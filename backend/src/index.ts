import express from 'express';
import http from 'http';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import { Server } from 'socket.io';
import { env, validateProductionSecrets } from './config/env';
import { logger } from './config/logger';
import { prisma } from './config/prisma';
import authRoutes from './routes/auth.routes';
import connectionRoutes from './routes/connections.routes';
import keyRoutes from './routes/keys.routes';
import cliRoutes from './routes/cli.routes';
import statsRoutes from './routes/stats.routes';
import userRoutes from './routes/users.routes';
import groupRoutes from './routes/groups.routes';
import featuresRoutes from './routes/features.routes';
import { setupPubSubSocket } from './sockets/pubsub.socket';
import { setupMetricsSocket } from './sockets/metrics.socket';
import { applyConfig } from './services/config-loader';

const app = express();
// When deployed behind nginx / an ingress, the client IP arrives in the
// `X-Forwarded-For` header. Trusting one hop of proxy lets `req.ip` and
// rate-limit keying reflect the real client rather than the proxy itself.
// Operators running without a proxy are unaffected (the header won't be set).
app.set('trust proxy', Number(process.env.TRUST_PROXY_HOPS || '1'));
const httpServer = http.createServer(app);

const io = new Server(httpServer, {
  cors: {
    origin: env.FRONTEND_URL,
    credentials: true,
  },
});

// Middleware
app.use(
  helmet({
    // Baseline CSP: lock down the document to same-origin resources, permit
    // the SPA's websocket back to the same origin, and forbid inline scripts.
    // Vite production builds emit hashed assets, which are compatible with
    // `'self'`-only script-src. Operators behind a CDN can override via
    // custom helmet config in a reverse proxy if needed.
    contentSecurityPolicy: {
      useDefaults: true,
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:', 'blob:'],
        fontSrc: ["'self'", 'data:'],
        connectSrc: ["'self'", 'ws:', 'wss:'],
        objectSrc: ["'none'"],
        frameAncestors: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
      },
    },
    crossOriginResourcePolicy: { policy: 'same-site' },
  })
);
app.use(cors({
  origin: env.FRONTEND_URL,
  credentials: true,
}));
// Global body size cap. Keep this small to limit memory amplification on
// unauthenticated endpoints; routes that legitimately accept larger payloads
// (e.g. Redis value writes) can override this with a per-route parser.
app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());

// Coarse global rate limit. Protects every endpoint (including ones without a
// route-specific limiter) against brute force and naive DoS. Auth routes have
// their own stricter limiter on top of this.
app.use(
  rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 1000,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many requests, please try again later' },
  })
);

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
app.use('/api/features', featuresRoutes);

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
    // Refuse to start in production if any secret is still the dev fallback.
    validateProductionSecrets();

    await prisma.$connect();
    logger.info('Connected to database');

    if (env.CONFIG_FILE) {
      await applyConfig(env.CONFIG_FILE);
    }

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
