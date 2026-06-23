import { Router, Response } from 'express';
import { z } from 'zod';
import rateLimit from 'express-rate-limit';
import { prisma } from '../config/prisma';
import { authMiddleware } from '../middleware/auth.middleware';
import { requirePermission } from '../middleware/rbac.middleware';
import { auditLog } from '../middleware/audit.middleware';
import { getRedisClient } from '../services/redis.service';
import { ConnectionAccessRequest } from '../types';
import { AuditAction, Permission } from '@prisma/client';
import { Redis, Cluster } from 'ioredis';

const router = Router({ mergeParams: true });

const aclLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  message: { error: 'Too many requests, please try again later' },
});

router.use(authMiddleware);

async function getConnection(connectionId: string): Promise<import('@prisma/client').RedisConnection | null> {
  return prisma.redisConnection.findFirst({ where: { id: connectionId, isActive: true } });
}

// ACL is a node-local command. For a standalone we operate on the client directly;
// for a cluster every master keeps its own ACL table, so reads use the first master
// and writes fan out to all masters to keep them consistent.
function masterNodes(client: Redis | Cluster): Redis[] {
  if (client instanceof Cluster) return client.nodes('master');
  return [client as Redis];
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function aclOnNode(node: Redis, ...args: any[]): Promise<any> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (node as any).acl(...args);
}

// Friendly translation for Redis versions without ACL or where the command is blocked.
function isAclUnavailable(err: Error): boolean {
  const msg = err.message ?? '';
  return msg.includes('unknown command') || msg.includes('NOPERM') || msg.includes('ERR unknown');
}

// Flatten the RESP array ACL GETUSER returns ([key, value, key, value, ...]) into an object.
function pairsToObject(arr: unknown): Record<string, unknown> {
  if (!Array.isArray(arr)) return {};
  const out: Record<string, unknown> = {};
  for (let i = 0; i + 1 < arr.length; i += 2) {
    out[String(arr[i])] = arr[i + 1];
  }
  return out;
}

// Parse a single `ACL LIST` line: "user <name> <rule> <rule> ...".
function parseAclListLine(line: string): { username: string; enabled: boolean; rules: string } {
  const tokens = line.trim().split(/\s+/);
  // tokens[0] === 'user'
  const username = tokens[1] ?? '';
  const rules = tokens.slice(2);
  const enabled = rules.includes('on');
  return { username, enabled, rules: rules.join(' ') };
}

router.get(
  '/',
  aclLimiter,
  requirePermission(Permission.MANAGE_CONNECTION),
  async (req: ConnectionAccessRequest, res: Response): Promise<void> => {
    try {
      const connection = await getConnection(req.params.id as string);
      if (!connection) { res.status(404).json({ error: 'Connection not found' }); return; }

      const client = await getRedisClient(connection);
      const node = masterNodes(client)[0];
      const list = (await aclOnNode(node, 'LIST')) as string[];
      const users = list.map(parseAclListLine);

      res.json({ users });
    } catch (err) {
      if (isAclUnavailable(err as Error)) {
        res.status(400).json({ error: 'ACL commands are not available on this Redis instance (requires Redis 6+ with ACL enabled).' });
        return;
      }
      res.status(500).json({ error: (err as Error).message });
    }
  }
);

router.get(
  '/categories',
  aclLimiter,
  requirePermission(Permission.MANAGE_CONNECTION),
  async (req: ConnectionAccessRequest, res: Response): Promise<void> => {
    try {
      const connection = await getConnection(req.params.id as string);
      if (!connection) { res.status(404).json({ error: 'Connection not found' }); return; }

      const client = await getRedisClient(connection);
      const node = masterNodes(client)[0];
      const categories = (await aclOnNode(node, 'CAT')) as string[];

      res.json({ categories: categories.sort() });
    } catch (err) {
      if (isAclUnavailable(err as Error)) { res.status(400).json({ error: 'ACL commands are not available on this Redis instance.' }); return; }
      res.status(500).json({ error: (err as Error).message });
    }
  }
);

router.post(
  '/save',
  requirePermission(Permission.MANAGE_CONNECTION),
  async (req: ConnectionAccessRequest, res: Response): Promise<void> => {
    try {
      const connection = await getConnection(req.params.id as string);
      if (!connection) { res.status(404).json({ error: 'Connection not found' }); return; }

      const client = await getRedisClient(connection);
      await Promise.all(masterNodes(client).map((node) => aclOnNode(node, 'SAVE')));
      res.json({ message: 'ACL rules saved to the configured ACL file' });
    } catch (err) {
      const msg = (err as Error).message ?? '';
      // Redis returns this when no `aclfile` is configured (rules then live only in redis.conf).
      if (msg.includes('not configured to use an ACL file')) {
        res.status(400).json({ error: 'This Redis instance has no ACL file configured. Persist via CONFIG REWRITE instead.' });
        return;
      }
      if (isAclUnavailable(err as Error)) { res.status(400).json({ error: 'ACL commands are not available on this Redis instance.' }); return; }
      res.status(500).json({ error: (err as Error).message });
    }
  }
);

router.get(
  '/:username',
  aclLimiter,
  requirePermission(Permission.MANAGE_CONNECTION),
  async (req: ConnectionAccessRequest, res: Response): Promise<void> => {
    try {
      const connection = await getConnection(req.params.id as string);
      if (!connection) { res.status(404).json({ error: 'Connection not found' }); return; }

      const username = decodeURIComponent(req.params.username as string);
      const client = await getRedisClient(connection);
      const node = masterNodes(client)[0];
      const raw = await aclOnNode(node, 'GETUSER', username);

      if (raw === null) { res.status(404).json({ error: 'ACL user not found' }); return; }

      const parsed = pairsToObject(raw);
      const flags = Array.isArray(parsed.flags) ? (parsed.flags as string[]) : [];
      const passwords = Array.isArray(parsed.passwords) ? (parsed.passwords as string[]) : [];

      res.json({
        username,
        flags,
        enabled: flags.includes('on'),
        nopass: flags.includes('nopass'),
        passwordHashes: passwords,
        commands: parsed.commands ?? '',
        keys: parsed.keys ?? '',
        channels: parsed.channels ?? '',
        selectors: parsed.selectors ?? [],
      });
    } catch (err) {
      if (isAclUnavailable(err as Error)) { res.status(400).json({ error: 'ACL commands are not available on this Redis instance.' }); return; }
      res.status(500).json({ error: (err as Error).message });
    }
  }
);

const USERNAME_RE = /^[A-Za-z0-9._:-]{1,128}$/;
// A rule token must not contain whitespace or control characters; tokens are passed
// to ioredis as separate arguments, so this is the only injection surface to guard.
const TOKEN_RE = /^[\x21-\x7e]+$/;

const ruleBodySchema = z.object({
  enabled: z.boolean().default(true),
  nopass: z.boolean().default(false),
  passwords: z.array(z.string().min(1)).optional(),
  keepExistingPasswords: z.boolean().default(false),
  keys: z.string().default('~*'),
  channels: z.string().default('&*'),
  commands: z.string().default('-@all'),
  rawRules: z.string().optional(),
});

const createBodySchema = ruleBodySchema.extend({
  username: z.string().regex(USERNAME_RE, 'Invalid username'),
});

type RuleBody = z.infer<typeof ruleBodySchema>;

function splitTokens(field: string): string[] {
  return field.trim().length === 0 ? [] : field.trim().split(/\s+/);
}

// Build a declarative `ACL SETUSER` rule list. We always lead with `reset` so the
// resulting user matches exactly what the editor describes (what you see is what is set),
// rather than layering onto whatever rules already existed.
function buildRules(body: RuleBody, existingHashes: string[]): string[] {
  const tokens: string[] = ['reset'];
  tokens.push(body.enabled ? 'on' : 'off');

  if (body.nopass) {
    tokens.push('nopass');
  } else {
    if (body.keepExistingPasswords) {
      for (const h of existingHashes) tokens.push(`#${h}`);
    }
    for (const pw of body.passwords ?? []) tokens.push(`>${pw}`);
  }

  tokens.push(...splitTokens(body.keys));
  tokens.push(...splitTokens(body.channels));
  tokens.push(...splitTokens(body.commands));
  if (body.rawRules) tokens.push(...splitTokens(body.rawRules));

  return tokens;
}

function validateTokens(tokens: string[]): string | null {
  for (const t of tokens) {
    if (!TOKEN_RE.test(t)) return `Invalid rule token: "${t}"`;
  }
  return null;
}

async function applySetUser(client: Redis | Cluster, username: string, tokens: string[]): Promise<void> {
  // Fan out to every master so a cluster's ACL tables stay in sync.
  await Promise.all(masterNodes(client).map((node) => aclOnNode(node, 'SETUSER', username, ...tokens)));
}

router.post(
  '/',
  requirePermission(Permission.MANAGE_CONNECTION),
  auditLog(AuditAction.CREATE_ACL_USER, (req) => req.params.id as string),
  async (req: ConnectionAccessRequest, res: Response): Promise<void> => {
    try {
      const connection = await getConnection(req.params.id as string);
      if (!connection) { res.status(404).json({ error: 'Connection not found' }); return; }

      const body = createBodySchema.parse(req.body);
      const tokens = buildRules(body, []);
      const tokenError = validateTokens(tokens);
      if (tokenError) { res.status(400).json({ error: tokenError }); return; }

      const client = await getRedisClient(connection);
      const node = masterNodes(client)[0];
      const existing = await aclOnNode(node, 'GETUSER', body.username);
      if (existing !== null) { res.status(409).json({ error: 'ACL user already exists' }); return; }

      await applySetUser(client, body.username, tokens);
      res.status(201).json({ message: 'ACL user created', username: body.username });
    } catch (err) {
      if (err instanceof z.ZodError) { res.status(400).json({ error: 'Validation failed', details: err.issues }); return; }
      if (isAclUnavailable(err as Error)) { res.status(400).json({ error: 'ACL commands are not available on this Redis instance.' }); return; }
      res.status(500).json({ error: (err as Error).message });
    }
  }
);

router.put(
  '/:username',
  requirePermission(Permission.MANAGE_CONNECTION),
  auditLog(AuditAction.UPDATE_ACL_USER, (req) => req.params.id as string),
  async (req: ConnectionAccessRequest, res: Response): Promise<void> => {
    try {
      const connection = await getConnection(req.params.id as string);
      if (!connection) { res.status(404).json({ error: 'Connection not found' }); return; }

      const username = decodeURIComponent(req.params.username as string);
      if (!USERNAME_RE.test(username)) { res.status(400).json({ error: 'Invalid username' }); return; }

      const body = ruleBodySchema.parse(req.body);
      const client = await getRedisClient(connection);
      const node = masterNodes(client)[0];

      const existing = await aclOnNode(node, 'GETUSER', username);
      if (existing === null) { res.status(404).json({ error: 'ACL user not found' }); return; }

      const existingParsed = pairsToObject(existing);
      const existingHashes = Array.isArray(existingParsed.passwords) ? (existingParsed.passwords as string[]) : [];

      const tokens = buildRules(body, existingHashes);
      const tokenError = validateTokens(tokens);
      if (tokenError) { res.status(400).json({ error: tokenError }); return; }

      await applySetUser(client, username, tokens);
      res.json({ message: 'ACL user updated', username });
    } catch (err) {
      if (err instanceof z.ZodError) { res.status(400).json({ error: 'Validation failed', details: err.issues }); return; }
      if (isAclUnavailable(err as Error)) { res.status(400).json({ error: 'ACL commands are not available on this Redis instance.' }); return; }
      res.status(500).json({ error: (err as Error).message });
    }
  }
);

router.delete(
  '/:username',
  requirePermission(Permission.MANAGE_CONNECTION),
  auditLog(AuditAction.DELETE_ACL_USER, (req) => req.params.id as string),
  async (req: ConnectionAccessRequest, res: Response): Promise<void> => {
    try {
      const connection = await getConnection(req.params.id as string);
      if (!connection) { res.status(404).json({ error: 'Connection not found' }); return; }

      const username = decodeURIComponent(req.params.username as string);
      if (username === 'default') { res.status(400).json({ error: 'The default ACL user cannot be deleted' }); return; }

      const client = await getRedisClient(connection);
      const results = await Promise.all(masterNodes(client).map((node) => aclOnNode(node, 'DELUSER', username)));
      const deleted = results.reduce((sum: number, n) => sum + (Number(n) || 0), 0);

      if (deleted === 0) { res.status(404).json({ error: 'ACL user not found' }); return; }
      res.json({ message: 'ACL user deleted', username });
    } catch (err) {
      if (isAclUnavailable(err as Error)) { res.status(400).json({ error: 'ACL commands are not available on this Redis instance.' }); return; }
      res.status(500).json({ error: (err as Error).message });
    }
  }
);

export default router;
