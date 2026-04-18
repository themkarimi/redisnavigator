import { Permission, UserRole } from '@prisma/client';
import { prisma } from '../config/prisma';
import { ROLE_PERMISSIONS } from './rolePermissions';

/**
 * Replicates the permission-resolution logic from `requirePermission` in
 * `middleware/rbac.middleware.ts` but for contexts outside Express (in
 * particular Socket.IO handlers). Returns true when the user has all of the
 * requested permissions on the given Redis connection, via:
 *   1. a global SUPERADMIN grant
 *   2. direct connection-level role assignment
 *   3. ownership of the connection
 *   4. group-based role assignment
 *
 * Keeping this logic in sync with the REST middleware ensures that realtime
 * channels (pub/sub, metrics) cannot be used to escape the RBAC that gates
 * the HTTP API.
 *
 * @param userId              ID of the authenticated user.
 * @param connectionId        ID of the Redis connection being accessed.
 * @param requiredPermissions One or more permissions that must **all** be
 *                            satisfied for the call to be authorised.
 */
export async function userHasConnectionPermission(
  userId: string,
  connectionId: string,
  ...requiredPermissions: Permission[]
): Promise<boolean> {
  // 1. Global SuperAdmin overrides all scoped checks.
  const isSuperAdmin = await prisma.userConnectionRole.findFirst({
    where: { userId, role: UserRole.SUPERADMIN },
  });
  if (isSuperAdmin) return true;

  const hasAll = (role: UserRole): boolean =>
    requiredPermissions.every((p) => ROLE_PERMISSIONS[role].includes(p));

  // 2. Direct role assignment on this connection.
  const direct = await prisma.userConnectionRole.findUnique({
    where: { userId_connectionId: { userId, connectionId } },
  });
  if (direct && hasAll(direct.role)) return true;

  // 3. Ownership grants full admin-equivalent access.
  const owned = await prisma.redisConnection.findFirst({
    where: { id: connectionId, ownerId: userId },
  });
  if (owned && hasAll(UserRole.ADMIN)) return true;

  // 4. Group-based role assignment.
  const groupAccess = await prisma.groupConnectionRole.findFirst({
    where: {
      connectionId,
      group: { members: { some: { userId } } },
    },
  });
  if (groupAccess && hasAll(groupAccess.role)) return true;

  return false;
}
