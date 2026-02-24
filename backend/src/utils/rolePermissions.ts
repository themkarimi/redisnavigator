import { Permission, UserRole } from '@prisma/client';

/**
 * Default permissions granted to each role.
 * Single source of truth – import this instead of redefining the map locally.
 */
export const ROLE_PERMISSIONS: Record<UserRole, Permission[]> = {
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
