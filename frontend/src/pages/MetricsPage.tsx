import React, { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { io, Socket } from 'socket.io-client'
import {
  ResponsiveContainer,
  LineChart,
  Line,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from 'recharts'
import { useServerInfo, useSlowLog, useClientList } from '@/hooks/useServerInfo'
import { formatBytes, formatUptime } from '@/utils/formatBytes'
import { useAuthStore } from '@/store/authStore'
import { useConnectionStore } from '@/store/connectionStore'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import type { MetricsSnapshot } from '@/types'
import { cn } from '@/utils/cn'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MAX_POINTS = 60
const CLIENT_PAGE_SIZE = 10

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ChartPoint extends MetricsSnapshot {
  memoryMB: number
  label: string
}

interface KeyspaceEntry {
  db: string
  keys: number
  expires: number
  avgTtl: number
}

type SlowLogEntry = {
  id: number
  timestamp: number
  duration: number
  args: string[]
}

type ConnectedClient = Record<string, string>

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseKeyspace(parsed: Record<string, string>): KeyspaceEntry[] {
  const entries: KeyspaceEntry[] = []
  for (const [key, value] of Object.entries(parsed)) {
    if (!/^db\d+$/.test(key)) continue
    // Format: keys=N,expires=N,avg_ttl=N
    const map: Record<string, number> = {}
    value.split(',').forEach((pair) => {
      const [k, v] = pair.split('=')
      if (k && v !== undefined) map[k.trim()] = parseInt(v, 10) || 0
    })
    entries.push({
      db: key,
      keys: map['keys'] ?? 0,
      expires: map['expires'] ?? 0,
      avgTtl: map['avg_ttl'] ?? 0,
    })
  }
  return entries.sort((a, b) => a.db.localeCompare(b.db))
}

function toChartPoint(snap: MetricsSnapshot): ChartPoint {
  const d = new Date(snap.timestamp)
  return {
    ...snap,
    memoryMB: parseFloat((snap.usedMemory / (1024 * 1024)).toFixed(2)),
    label: d.toLocaleTimeString('en-US', { hour12: false, minute: '2-digit', second: '2-digit' }),
  }
}

// ---------------------------------------------------------------------------
// Metric card
// ---------------------------------------------------------------------------

interface MetricCardProps {
  title: string
  value: string | number
  sub?: string
  accent?: boolean
}

function MetricCard({ title, value, sub, accent }: MetricCardProps) {
  return (
    <Card className="flex flex-col gap-1">
      <CardContent className="pt-5 pb-4">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{title}</p>
        <p
          className={cn(
            'text-2xl font-bold mt-1 tracking-tight',
            accent ? 'text-[#DC382C]' : 'text-foreground'
          )}
        >
          {value}
        </p>
        {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
      </CardContent>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Custom tooltip for recharts
// ---------------------------------------------------------------------------

interface TooltipPayloadItem {
  name: string
  value: number
  color?: string
}

function ChartTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean
  payload?: TooltipPayloadItem[]
  label?: string
}) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-card border border-border rounded-md px-3 py-2 text-xs shadow-lg">
      <p className="text-muted-foreground mb-1">{label}</p>
      {payload.map((p, i) => (
        <p key={i} style={{ color: p.color ?? '#fff' }}>
          {p.name}: <span className="font-semibold">{p.value}</span>
        </p>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function MetricsPage() {
  const { id: connectionId } = useParams<{ id: string }>()
  const connections = useConnectionStore((s) => s.connections)
  const connection = connections.find((c) => c.id === connectionId) ?? null

  // Real-time metrics via Socket.IO
  const [chartData, setChartData] = useState<ChartPoint[]>([])
  const [latestMetrics, setLatestMetrics] = useState<MetricsSnapshot | null>(null)
  const socketRef = React.useRef<Socket | null>(null)

  // Static server info
  const {
    data: info,
    isLoading: infoLoading,
    refetch: refetchInfo,
  } = useServerInfo(connectionId ?? null)

  // Slow log
  const {
    data: slowlogData,
    isLoading: slowlogLoading,
    refetch: refetchSlowlog,
  } = useSlowLog(connectionId ?? null)

  const slowlog: SlowLogEntry[] = Array.isArray(slowlogData) ? slowlogData : []

  // Connected clients
  const {
    data: clientListData,
    isLoading: clientListLoading,
    refetch: refetchClientList,
  } = useClientList(connectionId ?? null)

  const clientList: ConnectedClient[] = Array.isArray(clientListData) ? clientListData : []

  // Pagination state for connected clients
  const [clientPage, setClientPage] = useState(1)

  // Reset to page 1 when client list changes
  useEffect(() => {
    setClientPage(1)
  }, [clientListData])

  // -------------------------------------------------------------------------
  // Socket lifecycle
  // -------------------------------------------------------------------------

  useEffect(() => {
    if (!connectionId) return

    const token = useAuthStore.getState().accessToken
    const socket = io('/metrics', {
      auth: { connectionId, token },
      transports: ['websocket'],
    })

    socketRef.current = socket

    socket.on('connect', () => {
      socket.emit('subscribe', { connectionId })
    })

    socket.on('metrics', (snap: MetricsSnapshot) => {
      setLatestMetrics(snap)
      setChartData((prev) => {
        const next = [...prev, toChartPoint(snap)]
        return next.length > MAX_POINTS ? next.slice(next.length - MAX_POINTS) : next
      })
    })

    return () => {
      socket.emit('unsubscribe', { connectionId })
      socket.removeAllListeners()
      socket.disconnect()
      socketRef.current = null
    }
  }, [connectionId]) // eslint-disable-line react-hooks/exhaustive-deps

  // -------------------------------------------------------------------------
  // Derived values
  // -------------------------------------------------------------------------

  const memory = info?.memory
  const stats = info?.stats
  const server = info?.server
  const replication = info?.replication
  const keyspace = info?.parsed ? parseKeyspace(info.parsed) : []

  // Merge live metrics with static info where applicable
  const usedMemory = latestMetrics?.usedMemory ?? memory?.used ?? 0
  const opsPerSec = latestMetrics?.opsPerSec ?? stats?.instantaneousOpsPerSec ?? 0
  const connectedClients = latestMetrics?.connectedClients ?? stats?.connectedClients ?? 0

  // -------------------------------------------------------------------------
  // Render helpers
  // -------------------------------------------------------------------------

  const axisStyle = { fill: '#6b7280', fontSize: 10 }

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  return (
    <div className="flex flex-col h-full overflow-y-auto bg-background">
      <div className="max-w-screen-2xl w-full mx-auto px-6 py-6 space-y-8">

        {/* ---------------------------------------------------------------- */}
        {/* Header                                                           */}
        {/* ---------------------------------------------------------------- */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-foreground">Server Metrics</h1>
            {connection && (
              <p className="text-sm text-muted-foreground mt-0.5">
                {connection.name} — {connection.host}:{connection.port}
              </p>
            )}
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => { refetchInfo(); refetchSlowlog(); refetchClientList() }}
            className="gap-2"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            Refresh
          </Button>
        </div>

        {/* ---------------------------------------------------------------- */}
        {/* Section 1 — Stats grid                                           */}
        {/* ---------------------------------------------------------------- */}
        <section>
          <SectionTitle>Overview</SectionTitle>
          {infoLoading ? (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              {Array.from({ length: 8 }).map((_, i) => (
                <Card key={i}>
                  <CardContent className="pt-5 pb-4 space-y-2">
                    <Skeleton className="h-3 w-20" />
                    <Skeleton className="h-7 w-28" />
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <MetricCard
                title="Used Memory"
                value={formatBytes(usedMemory)}
                accent
              />
              <MetricCard
                title="Peak Memory"
                value={formatBytes(memory?.peak ?? 0)}
              />
              <MetricCard
                title="Connected Clients"
                value={connectedClients.toLocaleString()}
              />
              <MetricCard
                title="Commands / sec"
                value={opsPerSec.toLocaleString()}
                accent
              />
              <MetricCard
                title="Total Commands"
                value={(stats?.totalCommandsProcessed ?? 0).toLocaleString()}
              />
              <MetricCard
                title="Keyspace Hits"
                value={(stats?.keyspaceHits ?? 0).toLocaleString()}
              />
              <MetricCard
                title="DB Size"
                value={(info?.dbsize ?? 0).toLocaleString()}
                sub="keys"
              />
              <MetricCard
                title="Uptime"
                value={formatUptime(server?.uptime ?? 0)}
              />
            </div>
          )}
        </section>

        {/* ---------------------------------------------------------------- */}
        {/* Section 2 — Server Info                                          */}
        {/* ---------------------------------------------------------------- */}
        <section>
          <SectionTitle>Server Info</SectionTitle>
          {infoLoading ? (
            <Card>
              <CardContent className="pt-5 pb-4">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-10" />)}
                </div>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="pt-5 pb-5">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-6 gap-y-4">
                  <InfoPair label="Redis Version" value={server?.version ?? '—'} />
                  <InfoPair label="OS" value={server?.os ?? '—'} />
                  <InfoPair label="TCP Port" value={connection?.port?.toString() ?? '—'} />
                  <InfoPair
                    label="Role"
                    value={replication?.role ?? '—'}
                    valueClass={
                      replication?.role === 'master'
                        ? 'text-green-500 font-semibold'
                        : 'text-yellow-500 font-semibold'
                    }
                  />
                  <InfoPair label="Mode" value={server?.mode ?? '—'} />
                  <InfoPair
                    label="Max Memory"
                    value={
                      memory?.maxmemory
                        ? formatBytes(memory.maxmemory)
                        : 'No limit'
                    }
                  />
                  <InfoPair
                    label="Connected Slaves"
                    value={(replication?.connectedSlaves ?? 0).toString()}
                  />
                  <InfoPair
                    label="Keyspace Misses"
                    value={(stats?.keyspaceMisses ?? 0).toLocaleString()}
                  />
                </div>
              </CardContent>
            </Card>
          )}
        </section>

        {/* ---------------------------------------------------------------- */}
        {/* Section 3 — Charts                                               */}
        {/* ---------------------------------------------------------------- */}
        <section>
          <SectionTitle>
            Real-time Charts
            <span className="text-xs text-muted-foreground font-normal ml-2">
              (last {MAX_POINTS} samples via WebSocket)
            </span>
          </SectionTitle>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Memory usage chart */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold text-foreground">
                  Memory Usage (MB)
                </CardTitle>
              </CardHeader>
              <CardContent className="pb-4">
                {chartData.length === 0 ? (
                  <ChartEmptyState />
                ) : (
                  <ResponsiveContainer width="100%" height={200}>
                    <LineChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#2d2d2d" vertical={false} />
                      <XAxis
                        dataKey="label"
                        tick={axisStyle}
                        tickLine={false}
                        axisLine={false}
                        interval="preserveStartEnd"
                      />
                      <YAxis
                        tick={axisStyle}
                        tickLine={false}
                        axisLine={false}
                        width={40}
                        tickFormatter={(v: number) => `${v}MB`}
                      />
                      <Tooltip content={<ChartTooltip />} />
                      <Line
                        type="monotone"
                        dataKey="memoryMB"
                        name="Memory"
                        stroke="#DC382C"
                        strokeWidth={2}
                        dot={false}
                        activeDot={{ r: 4, fill: '#DC382C' }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>

            {/* Ops/sec chart */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold text-foreground">
                  Operations / Second
                </CardTitle>
              </CardHeader>
              <CardContent className="pb-4">
                {chartData.length === 0 ? (
                  <ChartEmptyState />
                ) : (
                  <ResponsiveContainer width="100%" height={200}>
                    <AreaChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                      <defs>
                        <linearGradient id="opsGradient" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#DC382C" stopOpacity={0.3} />
                          <stop offset="95%" stopColor="#DC382C" stopOpacity={0.0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#2d2d2d" vertical={false} />
                      <XAxis
                        dataKey="label"
                        tick={axisStyle}
                        tickLine={false}
                        axisLine={false}
                        interval="preserveStartEnd"
                      />
                      <YAxis
                        tick={axisStyle}
                        tickLine={false}
                        axisLine={false}
                        width={40}
                      />
                      <Tooltip content={<ChartTooltip />} />
                      <Area
                        type="monotone"
                        dataKey="opsPerSec"
                        name="Ops/sec"
                        stroke="#DC382C"
                        strokeWidth={2}
                        fill="url(#opsGradient)"
                        dot={false}
                        activeDot={{ r: 4, fill: '#DC382C' }}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>
          </div>
        </section>

        {/* ---------------------------------------------------------------- */}
        {/* Section 4 — Connected Clients                                   */}
        {/* ---------------------------------------------------------------- */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <SectionTitle as="span">
              Connected Clients
              <span className="text-xs text-muted-foreground font-normal ml-2">
                (live · refreshes every 5s)
              </span>
            </SectionTitle>
            <Button
              variant="outline"
              size="sm"
              onClick={() => refetchClientList()}
              disabled={clientListLoading}
              className="gap-2"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              {clientListLoading ? 'Loading...' : 'Refresh'}
            </Button>
          </div>
          <Card>
            {clientListLoading ? (
              <CardContent className="pt-4 pb-4 space-y-2">
                {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-8" />)}
              </CardContent>
            ) : clientList.length === 0 ? (
              <CardContent className="pt-6 pb-6 text-center">
                <p className="text-sm text-muted-foreground">No connected clients.</p>
              </CardContent>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border">
                        <Th>ID</Th>
                        <Th>Address</Th>
                        <Th>Name</Th>
                        <Th>DB</Th>
                        <Th>Age (s)</Th>
                        <Th>Idle (s)</Th>
                        <Th>Last Cmd</Th>
                        <Th>Flags</Th>
                      </tr>
                    </thead>
                    <tbody>
                      {clientList
                        .slice((clientPage - 1) * CLIENT_PAGE_SIZE, clientPage * CLIENT_PAGE_SIZE)
                        .map((c, i) => (
                          <tr key={c['id'] ?? `${clientPage}-${i}`} className="border-b border-border/50 hover:bg-muted/40 transition-colors">
                            <Td className="font-mono text-xs text-muted-foreground">{c['id'] ?? '—'}</Td>
                            <Td className="font-mono text-xs">{c['addr'] ?? '—'}</Td>
                            <Td className="font-mono text-xs">{c['name'] || '—'}</Td>
                            <Td>{c['db'] ?? '—'}</Td>
                            <Td>{c['age'] ?? '—'}</Td>
                            <Td>{c['idle'] ?? '—'}</Td>
                            <Td className="font-mono text-xs">{c['cmd'] ?? '—'}</Td>
                            <Td className="font-mono text-xs">{c['flags'] ?? '—'}</Td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
                {clientList.length > CLIENT_PAGE_SIZE && (
                  <div className="flex items-center justify-between px-4 py-3 border-t border-border">
                    <p className="text-xs text-muted-foreground">
                      {(clientPage - 1) * CLIENT_PAGE_SIZE + 1}–{Math.min(clientPage * CLIENT_PAGE_SIZE, clientList.length)} of {clientList.length} clients
                    </p>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setClientPage((p) => Math.max(1, p - 1))}
                        disabled={clientPage === 1}
                        className="h-7 px-2 text-xs"
                      >
                        ‹ Prev
                      </Button>
                      <span className="text-xs text-muted-foreground px-2">
                        Page {clientPage} / {Math.ceil(clientList.length / CLIENT_PAGE_SIZE)}
                      </span>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setClientPage((p) => Math.min(Math.ceil(clientList.length / CLIENT_PAGE_SIZE), p + 1))}
                        disabled={clientPage === Math.ceil(clientList.length / CLIENT_PAGE_SIZE)}
                        className="h-7 px-2 text-xs"
                      >
                        Next ›
                      </Button>
                    </div>
                  </div>
                )}
              </>
            )}
          </Card>
        </section>

        {/* ---------------------------------------------------------------- */}
        {/* Section 5 — Keyspace                                             */}
        {/* ---------------------------------------------------------------- */}
        <section>
          <SectionTitle>Keyspace</SectionTitle>
          <Card>
            {infoLoading ? (
              <CardContent className="pt-4 pb-4 space-y-2">
                {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-8" />)}
              </CardContent>
            ) : keyspace.length === 0 ? (
              <CardContent className="pt-6 pb-6 text-center">
                <p className="text-sm text-muted-foreground">No keyspace data available.</p>
              </CardContent>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border">
                      <Th>Database</Th>
                      <Th>Keys</Th>
                      <Th>Expires</Th>
                      <Th>Avg TTL (ms)</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {keyspace.map((row) => (
                      <tr key={row.db} className="border-b border-border/50 hover:bg-muted/40 transition-colors">
                        <Td className="font-mono text-xs font-semibold text-foreground">{row.db}</Td>
                        <Td>{row.keys.toLocaleString()}</Td>
                        <Td>{row.expires.toLocaleString()}</Td>
                        <Td>{row.avgTtl.toLocaleString()}</Td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </section>

        {/* ---------------------------------------------------------------- */}
        {/* Section 6 — Slow Log                                             */}
        {/* ---------------------------------------------------------------- */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <SectionTitle as="span">Slow Log</SectionTitle>
            <Button
              variant="outline"
              size="sm"
              onClick={() => refetchSlowlog()}
              disabled={slowlogLoading}
              className="gap-2"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              {slowlogLoading ? 'Loading...' : 'Refresh'}
            </Button>
          </div>
          <Card>
            {slowlogLoading ? (
              <CardContent className="pt-4 pb-4 space-y-2">
                {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-8" />)}
              </CardContent>
            ) : slowlog.length === 0 ? (
              <CardContent className="pt-6 pb-6 text-center">
                <p className="text-sm text-muted-foreground">No slow log entries.</p>
              </CardContent>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border">
                      <Th>ID</Th>
                      <Th>Duration</Th>
                      <Th>Command</Th>
                      <Th>Executed At</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {slowlog.map((entry) => (
                      <tr key={entry.id} className="border-b border-border/50 hover:bg-muted/40 transition-colors">
                        <Td className="font-mono text-xs text-muted-foreground">#{entry.id}</Td>
                        <Td>
                          <span
                            className={cn(
                              'font-mono text-xs px-1.5 py-0.5 rounded',
                              entry.duration > 100000
                                ? 'bg-red-500/20 text-red-400'
                                : entry.duration > 10000
                                ? 'bg-yellow-500/20 text-yellow-400'
                                : 'bg-muted text-muted-foreground'
                            )}
                          >
                            {(entry.duration / 1000).toFixed(2)} ms
                          </span>
                        </Td>
                        <Td>
                          <span className="font-mono text-xs text-foreground">
                            {Array.isArray(entry.args) ? entry.args.join(' ') : String(entry.args)}
                          </span>
                        </Td>
                        <Td className="text-xs text-muted-foreground">
                          {entry.timestamp
                            ? new Date(entry.timestamp * 1000).toLocaleString()
                            : '—'}
                        </Td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </section>

      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Tiny layout helpers
// ---------------------------------------------------------------------------

function SectionTitle({
  children,
  as: Tag = 'h2',
}: {
  children: React.ReactNode
  as?: React.ElementType
}) {
  return (
    <Tag className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
      {children}
    </Tag>
  )
}

function InfoPair({
  label,
  value,
  valueClass,
}: {
  label: string
  value: string
  valueClass?: string
}) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={cn('text-sm font-medium mt-0.5 text-foreground', valueClass)}>{value}</p>
    </div>
  )
}

function Th({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <th
      className={cn(
        'text-left px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground',
        className
      )}
    >
      {children}
    </th>
  )
}

function Td({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <td className={cn('px-4 py-2.5 text-sm text-muted-foreground', className)}>
      {children}
    </td>
  )
}

function ChartEmptyState() {
  return (
    <div className="h-[200px] flex items-center justify-center">
      <p className="text-xs text-muted-foreground">
        Waiting for real-time data...
      </p>
    </div>
  )
}
