import { Request, Response, NextFunction } from 'express';
import { env } from '../config/env';

/**
 * Blocks write operations (POST / PATCH / DELETE) when CONFIG_AS_CODE mode is
 * active (i.e. a CONFIG_FILE has been provided).  In that mode the application
 * is the source of truth for connections and groups, so UI-driven mutations are
 * not allowed.
 */
export function requireConfigEditable(_req: Request, res: Response, next: NextFunction): void {
  if (env.CONFIG_AS_CODE) {
    res.status(403).json({
      error: 'Mutations are disabled: instance is running in config-as-code mode.',
    });
    return;
  }
  next();
}
