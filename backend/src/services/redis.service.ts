import Redis, { RedisOptions, Cluster, ClusterNode, SentinelAddress } from 'ioredis';
import { decrypt } from '../utils/encryption';
import { logger } from '../config/logger';

interface NodeAddress {
  host: string;
  port: number;
}

interface ConnectionConfig {
  id: string;
  host: string;
  port: number;
  passwordEnc?: string | null;
  username?: string | null;
  useTLS: boolean;
  mode: string;
  sentinelMaster?: string | null;
  // Widened to unknown so Prisma's JsonValue passes without casting at every call site.
  // buildRedisOptions / createClient parse the value safely at runtime.
  sentinelNodes?: unknown;
  clusterNodes?: unknown;
}

// Coerce a Prisma JSON value into a typed list of host:port nodes, dropping anything malformed.
function parseNodes(raw: unknown): NodeAddress[] {
  return (Array.isArray(raw) ? raw : [])
    .map((n: unknown) => {
      const node = n as NodeAddress;
      return { host: node.host, port: node.port };
    })
    .filter((n) => typeof n.host === 'string' && n.host.length > 0 && typeof n.port === 'number');
}

const connectionPool = new Map<string, Redis | Cluster>();
const lastUsed = new Map<string, number>();

// Idle pooled clients are evicted after this long with no use, so connections to
// rarely-touched (connection, db) pairs don't accumulate for the process lifetime.
const IDLE_TTL_MS = 5 * 60 * 1000;
const SWEEP_INTERVAL_MS = 60 * 1000;

const idleSweep = setInterval(() => {
  const now = Date.now();
  for (const [key, client] of connectionPool.entries()) {
    const used = lastUsed.get(key) ?? 0;
    if (now - used > IDLE_TTL_MS) {
      client.removeAllListeners('error');
      client.quit().catch(() => client.disconnect());
      connectionPool.delete(key);
      lastUsed.delete(key);
    }
  }
}, SWEEP_INTERVAL_MS);
// Don't keep the event loop alive for the sweep alone.
idleSweep.unref?.();

export function buildRedisOptions(config: ConnectionConfig, db = 0): RedisOptions {
  const base: RedisOptions = {
    db,
    connectTimeout: 10000,
    commandTimeout: 5000,
    lazyConnect: true,
    maxRetriesPerRequest: 1,
    enableOfflineQueue: false,
    // Cap reconnection: a dead/unreachable target stops retrying after ~10 attempts
    // instead of ioredis' default infinite loop, so evicted clients can fully die.
    retryStrategy: (times: number) => (times > 10 ? null : Math.min(times * 200, 2000)),
    reconnectOnError: () => false,
  };

  if (config.passwordEnc) {
    base.password = decrypt(config.passwordEnc);
  }

  if (config.username) {
    base.username = config.username;
  }

  if (config.useTLS) {
    base.tls = {};
  }

  if (config.mode === 'SENTINEL') {
    const sentinels: SentinelAddress[] = parseNodes(config.sentinelNodes);
    return {
      ...base,
      sentinels,
      name: config.sentinelMaster ?? 'mymaster',
    };
  }

  return { ...base, host: config.host, port: config.port };
}

// Build a connected-but-lazy client for any mode. CLUSTER returns an ioredis Cluster
// seeded from clusterNodes (falling back to the primary host:port); all other modes
// return a plain Redis built from buildRedisOptions.
function createClient(config: ConnectionConfig, db = 0): Redis | Cluster {
  if (config.mode === 'CLUSTER') {
    const nodes = parseNodes(config.clusterNodes);
    const seeds: ClusterNode[] = nodes.length > 0 ? nodes : [{ host: config.host, port: config.port }];

    const redisOptions: RedisOptions = {
      connectTimeout: 10000,
      commandTimeout: 5000,
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
    };
    if (config.passwordEnc) redisOptions.password = decrypt(config.passwordEnc);
    if (config.username) redisOptions.username = config.username;
    if (config.useTLS) redisOptions.tls = {};

    // Note: Redis Cluster does not support SELECT, so `db` is intentionally ignored here.
    return new Redis.Cluster(seeds, {
      lazyConnect: true,
      enableOfflineQueue: false,
      redisOptions,
      // Match the standalone cap: stop retrying a dead cluster after ~10 attempts.
      clusterRetryStrategy: (times: number) => (times > 10 ? null : Math.min(times * 200, 2000)),
    });
  }

  return new Redis(buildRedisOptions(config, db));
}

export async function getRedisClient(config: ConnectionConfig, db = 0): Promise<Redis | Cluster> {
  const poolKey = `${config.id}:${db}`;
  const existing = connectionPool.get(poolKey);
  if (existing) {
    try {
      await existing.ping();
      lastUsed.set(poolKey, Date.now());
      return existing;
    } catch {
      // Tear the stale client down before dropping it — otherwise it lingers in
      // ioredis' reconnection loop, holding a socket and timers forever (zombie leak).
      existing.removeAllListeners('error');
      existing.disconnect();
      connectionPool.delete(poolKey);
      lastUsed.delete(poolKey);
    }
  }

  const client = createClient(config, db);

  client.on('error', (err) => {
    logger.warn(`Redis client error for connection ${config.id} db ${db}:`, err.message);
  });

  await client.connect();
  connectionPool.set(poolKey, client);
  lastUsed.set(poolKey, Date.now());
  return client;
}

export async function testConnection(config: Omit<ConnectionConfig, 'id'>): Promise<{ success: boolean; latency?: number; error?: string }> {
  const testConfig: ConnectionConfig = { ...config, id: `test_${Date.now()}` };
  let client: Redis | Cluster | null = null;
  const start = Date.now();

  try {
    client = createClient(testConfig);
    await client.connect();
    await client.ping();
    const latency = Date.now() - start;
    return { success: true, latency };
  } catch (err) {
    return { success: false, error: (err as Error).message };
  } finally {
    if (client) {
      client.disconnect();
    }
  }
}

export async function closeConnection(connectionId: string): Promise<void> {
  const keysToDelete: string[] = [];
  for (const key of connectionPool.keys()) {
    if (key.startsWith(`${connectionId}:`)) {
      keysToDelete.push(key);
    }
  }
  for (const key of keysToDelete) {
    const client = connectionPool.get(key);
    if (client) {
      client.removeAllListeners('error');
      await client.quit().catch(() => client.disconnect());
      connectionPool.delete(key);
      lastUsed.delete(key);
    }
  }
}
