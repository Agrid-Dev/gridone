import { Link } from 'react-router-dom'
import { AlertTriangle, Gauge, PlugZap, Radio, ShieldCheck, ThermometerSun } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Button } from '@/components/ui/button'
import { useDeviceData } from '@/contexts/DeviceDataContext'
import { useTranslation } from '@/contexts/LanguageContext'

const typeIcons = {
  air_conditioner: ThermometerSun,
  thermostat: ThermometerSun,
  light: PlugZap,
  fan: Gauge,
  sensor: Radio,
  air_purifier: ShieldCheck,
}

export function DashboardPage() {
  const { stats, zones, activity, loading, error, refresh } = useDeviceData()
  const { t } = useTranslation()

  const typeEntries = Object.entries(stats.byType || {})
  const highlightedZones = zones.slice(0, 4)
  const recentActivity = activity.slice(0, 6)

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {t('dashboard.header.title', { defaultValue: 'Overview' })}
          </h1>
          <p className="text-sm text-muted-foreground">
            {t('dashboard.header.subtitle', {
              defaultValue: 'Real-time visibility into climate, comfort, and energy trends.',
            })}
          </p>
        </div>
        <Button asChild>
          <Link to="/devices">
            {t('dashboard.actions.viewDevices', { defaultValue: 'View all devices' })}
          </Link>
        </Button>
      </div>

      {error && (
        <div className="flex items-center justify-between rounded-lg border border-destructive/50 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          <span>{error}</span>
          <Button variant="ghost" size="sm" onClick={refresh}>
            {t('common.retry', { defaultValue: 'Retry' })}
          </Button>
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              {t('dashboard.cards.totalDevices.title', { defaultValue: 'Total Devices' })}
            </CardTitle>
            <PlugZap className="h-5 w-5 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{loading ? '—' : stats.total}</div>
            <p className="text-xs text-muted-foreground">
              {t('dashboard.cards.totalDevices.helper', {
                defaultValue: 'Across {count} zones',
                values: { count: zones.length },
              })}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              {t('common.online', { defaultValue: 'Online' })}
            </CardTitle>
            <ShieldCheck className="h-5 w-5 text-emerald-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{loading ? '—' : stats.online}</div>
            <Progress value={stats.total ? (stats.online / stats.total) * 100 : 0} className="mt-2" />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              {t('common.offline', { defaultValue: 'Offline' })}
            </CardTitle>
            <AlertTriangle className="h-5 w-5 text-amber-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{loading ? '—' : stats.offline}</div>
            <p className="text-xs text-muted-foreground">
              {t('dashboard.cards.offline.helper', { defaultValue: 'Requires investigation' })}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              {t('dashboard.cards.alerts.title', { defaultValue: 'Alerts' })}
            </CardTitle>
            <Radio className="h-5 w-5 text-red-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{loading ? '—' : stats.alerts}</div>
            <p className="text-xs text-muted-foreground">
              {t('dashboard.cards.alerts.helper', {
                defaultValue: 'Temperature offsets and offline devices',
              })}
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>
              {t('dashboard.deviceTypes.title', { defaultValue: 'Devices by type' })}
            </CardTitle>
            <CardDescription>
              {t('dashboard.deviceTypes.subtitle', { defaultValue: 'Live breakdown of connected equipment' })}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {typeEntries.length === 0 && (
              <p className="text-sm text-muted-foreground">
                {t('dashboard.deviceTypes.empty', { defaultValue: 'No devices available.' })}
              </p>
            )}
            {typeEntries.map(([type, count]) => {
              const Icon = typeIcons[type] ?? PlugZap
              const percent = stats.total ? Math.round((count / stats.total) * 100) : 0
              return (
                <div key={type} className="flex items-center gap-4">
                  <div className="flex h-10 w-10 items-center justify-center rounded-md bg-muted">
                    <Icon className="h-5 w-5 text-muted-foreground" />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-medium capitalize">{type.replace('_', ' ')}</p>
                    <Progress value={percent} className="mt-2" />
                  </div>
                  <p className="text-sm text-muted-foreground">{count}</p>
                </div>
              )
            })}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>
              {t('dashboard.health.title', { defaultValue: 'System health' })}
            </CardTitle>
            <CardDescription>
              {t('dashboard.health.subtitle', { defaultValue: 'Realtime state across all devices' })}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                {t('dashboard.health.stability', { defaultValue: 'Stability' })}
              </p>
              <Badge variant={stats.alerts > 0 ? 'destructive' : 'success'}>
                {stats.alerts > 0
                  ? t('dashboard.health.attention', { defaultValue: 'Attention' })
                  : t('dashboard.health.optimal', { defaultValue: 'Optimal' })}
              </Badge>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">
                {t('dashboard.health.onlineCoverage', { defaultValue: 'Online coverage' })}
              </p>
              <div className="mt-2 flex items-baseline gap-2">
                <p className="text-3xl font-semibold">
                  {stats.total ? Math.round((stats.online / stats.total) * 100) : 0}%
                </p>
                <p className="text-xs text-muted-foreground">
                  {t('dashboard.health.coverageDescription', { defaultValue: 'of devices responding' })}
                </p>
              </div>
            </div>
            <div className="rounded-lg border bg-muted/30 p-3 text-sm text-muted-foreground">
              {stats.alerts > 0
                ? t('dashboard.health.alertMessage', {
                    defaultValue: '{count} device(s) outside expected range.',
                    values: { count: stats.alerts },
                  })
                : t('dashboard.health.nominal', { defaultValue: 'All systems nominal.' })}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>
              {t('dashboard.zones.title', { defaultValue: 'Quick stats by zone' })}
            </CardTitle>
            <CardDescription>
              {t('dashboard.zones.subtitle', {
                defaultValue: 'Temperature, energy, and active devices per zone',
              })}
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2">
            {highlightedZones.map((zone) => (
              <Link key={zone.id} to={`/zones#${zone.id}`} className="rounded-xl border bg-background/70 p-4 transition hover:shadow">
                <div className="flex items-center justify-between">
                  <p className="text-base font-semibold">{zone.name}</p>
                  <Badge variant="outline">
                    {t('dashboard.zones.activeBadge', {
                      defaultValue: '{active}/{total} active',
                      values: { active: zone.activeDevices, total: zone.deviceCount },
                    })}
                  </Badge>
                </div>
                <p className="mt-2 text-sm text-muted-foreground">
                  {t('dashboard.zones.avgTemperature', {
                    defaultValue: 'Avg Temp: {value}',
                    values: { value: zone.avgTemperature ? `${zone.avgTemperature}°C` : '—' },
                  })}
                </p>
                <p className="text-sm text-muted-foreground">
                  {t('dashboard.zones.energy', {
                    defaultValue: 'Energy: {value} kW',
                    values: { value: (zone.energyConsumption ?? 0).toFixed(1) },
                  })}
                </p>
              </Link>
            ))}
            {highlightedZones.length === 0 && (
              <p className="text-sm text-muted-foreground">
                {t('dashboard.zones.empty', { defaultValue: 'No zones available.' })}
              </p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>
              {t('dashboard.activity.title', { defaultValue: 'Recent activity' })}
            </CardTitle>
            <CardDescription>
              {t('dashboard.activity.subtitle', { defaultValue: 'Last device state changes' })}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {recentActivity.length === 0 && (
              <p className="text-sm text-muted-foreground">
                {t('dashboard.activity.empty', { defaultValue: 'No events yet.' })}
              </p>
            )}
            {recentActivity.map((event) => (
              <div key={event.id} className="border-b pb-3 last:border-0 last:pb-0">
                <p className="text-sm font-medium">{event.deviceName}</p>
                <p className="text-xs text-muted-foreground">{event.description}</p>
                <p className="mt-1 text-xs text-muted-foreground">{new Date(event.timestamp).toLocaleTimeString()}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
