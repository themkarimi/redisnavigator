import React, { Suspense, useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useThemeStore } from '@/store/themeStore'
import { PrivateRoute } from '@/components/layout/PrivateRoute'
import { AppLayout } from '@/components/layout/AppLayout'
import { Toaster } from '@/components/ui/toaster'

const LoginPage = React.lazy(() => import('@/pages/LoginPage'))
const RegisterPage = React.lazy(() => import('@/pages/RegisterPage'))
const ConnectionsPage = React.lazy(() => import('@/pages/ConnectionsPage'))
const KeyBrowserPage = React.lazy(() => import('@/pages/KeyBrowserPage'))
const CLIPage = React.lazy(() => import('@/pages/CLIPage'))
const PubSubPage = React.lazy(() => import('@/pages/PubSubPage'))
const MetricsPage = React.lazy(() => import('@/pages/MetricsPage'))
const SettingsPage = React.lazy(() => import('@/pages/SettingsPage'))
const UsersPage = React.lazy(() => import('@/pages/UsersPage'))

function LoadingFallback() {
  return (
    <div className="flex items-center justify-center h-full min-h-screen bg-background">
      <div className="flex flex-col items-center gap-3">
        <div className="w-8 h-8 border-2 border-redis-red border-t-transparent rounded-full animate-spin" />
        <p className="text-sm text-muted-foreground">Loading...</p>
      </div>
    </div>
  )
}

export default function App() {
  const theme = useThemeStore((s) => s.theme)

  useEffect(() => {
    const root = document.documentElement
    if (theme === 'dark') {
      root.classList.add('dark')
    } else {
      root.classList.remove('dark')
    }
  }, [theme])

  return (
    <BrowserRouter>
      <Suspense fallback={<LoadingFallback />}>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route element={<PrivateRoute />}>
            <Route element={<AppLayout />}>
              <Route path="/" element={<Navigate to="/connections" replace />} />
              <Route path="/connections" element={<ConnectionsPage />} />
              <Route path="/connections/:id/keys" element={<KeyBrowserPage />} />
              <Route path="/connections/:id/cli" element={<CLIPage />} />
              <Route path="/connections/:id/pubsub" element={<PubSubPage />} />
              <Route path="/connections/:id/metrics" element={<MetricsPage />} />
              <Route path="/settings" element={<SettingsPage />} />
              <Route path="/users" element={<UsersPage />} />
            </Route>
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
      <Toaster />
    </BrowserRouter>
  )
}
