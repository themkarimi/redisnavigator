import { Router, Response } from 'express';
import { z } from 'zod';
import { Redis, Cluster } from 'ioredis';
import { prisma } from '../config/prisma';
import { authMiddleware } from '../middleware/auth.middleware';
import { requirePermission } from '../middleware/rbac.middleware';
import { auditLog } from '../middleware/audit.middleware';
import { createEphemeralClient } from '../services/redis.service';
import { ConnectionAccessRequest } from '../types';
import { AuditAction, Permission } from '@prisma/client';

import { env } from '../config/env';

const router = Router({ mergeParams: true });
router.use(authMiddleware);

// Allowlist, not a blocklist: a blocklist is only as strong as its enumeration, and the old
// one was bypassable via EVAL/FUNCTION/SCRIPT/MIGRATE/ACL/CLIENT KILL. This lists the
// single-shot data commands the CLI is meant to expose. Deliberately excluded:
// - session/connection state (SELECT, MULTI/EXEC/DISCARD/WATCH) — meaningless on the
//   dedicated short-lived client created per request below, and SELECT on a shared client
//   would silently redirect every other user's DB.
// - blocking commands (BLPOP, BRPOP, BLMOVE, BZPOPMIN/MAX, WAIT, WAITAOF, XREAD BLOCK) —
//   would hang the request/timeout budget.
// - pub/sub (SUBSCRIBE/PSUBSCRIBE/...) — has its own dedicated socket transport.
// - scripting/admin/replication (EVAL*, FUNCTION*, SCRIPT, MIGRATE, ACL, CLIENT, CONFIG,
//   CLUSTER, MODULE, SHUTDOWN, DEBUG, REPLICAOF/SLAVEOF, FLUSHALL/FLUSHDB, MONITOR,
//   SAVE/BGSAVE/BGREWRITEAOF) — privilege escalation / destructive / server-wide impact.
const ALLOWED_COMMANDS = new Set([
  'GET', 'SET', 'SETNX', 'SETEX', 'PSETEX', 'GETSET', 'GETDEL', 'MGET', 'MSET', 'MSETNX',
  'APPEND', 'STRLEN', 'GETRANGE', 'SETRANGE', 'INCR', 'DECR', 'INCRBY', 'DECRBY', 'INCRBYFLOAT',
  'DEL', 'UNLINK', 'EXISTS', 'EXPIRE', 'PEXPIRE', 'EXPIREAT', 'PEXPIREAT', 'TTL', 'PTTL',
  'PERSIST', 'TYPE', 'KEYS', 'SCAN', 'RENAME', 'RENAMENX', 'COPY', 'DUMP', 'RESTORE',
  'RANDOMKEY', 'TOUCH', 'OBJECT',
  'HGET', 'HSET', 'HSETNX', 'HMGET', 'HMSET', 'HDEL', 'HGETALL', 'HKEYS', 'HVALS', 'HLEN',
  'HEXISTS', 'HINCRBY', 'HINCRBYFLOAT', 'HSCAN', 'HRANDFIELD', 'HSTRLEN',
  'LPUSH', 'RPUSH', 'LPUSHX', 'RPUSHX', 'LPOP', 'RPOP', 'LRANGE', 'LLEN', 'LINDEX', 'LSET',
  'LREM', 'LINSERT', 'LTRIM', 'LPOS',
  'SADD', 'SREM', 'SMEMBERS', 'SISMEMBER', 'SMISMEMBER', 'SCARD', 'SINTER', 'SUNION', 'SDIFF',
  'SINTERSTORE', 'SUNIONSTORE', 'SDIFFSTORE', 'SPOP', 'SRANDMEMBER', 'SSCAN', 'SMOVE',
  'ZADD', 'ZREM', 'ZRANGE', 'ZREVRANGE', 'ZRANGEBYSCORE', 'ZREVRANGEBYSCORE', 'ZSCORE',
  'ZMSCORE', 'ZCARD', 'ZCOUNT', 'ZINCRBY', 'ZRANK', 'ZREVRANK', 'ZSCAN', 'ZRANDMEMBER',
  'ZPOPMIN', 'ZPOPMAX', 'ZRANGEBYLEX', 'ZREMRANGEBYRANK', 'ZREMRANGEBYSCORE', 'ZREMRANGEBYLEX',
  'XADD', 'XRANGE', 'XREVRANGE', 'XLEN', 'XDEL', 'XTRIM',
  'PFADD', 'PFCOUNT', 'PFMERGE',
  'GEOADD', 'GEOPOS', 'GEODIST', 'GEOHASH', 'GEOSEARCH',
  'BITCOUNT', 'GETBIT', 'SETBIT', 'BITOP', 'BITPOS',
  'DBSIZE', 'PING', 'ECHO', 'MEMORY',
]);

function getEffectiveAllowedCommands(): Set<string> {
  const disabled = new Set(env.DISABLED_COMMANDS);
  return new Set([...ALLOWED_COMMANDS].filter((c) => !disabled.has(c)));
}

const cliSchema = z.object({
  command: z.string().min(1).max(1000),
});

router.post(
  '/',
  requirePermission(Permission.READ_KEY),
  auditLog(AuditAction.EXECUTE_CLI, (req) => req.params.id as string),
  async (req: ConnectionAccessRequest, res: Response): Promise<void> => {
    let client: Redis | Cluster | null = null;
    try {
      const { command } = cliSchema.parse(req.body);

      const parts = command.trim().split(/\s+/);
      const cmd = parts[0].toUpperCase();

      if (!getEffectiveAllowedCommands().has(cmd)) {
        res.status(403).json({ error: `Command ${cmd} is not allowed`, result: null });
        return;
      }

      const writeCommands = [
        'SET', 'SETNX', 'SETEX', 'PSETEX', 'GETSET', 'GETDEL', 'MSET', 'MSETNX', 'APPEND', 'SETRANGE',
        'INCR', 'DECR', 'INCRBY', 'DECRBY', 'INCRBYFLOAT', 'EXPIRE', 'PEXPIRE', 'EXPIREAT', 'PEXPIREAT',
        'PERSIST', 'RENAME', 'RENAMENX', 'COPY', 'RESTORE',
        'HSET', 'HSETNX', 'HMSET', 'HDEL', 'HINCRBY', 'HINCRBYFLOAT',
        'LPUSH', 'RPUSH', 'LPUSHX', 'RPUSHX', 'LPOP', 'RPOP', 'LSET', 'LREM', 'LINSERT', 'LTRIM',
        'SADD', 'SREM', 'SINTERSTORE', 'SUNIONSTORE', 'SDIFFSTORE', 'SPOP', 'SMOVE',
        'ZADD', 'ZREM', 'ZINCRBY', 'ZPOPMIN', 'ZPOPMAX', 'ZREMRANGEBYRANK', 'ZREMRANGEBYSCORE', 'ZREMRANGEBYLEX',
        'XADD', 'XDEL', 'XTRIM', 'PFADD', 'PFMERGE', 'GEOADD', 'SETBIT', 'BITOP',
      ];
      const deleteCommands = ['DEL', 'UNLINK'];

      if (writeCommands.includes(cmd) && !req.connectionRole?.permissions.includes(Permission.WRITE_KEY)) {
        res.status(403).json({ error: 'Insufficient permissions for write operation', result: null });
        return;
      }

      if (deleteCommands.includes(cmd) && !req.connectionRole?.permissions.includes(Permission.DELETE_KEY)) {
        res.status(403).json({ error: 'Insufficient permissions for delete operation', result: null });
        return;
      }

      const connection = await prisma.redisConnection.findFirst({
        where: { id: req.params.id as string, isActive: true },
      });

      if (!connection) {
        res.status(404).json({ error: 'Connection not found' });
        return;
      }

      // Dedicated, non-pooled client: CLI commands must never run on the client shared
      // with every other user of this connection (see the shared pool in redis.service.ts) —
      // a SELECT/MULTI/SUBSCRIBE issued here would otherwise corrupt or stall it for everyone.
      client = await createEphemeralClient(connection);
      const args = parts.slice(1);
      const result = await (client as unknown as { call: (cmd: string, ...args: string[]) => Promise<unknown> }).call(cmd, ...args);

      res.json({ result, command });
    } catch (err) {
      if (err instanceof z.ZodError) {
        res.status(400).json({ error: 'Validation failed', details: err.issues });
        return;
      }
      res.json({ result: null, error: (err as Error).message, command: req.body.command });
    } finally {
      client?.disconnect();
    }
  }
);

export default router;
