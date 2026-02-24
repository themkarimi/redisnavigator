import { Response, NextFunction } from 'express';
import { AuditAction } from '@prisma/client';
import { auditLog } from '../middleware/audit.middleware';
import { AuthenticatedRequest } from '../types';
import * as prismaModule from '../config/prisma';
import * as loggerModule from '../config/logger';

jest.mock('../config/prisma', () => ({
  prisma: {
    auditLog: {
      create: jest.fn(),
    },
  },
}));

jest.mock('../config/logger', () => ({
  logger: { info: jest.fn(), error: jest.fn() },
}));

const mockPrisma = prismaModule.prisma as unknown as {
  auditLog: { create: jest.Mock };
};

const mockLogger = loggerModule.logger as unknown as {
  info: jest.Mock;
};

function makeReq(overrides: Partial<AuthenticatedRequest> = {}): AuthenticatedRequest {
  return {
    user: { userId: 'user-1', email: 'user@test.com' },
    params: {},
    body: {},
    headers: {},
    ip: '127.0.0.1',
    ...overrides,
  } as unknown as AuthenticatedRequest;
}

function makeRes(statusCode = 200): Partial<Response> {
  const res: Partial<Response> = {
    statusCode,
    json: jest.fn().mockReturnThis(),
  };
  return res;
}

describe('auditLog middleware', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('creates an audit log with a masked key from params', async () => {
    const auditRecord = { id: 'audit-id-1' };
    mockPrisma.auditLog.create.mockResolvedValue(auditRecord);

    const req = makeReq({ params: { key: 'session%3Auser123' } });
    const res = makeRes();
    const next: NextFunction = jest.fn();

    const middleware = auditLog(AuditAction.READ_KEY);
    await middleware(req, res as Response, next);
    expect(next).toHaveBeenCalled();

    // Trigger the intercepted res.json
    (res.json as jest.Mock).call(res, { ok: true });

    // Give async prisma.create time to resolve
    await Promise.resolve();

    expect(mockPrisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          resourceKey: expect.stringMatching(/^ses\*\*\*$/),
        }),
      })
    );
  });

  it('creates an audit log with a masked key from req.body', async () => {
    const auditRecord = { id: 'audit-id-2' };
    mockPrisma.auditLog.create.mockResolvedValue(auditRecord);

    const req = makeReq({ body: { key: 'user:profile', value: 'secret-value', type: 'string' } });
    const res = makeRes();
    const next: NextFunction = jest.fn();

    const middleware = auditLog(AuditAction.WRITE_KEY);
    await middleware(req, res as Response, next);
    (res.json as jest.Mock).call(res, { ok: true });

    await Promise.resolve();

    const callArg = mockPrisma.auditLog.create.mock.calls[0][0];
    // Key should be masked
    expect(callArg.data.resourceKey).toBe('use***');
    // Sensitive value field must be stripped from details
    expect(callArg.data.details).not.toHaveProperty('value');
    // Non-sensitive fields are retained
    expect(callArg.data.details).toHaveProperty('type', 'string');
  });

  it('strips the password field from details', async () => {
    mockPrisma.auditLog.create.mockResolvedValue({ id: 'audit-id-3' });

    const req = makeReq({ body: { password: 'supersecret', username: 'admin' } });
    const res = makeRes();
    const next: NextFunction = jest.fn();

    const middleware = auditLog(AuditAction.LOGIN);
    await middleware(req, res as Response, next);
    (res.json as jest.Mock).call(res, { ok: true });

    await Promise.resolve();

    const callArg = mockPrisma.auditLog.create.mock.calls[0][0];
    expect(callArg.data.details).not.toHaveProperty('password');
    expect(callArg.data.details).toHaveProperty('username', 'admin');
  });

  it('does not create an audit log when request fails (status >= 400)', async () => {
    const req = makeReq();
    const res = makeRes(400);
    const next: NextFunction = jest.fn();

    const middleware = auditLog(AuditAction.READ_KEY);
    await middleware(req, res as Response, next);
    (res.json as jest.Mock).call(res, { error: 'bad request' });

    await Promise.resolve();
    expect(mockPrisma.auditLog.create).not.toHaveBeenCalled();
  });

  it('does not create an audit log when user is not authenticated', async () => {
    const req = makeReq({ user: undefined as unknown as AuthenticatedRequest['user'] });
    const res = makeRes();
    const next: NextFunction = jest.fn();

    const middleware = auditLog(AuditAction.READ_KEY);
    await middleware(req, res as Response, next);
    (res.json as jest.Mock).call(res, { ok: true });

    await Promise.resolve();
    expect(mockPrisma.auditLog.create).not.toHaveBeenCalled();
  });

  it('logs userEmail instead of userId in the audit logger output', async () => {
    mockPrisma.auditLog.create.mockResolvedValue({ id: 'audit-id-5' });

    const req = makeReq({ params: { key: 'mykey' } });
    const res = makeRes();
    const next: NextFunction = jest.fn();

    const middleware = auditLog(AuditAction.READ_KEY);
    await middleware(req, res as Response, next);
    (res.json as jest.Mock).call(res, { ok: true });

    await Promise.resolve();

    expect(mockLogger.info).toHaveBeenCalledWith(
      'audit',
      expect.objectContaining({
        userEmail: 'user@test.com',
      })
    );
    expect(mockLogger.info).toHaveBeenCalledWith(
      'audit',
      expect.not.objectContaining({
        userId: expect.anything(),
      })
    );
  });
});
