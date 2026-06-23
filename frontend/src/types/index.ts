export interface User {
  id: string;
  email: string;
  name: string;
  role?: UserRole | null;
  hasPassword?: boolean;
}

export interface AuthState {
  user: User | null;
  accessToken: string | null;
  isAuthenticated: boolean;
}

export type UserRole = 'SUPERADMIN' | 'ADMIN' | 'OPERATOR' | 'VIEWER';
export type ConnectionMode = 'STANDALONE' | 'SENTINEL' | 'CLUSTER';
export type RedisKeyType = 'string' | 'hash' | 'list' | 'set' | 'zset' | 'stream' | 'none';

export interface RedisConnection {
  id: string;
  name: string;
  host: string;
  port: number;
  username?: string;
  useTLS: boolean;
  mode: ConnectionMode;
  sentinelMaster?: string;
  sentinelNodes?: { host: string; port: number }[];
  clusterNodes?: { host: string; port: number }[];
  tags: string[];
  ownerId: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  owner?: { id: string; name: string; email: string };
}

export interface RedisKey {
  key: string;
  type: RedisKeyType;
  ttl: number;
}

export type BinaryEncoding = 'utf8' | 'base64'

export interface RedisKeyDetail extends RedisKey {
  value: unknown;
  keySize?: number;
  encoding?: BinaryEncoding;
  fieldEncodings?: Record<string, BinaryEncoding>;
  elementEncodings?: BinaryEncoding[];
  memberEncodings?: BinaryEncoding[];
}

export interface ServerInfo {
  raw: string;
  parsed: Record<string, string>;
  dbsize: number;
  server: { version: string; mode: string; os: string; uptime: number };
  memory: { used: number; usedHuman: string; peak: number; peakHuman: string; maxmemory: number; maxmemoryHuman: string };
  stats: { totalCommandsProcessed: number; instantaneousOpsPerSec: number; totalConnectionsReceived: number; connectedClients: number; keyspaceHits: number; keyspaceMisses: number };
  replication: { role: string; connectedSlaves: number };
}

export interface MemoryTypeStat {
  type: string;
  count: number;
  bytes: number;
}

export interface MemoryPrefixStat {
  prefix: string;
  count: number;
  bytes: number;
}

export interface MemoryKeyStat {
  key: string;
  type: string;
  bytes: number;
  ttl: number;
}

export interface MemoryAnalysis {
  totalKeys: number;
  sampledKeys: number;
  sampleLimit: number;
  truncated: boolean;
  avgKeyBytes: number;
  sampledBytes: number;
  usedMemory: number;
  usedMemoryHuman: string;
  usedMemoryDataset: number;
  maxMemory: number;
  memFragmentationRatio: number;
  byType: MemoryTypeStat[];
  byPrefix: MemoryPrefixStat[];
  topKeys: MemoryKeyStat[];
}

export interface MetricsSnapshot {
  timestamp: string;
  opsPerSec: number;
  usedMemory: number;
  connectedClients: number;
  keyspaceHits: number;
  keyspaceMisses: number;
}

export interface UserWithRoles {
  id: string;
  email: string;
  name: string;
  isActive: boolean;
  createdAt: string;
  connectionRoles: Array<{
    role: UserRole;
    connection: { id: string; name: string } | null;
  }>;
}

export interface GroupMember {
  id: string;
  groupId: string;
  userId: string;
  createdAt: string;
  user: { id: string; name: string; email: string };
}

export interface GroupConnectionRole {
  id: string;
  groupId: string;
  connectionId: string;
  role: UserRole;
  permissions: string[];
  connection: { id: string; name: string };
}

export interface AclUserSummary {
  username: string;
  enabled: boolean;
  rules: string;
}

export interface AclUserDetail {
  username: string;
  flags: string[];
  enabled: boolean;
  nopass: boolean;
  passwordHashes: string[];
  commands: string;
  keys: string;
  channels: string;
  selectors: unknown[];
}

export interface AclUserInput {
  username?: string;
  enabled: boolean;
  nopass: boolean;
  passwords?: string[];
  keepExistingPasswords?: boolean;
  keys: string;
  channels: string;
  commands: string;
  rawRules?: string;
}

export interface Group {
  id: string;
  name: string;
  description?: string;
  createdAt: string;
  updatedAt: string;
  members: GroupMember[];
  connectionRoles: GroupConnectionRole[];
}
