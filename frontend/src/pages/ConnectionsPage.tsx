import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ArrowRight,
  Circle,
  Plus,
  Server,
  Wifi,
  Edit2,
  Trash2,
  TestTube,
  Tag,
  CheckCircle2,
  XCircle,
  Loader2,
} from 'lucide-react'
import {
  useConnections,
  useCreateConnection,
  useUpdateConnection,
  useDeleteConnection,
  useTestConnection,
  useTestExistingConnection,
} from '@/hooks/useConnections'
import { useFeatures } from '@/hooks/useFeatures'
import { useConnectionStore } from '@/store/connectionStore'
import { useAuthStore } from '@/store/authStore'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { useToast } from '@/hooks/use-toast'
import type { RedisConnection, ConnectionMode } from '@/types'

// ─── Form State ───────────────────────────────────────────────────────────────

interface ConnectionFormData {
  name: string
  host: string
  port: number
  password: string
  username: string
  useTLS: boolean
  mode: ConnectionMode
  sentinelMaster: string
  tags: string
}

const defaultForm: ConnectionFormData = {
  name: '',
  host: 'localhost',
  port: 6379,
  password: '',
  username: '',
  useTLS: false,
  mode: 'STANDALONE',
  sentinelMaster: '',
  tags: '',
}

// ─── Page Component ───────────────────────────────────────────────────────────

export default function ConnectionsPage() {
  const navigate = useNavigate()
  const { toast } = useToast()

  // Queries & mutations
  const { data: connections = [], isLoading } = useConnections()
  const createConnection = useCreateConnection()
  const updateConnection = useUpdateConnection()
  const deleteConnection = useDeleteConnection()
  const testConnection = useTestConnection()
  const testExistingConnection = useTestExistingConnection()

  // Feature flags
  const { data: features } = useFeatures()
  const configAsCode = features?.configAsCode ?? false

  // Global connection store
  const { activeConnectionId, setActiveConnection } = useConnectionStore()

  // Check if the current user can create/edit connections
  const user = useAuthStore((s) => s.user)
  const canManageConnections = !configAsCode && (user?.role === 'ADMIN' || user?.role === 'SUPERADMIN')

  // Dialog state
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [formData, setFormData] = useState<ConnectionFormData>(defaultForm)

  // Per-card test state
  const [testingId, setTestingId] = useState<string | null>(null)
  const [testResults, setTestResults] = useState<Record<string, 'success' | 'error'>>({})

  // ── Helpers ──────────────────────────────────────────────────────────────────

  const updateField = <K extends keyof ConnectionFormData>(
    field: K,
    value: ConnectionFormData[K]
  ) => setFormData((prev) => ({ ...prev, [field]: value }))

  // ── Handlers ─────────────────────────────────────────────────────────────────

  const handleOpenCreate = () => {
    setFormData(defaultForm)
    setEditingId(null)
    setDialogOpen(true)
  }

  const handleOpenEdit = (conn: RedisConnection) => {
    setFormData({
      name: conn.name,
      host: conn.host,
      port: conn.port,
      password: '',
      username: conn.username ?? '',
      useTLS: conn.useTLS,
      mode: conn.mode,
      sentinelMaster: conn.sentinelMaster ?? '',
      tags: conn.tags.join(', '),
    })
    setEditingId(conn.id)
    setDialogOpen(true)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const { password, tags, ...rest } = formData

    // When editing, omit password from the payload if left blank so the
    // existing encrypted password is preserved in the database.
    const payload: Omit<ConnectionFormData, 'tags' | 'password'> & { tags: string[]; password?: string } = {
      ...rest,
      tags: tags
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean),
      ...(editingId && password === '' ? {} : { password }),
    }
    try {
      if (editingId) {
        await updateConnection.mutateAsync({ id: editingId, data: payload })
        toast({ title: 'Connection updated' })
      } else {
        await createConnection.mutateAsync(payload)
        toast({ title: 'Connection created' })
      }
      setDialogOpen(false)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Operation failed'
      toast({ title: 'Error', description: msg, variant: 'destructive' })
    }
  }

  const handleDelete = async () => {
    if (!deleteId) return
    try {
      await deleteConnection.mutateAsync(deleteId)
      toast({ title: 'Connection deleted' })
    } catch {
      toast({ title: 'Delete failed', variant: 'destructive' })
    }
    setDeleteId(null)
  }

  const handleTestExisting = async (conn: RedisConnection) => {
    setTestingId(conn.id)
    try {
      const result = await testExistingConnection.mutateAsync(conn.id)
      if (result.success) {
        setTestResults((r) => ({ ...r, [conn.id]: 'success' }))
        toast({
          title: 'Connection successful',
          description: result.latency ? `Latency: ${result.latency}ms` : undefined,
        })
      } else {
        setTestResults((r) => ({ ...r, [conn.id]: 'error' }))
        toast({
          title: 'Connection failed',
          description: result.error,
          variant: 'destructive',
        })
      }
    } catch {
      setTestResults((r) => ({ ...r, [conn.id]: 'error' }))
      toast({ title: 'Connection test failed', variant: 'destructive' })
    }
    setTestingId(null)
  }

  const handleConnect = (conn: RedisConnection) => {
    setActiveConnection(conn.id)
    navigate(`/connections/${conn.id}/keys`)
  }

  const isPending = createConnection.isPending || updateConnection.isPending
  const activeCount = connections.filter((conn) => conn.isActive).length
  const tlsCount = connections.filter((conn) => conn.useTLS).length
  const taggedCount = connections.filter((conn) => conn.tags.length > 0).length

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-8 p-6">
      {/* Page Header */}
      <section className="relative overflow-hidden rounded-3xl border border-white/10 bg-slate-950/60 p-6 shadow-2xl shadow-slate-950/30 backdrop-blur sm:p-8">
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute -right-10 top-0 h-40 w-40 rounded-full bg-cyan-400/10 blur-3xl" />
          <div className="absolute left-1/3 top-8 h-32 w-32 rounded-full bg-red-500/10 blur-3xl" />
        </div>
        <div className="relative flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-2xl">
            <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-red-400/20 bg-red-500/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-red-200">
              <Circle className="h-2.5 w-2.5 fill-current" />
              Connection control center
            </div>
            <h1 className="text-3xl font-semibold tracking-tight text-white sm:text-4xl">
              Redis Connections
            </h1>
            <p className="mt-3 max-w-xl text-sm leading-6 text-slate-300 sm:text-base">
              Manage environments, verify connectivity, and jump straight into browsing keys or live diagnostics.
            </p>
          </div>
          {canManageConnections && (
            <Button
              onClick={handleOpenCreate}
              className="h-11 rounded-xl bg-gradient-to-r from-red-500 via-red-600 to-orange-500 px-5 text-white shadow-lg shadow-red-950/40 hover:from-red-400 hover:via-red-500 hover:to-orange-400"
            >
              <Plus className="mr-2 h-4 w-4" />
              Add Connection
            </Button>
          )}
        </div>
        <div className="relative mt-6 grid gap-4 sm:grid-cols-3">
          <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
            <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Total</p>
            <p className="mt-3 text-3xl font-semibold text-white">{connections.length}</p>
            <p className="mt-2 text-sm text-slate-400">Configured Redis environments</p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
            <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Online ready</p>
            <p className="mt-3 text-3xl font-semibold text-white">{activeCount}</p>
            <p className="mt-2 text-sm text-slate-400">Connections marked active in the catalog</p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
            <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Protected</p>
            <p className="mt-3 text-3xl font-semibold text-white">{tlsCount}</p>
            <p className="mt-2 text-sm text-slate-400">{taggedCount} tagged connections for faster filtering</p>
          </div>
        </div>
      </section>

      {/* Connection Grid */}
      {isLoading ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-52 animate-pulse rounded-3xl border border-white/10 bg-white/5" />
          ))}
        </div>
      ) : connections.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-3xl border border-dashed border-white/10 bg-slate-950/40 py-28 text-center">
          <div className="mb-5 rounded-full bg-white/5 p-5">
            <Server className="h-10 w-10 text-slate-400" />
          </div>
          <h2 className="mb-2 text-xl font-semibold text-white">No connections yet</h2>
          <p className="mb-6 max-w-xs text-sm text-slate-400">
            Add your first Redis connection to start browsing keys and running commands.
          </p>
          {canManageConnections && (
            <Button
              onClick={handleOpenCreate}
              className="rounded-xl bg-gradient-to-r from-red-500 via-red-600 to-orange-500 text-white"
            >
              <Plus className="mr-2 h-4 w-4" />
              Add Connection
            </Button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
          {connections.map((conn) => {
            const isActive = activeConnectionId === conn.id
            const testResult = testResults[conn.id]
            return (
              <Card
                key={conn.id}
                className={`relative overflow-hidden border-white/10 bg-slate-950/60 text-slate-100 shadow-xl shadow-slate-950/20 transition-all hover:-translate-y-1 hover:shadow-2xl hover:shadow-slate-950/30 ${
                  isActive ? 'ring-2 ring-red-500/70 shadow-red-950/20' : ''
                }`}
              >
                <div className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-gradient-to-r from-red-500/12 via-transparent to-cyan-400/10" />
                <CardHeader className="relative pb-2">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-2 min-w-0">
                      <Server
                        className={`h-5 w-5 shrink-0 ${
                          isActive ? 'text-red-400' : 'text-slate-500'
                        }`}
                      />
                      <CardTitle className="truncate text-base text-white">{conn.name}</CardTitle>
                    </div>
                    {isActive && (
                      <Badge variant="secondary" className="ml-2 shrink-0 border-0 bg-red-500/15 text-xs text-red-100">
                        Active
                      </Badge>
                    )}
                  </div>
                </CardHeader>

                <CardContent className="relative space-y-4">
                  <div className="space-y-2 text-sm text-slate-400">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-slate-100">
                        {conn.host}:{conn.port}
                      </span>
                      {conn.useTLS && (
                        <Badge variant="outline" className="border-emerald-400/20 bg-emerald-400/10 px-1.5 py-0 text-xs text-emerald-200">
                          TLS
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="border-white/10 bg-white/5 text-xs text-slate-300">
                        {conn.mode}
                      </Badge>
                      {testResult === 'success' && (
                        <CheckCircle2 className="h-4 w-4 text-green-400" />
                      )}
                      {testResult === 'error' && (
                        <XCircle className="h-4 w-4 text-red-400" />
                      )}
                    </div>
                    {conn.tags.length > 0 && (
                      <div className="flex flex-wrap items-center gap-1.5">
                        <Tag className="h-3 w-3 shrink-0" />
                        {conn.tags.map((tag) => (
                          <span
                            key={tag}
                            className="rounded-full bg-white/5 px-2 py-1 text-xs text-slate-200"
                          >
                            {tag}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="flex gap-2 pt-1">
                    <Button
                      size="sm"
                      className="h-10 flex-1 rounded-xl bg-gradient-to-r from-red-500 via-red-600 to-orange-500 text-white shadow-lg shadow-red-950/30 hover:from-red-400 hover:via-red-500 hover:to-orange-400"
                      onClick={() => handleConnect(conn)}
                    >
                      {isActive ? (
                        <>
                          <Wifi className="mr-1.5 h-3 w-3" />
                          Connected
                        </>
                      ) : (
                        <>
                          Connect
                          <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
                        </>
                      )}
                    </Button>
                    <Button
                      size="icon"
                      variant="outline"
                      className="h-10 w-10 rounded-xl border-white/10 bg-white/5 hover:bg-white/10"
                      title="Test connection"
                      onClick={() => handleTestExisting(conn)}
                      disabled={testingId === conn.id}
                    >
                      {testingId === conn.id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <TestTube className="h-3.5 w-3.5" />
                      )}
                    </Button>
                    {canManageConnections && (
                      <Button
                        size="icon"
                        variant="outline"
                        className="h-10 w-10 rounded-xl border-white/10 bg-white/5 hover:bg-white/10"
                        title="Edit connection"
                        onClick={() => handleOpenEdit(conn)}
                      >
                        <Edit2 className="h-3.5 w-3.5" />
                      </Button>
                    )}
                    {canManageConnections && (
                      <Button
                        size="icon"
                        variant="outline"
                        className="h-10 w-10 rounded-xl border-red-500/20 bg-red-500/10 text-red-200 hover:bg-red-500 hover:text-white"
                        title="Delete connection"
                        onClick={() => setDeleteId(conn.id)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      {/* ── Create / Edit Dialog ── */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingId ? 'Edit Connection' : 'Add Connection'}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4 pt-2">
            {/* Name */}
            <div className="space-y-2">
              <Label htmlFor="conn-name">Name *</Label>
              <Input
                id="conn-name"
                placeholder="My Redis Server"
                value={formData.name}
                onChange={(e) => updateField('name', e.target.value)}
                required
              />
            </div>

            {/* Host + Port */}
            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-2 space-y-2">
                <Label htmlFor="conn-host">Host *</Label>
                <Input
                  id="conn-host"
                  placeholder="localhost"
                  value={formData.host}
                  onChange={(e) => updateField('host', e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="conn-port">Port *</Label>
                <Input
                  id="conn-port"
                  type="number"
                  placeholder="6379"
                  min={1}
                  max={65535}
                  value={formData.port}
                  onChange={(e) => updateField('port', parseInt(e.target.value, 10))}
                  required
                />
              </div>
            </div>

            {/* Username + Password */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="conn-username">Username</Label>
                <Input
                  id="conn-username"
                  placeholder="optional"
                  value={formData.username}
                  onChange={(e) => updateField('username', e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="conn-password">
                  Password{' '}
                  {editingId && (
                    <span className="text-muted-foreground text-xs">(leave blank to keep)</span>
                  )}
                </Label>
                <Input
                  id="conn-password"
                  type="password"
                  placeholder="optional"
                  value={formData.password}
                  onChange={(e) => updateField('password', e.target.value)}
                />
              </div>
            </div>

            {/* Mode */}
            <div className="space-y-2">
              <Label>Mode</Label>
              <Select
                value={formData.mode}
                onValueChange={(v) => updateField('mode', v as ConnectionMode)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="STANDALONE">Standalone</SelectItem>
                  <SelectItem value="SENTINEL">Sentinel</SelectItem>
                  <SelectItem value="CLUSTER">Cluster</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Sentinel Master Name — only shown in SENTINEL mode */}
            {formData.mode === 'SENTINEL' && (
              <div className="space-y-2">
                <Label htmlFor="conn-sentinel-master">Sentinel Master Name</Label>
                <Input
                  id="conn-sentinel-master"
                  placeholder="mymaster"
                  value={formData.sentinelMaster}
                  onChange={(e) => updateField('sentinelMaster', e.target.value)}
                />
              </div>
            )}

            {/* Tags */}
            <div className="space-y-2">
              <Label htmlFor="conn-tags">Tags</Label>
              <Input
                id="conn-tags"
                placeholder="production, cache, primary"
                value={formData.tags}
                onChange={(e) => updateField('tags', e.target.value)}
              />
              <p className="text-xs text-muted-foreground">Separate tags with commas</p>
            </div>

            {/* TLS Toggle */}
            <div className="flex items-center gap-3 py-1">
              <Switch
                id="conn-tls"
                checked={formData.useTLS}
                onCheckedChange={(v) => updateField('useTLS', v)}
              />
              <Label htmlFor="conn-tls" className="cursor-pointer">
                Use TLS / SSL
              </Label>
            </div>

            <DialogFooter className="pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setDialogOpen(false)}
                disabled={isPending}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isPending}>
                {isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                {editingId ? 'Save Changes' : 'Create Connection'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ── Delete Confirmation ── */}
      <AlertDialog open={!!deleteId} onOpenChange={(open) => !open && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Connection</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete this Redis connection and all associated
              permissions. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
