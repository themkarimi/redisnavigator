import { Server, Socket } from 'socket.io';
import { prisma } from '../config/prisma';
import { getRedisClient } from '../services/redis.service';
import { verifyAccessToken } from '../utils/jwt';
import { logger } from '../config/logger';

const metricsIntervals = new Map<string, ReturnType<typeof setInterval>>();

export function setupMetricsSocket(io: Server): void {
  const metricsNs = io.of('/metrics');

  metricsNs.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth.token;
      if (!token) throw new Error('No token');
      verifyAccessToken(token);
      next();
    } catch {
      next(new Error('Authentication error'));
    }
  });

  metricsNs.on('connection', (socket: Socket) => {
    socket.on('subscribe', async ({ connectionId }: { connectionId: string }) => {
      try {
        const connection = await prisma.redisConnection.findUnique({
          where: { id: connectionId, isActive: true },
        });
        if (!connection) { socket.emit('error', 'Connection not found'); return; }

        const intervalKey = `${socket.id}:${connectionId}`;

        const interval = setInterval(async () => {
          try {
            const client = await getRedisClient(connection);
            const info = await client.info('all');
            const parsed: Record<string, string> = {};
            info.split('\r\n').forEach(line => {
              if (line && !line.startsWith('#')) {
                const [k, v] = line.split(':');
                if (k && v !== undefined) parsed[k.trim()] = v.trim();
              }
            });

            socket.emit('metrics', {
              timestamp: new Date().toISOString(),
              opsPerSec: parseInt(parsed['instantaneous_ops_per_sec'] || '0'),
              usedMemory: parseInt(parsed['used_memory'] || '0'),
              connectedClients: parseInt(parsed['connected_clients'] || '0'),
              keyspaceHits: parseInt(parsed['keyspace_hits'] || '0'),
              keyspaceMisses: parseInt(parsed['keyspace_misses'] || '0'),
            });
          } catch {
            // ignore metrics errors
          }
        }, 2000);

        metricsIntervals.set(intervalKey, interval);
      } catch (err) {
        socket.emit('error', (err as Error).message);
      }
    });

    socket.on('unsubscribe', ({ connectionId }: { connectionId: string }) => {
      const intervalKey = `${socket.id}:${connectionId}`;
      const interval = metricsIntervals.get(intervalKey);
      if (interval) {
        clearInterval(interval);
        metricsIntervals.delete(intervalKey);
      }
    });

    socket.on('disconnect', () => {
      for (const [key, interval] of metricsIntervals.entries()) {
        if (key.startsWith(socket.id)) {
          clearInterval(interval);
          metricsIntervals.delete(key);
        }
      }
    });
  });
}
