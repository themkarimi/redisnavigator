import { useState } from 'react'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { isAxiosError } from 'axios'
import { UserPlus, Trash2, ShieldAlert, Loader2 } from 'lucide-react'
import { useAuthStore } from '@/store/authStore'
import { api } from '@/services/api'
import { useConnectionStore } from '@/store/connectionStore'
import type { UserWithRoles, UserRole } from '@/types'
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

// ─── Types ────────────────────────────────────────────────────────────────────

const createUserSchema = z.object({
  email: z.string().email('Enter a valid email'),
  name: z.string().min(1, 'Enter a name'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  role: z.enum(['ADMIN', 'OPERATOR', 'VIEWER'] as const).optional(),
  connectionId: z.string().optional(),
})

type CreateUserFormValues = z.infer<typeof createUserSchema>

const ROLE_COLORS: Record<UserRole, string> = {
  SUPERADMIN: 'bg-red-600 text-white border-red-700',
  ADMIN: 'bg-orange-600 text-white border-orange-700',
  OPERATOR: 'bg-blue-600 text-white border-blue-700',
  VIEWER: 'bg-gray-600 text-white border-gray-700',
}

// ─── Invite Dialog ─────────────────────────────────────────────────────────────

function CreateUserDialog() {
  const [open, setOpen] = useState(false)
  const [apiError, setApiError] = useState<string | null>(null)
  const queryClient = useQueryClient()
  const connections = useConnectionStore((s) => s.connections)

  const {
    register,
    handleSubmit,
    control,
    reset,
    formState: { errors },
  } = useForm<CreateUserFormValues>({
    resolver: zodResolver(createUserSchema),
    defaultValues: { role: 'VIEWER' },
  })

  const createMutation = useMutation({
    mutationFn: (data: CreateUserFormValues) => api.post('/users/create', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] })
      setOpen(false)
      reset()
      setApiError(null)
    },
    onError: (err) => {
      if (isAxiosError(err)) {
        const msg = err.response?.data?.message ?? err.response?.data?.error ?? 'Failed to create user.'
        setApiError(Array.isArray(msg) ? msg.join(', ') : String(msg))
      } else {
        setApiError('An unexpected error occurred.')
      }
    },
  })

  function onSubmit(values: CreateUserFormValues) {
    setApiError(null)
    createMutation.mutate(values)
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) { reset(); setApiError(null) } }}>
      <DialogTrigger asChild>
        <Button className="bg-red-600 hover:bg-red-700 text-white gap-2">
          <UserPlus className="h-4 w-4" />
          Create User
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create User</DialogTitle>
          <DialogDescription>
            Create a new local user. Optionally grant access to a Redis connection.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 py-2">
          {apiError && (
            <Alert variant="destructive">
              <AlertDescription>{apiError}</AlertDescription>
            </Alert>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="create-name">Full Name</Label>
            <Input
              id="create-name"
              type="text"
              placeholder="John Doe"
              {...register('name')}
            />
            {errors.name && <p className="text-xs text-red-500">{errors.name.message}</p>}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="create-email">Email Address</Label>
            <Input
              id="create-email"
              type="email"
              placeholder="user@example.com"
              {...register('email')}
            />
            {errors.email && <p className="text-xs text-red-500">{errors.email.message}</p>}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="create-password">Password</Label>
            <Input
              id="create-password"
              type="password"
              placeholder="Minimum 8 characters"
              {...register('password')}
            />
            {errors.password && <p className="text-xs text-red-500">{errors.password.message}</p>}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="create-connection">Connection <span className="text-muted-foreground font-normal">(Optional)</span></Label>
            <Controller
              name="connectionId"
              control={control}
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger id="create-connection">
                    <SelectValue placeholder="Select a connection" />
                  </SelectTrigger>
                  <SelectContent>
                    {connections.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
            {errors.connectionId && (
              <p className="text-xs text-red-500">{errors.connectionId.message}</p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="create-role">Role <span className="text-muted-foreground font-normal">(Optional)</span></Label>
            <Controller
              name="role"
              control={control}
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger id="create-role">
                    <SelectValue placeholder="Select a role" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ADMIN">Admin</SelectItem>
                    <SelectItem value="OPERATOR">Operator</SelectItem>
                    <SelectItem value="VIEWER">Viewer</SelectItem>
                  </SelectContent>
                </Select>
              )}
            />
            {errors.role && <p className="text-xs text-red-500">{errors.role.message}</p>}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={createMutation.isPending}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              {createMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Creating…
                </>
              ) : (
                'Create User'
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// ─── Delete Confirmation ───────────────────────────────────────────────────────

function DeleteUserButton({ userId, userName }: { userId: string; userName: string }) {
  const [open, setOpen] = useState(false)
  const queryClient = useQueryClient()

  const deleteMutation = useMutation({
    mutationFn: () => api.delete(`/users/${userId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] })
      setOpen(false)
    },
  })

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 h-8 w-8"
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete User</DialogTitle>
          <DialogDescription>
            Are you sure you want to remove <strong>{userName}</strong>? This action cannot be
            undone.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={() => deleteMutation.mutate()}
            disabled={deleteMutation.isPending}
          >
            {deleteMutation.isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Deleting…
              </>
            ) : (
              'Delete'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ─── Main Page ─────────────────────────────────────────────────────────────────

export default function UsersPage() {
  const currentUser = useAuthStore((s) => s.user)
  const canAccess = currentUser?.role === 'SUPERADMIN' || currentUser?.role === 'ADMIN'

  const { data: users, isLoading, isError } = useQuery<UserWithRoles[]>({
    queryKey: ['users'],
    queryFn: async () => {
      const { data } = await api.get('/users')
      return data
    },
    enabled: canAccess,
  })

  if (!canAccess) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4 p-10 text-center">
        <ShieldAlert className="h-12 w-12 text-red-500" />
        <h2 className="text-xl font-semibold">Access Restricted</h2>
        <p className="text-muted-foreground max-w-sm">
          You need Admin or Super Admin privileges to view the user management page.
        </p>
      </div>
    )
  }

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">User Management</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Create and manage access for your team.
          </p>
        </div>
        <CreateUserDialog />
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : isError ? (
        <Alert variant="destructive">
          <AlertDescription>Failed to load users. Please try again.</AlertDescription>
        </Alert>
      ) : !users || users.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center border rounded-lg border-dashed">
          <p className="text-muted-foreground">No users found.</p>
          <p className="text-sm text-muted-foreground mt-1">
            Create users to grant them access.
          </p>
        </div>
      ) : (
        <div className="rounded-lg border overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted/50 text-muted-foreground">
                <th className="text-left font-medium px-4 py-3">Name</th>
                <th className="text-left font-medium px-4 py-3">Email</th>
                <th className="text-left font-medium px-4 py-3">Roles</th>
                <th className="text-left font-medium px-4 py-3">Joined</th>
                <th className="text-right font-medium px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {users.map((user) => (
                <tr key={user.id} className="hover:bg-muted/30 transition-colors">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2.5">
                      <div className="flex items-center justify-center w-7 h-7 rounded-full bg-gray-200 dark:bg-gray-700 text-xs font-semibold">
                        {user.name.charAt(0).toUpperCase()}
                      </div>
                      <span className="font-medium">{user.name}</span>
                      {!user.isActive && (
                        <Badge variant="outline" className="text-[10px] py-0 px-1.5">
                          Inactive
                        </Badge>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{user.email}</td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {user.connectionRoles.length === 0 ? (
                        <span className="text-muted-foreground text-xs">No roles</span>
                      ) : (
                        user.connectionRoles.map((cr) => (
                          <span
                            key={`${user.id}-${cr.connection.id}`}
                            className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium border ${ROLE_COLORS[cr.role] ?? 'bg-gray-600 text-white'}`}
                            title={cr.connection.name}
                          >
                            {cr.role}
                            <span className="opacity-70">· {cr.connection.name}</span>
                          </span>
                        ))
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {new Date(user.createdAt).toLocaleDateString(undefined, {
                      year: 'numeric',
                      month: 'short',
                      day: 'numeric',
                    })}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {user.id !== currentUser?.id && (
                      <DeleteUserButton userId={user.id} userName={user.name} />
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
