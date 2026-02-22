import dotenv from 'dotenv';
dotenv.config();

export const env = {
  NODE_ENV: process.env.NODE_ENV || 'development',
  PORT: parseInt(process.env.PORT || '4000', 10),
  DATABASE_URL: process.env.DATABASE_URL || '',
  JWT_ACCESS_SECRET: process.env.JWT_ACCESS_SECRET || 'fallback_access_secret',
  JWT_REFRESH_SECRET: process.env.JWT_REFRESH_SECRET || 'fallback_refresh_secret',
  JWT_ACCESS_EXPIRES_IN: '15m',
  JWT_REFRESH_EXPIRES_IN: '7d',
  ENCRYPTION_KEY: process.env.ENCRYPTION_KEY || 'fallback_32_char_key_change_me!!',
  REDIS_BLACKLIST_URL: process.env.REDIS_BLACKLIST_URL || 'redis://localhost:6379',
  REDIS_BLACKLIST_PASSWORD: process.env.REDIS_BLACKLIST_PASSWORD || undefined,
  FRONTEND_URL: process.env.FRONTEND_URL || 'http://localhost:3000',
  BCRYPT_ROUNDS: 12,
  OIDC_ENABLED: process.env.OIDC_ENABLED === 'true',
  OIDC_ISSUER_URL: process.env.OIDC_ISSUER_URL || '',
  OIDC_CLIENT_ID: process.env.OIDC_CLIENT_ID || '',
  OIDC_CLIENT_SECRET: process.env.OIDC_CLIENT_SECRET || '',
  OIDC_REDIRECT_URI: process.env.OIDC_REDIRECT_URI || 'http://localhost:4000/api/auth/oidc/callback',
};
