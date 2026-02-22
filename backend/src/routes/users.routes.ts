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

const router = Router();
router.use(authMiddleware);

const inviteSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1),
  password: z.string().min(8),
  connectionId: z.string(),
  role: z.nativeEnum(UserRole),
});

const updateRoleSchema = z.object({
  connectionId: z.string(),
  role: z.nativeEnum(UserRole),
  permissions: z.array(z.nativeEnum(Permission)).optional(),
});

router.get('/', requireRole(UserRole.ADMIN, UserRole.SUPERADMIN), async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const users = await prisma.user.findMany({
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

router.post(
  '/invite',
  requireRole(UserRole.ADMIN, UserRole.SUPERADMIN),
  auditLog(AuditAction.INVITE_USER),
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const data = inviteSchema.parse(req.body);

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
        await tx.userConnectionRole.create({
          data: {
            userId: newUser.id,
            connectionId: data.connectionId,
            role: data.role,
            permissions: data.role === UserRole.VIEWER
              ? [Permission.READ_KEY]
              : data.role === UserRole.OPERATOR
              ? [Permission.READ_KEY, Permission.WRITE_KEY, Permission.DELETE_KEY]
              : [Permission.READ_KEY, Permission.WRITE_KEY, Permission.DELETE_KEY, Permission.MANAGE_CONNECTION, Permission.MANAGE_USERS],
          },
        });
        return newUser;
      });

      res.status(201).json({ id: user.id, email: user.email, name: user.name });
    } catch (err) {
      if (err instanceof z.ZodError) { res.status(400).json({ error: 'Validation failed', details: err.errors }); return; }
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

router.patch(
  '/:id/role',
  requireRole(UserRole.ADMIN, UserRole.SUPERADMIN),
  auditLog(AuditAction.UPDATE_USER_ROLE),
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const data = updateRoleSchema.parse(req.body);
      const defaultPerms = {
        [UserRole.VIEWER]: [Permission.READ_KEY],
        [UserRole.OPERATOR]: [Permission.READ_KEY, Permission.WRITE_KEY, Permission.DELETE_KEY],
        [UserRole.ADMIN]: [Permission.READ_KEY, Permission.WRITE_KEY, Permission.DELETE_KEY, Permission.MANAGE_CONNECTION, Permission.MANAGE_USERS],
        [UserRole.SUPERADMIN]: [Permission.READ_KEY, Permission.WRITE_KEY, Permission.DELETE_KEY, Permission.MANAGE_CONNECTION, Permission.MANAGE_USERS],
      };

      await prisma.userConnectionRole.upsert({
        where: { userId_connectionId: { userId: req.params.id, connectionId: data.connectionId } },
        update: { role: data.role, permissions: data.permissions || defaultPerms[data.role] },
        create: {
          userId: req.params.id, connectionId: data.connectionId,
          role: data.role, permissions: data.permissions || defaultPerms[data.role],
        },
      });

      res.json({ message: 'Role updated' });
    } catch (err) {
      if (err instanceof z.ZodError) { res.status(400).json({ error: 'Validation failed', details: err.errors }); return; }
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
      if (req.params.id === req.user!.userId) {
        res.status(400).json({ error: 'Cannot delete your own account' });
        return;
      }
      await prisma.user.update({ where: { id: req.params.id }, data: { isActive: false } });
      res.json({ message: 'User deleted' });
    } catch {
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

export default router;
