import { useAuthStore } from '@/store/authStore'
import { useThemeStore } from '@/store/themeStore'
import { useSettingsStore } from '@/store/settingsStore'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Input } from '@/components/ui/input'

export default function SettingsPage() {
  const user = useAuthStore((s) => s.user)
  const theme = useThemeStore((s) => s.theme)
  const toggleTheme = useThemeStore((s) => s.toggleTheme)
  const scanCount = useSettingsStore((s) => s.scanCount)
  const setScanCount = useSettingsStore((s) => s.setScanCount)

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
              <p className="text-xs text-muted-foreground pt-1">
                Profile editing is not available in this version.
              </p>
            </CardContent>
          </Card>
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
                    href="https://github.com/your-org/redis-gui"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-red-500 hover:text-red-400 transition-colors"
                  >
                    github.com/your-org/redis-gui
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
