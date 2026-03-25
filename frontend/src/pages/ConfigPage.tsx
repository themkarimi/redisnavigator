import { useState, useMemo } from 'react'
import { useParams } from 'react-router-dom'
import { RefreshCw, Search } from 'lucide-react'
import { useRedisConfig } from '@/hooks/useServerInfo'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/utils/cn'

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
                            {key}
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
      )}
    </div>
  )
}
