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
  Circle,
} from 'lucide-react'
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
    <aside className="h-screen w-[240px] bg-gray-900 text-white flex flex-col flex-shrink-0 border-r border-gray-800">
      {/* Logo */}
      <div className="flex items-center gap-2.5 px-4 py-5 border-b border-gray-800">
        <div className="flex items-center justify-center w-8 h-8 rounded-full bg-red-600">
          <Circle className="h-3 w-3 fill-white text-white" />
        </div>
        <span className="text-base font-semibold tracking-tight text-white">RedisGUI</span>
      </div>

      {/* Connection selector */}
      <div className="px-3 py-3 border-b border-gray-800">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-500 mb-1.5 px-1">
          Connection
        </p>
        {connections.length > 0 ? (
          <Select value={activeId ?? ''} onValueChange={handleConnectionChange}>
            <SelectTrigger className="w-full bg-gray-800 border-gray-700 text-gray-100 text-sm h-9 focus:ring-red-500 focus:border-red-500">
              <SelectValue placeholder="Select connection…" />
            </SelectTrigger>
            <SelectContent className="bg-gray-800 border-gray-700 text-gray-100">
              {connections.map((conn) => (
                <SelectItem
                  key={conn.id}
                  value={conn.id}
                  className="focus:bg-gray-700 focus:text-white text-gray-200"
                >
                  <span className="flex items-center gap-2">
                    <span
                      className={cn(
                        'inline-block w-1.5 h-1.5 rounded-full',
                        conn.isActive ? 'bg-green-400' : 'bg-gray-500'
                      )}
                    />
                    {conn.name}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <div className="flex items-center gap-2 px-2 py-1.5 rounded-md bg-gray-800 text-gray-500 text-sm">
            <Server className="h-4 w-4" />
            <span>No connections</span>
          </div>
        )}
      </div>

      {/* Main navigation */}
      <nav className="flex-1 overflow-y-auto px-2 py-3 space-y-0.5">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-500 mb-1.5 px-1">
          Navigate
        </p>
        {navItems.map((item) => {
          const to = activeId ? `/connections/${activeId}/${item.path}` : '#'
          const disabled = !activeId

          if (disabled) {
            return (
              <div
                key={item.label}
                className="flex items-center gap-3 px-3 py-2 rounded-md text-sm text-gray-600 cursor-not-allowed select-none"
              >
                {item.icon}
                <span>{item.label}</span>
              </div>
            )
          }

          return (
            <NavLink
              key={item.label}
              to={to}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors',
                  isActive
                    ? 'bg-red-600 text-white'
                    : 'text-gray-300 hover:bg-gray-800 hover:text-white'
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
      <div className="mx-3 border-t border-gray-800" />

      {/* Bottom section: management links */}
      <div className="px-2 py-2 space-y-0.5">
        <NavLink
          to="/connections"
          className={({ isActive }) =>
            cn(
              'flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors',
              isActive
                ? 'bg-red-600 text-white'
                : 'text-gray-300 hover:bg-gray-800 hover:text-white'
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
              'flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors',
              isActive
                ? 'bg-red-600 text-white'
                : 'text-gray-300 hover:bg-gray-800 hover:text-white'
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
                'flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors',
                isActive
                  ? 'bg-red-600 text-white'
                  : 'text-gray-300 hover:bg-gray-800 hover:text-white'
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
                'flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors',
                isActive
                  ? 'bg-red-600 text-white'
                  : 'text-gray-300 hover:bg-gray-800 hover:text-white'
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
          className="w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm text-gray-300 hover:bg-gray-800 hover:text-white transition-colors"
        >
          {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          <span>{theme === 'dark' ? 'Light Mode' : 'Dark Mode'}</span>
        </button>
      </div>

      {/* Divider */}
      <div className="mx-3 border-t border-gray-800" />

      {/* User info + logout */}
      <div className="px-3 py-3">
        <div className="flex items-center gap-2.5 mb-2">
          <div className="flex items-center justify-center w-8 h-8 rounded-full bg-red-600/80 text-white text-xs font-semibold flex-shrink-0">
            {userInitials}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-gray-100 truncate">{user?.name ?? 'Unknown'}</p>
            <p className="text-xs text-gray-500 truncate">{user?.email ?? ''}</p>
          </div>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={handleLogout}
          className="w-full justify-start gap-2 text-gray-400 hover:text-white hover:bg-gray-800 px-2"
        >
          <LogOut className="h-4 w-4" />
          Sign out
        </Button>
      </div>
    </aside>
  )
}
