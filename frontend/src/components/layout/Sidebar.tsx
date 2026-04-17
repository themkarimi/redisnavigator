import { useState } from 'react'
import { Link, NavLink, useLocation, useNavigate, useParams } from 'react-router-dom'
import {
  Database,
  Terminal,
  Radio,
  BarChart2,
  SlidersHorizontal,
  Server,
  Settings,
  Users,
  UsersRound,
  LogOut,
  Moon,
  Sun,
  ChevronLeft,
  ChevronRight,
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
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'

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
  { label: 'Config', icon: <SlidersHorizontal className="h-4 w-4" />, path: 'config' },
]

export function Sidebar() {
  const navigate = useNavigate()
  const { connectionId } = useParams()
  const location = useLocation()

  const user = useAuthStore((s) => s.user)
  const logout = useAuthStore((s) => s.logout)
  const queryClient = useQueryClient()

  const connections = useConnectionStore((s) => s.connections)
  const activeConnectionId = useConnectionStore((s) => s.activeConnectionId)
  const setActiveConnection = useConnectionStore((s) => s.setActiveConnection)

  const theme = useThemeStore((s) => s.theme)
  const toggleTheme = useThemeStore((s) => s.toggleTheme)

  const [collapsed, setCollapsed] = useState(() => {
    try { return localStorage.getItem('sidebar-collapsed') === 'true' } catch { return false }
  })

  const toggleCollapsed = () => {
    const next = !collapsed
    setCollapsed(next)
    try { localStorage.setItem('sidebar-collapsed', String(next)) } catch {}
  }

  const canManageUsers = user?.role === 'SUPERADMIN' || user?.role === 'ADMIN'
  const activeId = connectionId ?? activeConnectionId
  const activeConnection = connections.find((c) => c.id === activeId)

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

  const bottomLinks = [
    { label: 'Manage Connections', icon: <Server className="h-4 w-4" />, to: '/connections' },
    { label: 'Settings', icon: <Settings className="h-4 w-4" />, to: '/settings' },
    ...(canManageUsers
      ? [
          { label: 'Users', icon: <Users className="h-4 w-4" />, to: '/users' },
          { label: 'Groups', icon: <UsersRound className="h-4 w-4" />, to: '/groups' },
        ]
      : []),
  ]

  return (
    <TooltipProvider delayDuration={300}>
      <aside
        className={cn(
          'h-screen bg-gray-900 text-white flex flex-col flex-shrink-0 border-r border-gray-800 transition-all duration-200',
          collapsed ? 'w-[60px]' : 'w-[240px]'
        )}
      >
        {/* Logo + collapse toggle */}
        <div
          className={cn(
            'flex items-center border-b border-gray-800',
            collapsed ? 'justify-center px-2 py-5' : 'gap-2.5 px-4 py-5 justify-between'
          )}
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <img src="/favicon.svg" alt="RedisNavigator logo" className="w-8 h-8 flex-shrink-0" />
            {!collapsed && (
              <span className="text-base font-semibold tracking-tight text-white truncate">
                RedisNavigator
              </span>
            )}
          </div>
          {!collapsed && (
            <button
              onClick={toggleCollapsed}
              className="p-1 rounded hover:bg-gray-800 text-gray-400 hover:text-white flex-shrink-0 transition-colors"
              title="Collapse sidebar"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
          )}
        </div>

        {/* Expand button (collapsed mode only) */}
        {collapsed && (
          <button
            onClick={toggleCollapsed}
            className="flex items-center justify-center h-7 mx-2 mt-1 rounded hover:bg-gray-800 text-gray-500 hover:text-white transition-colors"
            title="Expand sidebar"
          >
            <ChevronRight className="h-3.5 w-3.5" />
          </button>
        )}

        {/* Connection selector */}
        <div className={cn('border-b border-gray-800', collapsed ? 'px-2 py-2' : 'px-3 py-3')}>
          {!collapsed && (
            <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-500 mb-1.5 px-1">
              Connection
            </p>
          )}
          {!collapsed ? (
            connections.length > 0 ? (
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
              <div className="flex items-center gap-2 px-2 py-1.5 rounded-md bg-gray-800 text-gray-500 text-sm">
                <Server className="h-4 w-4" />
                <span>No connections</span>
              </div>
            )
          ) : (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={() => navigate('/connections')}
                  className="relative flex items-center justify-center w-full h-9 rounded-md bg-gray-800 hover:bg-gray-700 transition-colors"
                >
                  <Server className="h-4 w-4 text-gray-300" />
                  {activeConnection && (
                    <span
                      className={cn(
                        'absolute top-1 right-1 w-2 h-2 rounded-full border border-gray-900',
                        activeConnection.isActive ? 'bg-green-400' : 'bg-gray-500'
                      )}
                    />
                  )}
                </button>
              </TooltipTrigger>
              <TooltipContent side="right">
                {activeConnection ? activeConnection.name : 'Manage Connections'}
              </TooltipContent>
            </Tooltip>
          )}
        </div>

        {/* Main navigation */}
        <nav className="flex-1 overflow-y-auto px-2 py-3 space-y-0.5">
          {!collapsed && (
            <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-500 mb-1.5 px-1">
              Navigate
            </p>
          )}
          {navItems.map((item) => {
            const to = activeId ? `/connections/${activeId}/${item.path}` : '#'
            const disabled = !activeId

            if (disabled) {
              const disabledEl = (
                <div
                  className={cn(
                    'flex items-center rounded-md text-sm text-gray-600 cursor-not-allowed select-none',
                    collapsed
                      ? 'justify-center h-9 w-9 mx-auto'
                      : 'gap-3 border-l-2 border-transparent pl-[10px] pr-3 py-2'
                  )}
                >
                  {item.icon}
                  {!collapsed && <span>{item.label}</span>}
                </div>
              )
              if (!collapsed) return <div key={item.label}>{disabledEl}</div>
              return (
                <Tooltip key={item.label}>
                  <TooltipTrigger asChild>{disabledEl}</TooltipTrigger>
                  <TooltipContent side="right">{item.label} — Select a connection first</TooltipContent>
                </Tooltip>
              )
            }

            if (!collapsed) {
              return (
                <NavLink
                  key={item.label}
                  to={to}
                  className={({ isActive }) =>
                    cn(
                      'flex items-center gap-3 border-l-2 pl-[10px] pr-3 py-2 rounded-md text-sm transition-all duration-150',
                      isActive
                        ? 'border-white/60 bg-red-600 text-white'
                        : 'border-transparent text-gray-300 hover:bg-gray-800 hover:text-white'
                    )
                  }
                >
                  {item.icon}
                  <span>{item.label}</span>
                </NavLink>
              )
            }

            return (
              <Tooltip key={item.label}>
                <TooltipTrigger asChild>
                  <Link
                    to={to}
                    className={cn(
                      'flex items-center justify-center h-9 w-9 mx-auto rounded-md text-sm transition-all duration-150',
                      location.pathname === to || location.pathname.startsWith(to + '/')
                        ? 'bg-red-600 text-white'
                        : 'text-gray-300 hover:bg-gray-800 hover:text-white'
                    )}
                  >
                    {item.icon}
                  </Link>
                </TooltipTrigger>
                <TooltipContent side="right">{item.label}</TooltipContent>
              </Tooltip>
            )
          })}
        </nav>

        {/* Divider */}
        <div className="mx-3 border-t border-gray-800" />

        {/* Bottom section: management links + theme */}
        <div className="px-2 py-2 space-y-0.5">
          {bottomLinks.map(({ label, icon, to }) => {
            if (!collapsed) {
              return (
                <NavLink
                  key={label}
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
                  {icon}
                  <span>{label}</span>
                </NavLink>
              )
            }
            return (
              <Tooltip key={label}>
                <TooltipTrigger asChild>
                  <Link
                    to={to}
                    className={cn(
                      'flex items-center justify-center h-9 w-9 mx-auto rounded-md text-sm transition-colors',
                      location.pathname === to || location.pathname.startsWith(to + '/')
                        ? 'bg-red-600 text-white'
                        : 'text-gray-300 hover:bg-gray-800 hover:text-white'
                    )}
                  >
                    {icon}
                  </Link>
                </TooltipTrigger>
                <TooltipContent side="right">{label}</TooltipContent>
              </Tooltip>
            )
          })}

          {/* Theme toggle */}
          {!collapsed ? (
            <button
              onClick={toggleTheme}
              className="w-full flex items-center gap-3 border-l-2 border-transparent pl-[10px] pr-3 py-2 rounded-md text-sm text-gray-300 hover:bg-gray-800 hover:text-white transition-all duration-150"
            >
              {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
              <span>{theme === 'dark' ? 'Light Mode' : 'Dark Mode'}</span>
            </button>
          ) : (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={toggleTheme}
                  className="flex items-center justify-center h-9 w-9 mx-auto rounded-md text-sm text-gray-300 hover:bg-gray-800 hover:text-white transition-all duration-150"
                >
                  {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
                </button>
              </TooltipTrigger>
              <TooltipContent side="right">
                {theme === 'dark' ? 'Light Mode' : 'Dark Mode'}
              </TooltipContent>
            </Tooltip>
          )}
        </div>

        {/* Divider */}
        <div className="mx-3 border-t border-gray-800" />

        {/* User info + logout */}
        <div className={cn('py-3', collapsed ? 'px-2' : 'px-3')}>
          {!collapsed ? (
            <>
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
            </>
          ) : (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={handleLogout}
                  className="flex items-center justify-center w-9 h-9 mx-auto rounded-full bg-red-600/80 text-white text-xs font-semibold hover:bg-red-700 transition-colors"
                  title="Sign out"
                >
                  {userInitials}
                </button>
              </TooltipTrigger>
              <TooltipContent side="right">
                <div>
                  <p className="font-medium">{user?.name}</p>
                  {user?.email && <p className="text-xs opacity-70">{user.email}</p>}
                  <p className="text-xs mt-0.5 opacity-60">Click to sign out</p>
                </div>
              </TooltipContent>
            </Tooltip>
          )}
        </div>
      </aside>
    </TooltipProvider>
  )
}
