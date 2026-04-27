import { Response, NextFunction } from 'express';
import { Prisma, AuditAction } from '@prisma/client';
import { prisma } from '../config/prisma';
import { logger } from '../config/logger';
import { AuthenticatedRequest } from '../types';
import { maskKey } from '../utils/maskKey';

export function auditLog(
  action: AuditAction,
  getConnectionId?: (req: AuthenticatedRequest) => string | null | undefined,
) {
  return async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    const originalJson = res.json.bind(res);
    res.json = (body: unknown) => {
      if (res.statusCode < 400 && req.user) {
        const { userId } = req.user;
        const connectionId = getConnectionId ? getConnectionId(req) : null;
        const rawKey = req.params.key
          ? decodeURIComponent(req.params.key as string)
          : (req.body as { key?: string })?.key;
        const maskedKey = rawKey ? maskKey(rawKey) : undefined;

        // Strip sensitive value data from the details before persisting
        const { value: _value, password: _password, ...safeBody } =
          (req.body as Record<string, unknown>) ?? {};
        const safeDetails = Object.keys(safeBody).length > 0
          ? (safeBody as unknown as Prisma.InputJsonValue)
          : Prisma.JsonNull;

        const cliCommand = (req.body as { command?: string })?.command ?? null;

        const createAuditRecord = async () => {
          let connectionName: string | null = null;
          if (connectionId) {
            const connection = await prisma.redisConnection.findUnique({
              where: { id: connectionId },
              select: { name: true },
            });
            connectionName = connection?.name ?? null;
          }

          const record = await prisma.auditLog.create({
            data: {
              userId,
              connectionId: connectionId || null,
              connectionName,
              action,
              resourceKey: maskedKey,
              details: safeDetails,
              ipAddress: req.ip,
              userAgent: req.headers['user-agent'],
            },
          });

          const logPayload: Record<string, unknown> = {
            auditId: record.id,
            action,
            userEmail: req.user?.email,
            connectionName: connectionName || null,
            resourceKey: maskedKey,
            ipAddress: req.ip,
          };
          if (cliCommand) {
            logPayload.cliCommand = cliCommand;
          }
          logger.info('audit', logPayload);
        };

        createAuditRecord().catch(() => { /* ignore audit log errors */ });
      }
      return originalJson(body);
    };
    next();
  };
}
