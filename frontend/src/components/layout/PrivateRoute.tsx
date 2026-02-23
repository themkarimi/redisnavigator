import { useEffect, useState, useRef } from 'react'
import { Navigate, Outlet } from 'react-router-dom'
import axios from 'axios'
import { useAuthStore } from '@/store/authStore'

export function PrivateRoute() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  const accessToken = useAuthStore((s) => s.accessToken)
  const setAccessToken = useAuthStore((s) => s.setAccessToken)
  const logout = useAuthStore((s) => s.logout)
  const [hasHydrated, setHasHydrated] = useState(useAuthStore.persist.hasHydrated)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const refreshingRef = useRef(false)

  useEffect(() => {
    const unsub = useAuthStore.persist.onFinishHydration(() => {
      setHasHydrated(true)
    })
    // Handle case where hydration completed before listener was set up
    if (useAuthStore.persist.hasHydrated()) {
      setHasHydrated(true)
    }
    return unsub
  }, [])

  useEffect(() => {
    if (!hasHydrated) return
    if (!isAuthenticated || accessToken) return
    if (refreshingRef.current) return
    refreshingRef.current = true
    setIsRefreshing(true)

    axios
      .post('/api/auth/refresh', {}, { withCredentials: true })
      .then(({ data }) => {
        setAccessToken(data.accessToken)
      })
      .catch(() => {
        logout()
      })
      .finally(() => {
        setIsRefreshing(false)
        refreshingRef.current = false
      })

    return () => {
      refreshingRef.current = false
    }
  }, [hasHydrated, isAuthenticated, accessToken, setAccessToken, logout])

  if (!hasHydrated || isRefreshing) return null
  return isAuthenticated ? <Outlet /> : <Navigate to="/login" replace />
}
