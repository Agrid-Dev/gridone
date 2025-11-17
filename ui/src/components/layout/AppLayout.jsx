import { useState } from 'react'
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom'
import { Activity, Gauge, LayoutDashboard, Settings, WifiOff, Wifi as WifiIcon, LogOut } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { useAuth } from '@/contexts/AuthContext'
import { useDeviceData } from '@/contexts/DeviceDataContext'
import { useApiConfig } from '@/contexts/ApiConfigContext'

const NAV_ITEMS = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/devices', label: 'Devices', icon: Gauge },
  { to: '/zones', label: 'Zones', icon: Activity },
  { to: '/settings', label: 'Settings', icon: Settings },
]

const statusColors = {
  connected: 'success',
  connecting: 'secondary',
  disconnected: 'destructive',
  error: 'destructive',
}

export function AppLayout() {
  const location = useLocation()
  const { logout, user } = useAuth()
  const { zones, connectionStatus } = useDeviceData()
  const { mode, apiModes } = useApiConfig()
  const [showMobileNav, setShowMobileNav] = useState(false)

  return (
    <div className="flex min-h-screen bg-muted/30">
      <aside className="hidden w-64 flex-col border-r bg-background/90 px-4 py-6 md:flex">
        <Link to="/" className="mb-8 flex items-center gap-2">
          <div className="rounded-md bg-primary/10 p-2 text-primary">
            <Gauge className="h-5 w-5" />
          </div>
          <div>
            <p className="text-lg font-semibold">GridOne</p>
            <p className="text-xs text-muted-foreground">Home Energy</p>
          </div>
        </Link>

        <nav className="space-y-2">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon
            const isActive =
              item.to === '/'
                ? location.pathname === '/'
                : location.pathname.startsWith(item.to)
            return (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive: routeActive }) =>
                  [
                    'flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                    (routeActive || isActive) ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                  ].join(' ')
                }
                end={item.to === '/'}
              >
                <Icon className="h-4 w-4" />
                {item.label}
              </NavLink>
            )
          })}
        </nav>

        <div className="mt-10 space-y-3">
          <div className="flex items-center justify-between text-xs uppercase text-muted-foreground">
            <span>Zones</span>
            <span>{zones.length}</span>
          </div>
          <div className="space-y-2">
            {zones.slice(0, 4).map((zone) => (
              <div key={zone.id} className="rounded-lg border bg-card px-3 py-2 text-sm">
                <div className="flex items-center justify-between">
                  <p className="font-medium capitalize">{zone.name}</p>
                  <Badge variant="outline">{zone.activeDevices}/{zone.deviceCount}</Badge>
                </div>
                <p className="text-xs text-muted-foreground">
                  Avg Temp: {zone.avgTemperature ? `${zone.avgTemperature}°C` : '—'}
                </p>
              </div>
            ))}
            {zones.length === 0 && <p className="text-xs text-muted-foreground">No zones available</p>}
          </div>
        </div>

        <div className="mt-auto space-y-3">
          <div className="flex items-center justify-between rounded-lg border px-3 py-2">
            <div>
              <p className="text-xs uppercase text-muted-foreground">API Mode</p>
              <p className="text-sm font-medium">{apiModes[mode].label}</p>
            </div>
            <Badge variant={statusColors[connectionStatus] || 'secondary'}>
              {connectionStatus === 'connected' ? 'Connected' : connectionStatus}
            </Badge>
          </div>
          <Button variant="outline" onClick={logout} className="w-full">
            <LogOut className="mr-2 h-4 w-4" />
            Logout
          </Button>
        </div>
      </aside>

      <div className="flex flex-1 flex-col">
        <header className="relative flex h-16 items-center justify-between border-b bg-background/80 px-4">
          <div className="flex items-center gap-2 md:hidden">
            <Button variant="outline" size="sm" onClick={() => setShowMobileNav((prev) => !prev)}>
              Menu
            </Button>
            {showMobileNav && (
              <div className="absolute left-4 top-16 z-20 w-48 rounded-lg border bg-background p-2 shadow-lg">
                {NAV_ITEMS.map((item) => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    onClick={() => setShowMobileNav(false)}
                    className={({ isActive }) =>
                      [
                        'flex items-center gap-2 rounded-md px-2 py-1 text-sm',
                        isActive ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-muted',
                      ].join(' ')
                    }
                    end={item.to === '/'}
                  >
                    <item.icon className="h-4 w-4" />
                    {item.label}
                  </NavLink>
                ))}
              </div>
            )}
          </div>
          <div className="flex flex-col md:flex-row md:items-center md:gap-3">
            <p className="text-sm font-medium">Realtime Status</p>
            <Badge variant={statusColors[connectionStatus] || 'secondary'} className="flex items-center gap-1">
              {connectionStatus === 'connected' ? <WifiIcon className="h-3.5 w-3.5" /> : <WifiOff className="h-3.5 w-3.5" />}
              <span className="capitalize">{connectionStatus}</span>
            </Badge>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-right">
              <p className="text-sm font-semibold">{user?.name}</p>
              <p className="text-xs text-muted-foreground">{user?.role}</p>
            </div>
            <Button variant="ghost" size="icon" onClick={logout} className="hidden md:inline-flex">
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </header>

        <main className="flex flex-1 flex-col overflow-y-auto bg-muted/20 px-4 py-6 md:px-8">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
