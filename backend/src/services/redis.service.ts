import Redis, { RedisOptions, Cluster, SentinelAddress } from 'ioredis';
import { decrypt } from '../utils/encryption';
import { logger } from '../config/logger';

interface SentinelNode {
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
  sentinelNodes?: SentinelNode[] | null;
}

const connectionPool = new Map<string, Redis | Cluster>();

export function buildRedisOptions(config: ConnectionConfig, db = 0): RedisOptions {
  const base: RedisOptions = {
    db,
    connectTimeout: 10000,
    commandTimeout: 5000,
    lazyConnect: true,
    maxRetriesPerRequest: 1,
    enableOfflineQueue: false,
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
    const sentinels: SentinelAddress[] = (config.sentinelNodes ?? []).map(
      (n) => ({ host: n.host, port: n.port })
    );
    return {
      ...base,
      sentinels,
      name: config.sentinelMaster ?? 'mymaster',
    };
  }

  return { ...base, host: config.host, port: config.port };
}

export async function getRedisClient(config: ConnectionConfig, db = 0): Promise<Redis> {
  const poolKey = `${config.id}:${db}`;
  const existing = connectionPool.get(poolKey);
  if (existing && existing instanceof Redis) {
    try {
      await existing.ping();
      return existing;
    } catch {
      connectionPool.delete(poolKey);
    }
  }

  const options = buildRedisOptions(config, db);
  const client = new Redis(options);

  client.on('error', (err) => {
    logger.warn(`Redis client error for connection ${config.id} db ${db}:`, err.message);
  });

  await client.connect();
  connectionPool.set(poolKey, client);
  return client;
}

export async function testConnection(config: Omit<ConnectionConfig, 'id'> & { sentinelNodes?: SentinelNode[] | null }): Promise<{ success: boolean; latency?: number; error?: string }> {
  const testConfig: ConnectionConfig = { ...config, id: `test_${Date.now()}` };
  let client: Redis | null = null;
  const start = Date.now();

  try {
    const options = buildRedisOptions(testConfig);
    client = new Redis({ ...options, lazyConnect: true });
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
    }
  }
}
