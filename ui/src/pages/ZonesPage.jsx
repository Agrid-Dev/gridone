import { useMemo } from 'react'
import { Fan, Flame, HomeIcon, Lightbulb, Power } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { useDeviceData } from '@/contexts/DeviceDataContext'

const zoneIcons = {
  living_room: HomeIcon,
  bedroom: HomeIcon,
  kitchen: Flame,
  office: Fan,
  garage: Power,
  patio: Lightbulb,
}

export function ZonesPage() {
  const { zones, devices, toggleZoneDevices } = useDeviceData()

  const devicesByZone = useMemo(() => {
    return zones.reduce((acc, zone) => {
      acc[zone.id] = devices.filter((device) => device.zone === zone.id)
      return acc
    }, {})
  }, [zones, devices])

  return (
    <div id="zones" className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Zones</h1>
        <p className="text-sm text-muted-foreground">Manage grouped rooms with bulk controls and quick stats.</p>
      </div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {zones.map((zone) => {
          const Icon = zoneIcons[zone.id] ?? HomeIcon
          const zoneDevices = devicesByZone[zone.id] || []
          const allOn = zoneDevices.every((device) => device.state === 'on')
          return (
            <Card key={zone.id} id={zone.id} className="flex flex-col">
              <CardHeader className="space-y-2">
                <div className="flex items-center gap-3">
                  <div className="rounded-md bg-muted p-2">
                    <Icon className="h-5 w-5" />
                  </div>
                  <div>
                    <CardTitle>{zone.name}</CardTitle>
                    <CardDescription>{zone.deviceCount} devices</CardDescription>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                  <Badge variant="outline">{zone.activeDevices} active</Badge>
                  {zone.avgTemperature && <Badge variant="secondary">Avg {zone.avgTemperature}°C</Badge>}
                  <Badge variant="outline">{(zone.energyConsumption ?? 0).toFixed(1)} kW</Badge>
                </div>
              </CardHeader>
              <CardContent className="flex flex-1 flex-col justify-between space-y-4">
                <div className="grid gap-2 text-sm">
                  {zoneDevices.slice(0, 3).map((device) => (
                    <div key={device.id} className="flex items-center justify-between rounded-lg border bg-muted/40 px-3 py-2">
                      <div>
                        <p className="text-sm font-medium">{device.name}</p>
                        <p className="text-xs text-muted-foreground capitalize">{device.type.replace('_', ' ')}</p>
                      </div>
                      <Badge variant={device.state === 'on' ? 'success' : 'outline'}>{device.state}</Badge>
                    </div>
                  ))}
                  {zoneDevices.length > 3 && (
                    <p className="text-xs text-muted-foreground">+{zoneDevices.length - 3} more devices</p>
                  )}
                  {zoneDevices.length === 0 && (
                    <p className="text-xs text-muted-foreground">No devices in this zone</p>
                  )}
                </div>
                <div className="flex gap-2">
                  <Button className="flex-1" variant="secondary" onClick={() => toggleZoneDevices(zone.id, true)} disabled={allOn}>
                    Turn all on
                  </Button>
                  <Button className="flex-1" variant="outline" onClick={() => toggleZoneDevices(zone.id, false)}>
                    Turn all off
                  </Button>
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>
    </div>
  )
}
