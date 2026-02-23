import fs from 'fs';
import yaml from 'js-yaml';
import { Permission, UserRole } from '@prisma/client';
import { prisma } from '../config/prisma';
import { logger } from '../config/logger';
import { encrypt } from '../utils/encryption';

// ---------------------------------------------------------------------------
// Types that describe the YAML schema
// ---------------------------------------------------------------------------

export interface YamlConnection {
  name: string;
  host: string;
  port?: number;
  password?: string;
  username?: string;
  useTLS?: boolean;
  mode?: 'STANDALONE' | 'SENTINEL' | 'CLUSTER';
  sentinelMaster?: string;
  tags?: string[];
}

export interface YamlGroupConnection {
  name: string;
  role: UserRole;
}

export interface YamlGroup {
  name: string;
  description?: string;
  members?: { email: string }[];
  connections?: YamlGroupConnection[];
}

export interface YamlPermission {
  userEmail: string;
  connection: string;
  role: UserRole;
}

export interface YamlConfig {
  connections?: YamlConnection[];
  groups?: YamlGroup[];
  permissions?: YamlPermission[];
}

// ---------------------------------------------------------------------------
// Role → default permissions mapping (kept in sync with the rest of the app)
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Replace ${VAR_NAME} tokens in a string with the corresponding environment
 * variable.  If the variable is not set the token is left as-is so that
 * misconfigurations are obvious in logs.
 */
export function resolveEnvVars(value: string): string {
  return value.replace(/\$\{([^}]+)\}/g, (_, name: string) => {
    const resolved = process.env[name];
    if (resolved === undefined) {
      logger.warn(`config-loader: environment variable "${name}" is not set`);
      return `\${${name}}`;
    }
    return resolved;
  });
}

/**
 * Walk every string leaf in an arbitrary object and call resolveEnvVars on it.
 */
export function resolveEnvVarsDeep<T>(obj: T): T {
  if (typeof obj === 'string') {
    return resolveEnvVars(obj) as unknown as T;
  }
  if (Array.isArray(obj)) {
    return obj.map(resolveEnvVarsDeep) as unknown as T;
  }
  if (obj !== null && typeof obj === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
      result[key] = resolveEnvVarsDeep(value);
    }
    return result as T;
  }
  return obj;
}

// ---------------------------------------------------------------------------
// Main loader
// ---------------------------------------------------------------------------

/**
 * Parse a YAML config file and apply its contents to the database.
 * All operations use upsert so the function is safe to call on every startup.
 */
export async function applyConfig(filePath: string): Promise<void> {
  if (!fs.existsSync(filePath)) {
    logger.warn(`config-loader: config file not found at "${filePath}", skipping`);
    return;
  }

  const raw = fs.readFileSync(filePath, 'utf8');
  const parsed = yaml.load(raw) as YamlConfig;

  if (!parsed || typeof parsed !== 'object') {
    logger.warn('config-loader: config file is empty or invalid, skipping');
    return;
  }

  const config = resolveEnvVarsDeep(parsed);

  // Resolve the SUPERADMIN user who will own YAML-defined connections.
  const ownerRole = await prisma.userConnectionRole.findFirst({
    where: { role: UserRole.SUPERADMIN },
    include: { user: true },
  });

  if (!ownerRole) {
    logger.warn('config-loader: no SUPERADMIN user found; connections from config will be skipped');
  }

  const ownerId = ownerRole?.user?.id;

  // -------------------------------------------------------------------------
  // Connections
  // -------------------------------------------------------------------------
  const connectionNameToId = new Map<string, string>();

  if (config.connections?.length) {
    for (const conn of config.connections) {
      if (!conn.name || !conn.host) {
        logger.warn('config-loader: skipping connection entry missing required "name" or "host"');
        continue;
      }

      if (!ownerId) {
        logger.warn(`config-loader: skipping connection "${conn.name}" — no SUPERADMIN owner found`);
        continue;
      }

      const data = {
        host: conn.host,
        port: conn.port ?? 6379,
        passwordEnc: conn.password ? encrypt(conn.password) : null,
        username: conn.username ?? null,
        useTLS: conn.useTLS ?? false,
        mode: conn.mode ?? 'STANDALONE',
        sentinelMaster: conn.sentinelMaster ?? null,
        tags: conn.tags ?? [],
        isActive: true,
      } as const;

      const existing = await prisma.redisConnection.findFirst({
        where: { name: conn.name, ownerId },
      });

      let connectionId: string;

      if (existing) {
        const updated = await prisma.redisConnection.update({
          where: { id: existing.id },
          data,
        });
        connectionId = updated.id;
        logger.info(`config-loader: updated connection "${conn.name}"`);
      } else {
        const created = await prisma.redisConnection.create({
          data: { ...data, name: conn.name, ownerId },
        });
        connectionId = created.id;

        // Grant the owner ADMIN access to the newly created connection.
        await prisma.userConnectionRole.upsert({
          where: { userId_connectionId: { userId: ownerId, connectionId } },
          update: {},
          create: {
            userId: ownerId,
            connectionId,
            role: UserRole.ADMIN,
            permissions: ROLE_PERMISSIONS[UserRole.ADMIN],
          },
        });

        logger.info(`config-loader: created connection "${conn.name}"`);
      }

      connectionNameToId.set(conn.name, connectionId);
    }
  }

  // -------------------------------------------------------------------------
  // Groups
  // -------------------------------------------------------------------------
  if (config.groups?.length) {
    for (const grp of config.groups) {
      if (!grp.name) {
        logger.warn('config-loader: skipping group entry missing required "name"');
        continue;
      }

      const group = await prisma.group.upsert({
        where: { name: grp.name },
        update: { description: grp.description ?? null },
        create: { name: grp.name, description: grp.description ?? null },
      });

      logger.info(`config-loader: upserted group "${grp.name}"`);

      // Members
      if (grp.members?.length) {
        for (const member of grp.members) {
          const user = await prisma.user.findUnique({ where: { email: member.email } });
          if (!user) {
            logger.warn(`config-loader: user "${member.email}" not found, skipping group member assignment`);
            continue;
          }
          await prisma.groupMember.upsert({
            where: { groupId_userId: { groupId: group.id, userId: user.id } },
            update: {},
            create: { groupId: group.id, userId: user.id },
          });
          logger.info(`config-loader: added "${member.email}" to group "${grp.name}"`);
        }
      }

      // Connection assignments
      if (grp.connections?.length) {
        for (const gc of grp.connections) {
          // Resolve connection ID — prefer connections created above, then DB lookup.
          let connectionId = connectionNameToId.get(gc.name);
          if (!connectionId) {
            const dbConn = await prisma.redisConnection.findFirst({
              where: { name: gc.name, isActive: true },
            });
            if (!dbConn) {
              logger.warn(`config-loader: connection "${gc.name}" not found, skipping group assignment`);
              continue;
            }
            connectionId = dbConn.id;
          }

          await prisma.groupConnectionRole.upsert({
            where: { groupId_connectionId: { groupId: group.id, connectionId } },
            update: { role: gc.role, permissions: ROLE_PERMISSIONS[gc.role] },
            create: {
              groupId: group.id,
              connectionId,
              role: gc.role,
              permissions: ROLE_PERMISSIONS[gc.role],
            },
          });
          logger.info(`config-loader: assigned connection "${gc.name}" to group "${grp.name}" with role ${gc.role}`);
        }
      }
    }
  }

  // -------------------------------------------------------------------------
  // User-level permissions
  // -------------------------------------------------------------------------
  if (config.permissions?.length) {
    for (const perm of config.permissions) {
      const user = await prisma.user.findUnique({ where: { email: perm.userEmail } });
      if (!user) {
        logger.warn(`config-loader: user "${perm.userEmail}" not found, skipping permission assignment`);
        continue;
      }

      let connectionId = connectionNameToId.get(perm.connection);
      if (!connectionId) {
        const dbConn = await prisma.redisConnection.findFirst({
          where: { name: perm.connection, isActive: true },
        });
        if (!dbConn) {
          logger.warn(`config-loader: connection "${perm.connection}" not found, skipping permission assignment`);
          continue;
        }
        connectionId = dbConn.id;
      }

      await prisma.userConnectionRole.upsert({
        where: { userId_connectionId: { userId: user.id, connectionId } },
        update: { role: perm.role, permissions: ROLE_PERMISSIONS[perm.role] },
        create: {
          userId: user.id,
          connectionId,
          role: perm.role,
          permissions: ROLE_PERMISSIONS[perm.role],
        },
      });
      logger.info(`config-loader: assigned role ${perm.role} on "${perm.connection}" to "${perm.userEmail}"`);
    }
  }

  logger.info('config-loader: configuration applied successfully');
}
