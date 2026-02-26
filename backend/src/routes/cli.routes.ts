import { Router, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../config/prisma';
import { authMiddleware } from '../middleware/auth.middleware';
import { requirePermission } from '../middleware/rbac.middleware';
import { auditLog } from '../middleware/audit.middleware';
import { getRedisClient } from '../services/redis.service';
import { ConnectionAccessRequest } from '../types';
import { AuditAction, Permission } from '@prisma/client';

import { env } from '../config/env';

const router = Router({ mergeParams: true });
router.use(authMiddleware);

const BLOCKED_COMMANDS = ['FLUSHALL', 'CONFIG', 'REPLICAOF', 'SLAVEOF', 'DEBUG', 'SHUTDOWN'];

function getEffectiveBlockedCommands(): Set<string> {
  return new Set([...BLOCKED_COMMANDS, ...env.DISABLED_COMMANDS]);
}

const cliSchema = z.object({
  command: z.string().min(1).max(1000),
});

router.post(
  '/',
  requirePermission(Permission.READ_KEY),
  auditLog(AuditAction.EXECUTE_CLI, (req) => req.params.id),
  async (req: ConnectionAccessRequest, res: Response): Promise<void> => {
    try {
      const { command } = cliSchema.parse(req.body);

      const parts = command.trim().split(/\s+/);
      const cmd = parts[0].toUpperCase();

      if (getEffectiveBlockedCommands().has(cmd)) {
        res.status(403).json({ error: `Command ${cmd} is not allowed`, result: null });
        return;
      }

      const writeCommands = ['SET', 'DEL', 'HSET', 'HMSET', 'LPUSH', 'RPUSH', 'SADD', 'ZADD', 'EXPIRE', 'PERSIST', 'RENAME', 'MOVE', 'COPY'];
      const deleteCommands = ['DEL', 'FLUSHDB', 'UNLINK'];

      if (writeCommands.includes(cmd) && !req.connectionRole?.permissions.includes(Permission.WRITE_KEY)) {
        res.status(403).json({ error: 'Insufficient permissions for write operation', result: null });
        return;
      }

      if (deleteCommands.includes(cmd) && !req.connectionRole?.permissions.includes(Permission.DELETE_KEY)) {
        res.status(403).json({ error: 'Insufficient permissions for delete operation', result: null });
        return;
      }

      const connection = await prisma.redisConnection.findFirst({
        where: { id: req.params.id, isActive: true },
      });

      if (!connection) {
        res.status(404).json({ error: 'Connection not found' });
        return;
      }

      const client = await getRedisClient(connection);
      const args = parts.slice(1);
      const result = await (client as unknown as { call: (cmd: string, ...args: string[]) => Promise<unknown> }).call(cmd, ...args);

      res.json({ result, command });
    } catch (err) {
      if (err instanceof z.ZodError) {
        res.status(400).json({ error: 'Validation failed', details: err.errors });
        return;
      }
      res.json({ result: null, error: (err as Error).message, command: req.body.command });
    }
  }
);

export default router;
