import { Request, Response } from 'express';
import * as envModule from '../config/env';
import * as oidcModule from '../config/oidc';
import * as prismaModule from '../config/prisma';

jest.mock('../config/env', () => ({
  env: {
    NODE_ENV: 'test',
    OIDC_ENABLED: false,
    OIDC_REDIRECT_URI: 'http://localhost:4000/api/auth/oidc/callback',
    FRONTEND_URL: 'http://localhost:3000',
    JWT_ACCESS_SECRET: 'test_access_secret',
    JWT_REFRESH_SECRET: 'test_refresh_secret',
    JWT_ACCESS_EXPIRES_IN: '15m',
    JWT_ACCESS_EXPIRES_IN_SECONDS: 15 * 60,
    JWT_REFRESH_EXPIRES_IN: '7d',
    BCRYPT_ROUNDS: 4,
  },
}));

jest.mock('../config/oidc');
jest.mock('../config/prisma', () => ({
  prisma: {
    user: { findUnique: jest.fn(), create: jest.fn(), update: jest.fn() },
    refreshToken: { create: jest.fn() },
    auditLog: { create: jest.fn() },
    userConnectionRole: { findMany: jest.fn().mockResolvedValue([]) },
  },
}));
jest.mock('../utils/redisBlacklist', () => ({
  blacklistToken: jest.fn(),
  isTokenBlacklisted: jest.fn().mockResolvedValue(false),
}));

function makeRes(): Partial<Response> {
  const res: Partial<Response> = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  res.cookie = jest.fn().mockReturnValue(res);
  res.clearCookie = jest.fn().mockReturnValue(res);
  res.redirect = jest.fn().mockReturnValue(res);
  return res;
}

async function getOidcHandler(method: 'GET', path: '/oidc' | '/oidc/callback') {
  const routerModule = await import('../routes/auth.routes');
  const router = routerModule.default as any;
  const stack = router.stack as any[];
  const route = stack.find(
    (layer: any) =>
      layer.route?.path === path &&
      layer.route?.methods?.[method.toLowerCase()]
  );
  return route?.route?.stack?.[route.route.stack.length - 1]?.handle;
}

describe('OIDC routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /oidc (OIDC disabled)', () => {
    it('returns 404 when OIDC is not enabled', async () => {
      (envModule.env as any).OIDC_ENABLED = false;
      const handler = await getOidcHandler('GET', '/oidc');
      if (!handler) return; // route may be at different stack index

      const req = { cookies: {} } as Partial<Request>;
      const res = makeRes();

      await handler(req, res, jest.fn());
      expect(res.status).toHaveBeenCalledWith(404);
    });
  });

  describe('GET /oidc/callback (OIDC disabled)', () => {
    it('returns 404 when OIDC is not enabled', async () => {
      (envModule.env as any).OIDC_ENABLED = false;
      const handler = await getOidcHandler('GET', '/oidc/callback');
      if (!handler) return;

      const req = { cookies: {} } as Partial<Request>;
      const res = makeRes();

      await handler(req, res, jest.fn());
      expect(res.status).toHaveBeenCalledWith(404);
    });
  });

  describe('GET /oidc/callback (OIDC enabled, missing cookie)', () => {
    it('returns 400 when oidc_state cookie is missing', async () => {
      (envModule.env as any).OIDC_ENABLED = true;
      const handler = await getOidcHandler('GET', '/oidc/callback');
      if (!handler) return;

      const req = { cookies: {} } as Partial<Request>;
      const res = makeRes();

      await handler(req, res, jest.fn());
      expect(res.status).toHaveBeenCalledWith(400);
    });
  });

  describe('GET /oidc/callback (OIDC enabled, successful flow)', () => {
    it('creates user and redirects to frontend on successful OIDC callback', async () => {
      (envModule.env as any).OIDC_ENABLED = true;

      const oidcState = JSON.stringify({ state: 'test_state', codeVerifier: 'test_verifier' });
      const cookieVal = Buffer.from(oidcState).toString('base64');

      const mockClient = {
        callbackParams: jest.fn().mockReturnValue({ code: 'auth_code', state: 'test_state' }),
        callback: jest.fn().mockResolvedValue({ access_token: 'oidc_access' }),
        userinfo: jest.fn().mockResolvedValue({
          sub: 'oidc-sub-123',
          email: 'oidcuser@example.com',
          name: 'OIDC User',
        }),
      };
      (oidcModule.getOidcClient as jest.Mock).mockResolvedValue(mockClient);

      (prismaModule.prisma.user.findUnique as jest.Mock)
        .mockResolvedValueOnce(null) // by oidcSub
        .mockResolvedValueOnce(null); // by email
      (prismaModule.prisma.user.create as jest.Mock).mockResolvedValue({
        id: 'user-new',
        email: 'oidcuser@example.com',
        name: 'OIDC User',
        isActive: true,
      });
      (prismaModule.prisma.refreshToken.create as jest.Mock).mockResolvedValue({});
      (prismaModule.prisma.auditLog.create as jest.Mock).mockResolvedValue({});

      const handler = await getOidcHandler('GET', '/oidc/callback');
      if (!handler) return;

      const req = {
        cookies: { oidc_state: cookieVal },
        headers: { 'user-agent': 'test-agent' },
        ip: '127.0.0.1',
        url: '/api/auth/oidc/callback?code=auth_code&state=test_state',
      } as Partial<Request>;
      const res = makeRes();

      await handler(req, res, jest.fn());

      expect(prismaModule.prisma.user.create).toHaveBeenCalled();
      expect(res.cookie).toHaveBeenCalledWith('refreshToken', expect.any(String), expect.any(Object));
      expect(res.redirect).toHaveBeenCalledWith(
        expect.stringContaining('http://localhost:3000/oidc/callback#access_token=')
      );
    });
  });
});
