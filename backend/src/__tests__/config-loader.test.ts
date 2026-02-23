import fs from 'fs';
import os from 'os';
import path from 'path';
import { applyConfig, resolveEnvVars, resolveEnvVarsDeep } from '../services/config-loader';
import * as prismaModule from '../config/prisma';

// ---------------------------------------------------------------------------
// Mock Prisma
// ---------------------------------------------------------------------------

jest.mock('../config/prisma', () => ({
  prisma: {
    userConnectionRole: {
      findFirst: jest.fn(),
      upsert: jest.fn(),
    },
    redisConnection: {
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    group: {
      upsert: jest.fn(),
    },
    groupMember: {
      upsert: jest.fn(),
    },
    groupConnectionRole: {
      upsert: jest.fn(),
    },
    user: {
      findUnique: jest.fn(),
    },
  },
}));

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockPrisma = (prismaModule.prisma as any);

// ---------------------------------------------------------------------------
// Mock encryption so tests don't need a real ENCRYPTION_KEY
// ---------------------------------------------------------------------------

jest.mock('../utils/encryption', () => ({
  encrypt: (v: string) => `enc:${v}`,
}));

// ---------------------------------------------------------------------------
// Mock logger to keep test output clean
// ---------------------------------------------------------------------------

jest.mock('../config/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function writeTempYaml(content: string): string {
  const file = path.join(os.tmpdir(), `test-config-${Date.now()}.yaml`);
  fs.writeFileSync(file, content, 'utf8');
  return file;
}

function cleanup(file: string) {
  if (fs.existsSync(file)) fs.unlinkSync(file);
}

// ---------------------------------------------------------------------------
// resolveEnvVars
// ---------------------------------------------------------------------------

describe('resolveEnvVars', () => {
  const ORIGINAL = process.env;

  beforeEach(() => {
    process.env = { ...ORIGINAL };
  });
  afterEach(() => {
    process.env = ORIGINAL;
  });

  it('replaces a known env var token', () => {
    process.env.MY_SECRET = 'hello';
    expect(resolveEnvVars('value is ${MY_SECRET}')).toBe('value is hello');
  });

  it('leaves the token unchanged when the env var is not set', () => {
    delete process.env.UNSET_VAR;
    expect(resolveEnvVars('${UNSET_VAR}')).toBe('${UNSET_VAR}');
  });

  it('handles a string with no tokens', () => {
    expect(resolveEnvVars('plain string')).toBe('plain string');
  });

  it('replaces multiple tokens in the same string', () => {
    process.env.A = 'foo';
    process.env.B = 'bar';
    expect(resolveEnvVars('${A}-${B}')).toBe('foo-bar');
  });
});

// ---------------------------------------------------------------------------
// resolveEnvVarsDeep
// ---------------------------------------------------------------------------

describe('resolveEnvVarsDeep', () => {
  const ORIGINAL = process.env;

  beforeEach(() => {
    process.env = { ...ORIGINAL, DEEP_VAR: 'deep_value' };
  });
  afterEach(() => {
    process.env = ORIGINAL;
  });

  it('resolves tokens in nested objects', () => {
    const result = resolveEnvVarsDeep({ a: { b: '${DEEP_VAR}' } });
    expect(result).toEqual({ a: { b: 'deep_value' } });
  });

  it('resolves tokens in arrays', () => {
    const result = resolveEnvVarsDeep(['${DEEP_VAR}', 'plain']);
    expect(result).toEqual(['deep_value', 'plain']);
  });

  it('passes through non-string scalars', () => {
    expect(resolveEnvVarsDeep(42)).toBe(42);
    expect(resolveEnvVarsDeep(true)).toBe(true);
    expect(resolveEnvVarsDeep(null)).toBe(null);
  });
});

// ---------------------------------------------------------------------------
// applyConfig
// ---------------------------------------------------------------------------

describe('applyConfig', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('does nothing when the config file does not exist', async () => {
    await applyConfig('/tmp/does-not-exist.yaml');
    expect(mockPrisma.userConnectionRole.findFirst).not.toHaveBeenCalled();
  });

  it('does nothing when the config file is empty', async () => {
    const path = writeTempYaml('');
    try {
      await applyConfig(path);
      expect(mockPrisma.userConnectionRole.findFirst).not.toHaveBeenCalled();
    } finally {
      cleanup(path);
    }
  });

  it('creates a new connection when it does not exist in the DB', async () => {
    const path = writeTempYaml(`
connections:
  - name: "Test Redis"
    host: localhost
    port: 6379
`);
    try {
      // SUPERADMIN owner found
      mockPrisma.userConnectionRole.findFirst.mockResolvedValue({
        user: { id: 'owner-id' },
      });
      // Connection not yet in DB
      mockPrisma.redisConnection.findFirst.mockResolvedValue(null);
      mockPrisma.redisConnection.create.mockResolvedValue({ id: 'conn-1' });
      mockPrisma.userConnectionRole.upsert.mockResolvedValue({});

      await applyConfig(path);

      expect(mockPrisma.redisConnection.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ name: 'Test Redis', host: 'localhost' }),
        })
      );
    } finally {
      cleanup(path);
    }
  });

  it('updates an existing connection', async () => {
    const path = writeTempYaml(`
connections:
  - name: "Existing Redis"
    host: new-host
    port: 6380
`);
    try {
      mockPrisma.userConnectionRole.findFirst.mockResolvedValue({
        user: { id: 'owner-id' },
      });
      mockPrisma.redisConnection.findFirst.mockResolvedValue({ id: 'existing-conn' });
      mockPrisma.redisConnection.update.mockResolvedValue({ id: 'existing-conn' });

      await applyConfig(path);

      expect(mockPrisma.redisConnection.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'existing-conn' },
          data: expect.objectContaining({ host: 'new-host', port: 6380 }),
        })
      );
      expect(mockPrisma.redisConnection.create).not.toHaveBeenCalled();
    } finally {
      cleanup(path);
    }
  });

  it('skips connection when no SUPERADMIN owner is found', async () => {
    const path = writeTempYaml(`
connections:
  - name: "Orphan Redis"
    host: localhost
`);
    try {
      mockPrisma.userConnectionRole.findFirst.mockResolvedValue(null);

      await applyConfig(path);

      expect(mockPrisma.redisConnection.create).not.toHaveBeenCalled();
    } finally {
      cleanup(path);
    }
  });

  it('upserts a group and its connection assignment', async () => {
    const path = writeTempYaml(`
groups:
  - name: "Ops Team"
    connections:
      - name: "Prod Redis"
        role: OPERATOR
`);
    try {
      mockPrisma.userConnectionRole.findFirst.mockResolvedValue(null);
      mockPrisma.group.upsert.mockResolvedValue({ id: 'group-1' });
      mockPrisma.redisConnection.findFirst.mockResolvedValue({ id: 'prod-conn' });
      mockPrisma.groupConnectionRole.upsert.mockResolvedValue({});

      await applyConfig(path);

      expect(mockPrisma.group.upsert).toHaveBeenCalledWith(
        expect.objectContaining({ where: { name: 'Ops Team' } })
      );
      expect(mockPrisma.groupConnectionRole.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { groupId_connectionId: { groupId: 'group-1', connectionId: 'prod-conn' } },
          create: expect.objectContaining({ role: 'OPERATOR' }),
        })
      );
    } finally {
      cleanup(path);
    }
  });

  it('adds a user to a group when the user exists', async () => {
    const path = writeTempYaml(`
groups:
  - name: "Dev Team"
    members:
      - email: dev@example.com
`);
    try {
      mockPrisma.userConnectionRole.findFirst.mockResolvedValue(null);
      mockPrisma.group.upsert.mockResolvedValue({ id: 'grp-dev' });
      mockPrisma.user.findUnique.mockResolvedValue({ id: 'user-dev' });
      mockPrisma.groupMember.upsert.mockResolvedValue({});

      await applyConfig(path);

      expect(mockPrisma.groupMember.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { groupId_userId: { groupId: 'grp-dev', userId: 'user-dev' } },
        })
      );
    } finally {
      cleanup(path);
    }
  });

  it('skips a group member whose email does not exist in the DB', async () => {
    const path = writeTempYaml(`
groups:
  - name: "Ghost Team"
    members:
      - email: ghost@example.com
`);
    try {
      mockPrisma.userConnectionRole.findFirst.mockResolvedValue(null);
      mockPrisma.group.upsert.mockResolvedValue({ id: 'grp-ghost' });
      mockPrisma.user.findUnique.mockResolvedValue(null);

      await applyConfig(path);

      expect(mockPrisma.groupMember.upsert).not.toHaveBeenCalled();
    } finally {
      cleanup(path);
    }
  });

  it('assigns a user permission via the permissions section', async () => {
    const path = writeTempYaml(`
permissions:
  - userEmail: alice@example.com
    connection: "My Redis"
    role: VIEWER
`);
    try {
      mockPrisma.userConnectionRole.findFirst.mockResolvedValue(null);
      mockPrisma.user.findUnique.mockResolvedValue({ id: 'alice-id' });
      mockPrisma.redisConnection.findFirst.mockResolvedValue({ id: 'my-conn' });
      mockPrisma.userConnectionRole.upsert.mockResolvedValue({});

      await applyConfig(path);

      expect(mockPrisma.userConnectionRole.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId_connectionId: { userId: 'alice-id', connectionId: 'my-conn' } },
          create: expect.objectContaining({ role: 'VIEWER' }),
        })
      );
    } finally {
      cleanup(path);
    }
  });

  it('skips a permission entry when the user is not in the DB', async () => {
    const path = writeTempYaml(`
permissions:
  - userEmail: unknown@example.com
    connection: "My Redis"
    role: VIEWER
`);
    try {
      mockPrisma.userConnectionRole.findFirst.mockResolvedValue(null);
      mockPrisma.user.findUnique.mockResolvedValue(null);

      await applyConfig(path);

      expect(mockPrisma.userConnectionRole.upsert).not.toHaveBeenCalled();
    } finally {
      cleanup(path);
    }
  });

  it('skips a permission entry when the connection is not in the DB', async () => {
    const path = writeTempYaml(`
permissions:
  - userEmail: bob@example.com
    connection: "Missing Redis"
    role: OPERATOR
`);
    try {
      mockPrisma.userConnectionRole.findFirst.mockResolvedValue(null);
      mockPrisma.user.findUnique.mockResolvedValue({ id: 'bob-id' });
      mockPrisma.redisConnection.findFirst.mockResolvedValue(null);

      await applyConfig(path);

      expect(mockPrisma.userConnectionRole.upsert).not.toHaveBeenCalled();
    } finally {
      cleanup(path);
    }
  });

  it('encrypts the password when provided', async () => {
    const path = writeTempYaml(`
connections:
  - name: "Secure Redis"
    host: secure.example.com
    password: "mysecret"
`);
    try {
      mockPrisma.userConnectionRole.findFirst.mockResolvedValue({
        user: { id: 'owner-id' },
      });
      mockPrisma.redisConnection.findFirst.mockResolvedValue(null);
      mockPrisma.redisConnection.create.mockResolvedValue({ id: 'secure-conn' });
      mockPrisma.userConnectionRole.upsert.mockResolvedValue({});

      await applyConfig(path);

      expect(mockPrisma.redisConnection.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ passwordEnc: 'enc:mysecret' }),
        })
      );
    } finally {
      cleanup(path);
    }
  });
});
