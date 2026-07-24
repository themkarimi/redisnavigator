import { Response, NextFunction } from 'express';
import { Prisma, AuditAction } from '@prisma/client';
import { prisma } from '../config/prisma';
import { logger } from '../config/logger';
import { AuthenticatedRequest } from '../types';
import { maskKey } from '../utils/maskKey';

// ACL SETUSER rule tokens carry inline secrets as `>password` (set password) or
// `#hash` (set password hash); redact both before persisting to the audit log.
function redactRawRules(rawRules: string): string {
  return rawRules
    .split(/\s+/)
    .map((token) => (token.startsWith('>') || token.startsWith('#') ? `${token[0]}[REDACTED]` : token))
    .join(' ');
}

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
        const { value: _value, password: _password, passwords: _passwords, rawRules: _rawRules, ...safeBody } =
          (req.body as Record<string, unknown>) ?? {};
        if (typeof _rawRules === 'string') {
          (safeBody as Record<string, unknown>).rawRules = redactRawRules(_rawRules);
        }
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
