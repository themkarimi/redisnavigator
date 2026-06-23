import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import { isAxiosError } from 'axios'
import {
  RefreshCw,
  UserPlus,
  Pencil,
  Trash2,
  ShieldCheck,
  ShieldAlert,
  KeyRound,
  Loader2,
  Search,
  Save,
} from 'lucide-react'
import {
  useAclUsers,
  useAclUser,
  useCreateAclUser,
  useUpdateAclUser,
  useDeleteAclUser,
  useSaveAcl,
} from '@/hooks/useAcl'
import type { AclUserDetail, AclUserInput, AclUserSummary } from '@/types'
import { useToast } from '@/hooks/use-toast'
import { cn } from '@/utils/cn'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { Skeleton } from '@/components/ui/skeleton'
import { Card, CardContent } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import {
  Dialog,
  DialogContent,
  DialogDescription,
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

// ─── Editor ─────────────────────────────────────────────────────────────────

interface EditorState {
  username: string
  enabled: boolean
  nopass: boolean
  passwords: string
  keepExistingPasswords: boolean
  keys: string
  channels: string
  commands: string
  rawRules: string
}

const DEFAULT_EDITOR: EditorState = {
  username: '',
  enabled: true,
  nopass: false,
  passwords: '',
  keepExistingPasswords: false,
  keys: '~*',
  channels: '&*',
  commands: '-@all',
  rawRules: '',
}

function fromDetail(detail: AclUserDetail): EditorState {
  return {
    username: detail.username,
    enabled: detail.enabled,
    nopass: detail.nopass,
    passwords: '',
    keepExistingPasswords: detail.passwordHashes.length > 0,
    keys: typeof detail.keys === 'string' ? detail.keys : '',
    channels: typeof detail.channels === 'string' ? detail.channels : '',
    commands: typeof detail.commands === 'string' ? detail.commands : '-@all',
    rawRules: '',
  }
}

function toInput(state: EditorState): AclUserInput {
  const passwords = state.passwords
    .split(/\s+/)
    .map((p) => p.trim())
    .filter(Boolean)
  return {
    enabled: state.enabled,
    nopass: state.nopass,
    passwords: state.nopass ? [] : passwords,
    keepExistingPasswords: state.nopass ? false : state.keepExistingPasswords,
    keys: state.keys.trim(),
    channels: state.channels.trim(),
    commands: state.commands.trim() || '-@all',
    rawRules: state.rawRules.trim() || undefined,
  }
}

function PresetRow({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-wrap gap-1.5">{children}</div>
}

interface AclEditorDialogProps {
  connectionId: string
  open: boolean
  onOpenChange: (open: boolean) => void
  /** null = create mode, otherwise edit the named user */
  editUsername: string | null
}

function AclEditorDialog({ connectionId, open, onOpenChange, editUsername }: AclEditorDialogProps) {
  const isEdit = editUsername !== null
  const { toast } = useToast()
  const detailQuery = useAclUser(connectionId, open && isEdit ? editUsername : null)
  const create = useCreateAclUser()
  const update = useUpdateAclUser()

  const [state, setState] = useState<EditorState>(DEFAULT_EDITOR)
  const [error, setError] = useState<string | null>(null)
  const existingHashes = detailQuery.data?.passwordHashes.length ?? 0

  // Reset / prefill whenever the dialog opens or the loaded detail changes.
  useEffect(() => {
    if (!open) return
    if (isEdit) {
      if (detailQuery.data) setState(fromDetail(detailQuery.data))
    } else {
      setState(DEFAULT_EDITOR)
    }
    setError(null)
  }, [open, isEdit, detailQuery.data])

  const set = <K extends keyof EditorState>(key: K, value: EditorState[K]) =>
    setState((s) => ({ ...s, [key]: value }))

  const saving = create.isPending || update.isPending

  async function handleSubmit() {
    setError(null)
    if (!isEdit && !/^[A-Za-z0-9._:-]{1,128}$/.test(state.username)) {
      setError('Username may only contain letters, numbers, and . _ : -')
      return
    }
    const input = toInput(state)
    try {
      if (isEdit) {
        await update.mutateAsync({ connectionId, username: editUsername, ...input })
        toast({ title: 'ACL user updated', description: editUsername })
      } else {
        await create.mutateAsync({ connectionId, username: state.username, ...input })
        toast({ title: 'ACL user created', description: state.username })
      }
      onOpenChange(false)
    } catch (err) {
      setError(isAxiosError(err) ? err.response?.data?.error ?? err.message : 'Request failed')
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? `Edit ACL user — ${editUsername}` : 'Create ACL user'}</DialogTitle>
          <DialogDescription>
            Rules are applied with a leading <code className="font-mono">reset</code>, so the saved user matches exactly what you define here. Changes are runtime-only — run{' '}
            <code className="font-mono">CONFIG REWRITE</code> or <code className="font-mono">ACL SAVE</code> on the server to persist them.
          </DialogDescription>
        </DialogHeader>

        {isEdit && detailQuery.isLoading ? (
          <div className="space-y-3 py-2">
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-24 w-full" />
          </div>
        ) : (
          <div className="space-y-4 py-1">
            {/* Username */}
            <div className="space-y-1.5">
              <Label htmlFor="acl-username">Username</Label>
              <Input
                id="acl-username"
                value={state.username}
                onChange={(e) => set('username', e.target.value)}
                disabled={isEdit}
                placeholder="e.g. app-readonly"
                className="font-mono"
              />
            </div>

            {/* Enabled */}
            <div className="flex items-center justify-between rounded-md border border-border p-3">
              <div>
                <p className="text-sm font-medium">Enabled</p>
                <p className="text-xs text-muted-foreground">Allow this user to authenticate (<code className="font-mono">on</code> / <code className="font-mono">off</code>)</p>
              </div>
              <Switch checked={state.enabled} onCheckedChange={(v) => set('enabled', v)} />
            </div>

            {/* Authentication */}
            <div className="space-y-2 rounded-md border border-border p-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">No password (nopass)</p>
                  <p className="text-xs text-muted-foreground">Authenticate with any password. Use with care.</p>
                </div>
                <Switch checked={state.nopass} onCheckedChange={(v) => set('nopass', v)} />
              </div>

              {!state.nopass && (
                <div className="space-y-2 pt-1">
                  {isEdit && existingHashes > 0 && (
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={state.keepExistingPasswords}
                        onChange={(e) => set('keepExistingPasswords', e.target.checked)}
                        className="h-4 w-4 accent-red-600"
                      />
                      Keep {existingHashes} existing password{existingHashes > 1 ? 's' : ''}
                    </label>
                  )}
                  <div className="space-y-1.5">
                    <Label htmlFor="acl-passwords">{isEdit ? 'Add passwords' : 'Passwords'}</Label>
                    <Textarea
                      id="acl-passwords"
                      value={state.passwords}
                      onChange={(e) => set('passwords', e.target.value)}
                      placeholder="One plaintext password per line"
                      rows={2}
                      className="font-mono text-sm"
                    />
                    <p className="text-xs text-muted-foreground">Stored hashed by Redis. Leave blank to keep current passwords.</p>
                  </div>
                </div>
              )}
            </div>

            {/* Commands */}
            <div className="space-y-1.5">
              <Label htmlFor="acl-commands">Command rules</Label>
              <PresetRow>
                <Button type="button" variant="outline" size="sm" onClick={() => set('commands', '+@all')}>Allow all</Button>
                <Button type="button" variant="outline" size="sm" onClick={() => set('commands', '-@all')}>Deny all</Button>
                <Button type="button" variant="outline" size="sm" onClick={() => set('commands', '-@all +@read')}>Read-only</Button>
              </PresetRow>
              <Input id="acl-commands" value={state.commands} onChange={(e) => set('commands', e.target.value)} placeholder="+@all  or  -@all +get +set" className="font-mono text-sm" />
            </div>

            {/* Keys */}
            <div className="space-y-1.5">
              <Label htmlFor="acl-keys">Key patterns</Label>
              <PresetRow>
                <Button type="button" variant="outline" size="sm" onClick={() => set('keys', '~*')}>All keys</Button>
                <Button type="button" variant="outline" size="sm" onClick={() => set('keys', '')}>No keys</Button>
              </PresetRow>
              <Input id="acl-keys" value={state.keys} onChange={(e) => set('keys', e.target.value)} placeholder="~*  or  ~app:* ~cache:*" className="font-mono text-sm" />
            </div>

            {/* Channels */}
            <div className="space-y-1.5">
              <Label htmlFor="acl-channels">Pub/Sub channel patterns</Label>
              <PresetRow>
                <Button type="button" variant="outline" size="sm" onClick={() => set('channels', '&*')}>All channels</Button>
                <Button type="button" variant="outline" size="sm" onClick={() => set('channels', 'resetchannels')}>No channels</Button>
              </PresetRow>
              <Input id="acl-channels" value={state.channels} onChange={(e) => set('channels', e.target.value)} placeholder="&*  or  &news:*" className="font-mono text-sm" />
            </div>

            {/* Advanced */}
            <div className="space-y-1.5">
              <Label htmlFor="acl-raw">Advanced rules (optional)</Label>
              <Input id="acl-raw" value={state.rawRules} onChange={(e) => set('rawRules', e.target.value)} placeholder="Extra ACL tokens appended verbatim, e.g. sanitize-payload" className="font-mono text-sm" />
            </div>

            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={saving} className="gap-2">
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            {isEdit ? 'Save changes' : 'Create user'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ─── User card ────────────────────────────────────────────────────────────────

function AclUserCard({
  user,
  onEdit,
  onDelete,
}: {
  user: AclUserSummary
  onEdit: () => void
  onDelete: () => void
}) {
  const isDefault = user.username === 'default'
  return (
    <Card>
      <CardContent className="flex items-start justify-between gap-4 py-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <KeyRound className="h-4 w-4 text-muted-foreground flex-shrink-0" />
            <span className="font-mono font-medium truncate">{user.username}</span>
            {user.enabled ? (
              <Badge className="bg-green-600 text-white border-green-700 gap-1"><ShieldCheck className="h-3 w-3" />on</Badge>
            ) : (
              <Badge variant="secondary" className="gap-1"><ShieldAlert className="h-3 w-3" />off</Badge>
            )}
            {isDefault && <Badge variant="outline">default</Badge>}
          </div>
          <p className="mt-2 font-mono text-xs text-muted-foreground break-all">{user.rules || '—'}</p>
        </div>
        <div className="flex flex-shrink-0 items-center gap-1.5">
          <Button variant="outline" size="sm" onClick={onEdit} className="gap-1.5">
            <Pencil className="h-3.5 w-3.5" /> Edit
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={onDelete}
            disabled={isDefault}
            className="gap-1.5 text-destructive hover:text-destructive"
            title={isDefault ? 'The default user cannot be deleted' : undefined}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AclPage() {
  const { id } = useParams<{ id: string }>()
  const connectionId = id ?? ''
  const { toast } = useToast()

  const { data: users, isLoading, isError, error, refetch, isFetching } = useAclUsers(connectionId || null)
  const deleteUser = useDeleteAclUser()
  const saveAcl = useSaveAcl()

  const [search, setSearch] = useState('')
  const [editorOpen, setEditorOpen] = useState(false)
  const [editUsername, setEditUsername] = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null)

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    const list = users ?? []
    if (!q) return list
    return list.filter((u) => u.username.toLowerCase().includes(q) || u.rules.toLowerCase().includes(q))
  }, [users, search])

  const apiErrorMsg = isAxiosError(error) ? error.response?.data?.error ?? error.message : null

  function openCreate() {
    setEditUsername(null)
    setEditorOpen(true)
  }
  function openEdit(username: string) {
    setEditUsername(username)
    setEditorOpen(true)
  }

  async function handleSave() {
    try {
      const res = await saveAcl.mutateAsync({ connectionId })
      toast({ title: 'ACL saved', description: res.message })
    } catch (err) {
      toast({
        title: 'Save failed',
        description: isAxiosError(err) ? err.response?.data?.error ?? err.message : 'Request failed',
        variant: 'destructive',
      })
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return
    try {
      await deleteUser.mutateAsync({ connectionId, username: deleteTarget })
      toast({ title: 'ACL user deleted', description: deleteTarget })
    } catch (err) {
      toast({
        title: 'Delete failed',
        description: isAxiosError(err) ? err.response?.data?.error ?? err.message : 'Request failed',
        variant: 'destructive',
      })
    } finally {
      setDeleteTarget(null)
    }
  }

  return (
    <div className="flex h-full flex-col gap-4 overflow-auto p-6">
      {/* Header */}
      <div className="flex flex-shrink-0 items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Access Control (ACL)</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">Manage Redis ACL users, permissions, and key/channel access</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching} className="gap-2">
            <RefreshCw className={cn('h-4 w-4', isFetching && 'animate-spin')} />
            Refresh
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleSave}
            disabled={saveAcl.isPending}
            className="gap-2"
            title="Persist current ACL rules to the server's ACL file (ACL SAVE)"
          >
            {saveAcl.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Save to disk
          </Button>
          <Button size="sm" onClick={openCreate} className="gap-2">
            <UserPlus className="h-4 w-4" />
            Add ACL User
          </Button>
        </div>
      </div>

      {/* Search */}
      <div className="relative max-w-sm flex-shrink-0">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input placeholder="Search users…" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-20 w-full rounded-lg" />
          ))}
        </div>
      ) : isError ? (
        <Alert variant="destructive">
          <AlertDescription>
            {apiErrorMsg ?? 'Failed to load ACL users. The Redis server may not support ACLs (requires Redis 6+) or you may lack permission.'}
          </AlertDescription>
        </Alert>
      ) : filtered.length === 0 ? (
        <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
          {search ? 'No users match your search.' : 'No ACL users found.'}
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((user) => (
            <AclUserCard
              key={user.username}
              user={user}
              onEdit={() => openEdit(user.username)}
              onDelete={() => setDeleteTarget(user.username)}
            />
          ))}
        </div>
      )}

      {connectionId && (
        <AclEditorDialog
          connectionId={connectionId}
          open={editorOpen}
          onOpenChange={setEditorOpen}
          editUsername={editUsername}
        />
      )}

      <AlertDialog open={deleteTarget !== null} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete ACL user?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes <span className="font-mono font-medium">{deleteTarget}</span> from the Redis ACL on every master node. Any client authenticating as this user will lose access. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteUser.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault()
                confirmDelete()
              }}
              disabled={deleteUser.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteUser.isPending ? 'Deleting…' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
