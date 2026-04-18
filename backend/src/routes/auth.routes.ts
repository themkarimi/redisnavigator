import { Router, Request, Response } from 'express';
import bcrypt from 'bcrypt';
import { z } from 'zod';
import rateLimit from 'express-rate-limit';
import {
  randomPKCECodeVerifier,
  calculatePKCECodeChallenge,
  randomState,
  buildAuthorizationUrl,
  authorizationCodeGrant,
  fetchUserInfo,
} from 'openid-client';
import { prisma } from '../config/prisma';
import { signAccessToken, signRefreshToken, verifyRefreshToken } from '../utils/jwt';
import { authMiddleware } from '../middleware/auth.middleware';
import { AuthenticatedRequest } from '../types';
import { env } from '../config/env';
import { AuditAction, UserRole } from '@prisma/client';
import { getOidcConfig } from '../config/oidc';
import { logger } from '../config/logger';

const router = Router();

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { error: 'Too many requests, please try again later' },
});

// Role priority for determining the "highest" global role
const ROLE_PRIORITY: Record<UserRole, number> = {
  SUPERADMIN: 4,
  ADMIN: 3,
  OPERATOR: 2,
  VIEWER: 1,
};

/**
 * Persists a new refresh token to the database and sets the refreshToken
 * cookie on the response.  Extracted to avoid duplicating the same block in
 * the login and OIDC-callback handlers.
 */
async function storeRefreshTokenAndSetCookie(
  userId: string,
  refreshToken: string,
  res: Response,
  expiresAt: Date,
): Promise<void> {
  await prisma.refreshToken.create({
    data: { token: refreshToken, userId, expiresAt },
  });

  res.cookie('refreshToken', refreshToken, {
    httpOnly: true,
    secure: env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: Math.max(0, expiresAt.getTime() - Date.now()),
  });
}

/**
 * Syncs a user's group memberships to match the groups provided by the OIDC
 * provider.  Only groups that already exist in RedisNavigator (matched by name)
 * are considered; unrecognised Keycloak groups are silently ignored.
 * Leading '/' characters are stripped from Keycloak path-style names before
 * matching (e.g. "/DevOps" → "DevOps").
 *
 * All existing group memberships for the user are replaced on every call so
 * that Keycloak remains the single source of truth for membership.
 */
async function syncOidcGroups(userId: string, rawGroupNames: string[]): Promise<void> {
  const groupNames = rawGroupNames.map((n) => n.replace(/^\//, ''));

  const matchedGroups = await prisma.group.findMany({
    where: { name: { in: groupNames } },
    select: { id: true },
  });

  const matchedGroupIds = matchedGroups.map((g) => g.id);

  await prisma.$transaction(async (tx) => {
    await tx.groupMember.deleteMany({ where: { userId } });
    if (matchedGroupIds.length > 0) {
      await tx.groupMember.createMany({
        data: matchedGroupIds.map((groupId) => ({ groupId, userId })),
        skipDuplicates: true,
      });
    }
  });
}

async function getUserHighestRole(userId: string): Promise<UserRole | null> {
  const roles = await prisma.userConnectionRole.findMany({
    where: { userId },
    select: { role: true },
  });
  if (roles.length === 0) return null;
  return roles.reduce((highest: UserRole, r: { role: UserRole }) =>
    ROLE_PRIORITY[r.role] > ROLE_PRIORITY[highest] ? r.role : highest,
    roles[0].role
  );
}

// Public config endpoint — lets the frontend know which login methods are available
// without requiring a build-time env var baked into the static bundle.
router.get('/config', (_req: Request, res: Response): void => {
  res.json({ oidcEnabled: !!env.OIDC_ENABLED });
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
});

router.post('/login', authLimiter, async (req: Request, res: Response): Promise<void> => {
  try {
    const data = loginSchema.parse(req.body);

    const user = await prisma.user.findFirst({ where: { email: data.email, isActive: true } });
    if (!user) {
      logger.warn(`Failed login attempt for unknown email (ip=${req.ip})`);
      res.status(401).json({ error: 'Invalid credentials' });
      return;
    }

    if (!user.password) {
      logger.warn(`Password login attempt on SSO account userId=${user.id} (ip=${req.ip})`);
      res.status(401).json({ error: 'This account uses SSO login' });
      return;
    }

    const isValid = await bcrypt.compare(data.password, user.password);
    if (!isValid) {
      logger.warn(`Failed login attempt for userId=${user.id} (ip=${req.ip})`);
      res.status(401).json({ error: 'Invalid credentials' });
      return;
    }

    const accessToken = signAccessToken({ userId: user.id, email: user.email });
    const sessionTimeoutSeconds = env.SESSION_TIMEOUT_HOURS * 3600;
    const sessionExpiresAt = new Date(Date.now() + sessionTimeoutSeconds * 1000);
    const refreshToken = signRefreshToken({ userId: user.id, email: user.email }, sessionTimeoutSeconds);

    await prisma.auditLog.create({
      data: {
        userId: user.id,
        action: AuditAction.LOGIN,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
      },
    });

    await storeRefreshTokenAndSetCookie(user.id, refreshToken, res, sessionExpiresAt);

    const role = await getUserHighestRole(user.id);
    res.json({
      accessToken,
      user: { id: user.id, email: user.email, name: user.name, role, hasPassword: !!user.password },
    });
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation failed', details: err.issues });
      return;
    }
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/refresh', authLimiter, async (req: Request, res: Response): Promise<void> => {
  try {
    const token = req.cookies?.refreshToken;
    if (!token) {
      res.status(401).json({ error: 'No refresh token' });
      return;
    }

    const payload = verifyRefreshToken(token);

    const storedToken = await prisma.refreshToken.findFirst({
      where: { token, isRevoked: false },
    });

    if (!storedToken || storedToken.expiresAt < new Date()) {
      res.status(401).json({ error: 'Invalid or expired refresh token' });
      return;
    }

    // Atomically mark the token as revoked. If another concurrent /refresh call
    // won the race, the update affects zero rows and we refuse this request.
    // This enforces single-use semantics for refresh tokens.
    const revokeResult = await prisma.refreshToken.updateMany({
      where: { id: storedToken.id, isRevoked: false },
      data: { isRevoked: true },
    });
    if (revokeResult.count !== 1) {
      res.status(401).json({ error: 'Invalid or expired refresh token' });
      return;
    }

    const user = await prisma.user.findFirst({ where: { id: payload.userId, isActive: true } });
    if (!user) {
      res.status(401).json({ error: 'User not found' });
      return;
    }

    const newAccessToken = signAccessToken({ userId: user.id, email: user.email });
    const remainingSeconds = Math.max(0, Math.floor((storedToken.expiresAt.getTime() - Date.now()) / 1000));
    if (remainingSeconds <= 0) {
      res.status(401).json({ error: 'Session has expired' });
      return;
    }
    const newRefreshToken = signRefreshToken({ userId: user.id, email: user.email }, remainingSeconds);

    await storeRefreshTokenAndSetCookie(user.id, newRefreshToken, res, storedToken.expiresAt);

    res.json({ accessToken: newAccessToken });
  } catch {
    res.status(401).json({ error: 'Invalid refresh token' });
  }
});

router.post('/logout', authMiddleware, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const token = req.cookies?.refreshToken;

    if (token) {
      await prisma.refreshToken.updateMany({
        where: { token, userId: req.user!.userId },
        data: { isRevoked: true },
      });
    }

    await prisma.auditLog.create({
      data: {
        userId: req.user!.userId,
        action: AuditAction.LOGOUT,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
      },
    });

    res.clearCookie('refreshToken', { path: '/' });
    res.json({ message: 'Logged out successfully' });
  } catch {
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/me', authLimiter, authMiddleware, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.userId, isActive: true },
      select: { id: true, email: true, name: true, password: true },
    });
    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }
    const role = await getUserHighestRole(user.id);
    res.json({ id: user.id, email: user.email, name: user.name, role, hasPassword: !!user.password });
  } catch {
    res.status(500).json({ error: 'Internal server error' });
  }
});

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8).max(100),
});

router.post('/change-password', authLimiter, authMiddleware, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const data = changePasswordSchema.parse(req.body);

    const user = await prisma.user.findUnique({ where: { id: req.user!.userId, isActive: true } });
    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    if (!user.password) {
      res.status(400).json({ error: 'Password change is not available for SSO accounts' });
      return;
    }

    const isValid = await bcrypt.compare(data.currentPassword, user.password);
    if (!isValid) {
      res.status(401).json({ error: 'Current password is incorrect' });
      return;
    }

    const hashedPassword = await bcrypt.hash(data.newPassword, env.BCRYPT_ROUNDS);
    await prisma.user.update({ where: { id: user.id }, data: { password: hashedPassword } });

    await prisma.auditLog.create({
      data: {
        userId: user.id,
        action: AuditAction.CHANGE_PASSWORD,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
      },
    });

    res.json({ message: 'Password changed successfully' });
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation failed', details: err.issues });
      return;
    }
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/oidc', authLimiter, async (_req: Request, res: Response): Promise<void> => {
  if (!env.OIDC_ENABLED) {
    res.status(404).json({ error: 'OIDC login is not enabled' });
    return;
  }

  try {
    const config = await getOidcConfig();
    const codeVerifier = randomPKCECodeVerifier();
    const codeChallenge = await calculatePKCECodeChallenge(codeVerifier);
    const state = randomState();

    const oidcState = JSON.stringify({ state, codeVerifier });
    res.cookie('oidc_state', Buffer.from(oidcState).toString('base64'), {
      httpOnly: true,
      secure: env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 5 * 60 * 1000,
    });

    const authUrl = buildAuthorizationUrl(config, {
      redirect_uri: env.OIDC_REDIRECT_URI,
      scope: 'openid email profile',
      state,
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
    });

    res.redirect(authUrl.href);
  } catch (err) {
    logger.error('Failed to initiate OIDC login:', err);
    res.status(500).json({ error: 'Failed to initiate OIDC login' });
  }
});

router.get('/oidc/callback', async (req: Request, res: Response): Promise<void> => {
  if (!env.OIDC_ENABLED) {
    res.status(404).json({ error: 'OIDC login is not enabled' });
    return;
  }

  try {
    const rawCookie = req.cookies?.oidc_state;
    if (!rawCookie) {
      res.status(400).json({ error: 'Missing OIDC state cookie' });
      return;
    }

    let state: string;
    let codeVerifier: string;
    try {
      ({ state, codeVerifier } = JSON.parse(Buffer.from(rawCookie, 'base64').toString()));
    } catch {
      res.status(400).json({ error: 'Invalid OIDC state cookie' });
      return;
    }
    res.clearCookie('oidc_state');

    const config = await getOidcConfig();
    const callbackUrl = new URL(
      `${env.OIDC_REDIRECT_URI}?${new URLSearchParams(req.query as Record<string, string>).toString()}`
    );
    const tokens = await authorizationCodeGrant(config, callbackUrl, {
      pkceCodeVerifier: codeVerifier,
      expectedState: state,
    });

    const claims = tokens.claims();
    const sub = claims?.sub ?? '';
    const email = claims?.email as string | undefined;
    const name = (claims?.name ?? claims?.preferred_username ?? email ?? sub) as string;

    // Fetch full user profile if claims are insufficient
    const userinfo = (!email && tokens.access_token)
      ? await fetchUserInfo(config, tokens.access_token, sub)
      : claims;

    const resolvedEmail = email ?? (userinfo?.email as string | undefined);
    const resolvedName = name || (userinfo?.name as string | undefined) || resolvedEmail || sub;

    if (!resolvedEmail) {
      res.redirect(`${env.FRONTEND_URL}/login?error=oidc_no_email`);
      return;
    }

    let user = await prisma.user.findUnique({ where: { oidcSub: sub } });

    if (!user) {
      user = await prisma.user.findUnique({ where: { email: resolvedEmail } });
      if (user) {
        user = await prisma.user.update({ where: { id: user.id }, data: { oidcSub: sub } });
      } else {
        user = await prisma.user.create({
          data: { email: resolvedEmail, name: resolvedName, oidcSub: sub },
        });
      }
    }

    if (!user.isActive) {
      res.redirect(`${env.FRONTEND_URL}/login?error=account_inactive`);
      return;
    }

    if (env.OIDC_SYNC_GROUPS) {
      const rawGroups = (claims?.[env.OIDC_GROUPS_CLAIM] ?? userinfo?.[env.OIDC_GROUPS_CLAIM]) as unknown;
      const groupNames = Array.isArray(rawGroups)
        ? (rawGroups as unknown[]).filter((item): item is string => typeof item === 'string')
        : [];
      await syncOidcGroups(user.id, groupNames);
    }

    const accessToken = signAccessToken({ userId: user.id, email: user.email });
    const sessionTimeoutSeconds = env.SESSION_TIMEOUT_HOURS * 3600;
    const sessionExpiresAt = new Date(Date.now() + sessionTimeoutSeconds * 1000);
    const refreshToken = signRefreshToken({ userId: user.id, email: user.email }, sessionTimeoutSeconds);

    await prisma.auditLog.create({
      data: {
        userId: user.id,
        action: AuditAction.LOGIN,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
      },
    });

    await storeRefreshTokenAndSetCookie(user.id, refreshToken, res, sessionExpiresAt);

    const userParam = encodeURIComponent(JSON.stringify({ id: user.id, email: user.email, name: user.name, role: await getUserHighestRole(user.id), hasPassword: !!user.password }));
    res.redirect(`${env.FRONTEND_URL}/oidc/callback#access_token=${accessToken}&user=${userParam}`);
  } catch (err) {
    logger.error('OIDC callback failed:', err);
    res.redirect(`${env.FRONTEND_URL}/login?error=oidc_failed`);
  }
});

export default router;
