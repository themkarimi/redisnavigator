import { discovery, type Configuration } from 'openid-client';
import { env } from './env';
import { logger } from './logger';

let oidcConfig: Configuration | null = null;

export async function getOidcConfig(): Promise<Configuration> {
  if (oidcConfig) {
    return oidcConfig;
  }

  try {
    oidcConfig = await discovery(
      new URL(env.OIDC_ISSUER_URL),
      env.OIDC_CLIENT_ID,
      env.OIDC_CLIENT_SECRET,
    );

    logger.info(`OIDC configuration discovered for issuer: ${env.OIDC_ISSUER_URL}`);
    return oidcConfig;
  } catch (err) {
    logger.error('Failed to initialize OIDC configuration. Check OIDC configuration:', err);
    throw err;
  }
}
