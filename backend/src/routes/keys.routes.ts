import { Router, Response } from 'express';
import { z } from 'zod';
import rateLimit from 'express-rate-limit';
import { prisma } from '../config/prisma';
import { authMiddleware } from '../middleware/auth.middleware';
import { requirePermission } from '../middleware/rbac.middleware';
import { auditLog } from '../middleware/audit.middleware';
import { getRedisClient } from '../services/redis.service';
import { ConnectionAccessRequest } from '../types';
import { AuditAction, Permission } from '@prisma/client';
import { Redis } from 'ioredis';

const router = Router({ mergeParams: true });

const keysLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  message: { error: 'Too many requests, please try again later' },
});

router.use(authMiddleware);

function parseDb(req: ConnectionAccessRequest): number {
  return parseInt((req.query.db as string) ?? '0', 10) || 0;
}

async function getConnection(connectionId: string): Promise<import('@prisma/client').RedisConnection | null> {
  return prisma.redisConnection.findFirst({ where: { id: connectionId, isActive: true } });
}

router.get(
  '/',
  keysLimiter,
  requirePermission(Permission.READ_KEY),
  async (req: ConnectionAccessRequest, res: Response): Promise<void> => {
    try {
      const connection = await getConnection(req.params.id);
      if (!connection) { res.status(404).json({ error: 'Connection not found' }); return; }

      const { pattern = '*', type, cursor: cursorParam = '0', count = '100' } = req.query as Record<string, string>;
      const client = await getRedisClient(connection, parseDb(req));

      const keys: string[] = [];
      const [nextCursor, batch] = await client.scan(cursorParam, 'MATCH', pattern, 'COUNT', parseInt(count, 10));

      if (type) {
        for (const key of batch) {
          const keyType = await client.type(key);
          if (keyType === type) keys.push(key);
        }
      } else {
        keys.push(...batch);
      }

      const keyDetails = await Promise.all(
        keys.map(async (key) => {
          const [keyType, ttl] = await Promise.all([
            client.type(key),
            client.ttl(key),
          ]);
          return { key, type: keyType, ttl };
        })
      );

      res.json({ keys: keyDetails, cursor: nextCursor, total: keyDetails.length });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  }
);

router.get(
  '/:key',
  requirePermission(Permission.READ_KEY),
  auditLog(AuditAction.READ_KEY, (req) => req.params.id),
  async (req: ConnectionAccessRequest, res: Response): Promise<void> => {
    try {
      const connection = await getConnection(req.params.id);
      if (!connection) { res.status(404).json({ error: 'Connection not found' }); return; }

      const client = await getRedisClient(connection, parseDb(req));
      const key = decodeURIComponent(req.params.key);
      const keyType = await client.type(key);

      if (keyType === 'none') { res.status(404).json({ error: 'Key not found' }); return; }

      const ttl = await client.ttl(key);
      let value: unknown;

      switch (keyType) {
        case 'string':
          value = await client.get(key);
          break;
        case 'hash':
          value = await client.hgetall(key);
          break;
        case 'list':
          value = await client.lrange(key, 0, -1);
          break;
        case 'set':
          value = await client.smembers(key);
          break;
        case 'zset': {
          const raw = await client.zrange(key, 0, -1, 'WITHSCORES');
          const entries: Array<{ member: string; score: number }> = [];
          for (let i = 0; i < raw.length; i += 2) {
            entries.push({ member: raw[i], score: parseFloat(raw[i + 1]) });
          }
          value = entries;
          break;
        }
        case 'stream':
          value = await client.xrange(key, '-', '+', 'COUNT', 100);
          break;
        default:
          value = null;
      }

      res.json({ key, type: keyType, value, ttl });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  }
);

const setKeySchema = z.object({
  key: z.string().min(1),
  type: z.enum(['string', 'hash', 'list', 'set', 'zset']),
  value: z.unknown(),
  ttl: z.number().int().optional(),
});

router.post(
  '/',
  requirePermission(Permission.WRITE_KEY),
  auditLog(AuditAction.WRITE_KEY, (req) => req.params.id),
  async (req: ConnectionAccessRequest, res: Response): Promise<void> => {
    try {
      const connection = await getConnection(req.params.id);
      if (!connection) { res.status(404).json({ error: 'Connection not found' }); return; }

      const data = setKeySchema.parse(req.body);
      const client = await getRedisClient(connection, parseDb(req));

      await setRedisValue(client, data.key, data.type, data.value);

      if (data.ttl && data.ttl > 0) {
        await client.expire(data.key, data.ttl);
      }

      res.status(201).json({ message: 'Key created', key: data.key });
    } catch (err) {
      if (err instanceof z.ZodError) { res.status(400).json({ error: 'Validation failed', details: err.errors }); return; }
      res.status(500).json({ error: (err as Error).message });
    }
  }
);

router.put(
  '/:key',
  keysLimiter,
  requirePermission(Permission.WRITE_KEY),
  auditLog(AuditAction.WRITE_KEY, (req) => req.params.id),
  async (req: ConnectionAccessRequest, res: Response): Promise<void> => {
    try {
      const connection = await getConnection(req.params.id);
      if (!connection) { res.status(404).json({ error: 'Connection not found' }); return; }

      const client = await getRedisClient(connection, parseDb(req));
      const key = decodeURIComponent(req.params.key);
      const { value, ttl } = req.body as { value?: unknown; ttl?: number };

      const keyType = await client.type(key);
      if (keyType === 'none') { res.status(404).json({ error: 'Key not found' }); return; }

      await setRedisValue(client, key, keyType, value);

      if (ttl !== undefined) {
        if (ttl < 0) await client.persist(key);
        else await client.expire(key, ttl);
      }

      res.json({ message: 'Key updated' });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  }
);

router.put(
  '/:key/fields/:field',
  keysLimiter,
  requirePermission(Permission.WRITE_KEY),
  auditLog(AuditAction.WRITE_KEY, (req) => req.params.id),
  async (req: ConnectionAccessRequest, res: Response): Promise<void> => {
    try {
      const connection = await getConnection(req.params.id);
      if (!connection) { res.status(404).json({ error: 'Connection not found' }); return; }

      const client = await getRedisClient(connection, parseDb(req));
      const key = decodeURIComponent(req.params.key);
      const field = decodeURIComponent(req.params.field);
      const { value } = req.body as { value: string };

      await client.hset(key, field, String(value));
      res.json({ message: 'Field updated' });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  }
);

router.delete(
  '/:key/fields/:field',
  keysLimiter,
  requirePermission(Permission.DELETE_KEY),
  auditLog(AuditAction.DELETE_KEY, (req) => req.params.id),
  async (req: ConnectionAccessRequest, res: Response): Promise<void> => {
    try {
      const connection = await getConnection(req.params.id);
      if (!connection) { res.status(404).json({ error: 'Connection not found' }); return; }

      const client = await getRedisClient(connection, parseDb(req));
      const key = decodeURIComponent(req.params.key);
      const field = decodeURIComponent(req.params.field);

      await client.hdel(key, field);
      res.json({ message: 'Field deleted' });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  }
);

router.patch(
  '/:key',
  requirePermission(Permission.WRITE_KEY),
  auditLog(AuditAction.WRITE_KEY, (req) => req.params.id),
  async (req: ConnectionAccessRequest, res: Response): Promise<void> => {
    try {
      const connection = await getConnection(req.params.id);
      if (!connection) { res.status(404).json({ error: 'Connection not found' }); return; }

      const client = await getRedisClient(connection, parseDb(req));
      const key = decodeURIComponent(req.params.key);
      const { value, ttl, field, score, member } = req.body as {
        value?: unknown; ttl?: number; field?: string; score?: number; member?: string;
      };

      const keyType = await client.type(key);

      switch (keyType) {
        case 'string':
          await client.set(key, String(value));
          break;
        case 'hash':
          if (field) await client.hset(key, field, String(value));
          break;
        case 'list':
          if (typeof req.body.index === 'number') await client.lset(key, req.body.index, String(value));
          break;
        case 'set':
          if (member && value) {
            await client.srem(key, member);
            await client.sadd(key, String(value));
          }
          break;
        case 'zset':
          if (member !== undefined && score !== undefined) await client.zadd(key, score, member);
          break;
      }

      if (ttl !== undefined) {
        if (ttl < 0) await client.persist(key);
        else await client.expire(key, ttl);
      }

      res.json({ message: 'Key updated' });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  }
);

router.delete(
  '/:key',
  requirePermission(Permission.DELETE_KEY),
  auditLog(AuditAction.DELETE_KEY, (req) => req.params.id),
  async (req: ConnectionAccessRequest, res: Response): Promise<void> => {
    try {
      const connection = await getConnection(req.params.id);
      if (!connection) { res.status(404).json({ error: 'Connection not found' }); return; }

      const client = await getRedisClient(connection, parseDb(req));
      const key = decodeURIComponent(req.params.key);
      await client.del(key);
      res.json({ message: 'Key deleted' });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  }
);

router.post(
  '/bulk-delete',
  requirePermission(Permission.DELETE_KEY),
  async (req: ConnectionAccessRequest, res: Response): Promise<void> => {
    try {
      const connection = await getConnection(req.params.id);
      if (!connection) { res.status(404).json({ error: 'Connection not found' }); return; }

      const { keys } = req.body as { keys: string[] };
      if (!Array.isArray(keys) || keys.length === 0) {
        res.status(400).json({ error: 'Keys array required' });
        return;
      }

      const client = await getRedisClient(connection, parseDb(req));
      const deleted = await client.del(...keys);
      res.json({ message: `Deleted ${deleted} keys`, deleted });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  }
);

router.post(
  '/delete-by-pattern',
  keysLimiter,
  requirePermission(Permission.DELETE_KEY),
  auditLog(AuditAction.DELETE_KEY, (req) => req.params.id),
  async (req: ConnectionAccessRequest, res: Response): Promise<void> => {
    try {
      const connection = await getConnection(req.params.id);
      if (!connection) { res.status(404).json({ error: 'Connection not found' }); return; }

      const { pattern } = req.body as { pattern: string };
      if (!pattern || typeof pattern !== 'string') {
        res.status(400).json({ error: 'Pattern is required' });
        return;
      }

      const client = await getRedisClient(connection, parseDb(req));
      let deleted = 0;
      let cursor = '0';

      do {
        const [nextCursor, batch] = await client.scan(cursor, 'MATCH', pattern, 'COUNT', 100);
        cursor = nextCursor;
        if (batch.length > 0) {
          deleted += await client.del(...batch);
        }
      } while (cursor !== '0');

      res.json({ message: `Deleted ${deleted} keys matching "${pattern}"`, deleted });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  }
);

async function setRedisValue(client: Redis, key: string, type: string, value: unknown): Promise<void> {
  switch (type) {
    case 'string':
      await client.set(key, String(value));
      break;
    case 'hash': {
      const hash = value as Record<string, string>;
      await client.del(key);
      if (Object.keys(hash).length > 0) await client.hset(key, hash);
      break;
    }
    case 'list': {
      const list = value as string[];
      await client.del(key);
      if (list.length > 0) await client.rpush(key, ...list);
      break;
    }
    case 'set': {
      const set = value as string[];
      await client.del(key);
      if (set.length > 0) await client.sadd(key, ...set);
      break;
    }
    case 'zset': {
      const zset = value as Array<{ score: number; member: string }>;
      await client.del(key);
      for (const item of zset) await client.zadd(key, item.score, item.member);
      break;
    }
  }
}

export default router;
