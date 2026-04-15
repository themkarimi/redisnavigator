import { Outlet, useLocation } from 'react-router-dom'
import { Sidebar } from './Sidebar'

export function AppLayout() {
  const location = useLocation()
  return (
    <div className="flex h-screen bg-background overflow-hidden">
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        <main
          key={location.pathname}
          className="flex-1 overflow-auto animate-in fade-in-0 slide-in-from-bottom-2 duration-300"
        >
          <Outlet />
        </main>
      </div>
    </div>
  )
}
