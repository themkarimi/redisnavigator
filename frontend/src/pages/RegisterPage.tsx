import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { isAxiosError } from 'axios'
import { CheckCircle2, Loader2 } from 'lucide-react'
import { api } from '@/services/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'

const registerSchema = z
  .object({
    name: z.string().min(2, 'Name must be at least 2 characters'),
    email: z.string().min(1, 'Email is required').email('Enter a valid email address'),
    password: z.string().min(8, 'Password must be at least 8 characters'),
    confirmPassword: z.string().min(1, 'Please confirm your password'),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  })

type RegisterFormValues = z.infer<typeof registerSchema>

export default function RegisterPage() {
  const navigate = useNavigate()
  const [apiError, setApiError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<RegisterFormValues>({
    resolver: zodResolver(registerSchema),
  })

  async function onSubmit(values: RegisterFormValues) {
    setApiError(null)
    try {
      await api.post('/auth/register', {
        name: values.name,
        email: values.email,
        password: values.password,
      })
      setSuccess(true)
      setTimeout(() => navigate('/login', { state: { registered: true } }), 2000)
    } catch (err) {
      if (isAxiosError(err)) {
        const message =
          err.response?.data?.message ??
          err.response?.data?.error ??
          'Registration failed. Please try again.'
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
          <div className="flex items-center justify-center w-12 h-12 rounded-full bg-red-600 mb-3">
            <span className="text-white font-bold text-lg">R</span>
          </div>
          <h1 className="text-2xl font-bold text-white tracking-tight">RedisGUI</h1>
          <p className="text-gray-400 text-sm mt-1">Visual Redis management tool</p>
        </div>

        <Card className="bg-gray-900 border-gray-800 text-white">
          <CardHeader className="pb-4">
            <CardTitle className="text-xl text-white">Create your account</CardTitle>
            <CardDescription className="text-gray-400">
              Sign up to start managing your Redis instances
            </CardDescription>
          </CardHeader>
          <CardContent>
            {success ? (
              <div className="flex flex-col items-center py-6 gap-3">
                <CheckCircle2 className="h-10 w-10 text-green-400" />
                <p className="text-gray-200 font-medium">Account created!</p>
                <p className="text-gray-400 text-sm text-center">
                  Redirecting you to the login page…
                </p>
              </div>
            ) : (
              <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
                {apiError && (
                  <Alert
                    variant="destructive"
                    className="bg-red-950/50 border-red-800 text-red-300"
                  >
                    <AlertDescription>{apiError}</AlertDescription>
                  </Alert>
                )}

                <div className="space-y-1.5">
                  <Label htmlFor="name" className="text-gray-200">
                    Full Name
                  </Label>
                  <Input
                    id="name"
                    type="text"
                    autoComplete="name"
                    placeholder="Jane Smith"
                    className="bg-gray-800 border-gray-700 text-white placeholder:text-gray-500 focus-visible:ring-red-500"
                    {...register('name')}
                  />
                  {errors.name && (
                    <p className="text-xs text-red-400">{errors.name.message}</p>
                  )}
                </div>

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
                    autoComplete="new-password"
                    placeholder="Min. 8 characters"
                    className="bg-gray-800 border-gray-700 text-white placeholder:text-gray-500 focus-visible:ring-red-500"
                    {...register('password')}
                  />
                  {errors.password && (
                    <p className="text-xs text-red-400">{errors.password.message}</p>
                  )}
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="confirmPassword" className="text-gray-200">
                    Confirm Password
                  </Label>
                  <Input
                    id="confirmPassword"
                    type="password"
                    autoComplete="new-password"
                    placeholder="Re-enter your password"
                    className="bg-gray-800 border-gray-700 text-white placeholder:text-gray-500 focus-visible:ring-red-500"
                    {...register('confirmPassword')}
                  />
                  {errors.confirmPassword && (
                    <p className="text-xs text-red-400">{errors.confirmPassword.message}</p>
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
                      Creating account…
                    </>
                  ) : (
                    'Create Account'
                  )}
                </Button>
              </form>
            )}

            {!success && (
              <p className="text-center text-sm text-gray-500 mt-6">
                Already have an account?{' '}
                <Link
                  to="/login"
                  className="text-red-400 hover:text-red-300 font-medium transition-colors"
                >
                  Sign in
                </Link>
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
