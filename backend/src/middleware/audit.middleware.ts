import { Response, NextFunction } from 'express';
import { Prisma, AuditAction } from '@prisma/client';
import { prisma } from '../config/prisma';
import { AuthenticatedRequest } from '../types';

export function auditLog(action: AuditAction) {
  return async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    const originalJson = res.json.bind(res);
    res.json = (body: unknown) => {
      if (res.statusCode < 400 && req.user) {
        const connectionId = req.params.id || req.params.connectionId;
        prisma.auditLog.create({
          data: {
            userId: req.user.userId,
            connectionId: connectionId || null,
            action,
            resourceKey: req.params.key || (req.body as { key?: string })?.key,
            details: req.body as unknown as Prisma.InputJsonValue,
            ipAddress: req.ip,
            userAgent: req.headers['user-agent'],
          },
        }).catch(() => {/* ignore audit log errors */});
      }
      return originalJson(body);
    };
    next();
  };
}
