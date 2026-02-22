import Redis, { RedisOptions, Cluster } from 'ioredis';
import { decrypt } from '../utils/encryption';
import { logger } from '../config/logger';

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

export function buildRedisOptions(config: ConnectionConfig): RedisOptions {
  const options: RedisOptions = {
    host: config.host,
    port: config.port,
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
    options.tls = {};
  }

  return options;
}

export async function getRedisClient(config: ConnectionConfig): Promise<Redis> {
  const existing = connectionPool.get(config.id);
  if (existing && existing instanceof Redis) {
    try {
      await existing.ping();
      return existing;
    } catch {
      connectionPool.delete(config.id);
    }
  }

  const options = buildRedisOptions(config);
  const client = new Redis(options);

  client.on('error', (err) => {
    logger.warn(`Redis client error for connection ${config.id}:`, err.message);
  });

  await client.connect();
  connectionPool.set(config.id, client);
  return client;
}

export async function testConnection(config: Omit<ConnectionConfig, 'id'>): Promise<{ success: boolean; latency?: number; error?: string }> {
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
  const client = connectionPool.get(connectionId);
  if (client) {
    await client.quit().catch(() => client.disconnect());
    connectionPool.delete(connectionId);
  }
}
