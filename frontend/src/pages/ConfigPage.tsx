import { useState, useMemo } from 'react'
import { useParams } from 'react-router-dom'
import { RefreshCw, Search, Info } from 'lucide-react'
import { useRedisConfig } from '@/hooks/useServerInfo'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/utils/cn'

// ---------------------------------------------------------------------------
// Per-key descriptions shown as tooltips
// ---------------------------------------------------------------------------

const CONFIG_DESCRIPTIONS: Record<string, string> = {
  // Network
  'bind': 'Network interfaces the server listens on. Use 127.0.0.1 for local-only access.',
  'port': 'TCP port Redis listens on. Default is 6379.',
  'tcp-backlog': 'Size of the TCP listen backlog queue for pending connections.',
  'tcp-keepalive': 'Interval (seconds) for TCP keepalive probes to detect dead peers.',
  'timeout': 'Idle client connection timeout in seconds. 0 disables it.',
  'unixsocket': 'Path to the Unix domain socket file for local connections.',
  'unixsocketperm': 'File permissions for the Unix socket.',
  'tls-port': 'TCP port for TLS/SSL encrypted connections.',
  'tls-cert-file': 'Path to the PEM-encoded TLS certificate file.',
  'tls-key-file': 'Path to the PEM-encoded TLS private key file.',
  'tls-ca-cert-file': 'Path to the PEM-encoded CA certificate for client verification.',
  'tls-ca-cert-dir': 'Directory containing PEM-encoded CA certificates.',
  'tls-auth-clients': 'Whether clients must authenticate with a certificate.',
  'tls-replication': 'Use TLS for replication connections.',
  'tls-cluster': 'Use TLS for cluster bus connections.',
  'tls-protocols': 'Allowed TLS protocol versions (e.g. TLSv1.2 TLSv1.3).',
  'tls-ciphers': 'Allowed TLS ciphers for TLSv1.2 and older.',
  'tls-ciphersuites': 'Allowed TLS 1.3 cipher suites.',
  'tls-prefer-server-ciphers': 'Prefer server cipher order over client order.',

  // Memory
  'maxmemory': 'Maximum memory Redis can use for data. 0 means no limit.',
  'maxmemory-policy': 'Eviction policy when the memory limit is reached (e.g. allkeys-lru, volatile-ttl).',
  'maxmemory-samples': 'Number of keys sampled for LRU/LFU eviction approximation.',
  'maxmemory-eviction-tenacity': 'How aggressively to evict keys when at the memory limit (0–100).',
  'active-defrag-enabled': 'Enable active memory defragmentation to reclaim fragmented memory.',
  'active-defrag-ignore-bytes': 'Minimum bytes of fragmentation before defragmentation starts.',
  'active-defrag-threshold-lower': 'Minimum fragmentation percentage to trigger defragmentation.',
  'active-defrag-threshold-upper': 'Fragmentation percentage at which defragmentation runs at max speed.',
  'active-defrag-cycle-min': 'Minimum CPU percentage dedicated to defragmentation.',
  'active-defrag-cycle-max': 'Maximum CPU percentage dedicated to defragmentation.',
  'active-defrag-max-scan-fields': 'Max number of set/hash/zset/list fields scanned per defrag cycle.',
  'lazyfree-lazy-eviction': 'Free evicted keys asynchronously in a background thread.',
  'lazyfree-lazy-expire': 'Free expired keys asynchronously in a background thread.',
  'lazyfree-lazy-server-del': 'Free deleted keys asynchronously (e.g. on DEL or RENAME).',
  'lazyfree-lazy-user-del': 'Free keys on user-issued DEL commands asynchronously.',
  'lazyfree-lazy-user-flush': 'Flush databases asynchronously on user-issued FLUSHDB/FLUSHALL.',
  'replica-lazy-flush': 'Flush the replica dataset asynchronously before a full resync.',
  'mem-replication-backlog': 'Memory reserved for the replication backlog buffer.',
  'mem-clients-slaves': 'Memory reserved for replica client output buffers.',
  'mem-clients-normal': 'Memory reserved for normal client output buffers.',
  'mem-aof-buffer': 'Memory reserved for the AOF sds buffer.',

  // Persistence
  'save': 'RDB snapshot triggers: save after N seconds if at least M keys changed.',
  'rdbcompression': 'Compress RDB snapshots with LZF to save disk space.',
  'rdbchecksum': 'Add a CRC64 checksum at the end of RDB files for integrity checking.',
  'dbfilename': 'Filename for the RDB dump file.',
  'dir': 'Working directory for RDB and AOF persistence files.',
  'appendonly': 'Enable Append-Only File (AOF) persistence for better durability.',
  'appendfilename': 'Filename for the AOF log file.',
  'appenddirname': 'Directory for the AOF files (used with multi-part AOF).',
  'appendfsync': 'Fsync policy for AOF: always, everysec (recommended), or no.',
  'no-appendfsync-on-rewrite': 'Skip fsync during AOF rewrite to avoid latency spikes.',
  'auto-aof-rewrite-percentage': 'Trigger AOF rewrite when file grows by this percentage over the base size.',
  'auto-aof-rewrite-min-size': 'Minimum AOF file size before an automatic rewrite is triggered.',
  'aof-rewrite-incremental-fsync': 'Fsync AOF data in 4 MB chunks during rewrite to reduce disk spikes.',
  'aof-use-rdb-preamble': 'Write an RDB snapshot at the start of the AOF for faster restarts.',
  'aof-timestamp-enabled': 'Embed timestamps in the AOF file for point-in-time recovery.',
  'rdb-save-incremental-fsync': 'Fsync RDB data in 4 MB chunks during save to reduce disk spikes.',
  'rdb-key-save-delay': 'Artificial delay (µs) between keys during RDB save for throttling.',

  // Replication
  'replicaof': 'Make this instance a replica of the specified master (host port).',
  'masterauth': 'Password used to authenticate with the master (shown as [hidden]).',
  'masteruser': 'Username for ACL-based authentication with the master.',
  'replica-serve-stale-data': 'Allow replicas to serve potentially stale data while syncing.',
  'replica-read-only': 'Replicas reject write commands (recommended: yes).',
  'repl-diskless-sync': 'Stream RDB directly to replicas over the network, skipping disk.',
  'repl-diskless-sync-delay': 'Seconds to wait before starting a diskless replication transfer.',
  'repl-diskless-sync-max-replicas': 'Max replicas to sync simultaneously in diskless mode.',
  'repl-diskless-load': 'Load RDB from socket directly without saving to disk on the replica.',
  'repl-ping-replica-period': 'Interval (seconds) for the master to ping replicas.',
  'repl-timeout': 'Timeout (seconds) for replication I/O operations.',
  'repl-backlog-size': 'Size of the replication backlog buffer for partial resynchronization.',
  'repl-backlog-ttl': 'Seconds the backlog is retained after all replicas disconnect.',
  'replica-priority': 'Priority for replica promotion in Sentinel; lower is higher priority.',
  'replica-announced': 'Whether this replica is announced to Sentinel and Cluster.',
  'min-replicas-to-write': 'Minimum connected replicas required for the master to accept writes.',
  'min-replicas-max-lag': 'Maximum replica lag (seconds) for the min-replicas-to-write check.',

  // Security
  'requirepass': 'Password required for client authentication (shown as [hidden]).',
  'protected-mode': 'Reject connections from non-loopback addresses when no password is set.',
  'acl-log-max-len': 'Maximum number of entries stored in the ACL security log.',
  'acl-filename': 'Path to an external ACL rules file.',
  'aclfile': 'Path to an external ACL rules file (alias for acl-filename).',
  'acllog-max-len': 'Maximum entries in the ACL event log.',

  // Clients
  'maxclients': 'Maximum number of simultaneous connected clients.',
  'client-query-buffer-limit': 'Maximum size of a single client query buffer.',
  'client-output-buffer-limit': 'Output buffer limits per client class (normal, replica, pubsub).',
  'client-eviction': 'Enable eviction of clients when memory is tight.',
  'hz': 'Frequency of server background tasks (1–500). Higher means more CPU but faster expiry.',
  'dynamic-hz': 'Automatically scale hz based on connected clients for efficiency.',
  'tracking-table-max-keys': 'Maximum keys tracked per client for client-side caching invalidation.',

  // Slow Log
  'slowlog-log-slower-than': 'Log commands that take longer than this many microseconds. -1 disables.',
  'slowlog-max-len': 'Maximum number of entries kept in the slow log.',

  // Lua
  'lua-time-limit': 'Maximum execution time (ms) for a Lua script before Redis intervenes.',
  'lua-replicate-commands': 'Replicate Lua scripts by sending the individual commands they execute.',
  'busy-reply-threshold': 'Milliseconds before Redis replies BUSY when a script is running.',

  // Cluster
  'cluster-enabled': 'Enable Redis Cluster mode.',
  'cluster-config-file': 'File where cluster node configuration is auto-persisted.',
  'cluster-node-timeout': 'Milliseconds before a cluster node is considered unreachable.',
  'cluster-announce-ip': 'IP address announced to the cluster (useful behind NAT).',
  'cluster-announce-port': 'Data port announced to the cluster.',
  'cluster-announce-bus-port': 'Cluster bus port announced to the cluster.',
  'cluster-migration-barrier': 'Minimum replicas a master must have before a replica can migrate.',
  'cluster-require-full-coverage': 'Stop accepting writes if any hash slot is uncovered.',
  'cluster-slave-no-failover': 'Prevent replicas from initiating automatic failover.',
  'cluster-allow-reads-when-down': 'Allow read operations when the cluster is in a failed state.',
  'cluster-link-sendbuf-limit': 'Maximum send buffer size for cluster bus links.',

  // Latency
  'latency-tracking': 'Enable latency monitoring for commands and events.',
  'latency-tracking-info-percentiles': 'Percentiles reported by LATENCY HISTOGRAM command.',
  'latency-monitor-threshold': 'Minimum latency (ms) for an event to be recorded.',
  'lfu-log-factor': 'Controls LFU counter increment rate; higher = slower aging.',
  'lfu-decay-time': 'Minutes between LFU counter halving for key frequency decay.',
  'active-expire-enabled': 'Enable active sampling and deletion of expired keys in the background.',
  'active-expire-effort': 'Effort level (1–10) for active expiration; higher uses more CPU.',
}

// ---------------------------------------------------------------------------
// Category grouping
// ---------------------------------------------------------------------------

const CATEGORY_PREFIXES: [string, string[]][] = [
  ['Network', ['bind', 'port', 'tls-', 'tcp-', 'unixsocket', 'timeout', 'tcp-keepalive']],
  ['Memory', ['maxmemory', 'mem-', 'active-defrag', 'lazyfree-', 'replica-lazy-flush']],
  ['Persistence', ['save', 'rdb', 'aof', 'appendonly', 'appendfilename', 'appendfsync', 'no-appendfsync-on-rewrite', 'auto-aof', 'aof-', 'dbfilename', 'dir']],
  ['Replication', ['replica', 'slave', 'repl-', 'min-replicas', 'min-slaves']],
  ['Security', ['requirepass', 'rename-command', 'acl', 'protected-mode']],
  ['Clients', ['maxclients', 'client-', 'hz', 'dynamic-hz', 'tracking-table-max-keys']],
  ['Slow Log', ['slowlog-']],
  ['Lua', ['lua-', 'busy-reply-threshold']],
  ['Cluster', ['cluster-']],
  ['Latency', ['latency-', 'lfu-', 'active-expire']],
]

function categorize(key: string): string {
  for (const [category, prefixes] of CATEGORY_PREFIXES) {
    if (prefixes.some((p) => key.startsWith(p))) return category
  }
  return 'Other'
}

// ---------------------------------------------------------------------------
// ConfigPage
// ---------------------------------------------------------------------------

export default function ConfigPage() {
  const { id } = useParams<{ id: string }>()
  const { data: config, isLoading, isError, refetch, isFetching } = useRedisConfig(id ?? null)

  const [search, setSearch] = useState('')
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null)

  const grouped = useMemo(() => {
    if (!config) return {}
    const map: Record<string, { key: string; value: string }[]> = {}
    for (const [key, value] of Object.entries(config)) {
      const cat = categorize(key)
      if (!map[cat]) map[cat] = []
      map[cat].push({ key, value })
    }
    // Sort entries within each category
    for (const entries of Object.values(map)) {
      entries.sort((a, b) => a.key.localeCompare(b.key))
    }
    return map
  }, [config])

  const categories = useMemo(() => Object.keys(grouped).sort(), [grouped])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    const result: Record<string, { key: string; value: string }[]> = {}
    for (const [cat, entries] of Object.entries(grouped)) {
      if (selectedCategory && cat !== selectedCategory) continue
      const hits = q
        ? entries.filter((e) => e.key.includes(q) || e.value.toLowerCase().includes(q))
        : entries
      if (hits.length > 0) result[cat] = hits
    }
    return result
  }, [grouped, search, selectedCategory])

  const totalParams = config ? Object.keys(config).length : 0
  const filteredCount = Object.values(filtered).reduce((sum, entries) => sum + entries.length, 0)

  return (
    <div className="flex flex-col h-full p-6 gap-4 overflow-auto">
      {/* Header */}
      <div className="flex items-center justify-between flex-shrink-0">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Configuration</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Live configuration of the selected Redis instance
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => refetch()}
          disabled={isFetching}
          className="gap-2"
        >
          <RefreshCw className={cn('h-4 w-4', isFetching && 'animate-spin')} />
          Refresh
        </Button>
      </div>

      {/* Controls */}
      <div className="flex items-center gap-3 flex-shrink-0">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
          <Input
            placeholder="Search parameters…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="flex items-center gap-1.5 flex-wrap">
          <Button
            variant={selectedCategory === null ? 'secondary' : 'ghost'}
            size="sm"
            onClick={() => setSelectedCategory(null)}
          >
            All
          </Button>
          {categories.map((cat) => (
            <Button
              key={cat}
              variant={selectedCategory === cat ? 'secondary' : 'ghost'}
              size="sm"
              onClick={() => setSelectedCategory((prev) => (prev === cat ? null : cat))}
            >
              {cat}
            </Button>
          ))}
        </div>
      </div>

      {/* Stats bar */}
      {!isLoading && !isError && config && (
        <p className="text-xs text-muted-foreground flex-shrink-0">
          Showing <span className="font-medium text-foreground">{filteredCount}</span> of{' '}
          <span className="font-medium text-foreground">{totalParams}</span> parameters
        </p>
      )}

      {/* Content */}
      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-40 w-full rounded-lg" />
          ))}
        </div>
      ) : isError ? (
        <Card className="border-destructive/50">
          <CardContent className="pt-6">
            <p className="text-sm text-destructive">
              Failed to load configuration. The Redis server may not support the{' '}
              <code className="font-mono">CONFIG GET</code> command, or you may not have permission.
            </p>
          </CardContent>
        </Card>
      ) : Object.keys(filtered).length === 0 ? (
        <div className="flex items-center justify-center flex-1 text-sm text-muted-foreground">
          No parameters match your search.
        </div>
      ) : (
        <TooltipProvider delayDuration={200}>
          <div className="space-y-4">
            {Object.entries(filtered)
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([category, entries]) => (
                <Card key={category}>
                  <CardHeader className="pb-2 pt-4 px-5">
                    <CardTitle className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                      {category}
                      <span className="ml-2 text-xs font-normal normal-case text-muted-foreground/70">
                        ({entries.length})
                      </span>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="px-0 pb-0">
                    <table className="w-full text-sm">
                      <tbody>
                        {entries.map(({ key, value }, idx) => (
                          <tr
                            key={key}
                            className={cn(
                              'border-t border-border/50',
                              idx === 0 && 'border-t-0'
                            )}
                          >
                            <td className="px-5 py-2 w-1/2 font-mono text-xs text-foreground align-top">
                              <div className="flex items-start gap-1.5">
                                <span>{key}</span>
                                {CONFIG_DESCRIPTIONS[key] && (
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <Info className="h-3 w-3 mt-0.5 text-muted-foreground/50 hover:text-muted-foreground flex-shrink-0 cursor-help" />
                                    </TooltipTrigger>
                                    <TooltipContent side="right" className="max-w-xs font-sans font-normal normal-case tracking-normal">
                                      {CONFIG_DESCRIPTIONS[key]}
                                    </TooltipContent>
                                  </Tooltip>
                                )}
                              </div>
                            </td>
                            <td className="px-5 py-2 w-1/2 font-mono text-xs text-muted-foreground break-all align-top">
                              {value === '' ? (
                                <span className="italic text-muted-foreground/50">empty</span>
                              ) : (
                                value
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </CardContent>
                </Card>
              ))}
          </div>
        </TooltipProvider>
      )}
    </div>
  )
}
