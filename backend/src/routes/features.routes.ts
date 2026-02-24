import { Router, Request, Response } from 'express';
import { env } from '../config/env';

const router = Router();

router.get('/', (_req: Request, res: Response): void => {
  res.json({
    configAsCode: env.CONFIG_AS_CODE,
    disabledCommands: env.DISABLED_COMMANDS,
  });
});

export default router;
