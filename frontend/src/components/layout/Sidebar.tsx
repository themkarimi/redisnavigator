import { NavLink, useNavigate, useParams } from 'react-router-dom'
import {
  Database,
  Terminal,
  Radio,
  BarChart2,
  Server,
  Settings,
  Users,
  UsersRound,
  LogOut,
  Moon,
  Sun,
} from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'
import { useAuthStore } from '@/store/authStore'
import { useConnectionStore } from '@/store/connectionStore'
import { useThemeStore } from '@/store/themeStore'
import { api } from '@/services/api'
import { cn } from '@/utils/cn'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

type NavItem = {
  label: string
  icon: React.ReactNode
  path: string
}

const navItems: NavItem[] = [
  { label: 'Key Browser', icon: <Database className="h-4 w-4" />, path: 'keys' },
  { label: 'CLI', icon: <Terminal className="h-4 w-4" />, path: 'cli' },
  { label: 'Pub/Sub', icon: <Radio className="h-4 w-4" />, path: 'pubsub' },
  { label: 'Metrics', icon: <BarChart2 className="h-4 w-4" />, path: 'metrics' },
]

export function Sidebar() {
  const navigate = useNavigate()
  const { connectionId } = useParams()

  const user = useAuthStore((s) => s.user)
  const logout = useAuthStore((s) => s.logout)
  const queryClient = useQueryClient()

  const connections = useConnectionStore((s) => s.connections)
  const activeConnectionId = useConnectionStore((s) => s.activeConnectionId)
  const setActiveConnection = useConnectionStore((s) => s.setActiveConnection)

  const theme = useThemeStore((s) => s.theme)
  const toggleTheme = useThemeStore((s) => s.toggleTheme)

  const canManageUsers = user?.role === 'SUPERADMIN' || user?.role === 'ADMIN'

  const activeId = connectionId ?? activeConnectionId

  function handleConnectionChange(id: string) {
    setActiveConnection(id)
    navigate(`/connections/${id}/keys`)
  }

  async function handleLogout() {
    try {
      await api.post('/auth/logout')
    } catch {
      // swallow errors — proceed with client-side logout regardless
    }
    queryClient.removeQueries({ queryKey: ['connections'] })
    logout()
    navigate('/login')
  }

  const userInitials = user?.name
    ? user.name
        .split(' ')
        .map((n) => n[0])
        .join('')
        .toUpperCase()
        .slice(0, 2)
    : '??'

  return (
    <aside className="relative flex h-screen w-[260px] flex-shrink-0 flex-col overflow-hidden border-r border-white/10 bg-slate-950/85 text-white backdrop-blur-xl">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-40 bg-gradient-to-br from-red-500/20 via-fuchsia-500/10 to-transparent" />
      {/* Logo */}
      <div className="relative flex items-center gap-3 border-b border-white/10 px-4 py-5">
        <img src="/favicon.svg" alt="RedisNavigator logo" className="w-8 h-8" />
        <div className="min-w-0">
          <span className="block text-base font-semibold tracking-tight text-white">RedisNavigator</span>
          <span className="block text-xs text-slate-400">Operate Redis with confidence</span>
        </div>
      </div>

      {/* Connection selector */}
      <div className="border-b border-white/10 px-3 py-4">
        <p className="mb-1.5 px-1 text-[10px] font-semibold uppercase tracking-[0.28em] text-slate-500">
          Connection
        </p>
        {connections.length > 0 ? (
          <Select value={activeId ?? ''} onValueChange={handleConnectionChange}>
            <SelectTrigger className="h-10 w-full border-white/10 bg-white/5 text-sm text-gray-100 shadow-inner shadow-black/20 focus:border-red-400 focus:ring-red-400">
              <SelectValue placeholder="Select connection…" />
            </SelectTrigger>
            <SelectContent className="border-white/10 bg-slate-900 text-gray-100">
              {connections.map((conn) => (
                <SelectItem
                  key={conn.id}
                  value={conn.id}
                  className="text-gray-200 focus:bg-white/10 focus:text-white"
                >
                  <span className="flex items-center gap-2 min-w-0">
                    <span
                      className={cn(
                        'inline-block w-1.5 h-1.5 rounded-full flex-shrink-0',
                        conn.isActive ? 'bg-green-400' : 'bg-gray-500'
                      )}
                    />
                    <span className="truncate">{conn.name}</span>
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <div className="flex items-center gap-2 rounded-xl border border-dashed border-white/10 bg-white/5 px-3 py-2 text-sm text-gray-500">
            <Server className="h-4 w-4" />
            <span>No connections</span>
          </div>
        )}
      </div>

      {/* Main navigation */}
      <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
        <p className="mb-1.5 px-1 text-[10px] font-semibold uppercase tracking-[0.28em] text-slate-500">
          Navigate
        </p>
        {navItems.map((item) => {
          const to = activeId ? `/connections/${activeId}/${item.path}` : '#'
          const disabled = !activeId

          if (disabled) {
            return (
              <div
                key={item.label}
                className="select-none rounded-xl px-3 py-2 text-sm text-gray-600 cursor-not-allowed"
              >
                <div className="flex items-center gap-3">
                  {item.icon}
                  <span>{item.label}</span>
                </div>
              </div>
            )
          }

          return (
            <NavLink
              key={item.label}
              to={to}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-all',
                  isActive
                    ? 'bg-gradient-to-r from-red-500 to-red-600 text-white shadow-lg shadow-red-950/40'
                    : 'text-gray-300 hover:bg-white/5 hover:text-white'
                )
              }
            >
              {item.icon}
              <span>{item.label}</span>
            </NavLink>
          )
        })}
      </nav>

      {/* Divider */}
      <div className="mx-3 border-t border-white/10" />

      {/* Bottom section: management links */}
      <div className="space-y-1 px-3 py-3">
        <NavLink
          to="/connections"
          className={({ isActive }) =>
            cn(
              'flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-all',
              isActive
                ? 'bg-gradient-to-r from-red-500 to-red-600 text-white shadow-lg shadow-red-950/40'
                : 'text-gray-300 hover:bg-white/5 hover:text-white'
            )
          }
        >
          <Server className="h-4 w-4" />
          <span>Manage Connections</span>
        </NavLink>

        <NavLink
          to="/settings"
          className={({ isActive }) =>
            cn(
              'flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-all',
              isActive
                ? 'bg-gradient-to-r from-red-500 to-red-600 text-white shadow-lg shadow-red-950/40'
                : 'text-gray-300 hover:bg-white/5 hover:text-white'
            )
          }
        >
          <Settings className="h-4 w-4" />
          <span>Settings</span>
        </NavLink>

        {canManageUsers && (
          <NavLink
            to="/users"
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-all',
                  isActive
                    ? 'bg-gradient-to-r from-red-500 to-red-600 text-white shadow-lg shadow-red-950/40'
                    : 'text-gray-300 hover:bg-white/5 hover:text-white'
                )
              }
            >
            <Users className="h-4 w-4" />
            <span>Users</span>
          </NavLink>
        )}

        {canManageUsers && (
          <NavLink
            to="/groups"
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-all',
                  isActive
                    ? 'bg-gradient-to-r from-red-500 to-red-600 text-white shadow-lg shadow-red-950/40'
                    : 'text-gray-300 hover:bg-white/5 hover:text-white'
                )
              }
            >
            <UsersRound className="h-4 w-4" />
            <span>Groups</span>
          </NavLink>
        )}

        {/* Theme toggle */}
        <button
          onClick={toggleTheme}
          className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-gray-300 transition-all hover:bg-white/5 hover:text-white"
        >
          {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          <span>{theme === 'dark' ? 'Light Mode' : 'Dark Mode'}</span>
        </button>
      </div>

      {/* Divider */}
      <div className="mx-3 border-t border-white/10" />

      {/* User info + logout */}
      <div className="px-3 py-4">
        <div className="mb-3 rounded-2xl border border-white/10 bg-white/5 p-3">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-red-500 to-orange-500 text-xs font-semibold text-white shadow-lg shadow-red-950/40">
            {userInitials}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-gray-100">{user?.name ?? 'Unknown'}</p>
              <p className="truncate text-xs text-gray-500">{user?.email ?? ''}</p>
            </div>
          </div>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={handleLogout}
          className="w-full justify-start gap-2 rounded-xl px-3 text-gray-400 hover:bg-white/5 hover:text-white"
        >
          <LogOut className="h-4 w-4" />
          Sign out
        </Button>
      </div>
    </aside>
  )
}
