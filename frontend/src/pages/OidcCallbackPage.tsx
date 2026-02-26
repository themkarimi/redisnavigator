import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Loader2 } from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'
import { useAuthStore } from '@/store/authStore'

export default function OidcCallbackPage() {
  const navigate = useNavigate()
  const setAuth = useAuthStore((s) => s.setAuth)
  const queryClient = useQueryClient()

  useEffect(() => {
    const hash = window.location.hash.slice(1)
    const params = new URLSearchParams(hash)
    const accessToken = params.get('access_token')
    const userParam = params.get('user')

    if (accessToken && userParam) {
      try {
        const user = JSON.parse(decodeURIComponent(userParam))
        setAuth(user, accessToken)
        queryClient.invalidateQueries({ queryKey: ['connections'] })
        navigate('/connections', { replace: true })
      } catch (err) {
        console.error('Failed to parse OIDC callback data:', err)
        navigate('/login?error=oidc_failed', { replace: true })
      }
    } else {
      navigate('/login?error=oidc_failed', { replace: true })
    }
  }, [navigate, setAuth, queryClient])

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-950">
      <div className="flex flex-col items-center gap-3 text-white">
        <Loader2 className="h-8 w-8 animate-spin text-red-500" />
        <p className="text-sm text-gray-400">Completing sign in…</p>
      </div>
    </div>
  )
}
