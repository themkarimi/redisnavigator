import { Router, Response } from 'express';
import rateLimit from 'express-rate-limit';
import { Redis, Cluster } from 'ioredis';
import { prisma } from '../config/prisma';
import { authMiddleware } from '../middleware/auth.middleware';
import { requirePermission } from '../middleware/rbac.middleware';
import { getRedisClient } from '../services/redis.service';
import { ConnectionAccessRequest } from '../types';
import { Permission } from '@prisma/client';

const router = Router({ mergeParams: true });

const SENSITIVE_CONFIG_KEYS = new Set([
  'masterauth',
  'requirepass',
  'tls-key-file-pass',
]);

export function sanitizeRedisConfigValue(key: string, value: string): string {
  const normalizedKey = key.toLowerCase();
  const isSensitive =
    SENSITIVE_CONFIG_KEYS.has(normalizedKey) ||
    normalizedKey.endsWith('-pass') ||
    normalizedKey.endsWith('-password');

  if (!isSensitive || value === '') {
    return value;
  }

  return '[hidden]';
}

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
        where: { id: req.params.id as string, isActive: true },
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
        where: { id: req.params.id as string, isActive: true },
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
        where: { id: req.params.id as string, isActive: true },
      });

      if (!connection) {
        res.status(404).json({ error: 'Connection not found' });
        return;
      }

      const client = await getRedisClient(connection);
      // ioredis returns SLOWLOG GET as an array of arrays:
      // [ id, timestamp, durationMicros, [arg, ...], clientAddr, clientName ]
      const raw = (await client.slowlog('GET', '128')) as unknown[];

      const slowlog = (Array.isArray(raw) ? raw : []).map((entry) => {
        const e = entry as unknown[];
        return {
          id: Number(e[0] ?? 0),
          timestamp: Number(e[1] ?? 0),
          duration: Number(e[2] ?? 0),
          args: Array.isArray(e[3]) ? (e[3] as unknown[]).map(String) : [],
          client: typeof e[4] === 'string' ? e[4] : '',
          clientName: typeof e[5] === 'string' ? e[5] : '',
        };
      });

      res.json({ slowlog });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  }
);

router.get(
  '/config',
  statsLimiter,
  requirePermission(Permission.READ_KEY),
  async (req: ConnectionAccessRequest, res: Response): Promise<void> => {
    try {
      const connection = await prisma.redisConnection.findFirst({
        where: { id: req.params.id as string, isActive: true },
      });

      if (!connection) {
        res.status(404).json({ error: 'Connection not found' });
        return;
      }

      const client = await getRedisClient(connection);
      let raw: string[];
      try {
        raw = await client.config('GET', '*') as string[];
      } catch (configErr) {
        const msg = (configErr as Error).message ?? '';
        if (msg.includes('ERR') || msg.includes('NOPERM') || msg.includes('unknown command')) {
          res.status(403).json({ error: 'CONFIG command is disabled or not permitted on this Redis instance' });
          return;
        }
        throw configErr;
      }

      // ioredis returns a flat array: [key, value, key, value, ...]
      const config: Record<string, string> = {};
      for (let i = 0; i + 1 < raw.length; i += 2) {
        config[raw[i]] = sanitizeRedisConfigValue(raw[i], raw[i + 1]);
      }

      res.json({ config });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  }
);

// ---------------------------------------------------------------------------
// Memory analysis
// ---------------------------------------------------------------------------

const MEMORY_DEFAULT_SAMPLE = 1000;
const MEMORY_MAX_SAMPLE = 20000;
const MEMORY_SCAN_COUNT = 500;
const MEMORY_USAGE_CONCURRENCY = 50;
const MEMORY_TOP_KEYS = 25;
const MEMORY_TOP_PREFIXES = 25;

// Collect up to `limit` keys by SCANning the keyspace. Standalone scans the node
// directly; a cluster fans the cursor out across every master shard.
async function sampleKeys(client: Redis | Cluster, limit: number): Promise<string[]> {
  const collected: string[] = [];

  if (!(client instanceof Cluster)) {
    let cursor = '0';
    do {
      const [next, batch] = await client.scan(cursor, 'MATCH', '*', 'COUNT', MEMORY_SCAN_COUNT);
      collected.push(...batch);
      cursor = next;
    } while (cursor !== '0' && collected.length < limit);
    return collected.slice(0, limit);
  }

  for (const node of client.nodes('master')) {
    let cursor = '0';
    do {
      const [next, batch] = await node.scan(cursor, 'MATCH', '*', 'COUNT', MEMORY_SCAN_COUNT);
      collected.push(...batch);
      cursor = next;
    } while (cursor !== '0' && collected.length < limit);
    if (collected.length >= limit) break;
  }
  return collected.slice(0, limit);
}

interface SampledKey {
  key: string;
  type: string;
  bytes: number;
  ttl: number;
}

// Resolve MEMORY USAGE / TYPE / TTL for each key, batched to bound concurrency.
// Routes per-key, so it works for both standalone and cluster clients.
async function measureKeys(client: Redis | Cluster, keys: string[]): Promise<SampledKey[]> {
  const out: SampledKey[] = [];
  for (let i = 0; i < keys.length; i += MEMORY_USAGE_CONCURRENCY) {
    const chunk = keys.slice(i, i + MEMORY_USAGE_CONCURRENCY);
    const measured = await Promise.all(
      chunk.map(async (key): Promise<SampledKey | null> => {
        try {
          const [bytes, type, ttl] = await Promise.all([
            client.memory('USAGE', key).catch(() => null),
            client.type(key).catch(() => 'none'),
            client.ttl(key).catch(() => -1),
          ]);
          if (type === 'none') return null; // key expired/deleted mid-scan
          return { key, type: String(type), bytes: Number(bytes ?? 0), ttl: Number(ttl ?? -1) };
        } catch {
          return null;
        }
      })
    );
    out.push(...(measured.filter(Boolean) as SampledKey[]));
  }
  return out;
}

function prefixOf(key: string): string {
  const idx = key.search(/[:|.#/]/);
  return idx > 0 ? key.slice(0, idx) : '(no prefix)';
}

router.get(
  '/memory',
  statsLimiter,
  // Editor-only: memory analysis SCANs the keyspace + runs MEMORY USAGE per key,
  // so it is gated behind WRITE_KEY (Operator/Admin/SuperAdmin), not READ_KEY.
  requirePermission(Permission.WRITE_KEY),
  async (req: ConnectionAccessRequest, res: Response): Promise<void> => {
    try {
      const connection = await prisma.redisConnection.findFirst({
        where: { id: req.params.id as string, isActive: true },
      });

      if (!connection) {
        res.status(404).json({ error: 'Connection not found' });
        return;
      }

      const requested = parseInt((req.query.sample as string) || '', 10);
      const sampleLimit = Number.isFinite(requested)
        ? Math.min(Math.max(requested, 1), MEMORY_MAX_SAMPLE)
        : MEMORY_DEFAULT_SAMPLE;

      const client = await getRedisClient(connection);

      const dbsize = await client.dbsize().catch(() => 0);

      // Overall memory figures from INFO (one node for a cluster).
      const memInfo = await client.info('memory').catch(() => '');
      const memParsed: Record<string, string> = {};
      memInfo.split('\r\n').forEach((line) => {
        if (line && !line.startsWith('#')) {
          const [k, v] = line.split(':');
          if (k && v !== undefined) memParsed[k.trim()] = v.trim();
        }
      });

      const keys = await sampleKeys(client, sampleLimit);
      const sampled = await measureKeys(client, keys);

      const byTypeMap = new Map<string, { count: number; bytes: number }>();
      const byPrefixMap = new Map<string, { count: number; bytes: number }>();
      let sampledBytes = 0;

      for (const item of sampled) {
        sampledBytes += item.bytes;

        const t = byTypeMap.get(item.type) ?? { count: 0, bytes: 0 };
        t.count += 1;
        t.bytes += item.bytes;
        byTypeMap.set(item.type, t);

        const p = prefixOf(item.key);
        const pe = byPrefixMap.get(p) ?? { count: 0, bytes: 0 };
        pe.count += 1;
        pe.bytes += item.bytes;
        byPrefixMap.set(p, pe);
      }

      const byType = Array.from(byTypeMap, ([type, v]) => ({ type, ...v })).sort(
        (a, b) => b.bytes - a.bytes
      );
      const byPrefix = Array.from(byPrefixMap, ([prefix, v]) => ({ prefix, ...v }))
        .sort((a, b) => b.bytes - a.bytes)
        .slice(0, MEMORY_TOP_PREFIXES);
      const topKeys = [...sampled].sort((a, b) => b.bytes - a.bytes).slice(0, MEMORY_TOP_KEYS);

      res.json({
        totalKeys: dbsize,
        sampledKeys: sampled.length,
        sampleLimit,
        truncated: dbsize > sampled.length,
        avgKeyBytes: sampled.length ? Math.round(sampledBytes / sampled.length) : 0,
        sampledBytes,
        usedMemory: parseInt(memParsed['used_memory'] || '0', 10),
        usedMemoryHuman: memParsed['used_memory_human'] || '',
        usedMemoryDataset: parseInt(memParsed['used_memory_dataset'] || '0', 10),
        maxMemory: parseInt(memParsed['maxmemory'] || '0', 10),
        memFragmentationRatio: parseFloat(memParsed['mem_fragmentation_ratio'] || '0'),
        byType,
        byPrefix,
        topKeys,
      });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  }
);

export default router;
