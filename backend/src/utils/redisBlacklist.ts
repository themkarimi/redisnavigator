import Redis from 'ioredis';
import { env } from '../config/env';
import { logger } from '../config/logger';

let blacklistClient: Redis | null = null;

export function getBlacklistClient(): Redis {
  if (!blacklistClient) {
    blacklistClient = new Redis(env.REDIS_BLACKLIST_URL, {
      password: env.REDIS_BLACKLIST_PASSWORD,
      lazyConnect: true,
      enableOfflineQueue: false,
    });
    blacklistClient.on('error', (err) => {
      logger.warn('Redis blacklist client error:', err.message);
    });
  }
  return blacklistClient;
}

export async function blacklistToken(token: string, expiresInSeconds: number): Promise<void> {
  try {
    const client = getBlacklistClient();
    await client.setex(`blacklist:${token}`, expiresInSeconds, '1');
  } catch (err) {
    logger.warn('Failed to blacklist token:', err);
  }
}

export async function isTokenBlacklisted(token: string): Promise<boolean> {
  try {
    const client = getBlacklistClient();
    const result = await client.get(`blacklist:${token}`);
    return result !== null;
  } catch {
    return false;
  }
}
