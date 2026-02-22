import { Response, NextFunction } from 'express';
import { Permission, UserRole } from '@prisma/client';
import { prisma } from '../config/prisma';
import { ConnectionAccessRequest, AuthenticatedRequest } from '../types';

const ROLE_PERMISSIONS: Record<UserRole, Permission[]> = {
  SUPERADMIN: [
    Permission.READ_KEY,
    Permission.WRITE_KEY,
    Permission.DELETE_KEY,
    Permission.MANAGE_CONNECTION,
    Permission.MANAGE_USERS,
  ],
  ADMIN: [
    Permission.READ_KEY,
    Permission.WRITE_KEY,
    Permission.DELETE_KEY,
    Permission.MANAGE_CONNECTION,
    Permission.MANAGE_USERS,
  ],
  OPERATOR: [Permission.READ_KEY, Permission.WRITE_KEY, Permission.DELETE_KEY],
  VIEWER: [Permission.READ_KEY],
};

export function requirePermission(...permissions: Permission[]) {
  return async (
    req: ConnectionAccessRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      if (!req.user) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      const connectionId = req.params.id || req.params.connectionId;

      // Check if user is SuperAdmin (global)
      const isSuperAdmin = await prisma.userConnectionRole.findFirst({
        where: {
          userId: req.user.userId,
          role: UserRole.SUPERADMIN,
        },
      });

      if (isSuperAdmin) {
        req.connectionRole = {
          role: UserRole.SUPERADMIN,
          permissions: ROLE_PERMISSIONS[UserRole.SUPERADMIN],
        };
        next();
        return;
      }

      if (!connectionId) {
        // For non-connection routes, check if admin
        const adminRole = await prisma.userConnectionRole.findFirst({
          where: {
            userId: req.user.userId,
            role: { in: [UserRole.ADMIN] },
          },
        });
        if (adminRole && permissions.every(p => ROLE_PERMISSIONS[UserRole.ADMIN].includes(p))) {
          req.connectionRole = { role: adminRole.role, permissions: ROLE_PERMISSIONS[adminRole.role] };
          next();
          return;
        }
        res.status(403).json({ error: 'Insufficient permissions' });
        return;
      }

      const userRole = await prisma.userConnectionRole.findUnique({
        where: {
          userId_connectionId: {
            userId: req.user.userId,
            connectionId,
          },
        },
      });

      if (!userRole) {
        // Check if user owns the connection
        const connection = await prisma.redisConnection.findUnique({
          where: { id: connectionId, ownerId: req.user.userId },
        });
        if (connection) {
          req.connectionRole = { role: UserRole.ADMIN, permissions: ROLE_PERMISSIONS[UserRole.ADMIN] };
          next();
          return;
        }

        // Check group-based access: find any group the user belongs to that has access to this connection
        const groupAccess = await prisma.groupConnectionRole.findFirst({
          where: {
            connectionId,
            group: {
              members: {
                some: { userId: req.user.userId },
              },
            },
          },
        });

        if (groupAccess) {
          const effectiveGroupPermissions = ROLE_PERMISSIONS[groupAccess.role];
          const hasAllGroupPermissions = permissions.every(p => effectiveGroupPermissions.includes(p));
          if (hasAllGroupPermissions) {
            req.connectionRole = { role: groupAccess.role, permissions: effectiveGroupPermissions };
            next();
            return;
          }
          res.status(403).json({ error: 'Insufficient permissions' });
          return;
        }

        res.status(403).json({ error: 'No access to this connection' });
        return;
      }

      const effectivePermissions = ROLE_PERMISSIONS[userRole.role];
      const hasAllPermissions = permissions.every(p => effectivePermissions.includes(p));

      if (!hasAllPermissions) {
        res.status(403).json({ error: 'Insufficient permissions' });
        return;
      }

      req.connectionRole = { role: userRole.role, permissions: effectivePermissions };
      next();
    } catch (err) {
      res.status(500).json({ error: 'Internal server error' });
    }
  };
}

export function requireRole(...roles: UserRole[]) {
  return async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      if (!req.user) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      const userRole = await prisma.userConnectionRole.findFirst({
        where: {
          userId: req.user.userId,
          role: { in: roles },
        },
      });

      if (!userRole) {
        res.status(403).json({ error: 'Insufficient role' });
        return;
      }

      next();
    } catch {
      res.status(500).json({ error: 'Internal server error' });
    }
  };
}
