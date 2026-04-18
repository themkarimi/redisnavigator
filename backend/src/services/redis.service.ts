import Redis, { RedisOptions, Cluster } from 'ioredis';
import { decrypt } from '../utils/encryption';
import { logger } from '../config/logger';
import { assertSafeRedisHost } from '../utils/network';
import { env } from '../config/env';

interface ConnectionConfig {
  id: string;
  host: string;
  port: number;
  passwordEnc?: string | null;
  username?: string | null;
  useTLS: boolean;
  mode: string;
  sentinelMaster?: string | null;
}

const connectionPool = new Map<string, Redis | Cluster>();

export function buildRedisOptions(config: ConnectionConfig, db = 0): RedisOptions {
  const options: RedisOptions = {
    host: config.host,
    port: config.port,
    db,
    connectTimeout: 10000,
    commandTimeout: 5000,
    lazyConnect: true,
    maxRetriesPerRequest: 1,
    enableOfflineQueue: false,
  };

  if (config.passwordEnc) {
    options.password = decrypt(config.passwordEnc);
  }

  if (config.username) {
    options.username = config.username;
  }

  if (config.useTLS) {
    // Verify the server certificate by default. Operators can opt out via
    // REDIS_TLS_INSECURE for self-signed development setups, but that path
    // must never be on in production without an explicit override.
    options.tls = { rejectUnauthorized: !env.REDIS_TLS_INSECURE };
  }

  return options;
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

  await assertSafeRedisHost(config.host);

  const options = buildRedisOptions(config, db);
  const client = new Redis(options);

  client.on('error', (err) => {
    logger.warn(`Redis client error for connection ${config.id} db ${db}:`, err.message);
  });

  await client.connect();
  connectionPool.set(poolKey, client);
  return client;
}

export async function testConnection(config: Omit<ConnectionConfig, 'id'>): Promise<{ success: boolean; latency?: number; error?: string }> {
  const testConfig: ConnectionConfig = { ...config, id: `test_${Date.now()}` };
  let client: Redis | null = null;
  const start = Date.now();

  try {
    await assertSafeRedisHost(config.host);
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
      await client.quit().catch(() => client.disconnect());
      connectionPool.delete(key);
    }
  }
}
