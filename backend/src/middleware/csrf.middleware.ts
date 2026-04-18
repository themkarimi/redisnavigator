import { Request, Response, NextFunction } from 'express';
import { env } from '../config/env';

/**
 * Lightweight same-origin guard for endpoints that authenticate via cookies.
 *
 * The `refreshToken` cookie is set with `SameSite=Lax`, which already prevents
 * cross-site POSTs from sending it, but we additionally verify the request
 * `Origin` / `Referer` header matches `FRONTEND_URL`. This is a belt-and-
 * braces defence against CSRF for the cookie-authenticated subset of the API
 * (refresh, logout) and matches CodeQL's recommended mitigation.
 *
 * Same-origin requests from the SPA always include an `Origin` header on
 * POST. Requests that lack both headers (e.g. curl, server-to-server) are
 * accepted only when no refresh-token cookie is present, to keep the health
 * check and unauthenticated flows working for operators.
 */
export function sameOriginOnly(req: Request, res: Response, next: NextFunction): void {
  const hasCookie = !!req.cookies?.refreshToken;
  if (!hasCookie) {
    next();
    return;
  }

  const expected = new URL(env.FRONTEND_URL).origin;
  const origin = req.headers.origin;
  const referer = req.headers.referer;

  const matches = (value: string | undefined): boolean => {
    if (!value) return false;
    try {
      return new URL(value).origin === expected;
    } catch {
      return false;
    }
  };

  if (matches(origin) || matches(referer)) {
    next();
    return;
  }

  res.status(403).json({ error: 'Cross-site request blocked' });
}
