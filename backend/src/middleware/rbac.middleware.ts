import { Response, NextFunction } from 'express';
import { Permission, UserRole } from '@prisma/client';
import { prisma } from '../config/prisma';
import { ConnectionAccessRequest, AuthenticatedRequest } from '../types';
import { ROLE_PERMISSIONS } from '../utils/rolePermissions';

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

      const connectionId = (req.params.id || req.params.connectionId) as string | undefined;

      // Check if user is SuperAdmin (global). Global roles are rows with
      // connectionId: null — a SUPERADMIN role scoped to one connection
      // must never be treated as a global grant.
      const isSuperAdmin = await prisma.userConnectionRole.findFirst({
        where: {
          userId: req.user.userId,
          connectionId: null,
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
        // For non-connection routes, check if global admin (connectionId: null)
        const adminRole = await prisma.userConnectionRole.findFirst({
          where: {
            userId: req.user.userId,
            connectionId: null,
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
        const connection = await prisma.redisConnection.findFirst({
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

      // requireRole gates *global* actions (managing all users/groups/connections).
      // A role scoped to a single connection (connectionId set) must never satisfy
      // this check — only a genuine global grant (connectionId: null) counts.
      const userRole = await prisma.userConnectionRole.findFirst({
        where: {
          userId: req.user.userId,
          connectionId: null,
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

/**
 * True if the user may administer the given connection: they are a global
 * SUPERADMIN, own the connection, hold an ADMIN/SUPERADMIN role on it directly,
 * or via a group they belong to. Used to scope ADMIN-level mutations (assigning
 * per-connection roles, attaching connections to groups) to connections the
 * caller actually administers, rather than any connection in the system.
 */
export async function userAdministersConnection(
  userId: string,
  connectionId: string
): Promise<boolean> {
  const globalSuperAdmin = await prisma.userConnectionRole.findFirst({
    where: { userId, connectionId: null, role: UserRole.SUPERADMIN },
  });
  if (globalSuperAdmin) return true;

  const owns = await prisma.redisConnection.findFirst({
    where: { id: connectionId, ownerId: userId },
  });
  if (owns) return true;

  const directRole = await prisma.userConnectionRole.findUnique({
    where: { userId_connectionId: { userId, connectionId } },
  });
  if (directRole && (directRole.role === UserRole.ADMIN || directRole.role === UserRole.SUPERADMIN)) {
    return true;
  }

  const groupRole = await prisma.groupConnectionRole.findFirst({
    where: {
      connectionId,
      role: { in: [UserRole.ADMIN, UserRole.SUPERADMIN] },
      group: { members: { some: { userId } } },
    },
  });
  return !!groupRole;
}

/** True if the user holds a global (connectionId: null) SUPERADMIN role. */
export async function isGlobalSuperAdmin(userId: string): Promise<boolean> {
  const role = await prisma.userConnectionRole.findFirst({
    where: { userId, connectionId: null, role: UserRole.SUPERADMIN },
  });
  return !!role;
}
