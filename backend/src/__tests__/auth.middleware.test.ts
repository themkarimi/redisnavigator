import { Request, Response, NextFunction } from 'express';
import { authMiddleware } from '../middleware/auth.middleware';
import { signAccessToken } from '../utils/jwt';
import * as redisBlacklist from '../utils/redisBlacklist';
import * as prismaModule from '../config/prisma';

jest.mock('../utils/redisBlacklist');
jest.mock('../config/prisma', () => ({
  prisma: {
    user: {
      findUnique: jest.fn(),
    },
  },
}));

describe('authMiddleware', () => {
  let mockReq: Partial<Request>;
  let mockRes: Partial<Response>;
  let mockNext: NextFunction;

  beforeEach(() => {
    mockReq = { headers: {} };
    mockRes = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };
    mockNext = jest.fn();
  });

  it('should reject requests without authorization header', async () => {
    await authMiddleware(mockReq as Request, mockRes as Response, mockNext);
    expect(mockRes.status).toHaveBeenCalledWith(401);
    expect(mockNext).not.toHaveBeenCalled();
  });

  it('should reject requests with invalid token format', async () => {
    mockReq.headers = { authorization: 'InvalidFormat token123' };
    await authMiddleware(mockReq as Request, mockRes as Response, mockNext);
    expect(mockRes.status).toHaveBeenCalledWith(401);
  });

  it('should reject blacklisted tokens', async () => {
    const token = signAccessToken({ userId: 'user1', email: 'test@test.com' });
    mockReq.headers = { authorization: `Bearer ${token}` };
    (redisBlacklist.isTokenBlacklisted as jest.Mock).mockResolvedValue(true);

    await authMiddleware(mockReq as Request, mockRes as Response, mockNext);
    expect(mockRes.status).toHaveBeenCalledWith(401);
  });

  it('should accept valid tokens and set user on request', async () => {
    const token = signAccessToken({ userId: 'user1', email: 'test@test.com' });
    mockReq.headers = { authorization: `Bearer ${token}` };
    (redisBlacklist.isTokenBlacklisted as jest.Mock).mockResolvedValue(false);
    (prismaModule.prisma.user.findUnique as jest.Mock).mockResolvedValue({
      id: 'user1', email: 'test@test.com',
    });

    await authMiddleware(mockReq as Request, mockRes as Response, mockNext);
    expect(mockNext).toHaveBeenCalled();
  });
});
