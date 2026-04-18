import dotenv from 'dotenv';
dotenv.config();

// Development-only fallbacks. These are intentionally easy to spot and MUST NOT
// be used in production. `validateProductionSecrets()` below will refuse to
// start the server if any of these values are in effect when NODE_ENV is set
// to "production".
const DEV_FALLBACK_JWT_ACCESS_SECRET = 'fallback_access_secret';
const DEV_FALLBACK_JWT_REFRESH_SECRET = 'fallback_refresh_secret';
const DEV_FALLBACK_ENCRYPTION_KEY = 'fallback_32_char_key_change_me!!';

export const env = {
  NODE_ENV: process.env.NODE_ENV || 'development',
  PORT: parseInt(process.env.PORT || '4000', 10),
  DATABASE_URL: process.env.DATABASE_URL || '',
  JWT_ACCESS_SECRET: process.env.JWT_ACCESS_SECRET || DEV_FALLBACK_JWT_ACCESS_SECRET,
  JWT_REFRESH_SECRET: process.env.JWT_REFRESH_SECRET || DEV_FALLBACK_JWT_REFRESH_SECRET,
  JWT_ACCESS_EXPIRES_IN: '15m',
  JWT_ACCESS_EXPIRES_IN_SECONDS: 15 * 60,
  JWT_REFRESH_EXPIRES_IN: '7d',
  SESSION_TIMEOUT_HOURS: Math.max(1, parseInt(process.env.SESSION_TIMEOUT_HOURS || '168', 10) || 168),
  ENCRYPTION_KEY: process.env.ENCRYPTION_KEY || DEV_FALLBACK_ENCRYPTION_KEY,
  FRONTEND_URL: process.env.FRONTEND_URL || 'http://localhost:3000',
  BCRYPT_ROUNDS: 12,
  OIDC_ENABLED: process.env.OIDC_ENABLED === 'true',
  OIDC_ISSUER_URL: process.env.OIDC_ISSUER_URL || '',
  OIDC_CLIENT_ID: process.env.OIDC_CLIENT_ID || '',
  OIDC_CLIENT_SECRET: process.env.OIDC_CLIENT_SECRET || '',
  OIDC_REDIRECT_URI: process.env.OIDC_REDIRECT_URI || 'http://localhost:4000/api/auth/oidc/callback',
  OIDC_SYNC_GROUPS: process.env.OIDC_SYNC_GROUPS === 'true',
  OIDC_GROUPS_CLAIM: process.env.OIDC_GROUPS_CLAIM || 'groups',
  CONFIG_FILE: process.env.CONFIG_FILE || '',
  CONFIG_AS_CODE: !!process.env.CONFIG_FILE,
  DISABLED_COMMANDS: (process.env.DISABLED_COMMANDS || '')
    .split(',')
    .map((c) => c.trim().toUpperCase())
    .filter(Boolean),
  // Opt-in escape hatch for private/loopback Redis hosts in environments where
  // the backend legitimately needs to reach internal addresses (e.g. running
  // inside the same container network as Redis). Off by default to prevent
  // SSRF against cloud metadata and internal services.
  ALLOW_PRIVATE_REDIS_HOSTS: process.env.ALLOW_PRIVATE_REDIS_HOSTS === 'true',
  // When true, TLS certificate verification for Redis connections is skipped.
  // Off by default; must be explicitly enabled for self-signed certs.
  REDIS_TLS_INSECURE: process.env.REDIS_TLS_INSECURE === 'true',
};

/**
 * Refuses to start the server in production if any secret is missing or still
 * using the development fallback value. Also enforces that ENCRYPTION_KEY is
 * exactly 32 bytes so AES-256 key derivation behaves consistently.
 *
 * Exported as a separate function (rather than running at import time) so that
 * the test suite, which sets NODE_ENV to 'test', is not affected.
 */
export function validateProductionSecrets(): void {
  if (env.NODE_ENV !== 'production') return;

  const issues: string[] = [];

  if (!process.env.JWT_ACCESS_SECRET || env.JWT_ACCESS_SECRET === DEV_FALLBACK_JWT_ACCESS_SECRET) {
    issues.push('JWT_ACCESS_SECRET is not set or uses the insecure development fallback');
  }
  if (!process.env.JWT_REFRESH_SECRET || env.JWT_REFRESH_SECRET === DEV_FALLBACK_JWT_REFRESH_SECRET) {
    issues.push('JWT_REFRESH_SECRET is not set or uses the insecure development fallback');
  }
  if (env.JWT_ACCESS_SECRET === env.JWT_REFRESH_SECRET) {
    issues.push('JWT_ACCESS_SECRET and JWT_REFRESH_SECRET must be different values');
  }
  if (!process.env.ENCRYPTION_KEY || env.ENCRYPTION_KEY === DEV_FALLBACK_ENCRYPTION_KEY) {
    issues.push('ENCRYPTION_KEY is not set or uses the insecure development fallback');
  }
  if (Buffer.byteLength(env.ENCRYPTION_KEY, 'utf8') !== 32) {
    issues.push('ENCRYPTION_KEY must be exactly 32 bytes (UTF-8) to derive a 256-bit AES key');
  }

  if (issues.length > 0) {
    const message =
      'Refusing to start in production with insecure configuration:\n - ' + issues.join('\n - ');
    throw new Error(message);
  }
}
