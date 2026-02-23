import express from 'express';
import http from 'http';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { Server } from 'socket.io';
import { env } from './config/env';
import { logger } from './config/logger';
import { prisma } from './config/prisma';
import authRoutes from './routes/auth.routes';
import connectionRoutes from './routes/connections.routes';
import keyRoutes from './routes/keys.routes';
import cliRoutes from './routes/cli.routes';
import statsRoutes from './routes/stats.routes';
import userRoutes from './routes/users.routes';
import groupRoutes from './routes/groups.routes';
import { setupPubSubSocket } from './sockets/pubsub.socket';
import { setupMetricsSocket } from './sockets/metrics.socket';

const app = express();
const httpServer = http.createServer(app);

const io = new Server(httpServer, {
  cors: {
    origin: env.FRONTEND_URL,
    credentials: true,
  },
});

// Middleware
app.use(helmet({
  contentSecurityPolicy: false,
}));
app.use(cors({
  origin: env.FRONTEND_URL,
  credentials: true,
}));
app.use(express.json({ limit: '10mb' }));
app.use(cookieParser());

// Health check
app.get('/health', (_, res) => res.json({ status: 'ok', timestamp: new Date().toISOString() }));

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/groups', groupRoutes);
app.use('/api/connections', connectionRoutes);
app.use('/api/connections/:id/keys', keyRoutes);
app.use('/api/connections/:id/cli', cliRoutes);
app.use('/api/connections/:id', statsRoutes);

// Socket.IO namespaces
setupPubSubSocket(io);
setupMetricsSocket(io);

// Global error handler
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  logger.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

async function main() {
  try {
    await prisma.$connect();
    logger.info('Connected to database');

    httpServer.listen(env.PORT, () => {
      logger.info(`Server running on port ${env.PORT} in ${env.NODE_ENV} mode`);
    });
  } catch (err) {
    logger.error('Failed to start server:', err);
    process.exit(1);
  }
}

main();

export { app, io };
