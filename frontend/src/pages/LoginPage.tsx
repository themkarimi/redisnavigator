import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { isAxiosError } from 'axios'
import { useQuery } from '@tanstack/react-query'
import { Circle, Loader2 } from 'lucide-react'
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

export default function LoginPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const setAuth = useAuthStore((s) => s.setAuth)

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
    <div className="min-h-screen flex items-center justify-center bg-gray-950 px-4">
      <div className="w-full max-w-md">
        {/* Brand */}
        <div className="flex flex-col items-center mb-8">
          <img src="/logo.png" alt="Logo" className="h-36 mb-3" />
        </div>

        <Card className="bg-gray-900 border-gray-800 text-white">
          <CardHeader className="pb-4">
            <CardTitle className="text-xl text-white">Sign in to your account</CardTitle>
            <CardDescription className="text-gray-400">
              Enter your credentials to continue
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
              {apiError && (
                <Alert variant="destructive" className="bg-red-950/50 border-red-800 text-red-300">
                  <AlertDescription>{apiError}</AlertDescription>
                </Alert>
              )}

              <div className="space-y-1.5">
                <Label htmlFor="email" className="text-gray-200">
                  Email
                </Label>
                <Input
                  id="email"
                  type="email"
                  autoComplete="email"
                  placeholder="you@example.com"
                  className="bg-gray-800 border-gray-700 text-white placeholder:text-gray-500 focus-visible:ring-red-500"
                  {...register('email')}
                />
                {errors.email && (
                  <p className="text-xs text-red-400">{errors.email.message}</p>
                )}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="password" className="text-gray-200">
                  Password
                </Label>
                <Input
                  id="password"
                  type="password"
                  autoComplete="current-password"
                  placeholder="••••••••"
                  className="bg-gray-800 border-gray-700 text-white placeholder:text-gray-500 focus-visible:ring-red-500"
                  {...register('password')}
                />
                {errors.password && (
                  <p className="text-xs text-red-400">{errors.password.message}</p>
                )}
              </div>

              <Button
                type="submit"
                disabled={isSubmitting}
                className="w-full bg-red-600 hover:bg-red-700 text-white mt-2"
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

            {oidcEnabled && (
              <>
                <div className="relative my-5">
                  <div className="absolute inset-0 flex items-center">
                    <span className="w-full border-t border-gray-700" />
                  </div>
                  <div className="relative flex justify-center text-xs">
                    <span className="bg-gray-900 px-2 text-gray-500">or</span>
                  </div>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  className="w-full border-gray-700 text-black hover:bg-gray-800"
                  onClick={() => { window.location.href = '/api/auth/oidc' }}
                >
                  Sign in with SSO
                </Button>
              </>
            )}

            {!oidcEnabled && (
              <p className="text-center text-sm text-gray-500 mt-6">
                Don&apos;t have an account?{' '}
                <Link
                  to="/register"
                  className="text-red-400 hover:text-red-300 font-medium transition-colors"
                >
                  Register
                </Link>
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
