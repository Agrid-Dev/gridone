import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Power, WifiOff, Wifi } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Switch } from '@/components/ui/switch'
import { useDeviceData } from '@/contexts/DeviceDataContext'
import { useTranslation } from '@/contexts/LanguageContext'

const typeLabels = {
  air_conditioner: { key: 'devices.typeLabels.air_conditioner', fallback: 'AC Unit' },
  thermostat: { key: 'devices.typeLabels.thermostat', fallback: 'Thermostat' },
  air_purifier: { key: 'devices.typeLabels.air_purifier', fallback: 'Air Purifier' },
  light: { key: 'devices.typeLabels.light', fallback: 'Light' },
  fan: { key: 'devices.typeLabels.fan', fallback: 'Fan' },
  sensor: { key: 'devices.typeLabels.sensor', fallback: 'Sensor' },
}

export function DevicesPage() {
  const { devices, zones, updateDevice, error, refresh } = useDeviceData()
  const { t } = useTranslation()
  const [filter, setFilter] = useState('all')

  const filteredDevices = useMemo(() => {
    if (filter === 'all') return devices
    return devices.filter((device) => device.zone === filter)
  }, [devices, filter])

  const getTypeLabel = (type) => {
    const entry = typeLabels[type]
    if (entry) {
      return t(entry.key, { defaultValue: entry.fallback })
    }
    return type.replace('_', ' ')
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          {t('devices.title', { defaultValue: 'Devices' })}
        </h1>
        <p className="text-sm text-muted-foreground">
          {t('devices.subtitle', { defaultValue: 'Monitor every connected device and drill into details.' })}
        </p>
      </div>

      {error && (
        <div className="rounded-lg border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {error}{' '}
          <button type="button" className="underline" onClick={refresh}>
            {t('common.retry', { defaultValue: 'Retry' })}
          </button>
        </div>
      )}

      <Tabs value={filter} onValueChange={setFilter} className="w-full">
        <TabsList className="w-full overflow-x-auto">
          <TabsTrigger value="all">
            {t('devices.tabs.all', { defaultValue: 'All' })}
          </TabsTrigger>
          {zones.map((zone) => (
            <TabsTrigger key={zone.id} value={zone.id} className="capitalize">
              {zone.name}
            </TabsTrigger>
          ))}
        </TabsList>
        <TabsContent value={filter}>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {filteredDevices.map((device) => (
              <Link key={device.id} to={`/devices/${device.id}`} className="block transition hover:-translate-y-0.5 hover:shadow-lg">
                <Card className="relative h-full">
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between">
                      <div>
                        <CardTitle className="text-lg">{device.name}</CardTitle>
                        <CardDescription className="capitalize">
                          {getTypeLabel(device.type)} • {device.zone.replace('_', ' ')}
                        </CardDescription>
                      </div>
                      <Badge variant={device.online ? 'success' : 'destructive'} className="flex items-center gap-1">
                        {device.online ? <Wifi className="h-3 w-3" /> : <WifiOff className="h-3 w-3" />}
                        {device.online
                          ? t('common.online', { defaultValue: 'Online' })
                          : t('common.offline', { defaultValue: 'Offline' })}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <DeviceMetrics device={device} t={t} />
                    <div className="flex items-center justify-between rounded-lg border bg-muted/40 px-3 py-2" onClick={(event) => event.preventDefault()}>
                      <div>
                        <p className="text-xs uppercase text-muted-foreground">
                          {t('common.state', { defaultValue: 'State' })}
                        </p>
                        <p className="text-sm font-medium capitalize">{device.state}</p>
                      </div>
                      <Switch
                        disabled={!device.online}
                        checked={device.state === 'on'}
                        onCheckedChange={async (checked) => {
                          await updateDevice(device.id, { state: checked ? 'on' : 'off' })
                        }}
                      />
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {t('common.idLabel', { defaultValue: 'ID' })}: {device.id}
                    </p>
                  </CardContent>
                </Card>
              </Link>
            ))}
            {filteredDevices.length === 0 && (
              <Card>
                <CardContent className="py-10 text-center text-sm text-muted-foreground">
                  {t('devices.empty', { defaultValue: 'No devices in this zone.' })}
                </CardContent>
              </Card>
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}

function DeviceMetrics({ device, t }) {
  if (device.type === 'light') {
    return (
      <div className="grid grid-cols-2 gap-3 text-sm">
        <Metric label={t('devices.metrics.brightness', { defaultValue: 'Brightness' })} value={`${device.brightness ?? 0}%`} />
        <Metric label={t('devices.metrics.color', { defaultValue: 'Color' })} value={device.color || '#FFFFFF'} />
      </div>
    )
  }
  if (device.type === 'thermostat' || device.type === 'air_conditioner') {
    return (
      <div className="grid grid-cols-2 gap-3 text-sm">
        <Metric
          label={t('devices.metrics.current', { defaultValue: 'Current' })}
          value={`${device.temperature ?? device.currentTemperature ?? '—'}°C`}
        />
        <Metric label={t('devices.metrics.target', { defaultValue: 'Target' })} value={`${device.targetTemperature ?? '—'}°C`} />
        <Metric label={t('devices.metrics.mode', { defaultValue: 'Mode' })} value={device.mode || 'auto'} />
        <Metric label={t('devices.metrics.humidity', { defaultValue: 'Humidity' })} value={`${device.humidity ?? '—'}%`} />
      </div>
    )
  }

  return (
    <div className="grid grid-cols-2 gap-3 text-sm">
      <Metric label={t('devices.metrics.mode', { defaultValue: 'Mode' })} value={device.mode || '—'} />
      <Metric
        label={t('devices.metrics.updated', { defaultValue: 'Updated' })}
        value={new Date(device.lastUpdated).toLocaleTimeString()}
      />
    </div>
  )
}

function Metric({ label, value }) {
  return (
    <div className="rounded-lg border bg-background/80 px-3 py-2">
      <p className="text-xs uppercase text-muted-foreground">{label}</p>
      <p className="text-sm font-medium">{value}</p>
    </div>
  )
}
