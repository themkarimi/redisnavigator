import { Issuer, Client } from 'openid-client';
import { env } from './env';
import { logger } from './logger';

let oidcClient: Client | null = null;

export async function getOidcClient(): Promise<Client> {
  if (oidcClient) {
    return oidcClient;
  }

  try {
    const issuer = await Issuer.discover(env.OIDC_ISSUER_URL);
    oidcClient = new issuer.Client({
      client_id: env.OIDC_CLIENT_ID,
      client_secret: env.OIDC_CLIENT_SECRET,
      redirect_uris: [env.OIDC_REDIRECT_URI],
      response_types: ['code'],
    });

    logger.info(`OIDC client initialized for issuer: ${issuer.issuer}`);
    return oidcClient;
  } catch (err) {
    logger.error('Failed to initialize OIDC client. Check OIDC configuration:', err);
    throw err;
  }
}
