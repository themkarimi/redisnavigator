import { Router, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../config/prisma';
import { authMiddleware } from '../middleware/auth.middleware';
import { requirePermission, requireRole } from '../middleware/rbac.middleware';
import { requireConfigEditable } from '../middleware/configAsCode.middleware';
import { auditLog } from '../middleware/audit.middleware';
import { encrypt } from '../utils/encryption';
import { testConnection, getRedisClient, closeConnection } from '../services/redis.service';
import { AuthenticatedRequest, ConnectionAccessRequest } from '../types';
import { AuditAction, Permission, UserRole } from '@prisma/client';

const router = Router();

router.use(authMiddleware);

const connectionSchema = z.object({
  name: z.string().min(1).max(100),
  host: z.string().min(1),
  port: z.number().int().min(1).max(65535).default(6379),
  password: z.string().nullish(),
  username: z.string().nullish(),
  useTLS: z.boolean().default(false),
  mode: z.enum(['STANDALONE', 'SENTINEL', 'CLUSTER']).default('STANDALONE'),
  sentinelMaster: z.string().nullish(),
  tags: z.array(z.string()).default([]),
});

const testConnectionSchema = connectionSchema.omit({ name: true, tags: true });

router.get('/', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const userRoles = await prisma.userConnectionRole.findMany({
      where: { userId: req.user!.userId },
      include: { connection: true },
    });

    const isSuperAdmin = userRoles.some(r => r.role === UserRole.SUPERADMIN);

    let connections;
    if (isSuperAdmin) {
      connections = await prisma.redisConnection.findMany({
        where: { isActive: true },
        include: { owner: { select: { id: true, name: true, email: true } } },
        orderBy: { createdAt: 'desc' },
      });
    } else {
      const connectionIds = userRoles.map(r => r.connectionId);
      const ownedConnections = await prisma.redisConnection.findMany({
        where: { ownerId: req.user!.userId, isActive: true },
      });
      const assignedConnections = await prisma.redisConnection.findMany({
        where: { id: { in: connectionIds }, isActive: true },
        include: { owner: { select: { id: true, name: true, email: true } } },
      });
      connections = [...ownedConnections, ...assignedConnections].filter(
        (c, i, arr) => arr.findIndex(x => x.id === c.id) === i
      );
    }

    res.json(connections.map(c => ({ ...c, passwordEnc: undefined })));
  } catch {
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post(
  '/',
  requireRole(UserRole.ADMIN, UserRole.SUPERADMIN),
  requireConfigEditable,
  auditLog(AuditAction.CREATE_CONNECTION),
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const data = connectionSchema.parse(req.body);

      const connection = await prisma.redisConnection.create({
        data: {
          name: data.name,
          host: data.host,
          port: data.port,
          passwordEnc: data.password ? encrypt(data.password) : null,
          username: data.username,
          useTLS: data.useTLS,
          mode: data.mode,
          sentinelMaster: data.sentinelMaster,
          tags: data.tags,
          ownerId: req.user!.userId,
        },
      });

      await prisma.userConnectionRole.create({
        data: {
          userId: req.user!.userId,
          connectionId: connection.id,
          role: UserRole.ADMIN,
          permissions: [
            Permission.READ_KEY,
            Permission.WRITE_KEY,
            Permission.DELETE_KEY,
            Permission.MANAGE_CONNECTION,
            Permission.MANAGE_USERS,
          ],
        },
      });

      res.status(201).json({ ...connection, passwordEnc: undefined });
    } catch (err) {
      if (err instanceof z.ZodError) {
        res.status(400).json({ error: 'Validation failed', details: err.errors });
        return;
      }
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

router.patch(
  '/:id',
  requirePermission(Permission.MANAGE_CONNECTION),
  requireConfigEditable,
  auditLog(AuditAction.UPDATE_CONNECTION),
  async (req: ConnectionAccessRequest, res: Response): Promise<void> => {
    try {
      const data = connectionSchema.partial().parse(req.body);
      const updateData: Record<string, unknown> = { ...data };

      if (data.password !== undefined) {
        updateData.passwordEnc = data.password ? encrypt(data.password) : null;
        delete updateData.password;
      }

      await closeConnection(req.params.id);

      const connection = await prisma.redisConnection.update({
        where: { id: req.params.id },
        data: updateData,
      });

      res.json({ ...connection, passwordEnc: undefined });
    } catch (err) {
      if (err instanceof z.ZodError) {
        res.status(400).json({ error: 'Validation failed', details: err.errors });
        return;
      }
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

router.delete(
  '/:id',
  requirePermission(Permission.MANAGE_CONNECTION),
  requireConfigEditable,
  auditLog(AuditAction.DELETE_CONNECTION),
  async (req: ConnectionAccessRequest, res: Response): Promise<void> => {
    try {
      await closeConnection(req.params.id);
      await prisma.redisConnection.update({
        where: { id: req.params.id },
        data: { isActive: false },
      });
      res.json({ message: 'Connection deleted' });
    } catch {
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

router.post('/test', authMiddleware, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const data = testConnectionSchema.parse(req.body);
    const result = await testConnection({
      host: data.host,
      port: data.port,
      passwordEnc: data.password ? encrypt(data.password) : null,
      username: data.username,
      useTLS: data.useTLS,
      mode: data.mode,
      sentinelMaster: data.sentinelMaster,
    });
    res.json(result);
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation failed', details: err.errors });
      return;
    }
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/:id/test', requirePermission(Permission.READ_KEY), async (req: ConnectionAccessRequest, res: Response): Promise<void> => {
  try {
    const connection = await prisma.redisConnection.findUnique({ where: { id: req.params.id } });
    if (!connection) {
      res.status(404).json({ error: 'Connection not found' });
      return;
    }
    const result = await testConnection(connection);
    res.json(result);
  } catch {
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
