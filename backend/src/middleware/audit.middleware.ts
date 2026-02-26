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
          ? decodeURIComponent(req.params.key)
          : (req.body as { key?: string })?.key;
        const maskedKey = rawKey ? maskKey(rawKey) : undefined;

        // Strip sensitive value data from the details before persisting
        const { value: _value, password: _password, ...safeBody } =
          (req.body as Record<string, unknown>) ?? {};
        const safeDetails = Object.keys(safeBody).length > 0
          ? (safeBody as unknown as Prisma.InputJsonValue)
          : Prisma.JsonNull;

        prisma.auditLog.create({
          data: {
            userId,
            connectionId: connectionId || null,
            action,
            resourceKey: maskedKey,
            details: safeDetails,
            ipAddress: req.ip,
            userAgent: req.headers['user-agent'],
          },
        }).then((record) => {
          logger.info('audit', {
            auditId: record.id,
            action,
            userEmail: req.user?.email,
            connectionId: connectionId || null,
            resourceKey: maskedKey,
            ipAddress: req.ip,
          });
        }).catch(() => { /* ignore audit log errors */ });
      }
      return originalJson(body);
    };
    next();
  };
}
