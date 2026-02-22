import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { isAxiosError } from 'axios'
import {
  Users,
  Plus,
  Trash2,
  ShieldAlert,
  Loader2,
  ChevronDown,
  ChevronRight,
  UserMinus,
  ServerOff,
} from 'lucide-react'
import { useAuthStore } from '@/store/authStore'
import { api } from '@/services/api'
import { useConnectionStore } from '@/store/connectionStore'
import type { Group, UserWithRoles, UserRole } from '@/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Alert, AlertDescription } from '@/components/ui/alert'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'

// ─── Schemas ──────────────────────────────────────────────────────────────────

const groupSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100),
  description: z.string().optional(),
})
type GroupFormValues = z.infer<typeof groupSchema>

const addMemberSchema = z.object({
  userId: z.string().min(1, 'Select a user'),
})
type AddMemberFormValues = z.infer<typeof addMemberSchema>

const assignConnectionSchema = z.object({
  connectionId: z.string().min(1, 'Select a connection'),
  role: z.enum(['ADMIN', 'OPERATOR', 'VIEWER'] as const),
})
type AssignConnectionFormValues = z.infer<typeof assignConnectionSchema>

// ─── Role badge colours ───────────────────────────────────────────────────────

const ROLE_COLORS: Record<UserRole, string> = {
  SUPERADMIN: 'bg-red-600 text-white border-red-700',
  ADMIN: 'bg-orange-600 text-white border-orange-700',
  OPERATOR: 'bg-blue-600 text-white border-blue-700',
  VIEWER: 'bg-gray-600 text-white border-gray-700',
}

// ─── Create Group Dialog ──────────────────────────────────────────────────────

function CreateGroupDialog() {
  const [open, setOpen] = useState(false)
  const [apiError, setApiError] = useState<string | null>(null)
  const queryClient = useQueryClient()

  const { register, handleSubmit, reset, formState: { errors } } = useForm<GroupFormValues>({
    resolver: zodResolver(groupSchema),
  })

  const mutation = useMutation({
    mutationFn: (data: GroupFormValues) => api.post('/groups', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['groups'] })
      setOpen(false)
      reset()
      setApiError(null)
    },
    onError: (err) => {
      if (isAxiosError(err)) {
        setApiError(err.response?.data?.error ?? 'Failed to create group.')
      } else {
        setApiError('An unexpected error occurred.')
      }
    },
  })

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) { reset(); setApiError(null) } }}>
      <DialogTrigger asChild>
        <Button className="bg-red-600 hover:bg-red-700 text-white gap-2">
          <Plus className="h-4 w-4" />
          New Group
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create Group</DialogTitle>
          <DialogDescription>Create a new group to manage shared access to Redis connections.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit((d) => { setApiError(null); mutation.mutate(d) })} className="space-y-4 py-2">
          {apiError && <Alert variant="destructive"><AlertDescription>{apiError}</AlertDescription></Alert>}
          <div className="space-y-1.5">
            <Label htmlFor="group-name">Name</Label>
            <Input id="group-name" placeholder="e.g. backend-team" {...register('name')} />
            {errors.name && <p className="text-xs text-red-500">{errors.name.message}</p>}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="group-desc">Description</Label>
            <Input id="group-desc" placeholder="Optional description" {...register('description')} />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" disabled={mutation.isPending} className="bg-red-600 hover:bg-red-700 text-white">
              {mutation.isPending ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Creating…</> : 'Create Group'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// ─── Add Member Dialog ────────────────────────────────────────────────────────

function AddMemberDialog({ groupId, existingUserIds }: { groupId: string; existingUserIds: string[] }) {
  const [open, setOpen] = useState(false)
  const [apiError, setApiError] = useState<string | null>(null)
  const queryClient = useQueryClient()

  const { data: users = [] } = useQuery<UserWithRoles[]>({
    queryKey: ['users'],
    queryFn: async () => (await api.get('/users')).data,
  })

  const availableUsers = users.filter((u) => !existingUserIds.includes(u.id))

  const { handleSubmit, setValue, watch, reset, formState: { errors } } = useForm<AddMemberFormValues>({
    resolver: zodResolver(addMemberSchema),
    defaultValues: { userId: '' },
  })

  const selectedUserId = watch('userId')

  const mutation = useMutation({
    mutationFn: (data: AddMemberFormValues) => api.post(`/groups/${groupId}/members`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['groups'] })
      setOpen(false)
      reset()
      setApiError(null)
    },
    onError: (err) => {
      if (isAxiosError(err)) {
        setApiError(err.response?.data?.error ?? 'Failed to add member.')
      } else {
        setApiError('An unexpected error occurred.')
      }
    },
  })

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) { reset(); setApiError(null) } }}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1.5">
          <Plus className="h-3.5 w-3.5" />
          Add Member
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add Member</DialogTitle>
          <DialogDescription>Select a user to add to this group.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit((d) => { setApiError(null); mutation.mutate(d) })} className="space-y-4 py-2">
          {apiError && <Alert variant="destructive"><AlertDescription>{apiError}</AlertDescription></Alert>}
          <div className="space-y-1.5">
            <Label>User</Label>
            <Select value={selectedUserId} onValueChange={(v) => setValue('userId', v)}>
              <SelectTrigger><SelectValue placeholder="Select a user" /></SelectTrigger>
              <SelectContent>
                {availableUsers.length === 0
                  ? <SelectItem value="_none" disabled>No users available</SelectItem>
                  : availableUsers.map((u) => (
                    <SelectItem key={u.id} value={u.id}>{u.name} ({u.email})</SelectItem>
                  ))
                }
              </SelectContent>
            </Select>
            {errors.userId && <p className="text-xs text-red-500">{errors.userId.message}</p>}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" disabled={mutation.isPending || availableUsers.length === 0} className="bg-red-600 hover:bg-red-700 text-white">
              {mutation.isPending ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Adding…</> : 'Add Member'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// ─── Assign Connection Dialog ─────────────────────────────────────────────────

function AssignConnectionDialog({ groupId, existingConnectionIds }: { groupId: string; existingConnectionIds: string[] }) {
  const [open, setOpen] = useState(false)
  const [apiError, setApiError] = useState<string | null>(null)
  const queryClient = useQueryClient()

  const connections = useConnectionStore((s) => s.connections)
  const availableConnections = connections.filter((c) => !existingConnectionIds.includes(c.id))

  const { handleSubmit, setValue, watch, reset, formState: { errors } } = useForm<AssignConnectionFormValues>({
    resolver: zodResolver(assignConnectionSchema),
    defaultValues: { connectionId: '', role: 'VIEWER' },
  })

  const selectedConnectionId = watch('connectionId')
  const selectedRole = watch('role')

  const mutation = useMutation({
    mutationFn: (data: AssignConnectionFormValues) => api.post(`/groups/${groupId}/connections`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['groups'] })
      setOpen(false)
      reset()
      setApiError(null)
    },
    onError: (err) => {
      if (isAxiosError(err)) {
        setApiError(err.response?.data?.error ?? 'Failed to assign connection.')
      } else {
        setApiError('An unexpected error occurred.')
      }
    },
  })

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) { reset(); setApiError(null) } }}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1.5">
          <Plus className="h-3.5 w-3.5" />
          Add Connection
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Assign Connection Access</DialogTitle>
          <DialogDescription>Grant this group access to a Redis connection.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit((d) => { setApiError(null); mutation.mutate(d) })} className="space-y-4 py-2">
          {apiError && <Alert variant="destructive"><AlertDescription>{apiError}</AlertDescription></Alert>}
          <div className="space-y-1.5">
            <Label>Connection</Label>
            <Select value={selectedConnectionId} onValueChange={(v) => setValue('connectionId', v)}>
              <SelectTrigger><SelectValue placeholder="Select a connection" /></SelectTrigger>
              <SelectContent>
                {availableConnections.length === 0
                  ? <SelectItem value="_none" disabled>No connections available</SelectItem>
                  : availableConnections.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))
                }
              </SelectContent>
            </Select>
            {errors.connectionId && <p className="text-xs text-red-500">{errors.connectionId.message}</p>}
          </div>
          <div className="space-y-1.5">
            <Label>Role</Label>
            <Select value={selectedRole} onValueChange={(v) => setValue('role', v as AssignConnectionFormValues['role'])}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ADMIN">Admin</SelectItem>
                <SelectItem value="OPERATOR">Operator</SelectItem>
                <SelectItem value="VIEWER">Viewer</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" disabled={mutation.isPending || availableConnections.length === 0} className="bg-red-600 hover:bg-red-700 text-white">
              {mutation.isPending ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Assigning…</> : 'Assign Access'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// ─── Group Row ────────────────────────────────────────────────────────────────

function GroupRow({ group }: { group: Group }) {
  const [open, setOpen] = useState(false)
  const queryClient = useQueryClient()

  const removeMember = useMutation({
    mutationFn: (userId: string) => api.delete(`/groups/${group.id}/members/${userId}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['groups'] }),
  })

  const removeConnection = useMutation({
    mutationFn: (connectionId: string) => api.delete(`/groups/${group.id}/connections/${connectionId}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['groups'] }),
  })

  const deleteGroup = useMutation({
    mutationFn: () => api.delete(`/groups/${group.id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['groups'] }),
  })

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <div className="border rounded-lg overflow-hidden">
        <CollapsibleTrigger asChild>
          <div className="flex items-center justify-between px-4 py-3 bg-muted/30 hover:bg-muted/50 cursor-pointer transition-colors">
            <div className="flex items-center gap-3">
              {open ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
              <div>
                <p className="font-semibold text-sm">{group.name}</p>
                {group.description && <p className="text-xs text-muted-foreground">{group.description}</p>}
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Badge variant="secondary" className="text-xs">{group.members.length} member{group.members.length !== 1 ? 's' : ''}</Badge>
              <Badge variant="secondary" className="text-xs">{group.connectionRoles.length} connection{group.connectionRoles.length !== 1 ? 's' : ''}</Badge>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30"
                title="Delete group"
                onClick={(e) => { e.stopPropagation(); deleteGroup.mutate() }}
                disabled={deleteGroup.isPending}
              >
                {deleteGroup.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
              </Button>
            </div>
          </div>
        </CollapsibleTrigger>

        <CollapsibleContent>
          <div className="px-4 py-3 space-y-4 border-t">
            {/* Members section */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
                  <Users className="h-3.5 w-3.5" />Members
                </p>
                <AddMemberDialog groupId={group.id} existingUserIds={group.members.map((m) => m.userId)} />
              </div>
              {group.members.length === 0 ? (
                <p className="text-sm text-muted-foreground py-1">No members yet.</p>
              ) : (
                <div className="space-y-1.5">
                  {group.members.map((m) => (
                    <div key={m.id} className="flex items-center justify-between rounded-md px-2 py-1.5 hover:bg-muted/40">
                      <div>
                        <span className="text-sm font-medium">{m.user.name}</span>
                        <span className="text-xs text-muted-foreground ml-2">{m.user.email}</span>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30"
                        title="Remove member"
                        onClick={() => removeMember.mutate(m.userId)}
                        disabled={removeMember.isPending}
                      >
                        <UserMinus className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Connections section */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
                  <ServerOff className="h-3.5 w-3.5" />Connection Access
                </p>
                <AssignConnectionDialog groupId={group.id} existingConnectionIds={group.connectionRoles.map((cr) => cr.connectionId)} />
              </div>
              {group.connectionRoles.length === 0 ? (
                <p className="text-sm text-muted-foreground py-1">No connection access assigned.</p>
              ) : (
                <div className="space-y-1.5">
                  {group.connectionRoles.map((cr) => (
                    <div key={cr.id} className="flex items-center justify-between rounded-md px-2 py-1.5 hover:bg-muted/40">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium">{cr.connection.name}</span>
                        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium border ${ROLE_COLORS[cr.role]}`}>
                          {cr.role}
                        </span>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30"
                        title="Remove connection access"
                        onClick={() => removeConnection.mutate(cr.connectionId)}
                        disabled={removeConnection.isPending}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  )
}

// ─── Main Page ─────────────────────────────────────────────────────────────────

export default function GroupsPage() {
  const currentUser = useAuthStore((s) => s.user)
  const canAccess = currentUser?.role === 'SUPERADMIN' || currentUser?.role === 'ADMIN'

  const { data: groups, isLoading, isError } = useQuery<Group[]>({
    queryKey: ['groups'],
    queryFn: async () => (await api.get('/groups')).data,
    enabled: canAccess,
  })

  if (!canAccess) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4 p-10 text-center">
        <ShieldAlert className="h-12 w-12 text-red-500" />
        <h2 className="text-xl font-semibold">Access Restricted</h2>
        <p className="text-muted-foreground max-w-sm">
          You need Admin or Super Admin privileges to manage groups.
        </p>
      </div>
    )
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Group Management</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Organise users into groups and grant them shared access to Redis connections.
          </p>
        </div>
        <CreateGroupDialog />
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : isError ? (
        <Alert variant="destructive">
          <AlertDescription>Failed to load groups. Please try again.</AlertDescription>
        </Alert>
      ) : !groups || groups.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center border rounded-lg border-dashed">
          <p className="text-muted-foreground">No groups found.</p>
          <p className="text-sm text-muted-foreground mt-1">Create a group to get started.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {groups.map((group) => (
            <GroupRow key={group.id} group={group} />
          ))}
        </div>
      )}
    </div>
  )
}
