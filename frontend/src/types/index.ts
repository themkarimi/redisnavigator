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

export interface RedisKeyDetail extends RedisKey {
  value: unknown;
  keySize?: number;
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

export interface Group {
  id: string;
  name: string;
  description?: string;
  createdAt: string;
  updatedAt: string;
  members: GroupMember[];
  connectionRoles: GroupConnectionRole[];
}
