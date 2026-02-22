import { Response, NextFunction } from 'express';
import { Permission, UserRole } from '@prisma/client';
import { requirePermission, requireRole } from '../middleware/rbac.middleware';
import * as prismaModule from '../config/prisma';
import { ConnectionAccessRequest, AuthenticatedRequest } from '../types';

jest.mock('../config/prisma', () => ({
  prisma: {
    userConnectionRole: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
    },
    redisConnection: {
      findUnique: jest.fn(),
    },
  },
}));

const mockPrisma = prismaModule.prisma as {
  userConnectionRole: {
    findFirst: jest.Mock;
    findUnique: jest.Mock;
  };
  redisConnection: {
    findUnique: jest.Mock;
  };
};

function makeRes(): Partial<Response> {
  return {
    status: jest.fn().mockReturnThis(),
    json: jest.fn(),
  };
}

function makeNext(): NextFunction {
  return jest.fn();
}

function makeReq(
  userId: string,
  params: Record<string, string> = {}
): Partial<ConnectionAccessRequest> {
  return {
    user: { userId, email: `${userId}@test.com` },
    params,
  };
}

describe('requirePermission', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('missing user', () => {
    it('returns 401 when req.user is absent', async () => {
      const req = { params: {} } as Partial<ConnectionAccessRequest>;
      const res = makeRes();
      const next = makeNext();

      await requirePermission(Permission.READ_KEY)(
        req as ConnectionAccessRequest,
        res as Response,
        next
      );

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ error: 'Unauthorized' });
      expect(next).not.toHaveBeenCalled();
    });
  });

  describe('SUPERADMIN', () => {
    it('passes all permission checks regardless of requested permission', async () => {
      const req = makeReq('superadmin-user', { connectionId: 'conn-1' });
      const res = makeRes();
      const next = makeNext();

      mockPrisma.userConnectionRole.findFirst.mockResolvedValue({
        userId: 'superadmin-user',
        role: UserRole.SUPERADMIN,
      });

      await requirePermission(
        Permission.READ_KEY,
        Permission.WRITE_KEY,
        Permission.DELETE_KEY,
        Permission.MANAGE_CONNECTION,
        Permission.MANAGE_USERS
      )(req as ConnectionAccessRequest, res as Response, next);

      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
      expect((req as ConnectionAccessRequest).connectionRole).toEqual({
        role: UserRole.SUPERADMIN,
        permissions: expect.arrayContaining([
          Permission.READ_KEY,
          Permission.WRITE_KEY,
          Permission.DELETE_KEY,
          Permission.MANAGE_CONNECTION,
          Permission.MANAGE_USERS,
        ]),
      });
    });

    it('SUPERADMIN passes READ_KEY check on any connection', async () => {
      const req = makeReq('superadmin-user', { id: 'conn-42' });
      const res = makeRes();
      const next = makeNext();

      mockPrisma.userConnectionRole.findFirst.mockResolvedValue({
        userId: 'superadmin-user',
        role: UserRole.SUPERADMIN,
      });

      await requirePermission(Permission.READ_KEY)(
        req as ConnectionAccessRequest,
        res as Response,
        next
      );

      expect(next).toHaveBeenCalled();
    });
  });

  describe('VIEWER role', () => {
    it('can access when requirePermission(READ_KEY) is applied', async () => {
      const req = makeReq('viewer-user', { connectionId: 'conn-1' });
      const res = makeRes();
      const next = makeNext();

      // Not a superadmin
      mockPrisma.userConnectionRole.findFirst.mockResolvedValue(null);
      // Has VIEWER role on this connection
      mockPrisma.userConnectionRole.findUnique.mockResolvedValue({
        userId: 'viewer-user',
        connectionId: 'conn-1',
        role: UserRole.VIEWER,
      });

      await requirePermission(Permission.READ_KEY)(
        req as ConnectionAccessRequest,
        res as Response,
        next
      );

      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });

    it('cannot delete keys (VIEWER lacks DELETE_KEY permission)', async () => {
      const req = makeReq('viewer-user', { connectionId: 'conn-1' });
      const res = makeRes();
      const next = makeNext();

      mockPrisma.userConnectionRole.findFirst.mockResolvedValue(null);
      mockPrisma.userConnectionRole.findUnique.mockResolvedValue({
        userId: 'viewer-user',
        connectionId: 'conn-1',
        role: UserRole.VIEWER,
      });

      await requirePermission(Permission.DELETE_KEY)(
        req as ConnectionAccessRequest,
        res as Response,
        next
      );

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({ error: 'Insufficient permissions' });
      expect(next).not.toHaveBeenCalled();
    });

    it('cannot write keys (VIEWER lacks WRITE_KEY permission)', async () => {
      const req = makeReq('viewer-user', { connectionId: 'conn-1' });
      const res = makeRes();
      const next = makeNext();

      mockPrisma.userConnectionRole.findFirst.mockResolvedValue(null);
      mockPrisma.userConnectionRole.findUnique.mockResolvedValue({
        userId: 'viewer-user',
        connectionId: 'conn-1',
        role: UserRole.VIEWER,
      });

      await requirePermission(Permission.WRITE_KEY)(
        req as ConnectionAccessRequest,
        res as Response,
        next
      );

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({ error: 'Insufficient permissions' });
      expect(next).not.toHaveBeenCalled();
    });
  });

  describe('WRITE_KEY permission enforcement', () => {
    it('user without WRITE_KEY permission gets 403', async () => {
      const req = makeReq('viewer-user', { id: 'conn-2' });
      const res = makeRes();
      const next = makeNext();

      mockPrisma.userConnectionRole.findFirst.mockResolvedValue(null);
      mockPrisma.userConnectionRole.findUnique.mockResolvedValue({
        userId: 'viewer-user',
        connectionId: 'conn-2',
        role: UserRole.VIEWER,
      });

      await requirePermission(Permission.WRITE_KEY)(
        req as ConnectionAccessRequest,
        res as Response,
        next
      );

      expect(res.status).toHaveBeenCalledWith(403);
      expect(next).not.toHaveBeenCalled();
    });

    it('user with OPERATOR role can write keys', async () => {
      const req = makeReq('operator-user', { id: 'conn-3' });
      const res = makeRes();
      const next = makeNext();

      mockPrisma.userConnectionRole.findFirst.mockResolvedValue(null);
      mockPrisma.userConnectionRole.findUnique.mockResolvedValue({
        userId: 'operator-user',
        connectionId: 'conn-3',
        role: UserRole.OPERATOR,
      });

      await requirePermission(Permission.WRITE_KEY)(
        req as ConnectionAccessRequest,
        res as Response,
        next
      );

      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });
  });

  describe('ADMIN role - connection ownership', () => {
    it('ADMIN can manage a connection they own when no explicit role record exists', async () => {
      const req = makeReq('admin-user', { id: 'owned-conn' });
      const res = makeRes();
      const next = makeNext();

      // Not a superadmin
      mockPrisma.userConnectionRole.findFirst.mockResolvedValue(null);
      // No direct role assignment on this connection
      mockPrisma.userConnectionRole.findUnique.mockResolvedValue(null);
      // But user owns the connection
      mockPrisma.redisConnection.findUnique.mockResolvedValue({
        id: 'owned-conn',
        ownerId: 'admin-user',
      });

      await requirePermission(Permission.MANAGE_CONNECTION)(
        req as ConnectionAccessRequest,
        res as Response,
        next
      );

      expect(next).toHaveBeenCalled();
      expect((req as ConnectionAccessRequest).connectionRole).toEqual({
        role: UserRole.ADMIN,
        permissions: expect.arrayContaining([Permission.MANAGE_CONNECTION]),
      });
    });

    it('ADMIN cannot access a connection they do not own and have no role on', async () => {
      const req = makeReq('admin-user', { id: 'other-conn' });
      const res = makeRes();
      const next = makeNext();

      mockPrisma.userConnectionRole.findFirst.mockResolvedValue(null);
      mockPrisma.userConnectionRole.findUnique.mockResolvedValue(null);
      // User does not own this connection
      mockPrisma.redisConnection.findUnique.mockResolvedValue(null);

      await requirePermission(Permission.MANAGE_CONNECTION)(
        req as ConnectionAccessRequest,
        res as Response,
        next
      );

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({ error: 'No access to this connection' });
      expect(next).not.toHaveBeenCalled();
    });
  });

  describe('missing connection role', () => {
    it('returns 403 with "No access to this connection" when no role record found and user does not own it', async () => {
      const req = makeReq('random-user', { connectionId: 'secret-conn' });
      const res = makeRes();
      const next = makeNext();

      mockPrisma.userConnectionRole.findFirst.mockResolvedValue(null);
      mockPrisma.userConnectionRole.findUnique.mockResolvedValue(null);
      mockPrisma.redisConnection.findUnique.mockResolvedValue(null);

      await requirePermission(Permission.READ_KEY)(
        req as ConnectionAccessRequest,
        res as Response,
        next
      );

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({ error: 'No access to this connection' });
      expect(next).not.toHaveBeenCalled();
    });

    it('returns 403 when no connectionId is present and user has no admin-level role', async () => {
      const req = makeReq('ordinary-user', {});
      const res = makeRes();
      const next = makeNext();

      // Not SUPERADMIN
      mockPrisma.userConnectionRole.findFirst.mockResolvedValueOnce(null);
      // No ADMIN role either
      mockPrisma.userConnectionRole.findFirst.mockResolvedValueOnce(null);

      await requirePermission(Permission.MANAGE_USERS)(
        req as ConnectionAccessRequest,
        res as Response,
        next
      );

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({ error: 'Insufficient permissions' });
      expect(next).not.toHaveBeenCalled();
    });
  });

  describe('connectionRole is set correctly on success', () => {
    it('sets connectionRole with effective permissions after successful check', async () => {
      const req = makeReq('operator-user', { connectionId: 'conn-ops' });
      const res = makeRes();
      const next = makeNext();

      mockPrisma.userConnectionRole.findFirst.mockResolvedValue(null);
      mockPrisma.userConnectionRole.findUnique.mockResolvedValue({
        userId: 'operator-user',
        connectionId: 'conn-ops',
        role: UserRole.OPERATOR,
      });

      await requirePermission(Permission.DELETE_KEY)(
        req as ConnectionAccessRequest,
        res as Response,
        next
      );

      expect(next).toHaveBeenCalled();
      expect((req as ConnectionAccessRequest).connectionRole).toEqual({
        role: UserRole.OPERATOR,
        permissions: expect.arrayContaining([
          Permission.READ_KEY,
          Permission.WRITE_KEY,
          Permission.DELETE_KEY,
        ]),
      });
    });
  });

  describe('error handling', () => {
    it('returns 500 when prisma throws an unexpected error', async () => {
      const req = makeReq('user-1', { connectionId: 'conn-1' });
      const res = makeRes();
      const next = makeNext();

      mockPrisma.userConnectionRole.findFirst.mockRejectedValue(new Error('DB failure'));

      await requirePermission(Permission.READ_KEY)(
        req as ConnectionAccessRequest,
        res as Response,
        next
      );

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: 'Internal server error' });
    });
  });
});

describe('requireRole', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns 401 when req.user is missing', async () => {
    const req = {} as Partial<AuthenticatedRequest>;
    const res = makeRes();
    const next = makeNext();

    await requireRole(UserRole.ADMIN)(
      req as AuthenticatedRequest,
      res as Response,
      next
    );

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: 'Unauthorized' });
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 403 when user does not have the required role', async () => {
    const req: Partial<AuthenticatedRequest> = {
      user: { userId: 'viewer-1', email: 'viewer@test.com' },
    };
    const res = makeRes();
    const next = makeNext();

    mockPrisma.userConnectionRole.findFirst.mockResolvedValue(null);

    await requireRole(UserRole.ADMIN)(
      req as AuthenticatedRequest,
      res as Response,
      next
    );

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({ error: 'Insufficient role' });
    expect(next).not.toHaveBeenCalled();
  });

  it('calls next when user has the required role', async () => {
    const req: Partial<AuthenticatedRequest> = {
      user: { userId: 'admin-1', email: 'admin@test.com' },
    };
    const res = makeRes();
    const next = makeNext();

    mockPrisma.userConnectionRole.findFirst.mockResolvedValue({
      userId: 'admin-1',
      role: UserRole.ADMIN,
    });

    await requireRole(UserRole.ADMIN)(
      req as AuthenticatedRequest,
      res as Response,
      next
    );

    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  it('accepts any of multiple allowed roles', async () => {
    const req: Partial<AuthenticatedRequest> = {
      user: { userId: 'superadmin-1', email: 'sa@test.com' },
    };
    const res = makeRes();
    const next = makeNext();

    mockPrisma.userConnectionRole.findFirst.mockResolvedValue({
      userId: 'superadmin-1',
      role: UserRole.SUPERADMIN,
    });

    await requireRole(UserRole.ADMIN, UserRole.SUPERADMIN)(
      req as AuthenticatedRequest,
      res as Response,
      next
    );

    expect(next).toHaveBeenCalled();
  });

  it('returns 500 when prisma throws', async () => {
    const req: Partial<AuthenticatedRequest> = {
      user: { userId: 'user-err', email: 'err@test.com' },
    };
    const res = makeRes();
    const next = makeNext();

    mockPrisma.userConnectionRole.findFirst.mockRejectedValue(new Error('DB crash'));

    await requireRole(UserRole.ADMIN)(
      req as AuthenticatedRequest,
      res as Response,
      next
    );

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ error: 'Internal server error' });
  });
});
