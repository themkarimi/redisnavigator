import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
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
  LayoutGrid,
  List,
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
import { Checkbox } from '@/components/ui/checkbox'
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
  sentinelNodes: { host: string; port: number }[]
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
  sentinelNodes: [],
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
  const [keepPassword, setKeepPassword] = useState(false)

  // View mode (grid | list) persisted across sessions
  const [viewMode, setViewMode] = useState<'grid' | 'list'>(() => {
    try {
      const stored = localStorage.getItem('connectionsViewMode')
      return stored === 'grid' || stored === 'list' ? stored : 'grid'
    } catch {
      return 'grid'
    }
  })

  const changeViewMode = (mode: 'grid' | 'list') => {
    setViewMode(mode)
    try {
      localStorage.setItem('connectionsViewMode', mode)
    } catch {
      // ignore storage errors
    }
  }
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
      sentinelNodes: conn.sentinelNodes ?? [],
      tags: conn.tags.join(', '),
    })
    setEditingId(conn.id)
    setKeepPassword(true)
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
      sentinelNodes: rest.mode === 'SENTINEL' ? rest.sentinelNodes : [],
      ...(editingId && keepPassword ? {} : { password }),
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

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Page Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Redis Connections</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Manage your Redis server connections
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* View toggle */}
          <div className="flex items-center border rounded-md overflow-hidden">
            <button
              type="button"
              title="Grid view"
              onClick={() => changeViewMode('grid')}
              className={`p-2 transition-colors ${
                viewMode === 'grid'
                  ? 'bg-muted text-foreground'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
              }`}
            >
              <LayoutGrid className="w-4 h-4" />
            </button>
            <button
              type="button"
              title="List view"
              onClick={() => changeViewMode('list')}
              className={`p-2 transition-colors ${
                viewMode === 'list'
                  ? 'bg-muted text-foreground'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
              }`}
            >
              <List className="w-4 h-4" />
            </button>
          </div>
          {canManageConnections && (
            <Button onClick={handleOpenCreate}>
              <Plus className="w-4 h-4 mr-2" />
              Add Connection
            </Button>
          )}
        </div>
      </div>

      {/* Connection List / Grid */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-52 rounded-lg skeleton-shimmer" />
          ))}
        </div>
      ) : connections.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-28 text-center">
          <div className="rounded-full bg-muted p-5 mb-5">
            <Server className="w-10 h-10 text-muted-foreground" />
          </div>
          <h2 className="text-xl font-semibold mb-2">No connections yet</h2>
          <p className="text-muted-foreground text-sm mb-6 max-w-xs">
            Add your first Redis connection to start browsing keys and running commands.
          </p>
          {canManageConnections && (
            <Button onClick={handleOpenCreate}>
              <Plus className="w-4 h-4 mr-2" />
              Add Connection
            </Button>
          )}
        </div>
      ) : (
        <>
          {/* ── Grid View ── */}
          {viewMode === 'grid' && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {connections.map((conn) => {
                const isActive = activeConnectionId === conn.id
                const testResult = testResults[conn.id]
                return (
                  <Card
                    key={conn.id}
                    className={`relative transition-all duration-200 hover:shadow-lg hover:-translate-y-1 hover:scale-[1.02] ${
                      isActive ? 'ring-2 ring-red-500 shadow-lg' : 'hover:ring-1 hover:ring-red-500/20'
                    }`}
                  >
                    <CardHeader className="pb-2">
                      <div className="flex items-start justify-between">
                        <div className="flex items-center gap-2 min-w-0">
                          <Server
                            className={`w-5 h-5 shrink-0 ${
                              isActive ? 'text-red-500' : 'text-muted-foreground'
                            }`}
                          />
                          <CardTitle className="text-base truncate">{conn.name}</CardTitle>
                        </div>
                        {isActive && (
                          <Badge variant="secondary" className="ml-2 shrink-0 text-xs">
                            Active
                          </Badge>
                        )}
                      </div>
                    </CardHeader>

                    <CardContent className="space-y-3">
                      <div className="space-y-1.5 text-sm text-muted-foreground">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-foreground">
                            {conn.host}:{conn.port}
                          </span>
                          {conn.useTLS && (
                            <Badge variant="outline" className="text-xs py-0 px-1.5">
                              TLS
                            </Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="text-xs">
                            {conn.mode}
                          </Badge>
                          {testResult === 'success' && (
                            <CheckCircle2 className="w-4 h-4 text-green-500" />
                          )}
                          {testResult === 'error' && (
                            <XCircle className="w-4 h-4 text-red-500" />
                          )}
                        </div>
                        {conn.tags.length > 0 && (
                          <div className="flex items-center gap-1 flex-wrap">
                            <Tag className="w-3 h-3 shrink-0" />
                            {conn.tags.map((tag) => (
                              <span
                                key={tag}
                                className="bg-muted px-1.5 py-0.5 rounded text-xs"
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
                          className="flex-1 bg-red-600 hover:bg-red-700 text-white"
                          onClick={() => handleConnect(conn)}
                        >
                          {isActive ? (
                            <>
                              <Wifi className="w-3 h-3 mr-1.5" />
                              Connected
                            </>
                          ) : (
                            'Connect'
                          )}
                        </Button>
                        <Button
                          size="icon"
                          variant="outline"
                          className="h-9 w-9"
                          title="Test connection"
                          onClick={() => handleTestExisting(conn)}
                          disabled={testingId === conn.id}
                        >
                          {testingId === conn.id ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <TestTube className="w-3.5 h-3.5" />
                          )}
                        </Button>
                        {canManageConnections && (
                          <Button
                            size="icon"
                            variant="outline"
                            className="h-9 w-9"
                            title="Edit connection"
                            onClick={() => handleOpenEdit(conn)}
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </Button>
                        )}
                        {canManageConnections && (
                          <Button
                            size="icon"
                            variant="outline"
                            className="h-9 w-9 text-destructive hover:bg-destructive hover:text-destructive-foreground"
                            title="Delete connection"
                            onClick={() => setDeleteId(conn.id)}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                )
              })}
            </div>
          )}

          {/* ── List View ── */}
          {viewMode === 'list' && (
            <div className="border rounded-lg overflow-hidden divide-y">
              {connections.map((conn) => {
                const isActive = activeConnectionId === conn.id
                const testResult = testResults[conn.id]
                return (
                  <div
                    key={conn.id}
                    className={`flex items-center gap-3 border-l-2 pl-[14px] pr-4 py-3 transition-all duration-150 hover:bg-muted/60 ${
                      isActive ? 'bg-red-50 dark:bg-red-950/20 border-red-500' : 'border-transparent'
                    }`}
                  >
                    {/* Icon */}
                    <Server
                      className={`w-4 h-4 shrink-0 ${
                        isActive ? 'text-red-500' : 'text-muted-foreground'
                      }`}
                    />

                    {/* Name */}
                    <span className="font-medium text-sm w-32 sm:w-40 truncate shrink-0" title={conn.name}>
                      {conn.name}
                    </span>

                    {/* Host:Port */}
                    <span className="hidden sm:inline font-mono text-sm text-muted-foreground w-36 md:w-44 truncate shrink-0">
                      {conn.host}:{conn.port}
                    </span>

                    {/* Badges */}
                    <div className="flex items-center gap-1.5 shrink-0">
                      <Badge variant="outline" className="text-xs">
                        {conn.mode}
                      </Badge>
                      {conn.useTLS && (
                        <Badge variant="outline" className="text-xs py-0 px-1.5">
                          TLS
                        </Badge>
                      )}
                      {isActive && (
                        <Badge variant="secondary" className="text-xs">
                          Active
                        </Badge>
                      )}
                    </div>

                    {/* Tags */}
                    <div className="flex items-center gap-1 flex-1 min-w-0 flex-wrap">
                      {conn.tags.length > 0 && (
                        <>
                          <Tag className="w-3 h-3 shrink-0 text-muted-foreground" />
                          {conn.tags.map((tag) => (
                            <span
                              key={tag}
                              className="bg-muted px-1.5 py-0.5 rounded text-xs"
                            >
                              {tag}
                            </span>
                          ))}
                        </>
                      )}
                    </div>

                    {/* Test result icon */}
                    <div className="shrink-0 w-5 flex justify-center">
                      {testResult === 'success' && (
                        <CheckCircle2 className="w-4 h-4 text-green-500" />
                      )}
                      {testResult === 'error' && (
                        <XCircle className="w-4 h-4 text-red-500" />
                      )}
                    </div>

                    {/* Actions */}
                    <div className="flex gap-1.5 shrink-0">
                      <Button
                        size="sm"
                        className="bg-red-600 hover:bg-red-700 text-white h-8 px-3"
                        onClick={() => handleConnect(conn)}
                      >
                        {isActive ? (
                          <>
                            <Wifi className="w-3 h-3 mr-1" />
                            Connected
                          </>
                        ) : (
                          'Connect'
                        )}
                      </Button>
                      <Button
                        size="icon"
                        variant="outline"
                        className="h-8 w-8"
                        title="Test connection"
                        onClick={() => handleTestExisting(conn)}
                        disabled={testingId === conn.id}
                      >
                        {testingId === conn.id ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <TestTube className="w-3.5 h-3.5" />
                        )}
                      </Button>
                      {canManageConnections && (
                        <Button
                          size="icon"
                          variant="outline"
                          className="h-8 w-8"
                          title="Edit connection"
                          onClick={() => handleOpenEdit(conn)}
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </Button>
                      )}
                      {canManageConnections && (
                        <Button
                          size="icon"
                          variant="outline"
                          className="h-8 w-8 text-destructive hover:bg-destructive hover:text-destructive-foreground"
                          title="Delete connection"
                          onClick={() => setDeleteId(conn.id)}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </>
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
            <div className="space-y-3">
              <div className="space-y-2">
                <Label htmlFor="conn-username">Username</Label>
                <Input
                  id="conn-username"
                  placeholder="optional"
                  value={formData.username}
                  onChange={(e) => updateField('username', e.target.value)}
                />
              </div>

              {editingId && (
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="keep-password"
                    checked={keepPassword}
                    onCheckedChange={(checked) => setKeepPassword(!!checked)}
                  />
                  <Label htmlFor="keep-password" className="cursor-pointer text-sm font-normal">
                    Keep existing password
                  </Label>
                </div>
              )}

              {(!editingId || !keepPassword) && (
                <div className="space-y-2">
                  <Label htmlFor="conn-password">Password</Label>
                  <Input
                    id="conn-password"
                    type="password"
                    placeholder="optional"
                    value={formData.password}
                    onChange={(e) => updateField('password', e.target.value)}
                  />
                </div>
              )}
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

            {/* Sentinel Nodes — only shown in SENTINEL mode */}
            {formData.mode === 'SENTINEL' && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>Sentinel Nodes</Label>
                  <button
                    type="button"
                    className="text-xs text-primary underline"
                    onClick={() =>
                      updateField('sentinelNodes', [
                        ...formData.sentinelNodes,
                        { host: '', port: 26379 },
                      ])
                    }
                  >
                    + Add node
                  </button>
                </div>
                {formData.sentinelNodes.length === 0 && (
                  <p className="text-xs text-muted-foreground">
                    Add at least one sentinel node (host:port).
                  </p>
                )}
                {formData.sentinelNodes.map((node, idx) => (
                  <div key={idx} className="grid grid-cols-3 gap-2 items-center">
                    <div className="col-span-2">
                      <Input
                        placeholder="sentinel-host"
                        value={node.host}
                        onChange={(e) => {
                          const updated = formData.sentinelNodes.map((n, i) =>
                            i === idx ? { ...n, host: e.target.value } : n
                          )
                          updateField('sentinelNodes', updated)
                        }}
                      />
                    </div>
                    <div className="flex gap-1">
                      <Input
                        type="number"
                        placeholder="26379"
                        min={1}
                        max={65535}
                        value={node.port}
                        onChange={(e) => {
                          const updated = formData.sentinelNodes.map((n, i) =>
                            i === idx ? { ...n, port: parseInt(e.target.value, 10) } : n
                          )
                          updateField('sentinelNodes', updated)
                        }}
                      />
                      <button
                        type="button"
                        className="text-destructive text-sm px-1"
                        onClick={() =>
                          updateField(
                            'sentinelNodes',
                            formData.sentinelNodes.filter((_, i) => i !== idx)
                          )
                        }
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                ))}
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
