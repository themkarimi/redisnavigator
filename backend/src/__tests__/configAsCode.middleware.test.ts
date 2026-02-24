import { Request, Response, NextFunction } from 'express';
import { requireConfigEditable } from '../middleware/configAsCode.middleware';
import * as envModule from '../config/env';

// Cast env to a writable object for test manipulation
const mutableEnv = envModule.env as { CONFIG_AS_CODE: boolean };

function makeRes(): { status: jest.Mock; json: jest.Mock } {
  const res = { status: jest.fn(), json: jest.fn() };
  res.status.mockReturnValue(res);
  return res;
}

describe('requireConfigEditable', () => {
  const originalValue = mutableEnv.CONFIG_AS_CODE;

  afterEach(() => {
    mutableEnv.CONFIG_AS_CODE = originalValue;
  });

  it('calls next() when CONFIG_AS_CODE is false', () => {
    mutableEnv.CONFIG_AS_CODE = false;
    const req = {} as Request;
    const res = makeRes() as unknown as Response;
    const next: NextFunction = jest.fn();

    requireConfigEditable(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  it('returns 403 when CONFIG_AS_CODE is true', () => {
    mutableEnv.CONFIG_AS_CODE = true;
    const req = {} as Request;
    const res = makeRes() as unknown as Response;
    const next: NextFunction = jest.fn();

    requireConfigEditable(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: expect.stringContaining('config-as-code') })
    );
  });
});
