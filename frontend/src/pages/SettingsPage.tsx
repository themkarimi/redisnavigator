import { useState } from 'react'
import { useAuthStore } from '@/store/authStore'
import { useThemeStore } from '@/store/themeStore'
import { useSettingsStore } from '@/store/settingsStore'
import { api } from '@/services/api'
import { isAxiosError } from 'axios'
import { Loader2 } from 'lucide-react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription } from '@/components/ui/alert'

export default function SettingsPage() {
  const user = useAuthStore((s) => s.user)
  const theme = useThemeStore((s) => s.theme)
  const toggleTheme = useThemeStore((s) => s.toggleTheme)
  const scanCount = useSettingsStore((s) => s.scanCount)
  const setScanCount = useSettingsStore((s) => s.setScanCount)

  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [passwordLoading, setPasswordLoading] = useState(false)
  const [passwordError, setPasswordError] = useState<string | null>(null)
  const [passwordSuccess, setPasswordSuccess] = useState<string | null>(null)

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Manage your preferences and account details.
        </p>
      </div>

      <Tabs defaultValue="appearance">
        <TabsList className="mb-6">
          <TabsTrigger value="appearance">Appearance</TabsTrigger>
          <TabsTrigger value="redis">Redis</TabsTrigger>
          <TabsTrigger value="profile">Profile</TabsTrigger>
          <TabsTrigger value="about">About</TabsTrigger>
        </TabsList>

        {/* Appearance tab */}
        <TabsContent value="appearance">
          <Card>
            <CardHeader>
              <CardTitle>Appearance</CardTitle>
              <CardDescription>
                Customize how RedisGUI looks on your device.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="dark-mode" className="text-base font-medium">
                    Dark Mode
                  </Label>
                  <p className="text-sm text-muted-foreground">
                    Use a dark color scheme across the application.
                  </p>
                </div>
                <Switch
                  id="dark-mode"
                  checked={theme === 'dark'}
                  onCheckedChange={toggleTheme}
                  aria-label="Toggle dark mode"
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Redis tab */}
        <TabsContent value="redis">
          <Card>
            <CardHeader>
              <CardTitle>Redis</CardTitle>
              <CardDescription>
                Configure Redis key scanning behavior to avoid overwhelming your Redis instance.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="scan-count">Keys Per Scan</Label>
                <p className="text-sm text-muted-foreground">
                  Number of keys Redis is hinted to return per SCAN iteration. Lower values reduce load on the Redis instance. Use "Scan More" in the Key Browser to load additional keys.
                </p>
                <Input
                  id="scan-count"
                  type="number"
                  min={1}
                  max={10000}
                  value={scanCount}
                  onChange={(e) => {
                    const v = parseInt(e.target.value, 10)
                    if (!isNaN(v) && v > 0 && v <= 10000) setScanCount(v)
                  }}
                  className="w-32"
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Profile tab */}
        <TabsContent value="profile">
          <Card>
            <CardHeader>
              <CardTitle>Profile</CardTitle>
              <CardDescription>Your account information.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="profile-name">Full Name</Label>
                <Input
                  id="profile-name"
                  value={user?.name ?? ''}
                  readOnly
                  disabled
                  className="bg-muted cursor-not-allowed"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="profile-email">Email</Label>
                <Input
                  id="profile-email"
                  type="email"
                  value={user?.email ?? ''}
                  readOnly
                  disabled
                  className="bg-muted cursor-not-allowed"
                />
              </div>
            </CardContent>
          </Card>

          {user?.hasPassword && (
            <Card className="mt-4">
              <CardHeader>
                <CardTitle>Change Password</CardTitle>
                <CardDescription>Update your account password.</CardDescription>
              </CardHeader>
              <CardContent>
                <form
                  className="space-y-4"
                  onSubmit={async (e) => {
                    e.preventDefault()
                    setPasswordError(null)
                    setPasswordSuccess(null)

                    if (newPassword !== confirmPassword) {
                      setPasswordError('New passwords do not match.')
                      return
                    }
                    if (newPassword.length < 8) {
                      setPasswordError('New password must be at least 8 characters.')
                      return
                    }

                    setPasswordLoading(true)
                    try {
                      await api.post('/auth/change-password', {
                        currentPassword,
                        newPassword,
                      })
                      setPasswordSuccess('Password changed successfully.')
                      setCurrentPassword('')
                      setNewPassword('')
                      setConfirmPassword('')
                    } catch (err) {
                      if (isAxiosError(err)) {
                        const msg = err.response?.data?.error ?? 'Failed to change password.'
                        setPasswordError(String(msg))
                      } else {
                        setPasswordError('An unexpected error occurred.')
                      }
                    } finally {
                      setPasswordLoading(false)
                    }
                  }}
                >
                  {passwordError && (
                    <Alert variant="destructive">
                      <AlertDescription>{passwordError}</AlertDescription>
                    </Alert>
                  )}
                  {passwordSuccess && (
                    <Alert>
                      <AlertDescription>{passwordSuccess}</AlertDescription>
                    </Alert>
                  )}
                  <div className="space-y-1.5">
                    <Label htmlFor="current-password">Current Password</Label>
                    <Input
                      id="current-password"
                      type="password"
                      value={currentPassword}
                      onChange={(e) => setCurrentPassword(e.target.value)}
                      required
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="new-password">New Password</Label>
                    <Input
                      id="new-password"
                      type="password"
                      placeholder="Minimum 8 characters"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      required
                      minLength={8}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="confirm-password">Confirm New Password</Label>
                    <Input
                      id="confirm-password"
                      type="password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      required
                      minLength={8}
                    />
                  </div>
                  <Button
                    type="submit"
                    disabled={passwordLoading}
                    className="bg-red-600 hover:bg-red-700 text-white"
                  >
                    {passwordLoading ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Changing…
                      </>
                    ) : (
                      'Change Password'
                    )}
                  </Button>
                </form>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* About tab */}
        <TabsContent value="about">
          <Card>
            <CardHeader>
              <CardTitle>About RedisGUI</CardTitle>
              <CardDescription>Application information and resources.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-3">
                <div className="flex items-center justify-center w-10 h-10 rounded-full bg-red-600 text-white font-bold text-base">
                  R
                </div>
                <div>
                  <p className="font-semibold text-base">RedisGUI</p>
                  <p className="text-sm text-muted-foreground">Version 1.0.0</p>
                </div>
              </div>

              <div className="space-y-2 pt-2 border-t">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Version</span>
                  <span className="font-mono">1.0.0</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">License</span>
                  <span>MIT</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">GitHub</span>
                  <a
                    href="https://github.com/themkarimi/redis-gui"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-red-500 hover:text-red-400 transition-colors"
                  >
                    github.com/themkarimi/redis-gui
                  </a>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Built with</span>
                  <span>React, Node.js, Redis</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
