import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Power, WifiOff, Wifi } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Switch } from '@/components/ui/switch'
import { useDeviceData } from '@/contexts/DeviceDataContext'

const typeLabels = {
  air_conditioner: 'AC Unit',
  thermostat: 'Thermostat',
  air_purifier: 'Air Purifier',
  light: 'Light',
  fan: 'Fan',
  sensor: 'Sensor',
}

export function DevicesPage() {
  const { devices, zones, updateDevice, error, refresh } = useDeviceData()
  const [filter, setFilter] = useState('all')

  const filteredDevices = useMemo(() => {
    if (filter === 'all') return devices
    return devices.filter((device) => device.zone === filter)
  }, [devices, filter])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Devices</h1>
        <p className="text-sm text-muted-foreground">Monitor every connected device and drill into details.</p>
      </div>

      {error && (
        <div className="rounded-lg border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {error}{' '}
          <button type="button" className="underline" onClick={refresh}>
            Retry
          </button>
        </div>
      )}

      <Tabs value={filter} onValueChange={setFilter} className="w-full">
        <TabsList className="w-full overflow-x-auto">
          <TabsTrigger value="all">All</TabsTrigger>
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
                          {typeLabels[device.type] || device.type} • {device.zone.replace('_', ' ')}
                        </CardDescription>
                      </div>
                      <Badge variant={device.online ? 'success' : 'destructive'} className="flex items-center gap-1">
                        {device.online ? <Wifi className="h-3 w-3" /> : <WifiOff className="h-3 w-3" />}
                        {device.online ? 'Online' : 'Offline'}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <DeviceMetrics device={device} />
                    <div className="flex items-center justify-between rounded-lg border bg-muted/40 px-3 py-2" onClick={(event) => event.preventDefault()}>
                      <div>
                        <p className="text-xs uppercase text-muted-foreground">State</p>
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
                    <p className="text-xs text-muted-foreground">ID: {device.id}</p>
                  </CardContent>
                </Card>
              </Link>
            ))}
            {filteredDevices.length === 0 && (
              <Card>
                <CardContent className="py-10 text-center text-sm text-muted-foreground">No devices in this zone.</CardContent>
              </Card>
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}

function DeviceMetrics({ device }) {
  if (device.type === 'light') {
    return (
      <div className="grid grid-cols-2 gap-3 text-sm">
        <Metric label="Brightness" value={`${device.brightness ?? 0}%`} />
        <Metric label="Color" value={device.color || '#FFFFFF'} />
      </div>
    )
  }
  if (device.type === 'thermostat' || device.type === 'air_conditioner') {
    return (
      <div className="grid grid-cols-2 gap-3 text-sm">
        <Metric label="Current" value={`${device.temperature ?? device.currentTemperature ?? '—'}°C`} />
        <Metric label="Target" value={`${device.targetTemperature ?? '—'}°C`} />
        <Metric label="Mode" value={device.mode || 'auto'} />
        <Metric label="Humidity" value={`${device.humidity ?? '—'}%`} />
      </div>
    )
  }

  return (
    <div className="grid grid-cols-2 gap-3 text-sm">
      <Metric label="Mode" value={device.mode || '—'} />
      <Metric label="Updated" value={new Date(device.lastUpdated).toLocaleTimeString()} />
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
