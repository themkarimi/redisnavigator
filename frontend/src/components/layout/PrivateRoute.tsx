import { useEffect, useState } from 'react'
import { Navigate, Outlet } from 'react-router-dom'
import axios from 'axios'
import { useAuthStore } from '@/store/authStore'

const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000'

export function PrivateRoute() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  const accessToken = useAuthStore((s) => s.accessToken)
  const setAccessToken = useAuthStore((s) => s.setAccessToken)
  const logout = useAuthStore((s) => s.logout)
  const [isRefreshing, setIsRefreshing] = useState(() => isAuthenticated && !accessToken)

  useEffect(() => {
    if (!isAuthenticated || accessToken) return

    axios
      .post(`${BASE_URL}/api/auth/refresh`, {}, { withCredentials: true })
      .then(({ data }) => {
        setAccessToken(data.accessToken)
      })
      .catch(() => {
        logout()
      })
      .finally(() => {
        setIsRefreshing(false)
      })
  }, [isAuthenticated, accessToken, setAccessToken, logout])

  if (isRefreshing) return null
  return isAuthenticated ? <Outlet /> : <Navigate to="/login" replace />
}
