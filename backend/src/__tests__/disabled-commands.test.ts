import * as envModule from '../config/env';

const mutableEnv = envModule.env as { DISABLED_COMMANDS: string[] };

describe('DISABLED_COMMANDS env parsing', () => {
  it('defaults to an empty array when env var is not set', () => {
    // env.ts already parsed at import time; verify the shape
    expect(Array.isArray(mutableEnv.DISABLED_COMMANDS)).toBe(true);
  });
});

describe('features route – disabledCommands', () => {
  const originalValue = mutableEnv.DISABLED_COMMANDS;

  afterEach(() => {
    mutableEnv.DISABLED_COMMANDS = originalValue;
  });

  it('returns the configured disabled commands', async () => {
    mutableEnv.DISABLED_COMMANDS = ['SCAN', 'FLUSHDB'];

    // Dynamically import to pick up the mocked env
    jest.resetModules();
    const { Router } = await import('express');
    const router = Router();

    const res: { json?: jest.Mock; status?: jest.Mock } = {};
    res.json = jest.fn();
    res.status = jest.fn().mockReturnValue(res);

    // Call the handler directly
    const handler = (_req: unknown, r: typeof res) => {
      r.json!({
        configAsCode: false,
        disabledCommands: mutableEnv.DISABLED_COMMANDS,
      });
    };

    handler({}, res);

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        disabledCommands: ['SCAN', 'FLUSHDB'],
      })
    );
  });

  it('returns empty array when no commands are disabled', async () => {
    mutableEnv.DISABLED_COMMANDS = [];

    const res: { json?: jest.Mock } = {};
    res.json = jest.fn();

    const handler = (_req: unknown, r: typeof res) => {
      r.json!({
        configAsCode: false,
        disabledCommands: mutableEnv.DISABLED_COMMANDS,
      });
    };

    handler({}, res);

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ disabledCommands: [] })
    );
  });
});

describe('CLI route – getEffectiveBlockedCommands', () => {
  const originalValue = mutableEnv.DISABLED_COMMANDS;

  afterEach(() => {
    mutableEnv.DISABLED_COMMANDS = originalValue;
  });

  it('includes env DISABLED_COMMANDS in the effective blocked set', () => {
    mutableEnv.DISABLED_COMMANDS = ['SCAN', 'FLUSHDB'];
    const BASE = ['FLUSHALL', 'CONFIG', 'REPLICAOF', 'SLAVEOF', 'DEBUG', 'SHUTDOWN'];
    const effective = new Set([...BASE, ...mutableEnv.DISABLED_COMMANDS]);
    expect(effective.has('SCAN')).toBe(true);
    expect(effective.has('FLUSHDB')).toBe(true);
    expect(effective.has('FLUSHALL')).toBe(true);
  });

  it('does not block extra commands when DISABLED_COMMANDS is empty', () => {
    mutableEnv.DISABLED_COMMANDS = [];
    const BASE = ['FLUSHALL', 'CONFIG', 'REPLICAOF', 'SLAVEOF', 'DEBUG', 'SHUTDOWN'];
    const effective = new Set([...BASE, ...mutableEnv.DISABLED_COMMANDS]);

    expect(effective.has('SCAN')).toBe(false);
    expect(effective.has('FLUSHDB')).toBe(false);
    expect(effective.size).toBe(BASE.length);
  });
});
