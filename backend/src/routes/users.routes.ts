import { Router, Response } from 'express';
import { z } from 'zod';
import bcrypt from 'bcrypt';
import { prisma } from '../config/prisma';
import { authMiddleware } from '../middleware/auth.middleware';
import { requireRole } from '../middleware/rbac.middleware';
import { auditLog } from '../middleware/audit.middleware';
import { AuthenticatedRequest } from '../types';
import { AuditAction, Permission, UserRole } from '@prisma/client';
import { env } from '../config/env';
import { ROLE_PERMISSIONS } from '../utils/rolePermissions';

const router = Router();
router.use(authMiddleware);

const createUserSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1),
  password: z.string().min(8),
  connectionId: z.string().optional(),
  role: z.nativeEnum(UserRole).optional(),
});

const updateRoleSchema = z.object({
  connectionId: z.string().nullable().optional(),
  role: z.nativeEnum(UserRole),
  permissions: z.array(z.nativeEnum(Permission)).optional(),
});

router.get('/', requireRole(UserRole.ADMIN, UserRole.SUPERADMIN), async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const users = await prisma.user.findMany({
      where: { isActive: true },
      select: {
        id: true, email: true, name: true, isActive: true, createdAt: true,
        connectionRoles: {
          include: { connection: { select: { id: true, name: true } } },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
    res.json(users);
  } catch {
    res.status(500).json({ error: 'Internal server error' });
  }
});

async function createUserHandler(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const data = createUserSchema.parse(req.body);

      const existing = await prisma.user.findUnique({ where: { email: data.email } });
      if (existing) {
        res.status(409).json({ error: 'Email already registered' });
        return;
      }

      const hashed = await bcrypt.hash(data.password, env.BCRYPT_ROUNDS);

      const user = await prisma.$transaction(async tx => {
        const newUser = await tx.user.create({
          data: { email: data.email, password: hashed, name: data.name },
        });
        if (data.connectionId && data.role) {
          await tx.userConnectionRole.create({
            data: {
              userId: newUser.id,
              connectionId: data.connectionId,
              role: data.role,
              permissions: ROLE_PERMISSIONS[data.role],
            },
          });
        }
        return newUser;
      });

      res.status(201).json({ id: user.id, email: user.email, name: user.name });
    } catch (err) {
      if (err instanceof z.ZodError) { res.status(400).json({ error: 'Validation failed', details: err.issues }); return; }
      res.status(500).json({ error: 'Internal server error' });
    }
  }

router.post(
  '/create',
  requireRole(UserRole.ADMIN, UserRole.SUPERADMIN),
  auditLog(AuditAction.CREATE_USER),
  createUserHandler
);

router.post(
  '/invite',
  requireRole(UserRole.ADMIN, UserRole.SUPERADMIN),
  auditLog(AuditAction.INVITE_USER),
  createUserHandler
);

router.patch(
  '/:id/role',
  requireRole(UserRole.ADMIN, UserRole.SUPERADMIN),
  auditLog(AuditAction.UPDATE_USER_ROLE),
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const data = updateRoleSchema.parse(req.body);
      const userId = req.params.id as string;
      const connectionId = data.connectionId ?? null;
      const permissions = data.permissions || ROLE_PERMISSIONS[data.role];

      if (connectionId === null) {
        const existing = await prisma.userConnectionRole.findFirst({
          where: { userId, connectionId: null },
        });
        if (existing) {
          await prisma.userConnectionRole.update({
            where: { id: existing.id },
            data: { role: data.role, permissions },
          });
        } else {
          await prisma.userConnectionRole.create({
            data: { userId, connectionId: null, role: data.role, permissions },
          });
        }
      } else {
        await prisma.userConnectionRole.upsert({
          where: { userId_connectionId: { userId, connectionId } },
          update: { role: data.role, permissions },
          create: { userId, connectionId, role: data.role, permissions },
        });
      }

      res.json({ message: 'Role updated' });
    } catch (err) {
      if (err instanceof z.ZodError) { res.status(400).json({ error: 'Validation failed', details: err.issues }); return; }
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

router.delete(
  '/:id',
  requireRole(UserRole.SUPERADMIN),
  auditLog(AuditAction.DELETE_USER),
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const userId = req.params.id as string;

      if (userId === req.user!.userId) {
        res.status(400).json({ error: 'Cannot delete your own account' });
        return;
      }

      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          password: true,
          isActive: true,
          _count: {
            select: {
              ownedConnections: true,
            },
          },
        },
      });

      if (!user) {
        res.status(404).json({ error: 'User not found' });
        return;
      }

      if (user._count.ownedConnections > 0) {
        res.status(409).json({
          error: 'Cannot delete a user who owns connections. Transfer or remove those connections first.',
        });
        return;
      }

      if (user.password) {
        await prisma.$transaction([
          prisma.auditLog.deleteMany({ where: { userId } }),
          prisma.user.delete({ where: { id: userId } }),
        ]);
      } else {
        await prisma.user.update({ where: { id: userId }, data: { isActive: false } });
      }

      res.json({ message: 'User deleted' });
    } catch {
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

export default router;
