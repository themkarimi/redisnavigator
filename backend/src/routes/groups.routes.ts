import { Router, Response } from 'express';
import { z } from 'zod';
import rateLimit from 'express-rate-limit';
import { prisma } from '../config/prisma';
import { authMiddleware } from '../middleware/auth.middleware';
import { requireRole } from '../middleware/rbac.middleware';
import { requireConfigEditable } from '../middleware/configAsCode.middleware';
import { auditLog } from '../middleware/audit.middleware';
import { AuthenticatedRequest } from '../types';
import { AuditAction, Permission, UserRole } from '@prisma/client';

const router = Router();

const groupsLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: { error: 'Too many requests, please try again later' },
});

router.use(groupsLimiter);
router.use(authMiddleware);

const ROLE_PERMISSIONS: Record<UserRole, Permission[]> = {
  SUPERADMIN: [Permission.READ_KEY, Permission.WRITE_KEY, Permission.DELETE_KEY, Permission.MANAGE_CONNECTION, Permission.MANAGE_USERS],
  ADMIN: [Permission.READ_KEY, Permission.WRITE_KEY, Permission.DELETE_KEY, Permission.MANAGE_CONNECTION, Permission.MANAGE_USERS],
  OPERATOR: [Permission.READ_KEY, Permission.WRITE_KEY, Permission.DELETE_KEY],
  VIEWER: [Permission.READ_KEY],
};

const groupSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().optional(),
});

const assignConnectionSchema = z.object({
  connectionId: z.string().min(1),
  role: z.nativeEnum(UserRole),
});

// GET /groups — list all groups with members and connection roles
router.get('/', requireRole(UserRole.ADMIN, UserRole.SUPERADMIN), async (_req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const groups = await prisma.group.findMany({
      include: {
        members: {
          include: { user: { select: { id: true, name: true, email: true } } },
        },
        connectionRoles: {
          include: { connection: { select: { id: true, name: true } } },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
    res.json(groups);
  } catch {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /groups — create a new group
router.post(
  '/',
  requireRole(UserRole.ADMIN, UserRole.SUPERADMIN),
  requireConfigEditable,
  auditLog(AuditAction.CREATE_GROUP),
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const data = groupSchema.parse(req.body);
      const existing = await prisma.group.findUnique({ where: { name: data.name } });
      if (existing) {
        res.status(409).json({ error: 'A group with that name already exists' });
        return;
      }
      const group = await prisma.group.create({ data });
      res.status(201).json(group);
    } catch (err) {
      if (err instanceof z.ZodError) {
        res.status(400).json({ error: 'Validation failed', details: err.errors });
        return;
      }
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

// PATCH /groups/:id — update a group's name or description
router.patch(
  '/:id',
  requireRole(UserRole.ADMIN, UserRole.SUPERADMIN),
  requireConfigEditable,
  auditLog(AuditAction.UPDATE_GROUP),
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const data = groupSchema.partial().parse(req.body);
      const group = await prisma.group.update({ where: { id: req.params.id }, data });
      res.json(group);
    } catch (err) {
      if (err instanceof z.ZodError) {
        res.status(400).json({ error: 'Validation failed', details: err.errors });
        return;
      }
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

// DELETE /groups/:id — delete a group
router.delete(
  '/:id',
  requireRole(UserRole.ADMIN, UserRole.SUPERADMIN),
  requireConfigEditable,
  auditLog(AuditAction.DELETE_GROUP),
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      await prisma.group.delete({ where: { id: req.params.id } });
      res.json({ message: 'Group deleted' });
    } catch {
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

// POST /groups/:id/members — add a user to a group
router.post(
  '/:id/members',
  requireRole(UserRole.ADMIN, UserRole.SUPERADMIN),
  requireConfigEditable,
  auditLog(AuditAction.ADD_GROUP_MEMBER),
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const { userId } = z.object({ userId: z.string().min(1) }).parse(req.body);
      const member = await prisma.groupMember.create({
        data: { groupId: req.params.id, userId },
        include: { user: { select: { id: true, name: true, email: true } } },
      });
      res.status(201).json(member);
    } catch (err) {
      if (err instanceof z.ZodError) {
        res.status(400).json({ error: 'Validation failed', details: err.errors });
        return;
      }
      // Unique constraint violation — user already in group
      if ((err as NodeJS.ErrnoException).code === 'P2002') {
        res.status(409).json({ error: 'User is already a member of this group' });
        return;
      }
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

// DELETE /groups/:id/members/:userId — remove a user from a group
router.delete(
  '/:id/members/:userId',
  requireRole(UserRole.ADMIN, UserRole.SUPERADMIN),
  requireConfigEditable,
  auditLog(AuditAction.REMOVE_GROUP_MEMBER),
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      await prisma.groupMember.deleteMany({
        where: { groupId: req.params.id, userId: req.params.userId },
      });
      res.json({ message: 'Member removed' });
    } catch {
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

// POST /groups/:id/connections — assign a connection to a group with a role
router.post(
  '/:id/connections',
  requireRole(UserRole.ADMIN, UserRole.SUPERADMIN),
  requireConfigEditable,
  auditLog(AuditAction.ASSIGN_GROUP_CONNECTION),
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const data = assignConnectionSchema.parse(req.body);
      const groupConnectionRole = await prisma.groupConnectionRole.upsert({
        where: { groupId_connectionId: { groupId: req.params.id, connectionId: data.connectionId } },
        update: { role: data.role, permissions: ROLE_PERMISSIONS[data.role] },
        create: {
          groupId: req.params.id,
          connectionId: data.connectionId,
          role: data.role,
          permissions: ROLE_PERMISSIONS[data.role],
        },
        include: { connection: { select: { id: true, name: true } } },
      });
      res.status(201).json(groupConnectionRole);
    } catch (err) {
      if (err instanceof z.ZodError) {
        res.status(400).json({ error: 'Validation failed', details: err.errors });
        return;
      }
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

// DELETE /groups/:id/connections/:connectionId — remove a connection from a group
router.delete(
  '/:id/connections/:connectionId',
  requireRole(UserRole.ADMIN, UserRole.SUPERADMIN),
  requireConfigEditable,
  auditLog(AuditAction.REMOVE_GROUP_CONNECTION),
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      await prisma.groupConnectionRole.deleteMany({
        where: { groupId: req.params.id, connectionId: req.params.connectionId },
      });
      res.json({ message: 'Connection access removed' });
    } catch {
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

export default router;
