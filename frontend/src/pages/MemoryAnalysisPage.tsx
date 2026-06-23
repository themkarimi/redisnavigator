import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { RefreshCw, PieChart, AlertTriangle, Database, HardDrive, Lock } from 'lucide-react'
import { isAxiosError } from 'axios'
import { useMemoryAnalysis } from '@/hooks/useServerInfo'
import { useConnectionStore } from '@/store/connectionStore'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { formatBytes } from '@/utils/formatBytes'
import { cn } from '@/utils/cn'

// ---------------------------------------------------------------------------
// Sample sizes offered in the picker. Larger = more accurate, slower scan.
// ---------------------------------------------------------------------------

const SAMPLE_OPTIONS = [500, 1000, 5000, 10000, 20000]

const TYPE_COLORS: Record<string, string> = {
  string: 'bg-blue-500',
  hash: 'bg-emerald-500',
  list: 'bg-amber-500',
  set: 'bg-violet-500',
  zset: 'bg-pink-500',
  stream: 'bg-cyan-500',
}

function typeColor(type: string): string {
  return TYPE_COLORS[type] ?? 'bg-muted-foreground'
}

function formatTtl(ttl: number): string {
  if (ttl === -1) return 'no expiry'
  if (ttl < 0) return '—'
  if (ttl < 60) return `${ttl}s`
  if (ttl < 3600) return `${Math.floor(ttl / 60)}m`
  if (ttl < 86400) return `${Math.floor(ttl / 3600)}h`
  return `${Math.floor(ttl / 86400)}d`
}

export default function MemoryAnalysisPage() {
  const { id: connectionId } = useParams<{ id: string }>()
  const connections = useConnectionStore((s) => s.connections)
  const connection = connections.find((c) => c.id === connectionId) ?? null

  const [sample, setSample] = useState(1000)
  const [enabled, setEnabled] = useState(false)

  const { data, isFetching, refetch, error } = useMemoryAnalysis(
    connectionId ?? null,
    sample,
    enabled
  )

  const runAnalysis = () => {
    if (!enabled) setEnabled(true)
    else refetch()
  }

  // Memory analysis is editor-only (WRITE_KEY) on the backend; a Viewer gets 403.
  const forbidden = isAxiosError(error) && error.response?.status === 403

  const maxTypeBytes = data ? Math.max(1, ...data.byType.map((t) => t.bytes)) : 1
  const maxPrefixBytes = data ? Math.max(1, ...data.byPrefix.map((p) => p.bytes)) : 1

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-6xl mx-auto p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-lg font-semibold text-foreground flex items-center gap-2">
              <PieChart className="h-5 w-5" />
              Memory Analysis
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              {connection ? connection.name : 'Connection'} — sampled keyspace memory breakdown
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Select value={String(sample)} onValueChange={(v) => setSample(Number(v))}>
              <SelectTrigger className="w-[150px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SAMPLE_OPTIONS.map((n) => (
                  <SelectItem key={n} value={String(n)}>
                    Sample {n.toLocaleString()}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button onClick={runAnalysis} disabled={isFetching} className="gap-2">
              <RefreshCw className={cn('h-3.5 w-3.5', isFetching && 'animate-spin')} />
              {isFetching ? 'Analyzing…' : enabled ? 'Re-run' : 'Analyze'}
            </Button>
          </div>
        </div>

        {/* Cost notice */}
        <div className="flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-600 dark:text-amber-400">
          <AlertTriangle className="h-4 w-4 flex-shrink-0 mt-0.5" />
          <span>
            Analysis SCANs a sample of the keyspace and runs MEMORY USAGE per key. It is
            non-blocking but adds load on large instances — prefer running against a replica.
            Figures are estimates extrapolated from the sample.
          </span>
        </div>

        {forbidden ? (
          <Card>
            <CardContent className="pt-8 pb-8 text-center">
              <Lock className="h-8 w-8 mx-auto text-muted-foreground mb-3" />
              <p className="text-sm font-medium text-foreground">Editor access required</p>
              <p className="text-sm text-muted-foreground mt-1">
                Memory analysis scans the keyspace, so it is limited to users with editor
                (write) access on this connection. Viewers cannot run it.
              </p>
            </CardContent>
          </Card>
        ) : (
          error && (
            <Card>
              <CardContent className="pt-4 pb-4 text-sm text-red-400">
                {(error as Error).message}
              </CardContent>
            </Card>
          )
        )}

        {!enabled && !data && (
          <Card>
            <CardContent className="pt-10 pb-10 text-center">
              <PieChart className="h-8 w-8 mx-auto text-muted-foreground mb-3" />
              <p className="text-sm text-muted-foreground">
                Click <span className="font-medium text-foreground">Analyze</span> to sample the
                keyspace and break down memory by type, prefix, and biggest keys.
              </p>
            </CardContent>
          </Card>
        )}

        {isFetching && !data && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-20" />
              ))}
            </div>
            <Skeleton className="h-48" />
            <Skeleton className="h-64" />
          </div>
        )}

        {data && (
          <>
            {/* Summary cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <StatCard
                icon={<HardDrive className="h-4 w-4" />}
                label="Used Memory"
                value={data.usedMemoryHuman || formatBytes(data.usedMemory)}
                sub={data.maxMemory > 0 ? `of ${formatBytes(data.maxMemory)} max` : 'no limit'}
              />
              <StatCard
                icon={<Database className="h-4 w-4" />}
                label="Total Keys"
                value={data.totalKeys.toLocaleString()}
                sub={`${data.sampledKeys.toLocaleString()} sampled`}
              />
              <StatCard
                label="Avg Key Size"
                value={formatBytes(data.avgKeyBytes)}
                sub={`${formatBytes(data.sampledBytes)} in sample`}
              />
              <StatCard
                label="Fragmentation"
                value={data.memFragmentationRatio ? `${data.memFragmentationRatio.toFixed(2)}x` : '—'}
                sub={data.memFragmentationRatio > 1.5 ? 'high — consider defrag' : 'healthy'}
                valueClass={data.memFragmentationRatio > 1.5 ? 'text-amber-400' : undefined}
              />
            </div>

            {data.truncated && (
              <p className="text-xs text-muted-foreground">
                Showing {data.sampledKeys.toLocaleString()} of {data.totalKeys.toLocaleString()}{' '}
                keys. Increase the sample size for a more accurate picture.
              </p>
            )}

            {/* By type */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold">Memory by Type</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 pb-4">
                {data.byType.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No keys in sample.</p>
                ) : (
                  data.byType.map((t) => (
                    <div key={t.type}>
                      <div className="flex items-center justify-between text-xs mb-1">
                        <span className="font-mono text-foreground flex items-center gap-2">
                          <span className={cn('h-2.5 w-2.5 rounded-sm', typeColor(t.type))} />
                          {t.type}
                          <span className="text-muted-foreground">
                            ({t.count.toLocaleString()} keys)
                          </span>
                        </span>
                        <span className="font-mono text-muted-foreground">
                          {formatBytes(t.bytes)}
                        </span>
                      </div>
                      <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                        <div
                          className={cn('h-full rounded-full', typeColor(t.type))}
                          style={{ width: `${(t.bytes / maxTypeBytes) * 100}%` }}
                        />
                      </div>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>

            {/* By prefix */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold">Top Key Prefixes</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2.5 pb-4">
                {data.byPrefix.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No keys in sample.</p>
                ) : (
                  data.byPrefix.map((p) => (
                    <div key={p.prefix}>
                      <div className="flex items-center justify-between text-xs mb-1">
                        <span className="font-mono text-foreground truncate max-w-[60%]">
                          {p.prefix}
                          <span className="text-muted-foreground ml-2">
                            ({p.count.toLocaleString()})
                          </span>
                        </span>
                        <span className="font-mono text-muted-foreground">
                          {formatBytes(p.bytes)}
                        </span>
                      </div>
                      <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                        <div
                          className="h-full rounded-full bg-primary"
                          style={{ width: `${(p.bytes / maxPrefixBytes) * 100}%` }}
                        />
                      </div>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>

            {/* Biggest keys */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold">Biggest Keys</CardTitle>
              </CardHeader>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border">
                      <Th>Key</Th>
                      <Th>Type</Th>
                      <Th className="text-right">Size</Th>
                      <Th className="text-right">TTL</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.topKeys.length === 0 ? (
                      <tr>
                        <Td className="text-muted-foreground" >No keys in sample.</Td>
                      </tr>
                    ) : (
                      data.topKeys.map((k) => (
                        <tr
                          key={k.key}
                          className="border-b border-border/50 hover:bg-muted/40 transition-colors"
                        >
                          <Td className="font-mono text-xs text-foreground max-w-[360px] truncate">
                            {k.key}
                          </Td>
                          <Td>
                            <span className="font-mono text-xs flex items-center gap-1.5">
                              <span className={cn('h-2 w-2 rounded-sm', typeColor(k.type))} />
                              {k.type}
                            </span>
                          </Td>
                          <Td className="text-right font-mono text-xs">{formatBytes(k.bytes)}</Td>
                          <Td className="text-right text-xs text-muted-foreground">
                            {formatTtl(k.ttl)}
                          </Td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </Card>
          </>
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Tiny helpers
// ---------------------------------------------------------------------------

function StatCard({
  icon,
  label,
  value,
  sub,
  valueClass,
}: {
  icon?: React.ReactNode
  label: string
  value: string
  sub?: string
  valueClass?: string
}) {
  return (
    <Card>
      <CardContent className="pt-4 pb-4">
        <p className="text-xs text-muted-foreground flex items-center gap-1.5">
          {icon}
          {label}
        </p>
        <p className={cn('text-xl font-semibold mt-1 text-foreground', valueClass)}>{value}</p>
        {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
      </CardContent>
    </Card>
  )
}

function Th({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <th className={cn('px-4 py-2 text-left text-xs font-medium text-muted-foreground', className)}>
      {children}
    </th>
  )
}

function Td({ children, className }: { children: React.ReactNode; className?: string }) {
  return <td className={cn('px-4 py-2.5', className)}>{children}</td>
}
