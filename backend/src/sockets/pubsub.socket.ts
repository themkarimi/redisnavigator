import { Server, Socket } from 'socket.io';
import Redis, { RedisOptions } from 'ioredis';
import { prisma } from '../config/prisma';
import { verifyAccessToken } from '../utils/jwt';
import { decrypt } from '../utils/encryption';
import { logger } from '../config/logger';
import { userHasConnectionPermission } from '../utils/permissions';
import { assertSafeRedisHost } from '../utils/network';
import { env } from '../config/env';
import { Permission } from '@prisma/client';

const subscriberMap = new Map<string, Redis>();

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
        const userId = socket.data.userId as string;
        if (!(await userHasConnectionPermission(userId, connectionId, Permission.READ_KEY))) {
          socket.emit('error', 'No access to this connection');
          return;
        }

        const connection = await prisma.redisConnection.findFirst({
          where: { id: connectionId, isActive: true },
        });
        if (!connection) { socket.emit('error', 'Connection not found'); return; }

        const subKey = `${socket.id}:${connectionId}`;

        if (subscriberMap.has(subKey)) {
          subscriberMap.get(subKey)?.disconnect();
        }

        await assertSafeRedisHost(connection.host);

        const options: Record<string, unknown> = {
          host: connection.host, port: connection.port, lazyConnect: true,
        };
        if (connection.passwordEnc) options.password = decrypt(connection.passwordEnc);
        if (connection.useTLS) options.tls = { rejectUnauthorized: !env.REDIS_TLS_INSECURE };

        const subscriber = new Redis(options as RedisOptions);
        await subscriber.connect();
        subscriberMap.set(subKey, subscriber);

        subscriber.on('message', (channel, message) => {
          socket.emit('message', { channel, message, timestamp: new Date().toISOString() });
        });

        subscriber.on('pmessage', (pattern, channel, message) => {
          socket.emit('pmessage', { pattern, channel, message, timestamp: new Date().toISOString() });
        });

        await subscriber.subscribe(...channels);
        socket.emit('subscribed', { channels });
      } catch (err) {
        logger.warn(`PubSub subscribe failed: ${(err as Error).message}`);
        socket.emit('error', 'Subscribe failed');
      }
    });

    socket.on('psubscribe', async ({ connectionId, patterns }: { connectionId: string; patterns: string[] }) => {
      try {
        const userId = socket.data.userId as string;
        if (!(await userHasConnectionPermission(userId, connectionId, Permission.READ_KEY))) {
          socket.emit('error', 'No access to this connection');
          return;
        }
        const subKey = `${socket.id}:${connectionId}`;
        const subscriber = subscriberMap.get(subKey);
        if (subscriber) {
          await subscriber.psubscribe(...patterns);
          socket.emit('psubscribed', { patterns });
        }
      } catch (err) {
        logger.warn(`PubSub psubscribe failed: ${(err as Error).message}`);
        socket.emit('error', 'Subscribe failed');
      }
    });

    socket.on('publish', async ({ connectionId, channel, message }: { connectionId: string; channel: string; message: string }) => {
      try {
        const userId = socket.data.userId as string;
        // Publishing modifies Redis state, so require WRITE_KEY (not just READ_KEY).
        if (!(await userHasConnectionPermission(userId, connectionId, Permission.WRITE_KEY))) {
          socket.emit('error', 'No access to this connection');
          return;
        }

        const connection = await prisma.redisConnection.findFirst({
          where: { id: connectionId, isActive: true },
        });
        if (!connection) { socket.emit('error', 'Connection not found'); return; }

        await assertSafeRedisHost(connection.host);

        const options: Record<string, unknown> = { host: connection.host, port: connection.port };
        if (connection.passwordEnc) options.password = decrypt(connection.passwordEnc);
        if (connection.useTLS) options.tls = { rejectUnauthorized: !env.REDIS_TLS_INSECURE };

        const publisher = new Redis(options as RedisOptions);
        const receivers = await publisher.publish(channel, message);
        publisher.disconnect();
        socket.emit('published', { channel, message, receivers });
      } catch (err) {
        logger.warn(`PubSub publish failed: ${(err as Error).message}`);
        socket.emit('error', 'Publish failed');
      }
    });

    socket.on('unsubscribe', async ({ connectionId }: { connectionId: string }) => {
      const subKey = `${socket.id}:${connectionId}`;
      const subscriber = subscriberMap.get(subKey);
      if (subscriber) {
        await subscriber.disconnect();
        subscriberMap.delete(subKey);
        socket.emit('unsubscribed', { connectionId });
      }
    });

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
