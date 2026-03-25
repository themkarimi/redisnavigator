import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { isAxiosError } from 'axios'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Activity,
  Circle,
  Gauge,
  Loader2,
  ShieldCheck,
} from 'lucide-react'
import { useAuthStore } from '@/store/authStore'
import { api } from '@/services/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'

const loginSchema = z.object({
  email: z.string().min(1, 'Email is required').email('Enter a valid email address'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
})

type LoginFormValues = z.infer<typeof loginSchema>

const platformHighlights = [
  {
    icon: ShieldCheck,
    title: 'Secure by default',
    description: 'Encrypted credentials, RBAC, and audit trails built into every connection.',
  },
  {
    icon: Activity,
    title: 'Live observability',
    description: 'Track pub/sub, metrics, and command activity in one focused workspace.',
  },
  {
    icon: Gauge,
    title: 'Faster operations',
    description: 'Switch between environments quickly and keep production changes controlled.',
  },
]

export default function LoginPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const setAuth = useAuthStore((s) => s.setAuth)
  const queryClient = useQueryClient()

  const { data: authConfig } = useQuery({
    queryKey: ['auth-config'],
    queryFn: async () => {
      const { data } = await api.get<{ oidcEnabled: boolean }>('/auth/config')
      return data
    },
    staleTime: Infinity,
  })
  const oidcEnabled = authConfig?.oidcEnabled ?? false
  const [apiError, setApiError] = useState<string | null>(() => {
    const err = searchParams.get('error')
    if (err === 'oidc_failed') return 'OIDC login failed. Please try again.'
    if (err === 'oidc_no_email') return 'OIDC provider did not return an email address.'
    if (err === 'account_inactive') return 'Your account is inactive.'
    return null
  })

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
  })

  async function onSubmit(values: LoginFormValues) {
    setApiError(null)
    try {
      const { data } = await api.post<{ accessToken: string; user: { id: string; email: string; name: string } }>(
        '/auth/login',
        values
      )
      setAuth(data.user, data.accessToken)
      queryClient.invalidateQueries({ queryKey: ['connections'] })
      navigate('/connections')
    } catch (err) {
      if (isAxiosError(err)) {
        const message =
          err.response?.data?.message ??
          err.response?.data?.error ??
          'Invalid email or password.'
        setApiError(Array.isArray(message) ? message.join(', ') : String(message))
      } else {
        setApiError('An unexpected error occurred. Please try again.')
      }
    }
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#020617] px-4 py-10 text-white sm:px-6 lg:px-8">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute left-0 top-0 h-80 w-80 rounded-full bg-red-500/20 blur-3xl" />
        <div className="absolute right-0 top-20 h-96 w-96 rounded-full bg-cyan-500/20 blur-3xl" />
        <div className="absolute bottom-0 left-1/3 h-72 w-72 rounded-full bg-fuchsia-500/10 blur-3xl" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.08),transparent_35%),linear-gradient(135deg,rgba(15,23,42,0.96),rgba(2,6,23,1))]" />
      </div>

      <div className="relative mx-auto flex min-h-[calc(100vh-5rem)] w-full max-w-6xl items-center">
        <div className="grid w-full gap-10 lg:grid-cols-[1.15fr_0.85fr] lg:items-center">
          <div className="space-y-8">
            <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-slate-200 backdrop-blur">
              <Circle className="h-3 w-3 fill-red-400 text-red-400" />
              Redis GUI for modern operations teams
            </div>

            <div className="space-y-5">
              <img src="/logo.png" alt="RedisNavigator" className="h-20 sm:h-24" />
              <div className="max-w-2xl space-y-4">
                <h1 className="text-4xl font-semibold tracking-tight text-white sm:text-5xl lg:text-6xl">
                  See every Redis environment with a cleaner, faster control plane.
                </h1>
                <p className="max-w-xl text-base leading-7 text-slate-300 sm:text-lg">
                  Monitor live workloads, browse keys safely, and manage access from a single polished interface.
                </p>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              {platformHighlights.map(({ icon: Icon, title, description }) => (
                <div
                  key={title}
                  className="rounded-2xl border border-white/10 bg-white/5 p-4 shadow-2xl shadow-slate-950/30 backdrop-blur"
                >
                  <div className="mb-3 inline-flex rounded-xl bg-red-500/15 p-2 text-red-200">
                    <Icon className="h-5 w-5" />
                  </div>
                  <h2 className="text-sm font-semibold text-white">{title}</h2>
                  <p className="mt-2 text-sm leading-6 text-slate-300">{description}</p>
                </div>
              ))}
            </div>
          </div>

          <Card className="border-white/10 bg-slate-950/70 text-white shadow-2xl shadow-black/40 backdrop-blur-xl">
            <CardHeader className="space-y-3 pb-6">
              <div className="inline-flex w-fit items-center gap-2 rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1 text-xs font-medium uppercase tracking-[0.24em] text-emerald-200">
                Secure access
              </div>
              <div className="space-y-2">
                <CardTitle className="text-2xl text-white">Sign in to RedisNavigator</CardTitle>
                <CardDescription className="text-slate-400">
                  Enter your credentials to continue into your Redis workspace.
                </CardDescription>
              </div>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-5">
                {apiError && (
                  <Alert variant="destructive" className="border-red-800 bg-red-950/50 text-red-300">
                    <AlertDescription>{apiError}</AlertDescription>
                  </Alert>
                )}

                <div className="space-y-2">
                  <Label htmlFor="email" className="text-slate-200">
                    Email
                  </Label>
                  <Input
                    id="email"
                    type="email"
                    autoComplete="email"
                    placeholder="you@example.com"
                    className="h-11 border-white/10 bg-white/5 text-white placeholder:text-slate-500 focus-visible:ring-red-500"
                    {...register('email')}
                  />
                  {errors.email && <p className="text-xs text-red-400">{errors.email.message}</p>}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="password" className="text-slate-200">
                    Password
                  </Label>
                  <Input
                    id="password"
                    type="password"
                    autoComplete="current-password"
                    placeholder="••••••••"
                    className="h-11 border-white/10 bg-white/5 text-white placeholder:text-slate-500 focus-visible:ring-red-500"
                    {...register('password')}
                  />
                  {errors.password && <p className="text-xs text-red-400">{errors.password.message}</p>}
                </div>

                <Button
                  type="submit"
                  disabled={isSubmitting}
                  className="mt-2 h-11 w-full bg-gradient-to-r from-red-500 via-red-600 to-orange-500 text-white shadow-lg shadow-red-950/40 transition-transform hover:scale-[1.01] hover:from-red-400 hover:via-red-500 hover:to-orange-400"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Signing in…
                    </>
                  ) : (
                    'Sign In'
                  )}
                </Button>
              </form>

              <div className="mt-6 rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-sm text-slate-300">
                <p className="font-medium text-white">Built for safer Redis access</p>
                <p className="mt-2 leading-6 text-slate-400">
                  Role-based access, audit logs, encrypted credentials, and live metrics come standard.
                </p>
              </div>

              {oidcEnabled && (
                <>
                  <div className="relative my-6">
                    <div className="absolute inset-0 flex items-center">
                      <span className="w-full border-t border-white/10" />
                    </div>
                    <div className="relative flex justify-center text-xs uppercase tracking-[0.2em]">
                      <span className="bg-slate-950 px-3 text-slate-500">or continue with</span>
                    </div>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    className="h-11 w-full border-white/10 bg-white/5 text-slate-200 hover:bg-white/10 hover:text-white"
                    onClick={() => { window.location.href = '/api/auth/oidc' }}
                  >
                    Sign in with SSO
                  </Button>
                </>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
