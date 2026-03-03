import { Router, Response } from 'express';
import rateLimit from 'express-rate-limit';
import { prisma } from '../config/prisma';
import { authMiddleware } from '../middleware/auth.middleware';
import { requirePermission } from '../middleware/rbac.middleware';
import { getRedisClient } from '../services/redis.service';
import { ConnectionAccessRequest } from '../types';
import { Permission } from '@prisma/client';

const router = Router({ mergeParams: true });

const statsLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  message: { error: 'Too many requests, please try again later' },
});

router.use(authMiddleware);

router.get(
  '/info',
  statsLimiter,
  requirePermission(Permission.READ_KEY),
  async (req: ConnectionAccessRequest, res: Response): Promise<void> => {
    try {
      const connection = await prisma.redisConnection.findFirst({
        where: { id: req.params.id, isActive: true },
      });

      if (!connection) {
        res.status(404).json({ error: 'Connection not found' });
        return;
      }

      const client = await getRedisClient(connection);
      const info = await client.info();

      const parsed: Record<string, string> = {};
      info.split('\r\n').forEach(line => {
        if (line && !line.startsWith('#')) {
          const [key, value] = line.split(':');
          if (key && value !== undefined) parsed[key.trim()] = value.trim();
        }
      });

      const dbsize = await client.dbsize();

      res.json({
        raw: info,
        parsed,
        dbsize,
        server: {
          version: parsed['redis_version'],
          mode: parsed['redis_mode'],
          os: parsed['os'],
          uptime: parseInt(parsed['uptime_in_seconds'] || '0'),
        },
        memory: {
          used: parseInt(parsed['used_memory'] || '0'),
          usedHuman: parsed['used_memory_human'],
          peak: parseInt(parsed['used_memory_peak'] || '0'),
          peakHuman: parsed['used_memory_peak_human'],
          maxmemory: parseInt(parsed['maxmemory'] || '0'),
          maxmemoryHuman: parsed['maxmemory_human'],
        },
        stats: {
          totalCommandsProcessed: parseInt(parsed['total_commands_processed'] || '0'),
          instantaneousOpsPerSec: parseInt(parsed['instantaneous_ops_per_sec'] || '0'),
          totalConnectionsReceived: parseInt(parsed['total_connections_received'] || '0'),
          connectedClients: parseInt(parsed['connected_clients'] || '0'),
          keyspaceHits: parseInt(parsed['keyspace_hits'] || '0'),
          keyspaceMisses: parseInt(parsed['keyspace_misses'] || '0'),
        },
        replication: {
          role: parsed['role'],
          connectedSlaves: parseInt(parsed['connected_slaves'] || '0'),
        },
      });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  }
);

router.get(
  '/clients',
  statsLimiter,
  requirePermission(Permission.READ_KEY),
  async (req: ConnectionAccessRequest, res: Response): Promise<void> => {
    try {
      const connection = await prisma.redisConnection.findFirst({
        where: { id: req.params.id, isActive: true },
      });

      if (!connection) {
        res.status(404).json({ error: 'Connection not found' });
        return;
      }

      const client = await getRedisClient(connection);
      const result = await client.client('LIST');
      const list = typeof result === 'string' ? result : '';

      const clients = list
        .trim()
        .split('\n')
        .filter(Boolean)
        .map((line) => {
          const fields: Record<string, string> = {};
          line.trim().split(' ').forEach((pair) => {
            const idx = pair.indexOf('=');
            if (idx !== -1) {
              fields[pair.slice(0, idx)] = pair.slice(idx + 1);
            }
          });
          return fields;
        });

      res.json({ clients });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  }
);

router.get(
  '/slowlog',
  statsLimiter,
  requirePermission(Permission.READ_KEY),
  async (req: ConnectionAccessRequest, res: Response): Promise<void> => {
    try {
      const connection = await prisma.redisConnection.findFirst({
        where: { id: req.params.id, isActive: true },
      });

      if (!connection) {
        res.status(404).json({ error: 'Connection not found' });
        return;
      }

      const client = await getRedisClient(connection);
      const slowlog = await client.slowlog('GET', '128');

      res.json({ slowlog });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  }
);

export default router;
