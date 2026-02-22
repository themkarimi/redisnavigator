import { Server, Socket } from 'socket.io';
import Redis from 'ioredis';
import { prisma } from '../config/prisma';
import { verifyAccessToken } from '../utils/jwt';
import { decrypt } from '../utils/encryption';
import { logger } from '../config/logger';

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
        const connection = await prisma.redisConnection.findUnique({
          where: { id: connectionId, isActive: true },
        });
        if (!connection) { socket.emit('error', 'Connection not found'); return; }

        const subKey = `${socket.id}:${connectionId}`;

        if (subscriberMap.has(subKey)) {
          subscriberMap.get(subKey)?.disconnect();
        }

        const options: Record<string, unknown> = {
          host: connection.host, port: connection.port, lazyConnect: true,
        };
        if (connection.passwordEnc) options.password = decrypt(connection.passwordEnc);
        if (connection.useTLS) options.tls = {};

        const subscriber = new Redis(options as Parameters<typeof Redis>[0]);
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
        socket.emit('error', (err as Error).message);
      }
    });

    socket.on('psubscribe', async ({ connectionId, patterns }: { connectionId: string; patterns: string[] }) => {
      try {
        const subKey = `${socket.id}:${connectionId}`;
        const subscriber = subscriberMap.get(subKey);
        if (subscriber) {
          await subscriber.psubscribe(...patterns);
          socket.emit('psubscribed', { patterns });
        }
      } catch (err) {
        socket.emit('error', (err as Error).message);
      }
    });

    socket.on('publish', async ({ connectionId, channel, message }: { connectionId: string; channel: string; message: string }) => {
      try {
        const connection = await prisma.redisConnection.findUnique({
          where: { id: connectionId, isActive: true },
        });
        if (!connection) { socket.emit('error', 'Connection not found'); return; }

        const options: Record<string, unknown> = { host: connection.host, port: connection.port };
        if (connection.passwordEnc) options.password = decrypt(connection.passwordEnc);

        const publisher = new Redis(options as Parameters<typeof Redis>[0]);
        const receivers = await publisher.publish(channel, message);
        publisher.disconnect();
        socket.emit('published', { channel, message, receivers });
      } catch (err) {
        socket.emit('error', (err as Error).message);
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
