import { Server, Socket } from 'socket.io';
import Redis, { RedisOptions } from 'ioredis';
import { prisma } from '../config/prisma';
import { verifyAccessToken } from '../utils/jwt';
import { decrypt } from '../utils/encryption';
import { logger } from '../config/logger';

const subscriberMap = new Map<string, Redis>();

/**
 * Return the persistent subscriber for this socket+connection, creating and
 * connecting it (with its message listeners) on first use. Reusing one
 * subscriber lets channel and pattern subscriptions accumulate instead of
 * being wiped on every subscribe call.
 */
async function getOrCreateSubscriber(socket: Socket, connectionId: string): Promise<Redis> {
  const subKey = `${socket.id}:${connectionId}`;
  const existing = subscriberMap.get(subKey);
  if (existing) return existing;

  const connection = await prisma.redisConnection.findFirst({
    where: { id: connectionId, isActive: true },
  });
  if (!connection) throw new Error('Connection not found');

  const options: RedisOptions = {
    host: connection.host,
    port: connection.port,
    lazyConnect: true,
  };
  if (connection.passwordEnc) options.password = decrypt(connection.passwordEnc);
  if (connection.useTLS) options.tls = {};

  const subscriber = new Redis(options);
  await subscriber.connect();

  subscriber.on('message', (channel, message) => {
    socket.emit('message', { channel, message, timestamp: new Date().toISOString() });
  });
  subscriber.on('pmessage', (pattern, channel, message) => {
    socket.emit('pmessage', { pattern, channel, message, timestamp: new Date().toISOString() });
  });

  subscriberMap.set(subKey, subscriber);
  return subscriber;
}

export function setupPubSubSocket(io: Server): void {
  const pubSubNs = io.of('/pubsub');

  pubSubNs.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth.token;
      if (!token) throw new Error('No token');
      const payload = verifyAccessToken(token);
      socket.data.userId = payload.userId;
      next();
    } catch {
      next(new Error('Authentication error'));
    }
  });

  pubSubNs.on('connection', (socket: Socket) => {
    logger.info(`PubSub socket connected: ${socket.id}`);

    socket.on('subscribe', async ({ connectionId, channels }: { connectionId: string; channels: string[] }) => {
      try {
        if (!channels?.length) return;
        const subscriber = await getOrCreateSubscriber(socket, connectionId);
        await subscriber.subscribe(...channels);
        socket.emit('subscribed', { channels });
      } catch (err) {
        socket.emit('error', (err as Error).message);
      }
    });

    socket.on('psubscribe', async ({ connectionId, patterns }: { connectionId: string; patterns: string[] }) => {
      try {
        if (!patterns?.length) return;
        const subscriber = await getOrCreateSubscriber(socket, connectionId);
        await subscriber.psubscribe(...patterns);
        socket.emit('psubscribed', { patterns });
      } catch (err) {
        socket.emit('error', (err as Error).message);
      }
    });

    socket.on('publish', async ({ connectionId, channel, message }: { connectionId: string; channel: string; message: string }) => {
      try {
        const connection = await prisma.redisConnection.findFirst({
          where: { id: connectionId, isActive: true },
        });
        if (!connection) { socket.emit('error', 'Connection not found'); return; }

        const options: RedisOptions = { host: connection.host, port: connection.port };
        if (connection.passwordEnc) options.password = decrypt(connection.passwordEnc);
        if (connection.useTLS) options.tls = {};

        const publisher = new Redis(options);
        const receivers = await publisher.publish(channel, message);
        publisher.disconnect();
        socket.emit('published', { channel, message, receivers });
      } catch (err) {
        socket.emit('error', (err as Error).message);
      }
    });

    socket.on(
      'unsubscribe',
      async ({ connectionId, channels, patterns }: { connectionId: string; channels?: string[]; patterns?: string[] }) => {
        try {
          const subKey = `${socket.id}:${connectionId}`;
          const subscriber = subscriberMap.get(subKey);
          if (!subscriber) return;

          const removeChannels = channels ?? [];
          const removePatterns = patterns ?? [];

          if (removeChannels.length) await subscriber.unsubscribe(...removeChannels);
          if (removePatterns.length) await subscriber.punsubscribe(...removePatterns);

          // No specific targets => tear the subscriber down entirely.
          if (!removeChannels.length && !removePatterns.length) {
            subscriber.disconnect();
            subscriberMap.delete(subKey);
          }
          socket.emit('unsubscribed', { connectionId, channels: removeChannels, patterns: removePatterns });
        } catch (err) {
          socket.emit('error', (err as Error).message);
        }
      }
    );

    socket.on('disconnect', () => {
      for (const [key, sub] of subscriberMap.entries()) {
        if (key.startsWith(socket.id)) {
          sub.disconnect();
          subscriberMap.delete(key);
        }
      }
    });
  });
}
