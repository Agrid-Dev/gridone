import { useMemo, useState } from 'react'
import { Fan, Flame, HomeIcon, Lightbulb, Power } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { useDeviceData } from '@/contexts/DeviceDataContext'
import { useTranslation } from '@/contexts/LanguageContext'
import { Zone3DEditor } from '@/components/zones/Zone3DEditor'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

const zoneIcons = {
  lobby: HomeIcon,
  guest_floor_12: HomeIcon,
  grand_ballroom: Lightbulb,
  main_kitchen: Flame,
  spa: Fan,
  service_elevator: Power,
  sky_lounge: Lightbulb,
}

export function ZonesPage() {
  const { zones, devices, toggleZoneDevices } = useDeviceData()
  const { t } = useTranslation()
  const [activeTab, setActiveTab] = useState('overview')

  const devicesByZone = useMemo(() => {
    return zones.reduce((acc, zone) => {
      acc[zone.id] = devices.filter((device) => device.zone === zone.id)
      return acc
    }, {})
  }, [zones, devices])
  const formatDeviceState = (state) => t(`devices.states.${state}`, { defaultValue: state })

  return (
    <div id="zones" className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          {t('zones.title', { defaultValue: 'Zones' })}
        </h1>
        <p className="text-sm text-muted-foreground">
          {t('zones.subtitle', { defaultValue: 'Manage grouped rooms with bulk controls and quick stats.' })}
        </p>
      </div>
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="w-full justify-start">
          <TabsTrigger value="overview">{t('zones.tabs.overview', { defaultValue: 'Synthèse' })}</TabsTrigger>
          <TabsTrigger value="plan">{t('zones.tabs.plan', { defaultValue: 'Plan 3D' })}</TabsTrigger>
        </TabsList>
        <TabsContent value="overview" className="space-y-4">
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
                        <CardDescription>
                          {t('zones.card.deviceCount', {
                            defaultValue: '{count} devices',
                            values: { count: zone.deviceCount },
                          })}
                        </CardDescription>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                      <Badge variant="outline">
                        {t('zones.card.activeDevices', {
                          defaultValue: '{count} active',
                          values: { count: zone.activeDevices },
                        })}
                      </Badge>
                      {zone.avgTemperature && (
                        <Badge variant="secondary">
                          {t('zones.card.avgBadge', {
                            defaultValue: 'Avg {value}°C',
                            values: { value: zone.avgTemperature },
                          })}
                        </Badge>
                      )}
                      <Badge variant="outline">
                        {t('zones.card.energyBadge', {
                          defaultValue: '{value} kW',
                          values: { value: (zone.energyConsumption ?? 0).toFixed(1) },
                        })}
                      </Badge>
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
                          <Badge variant={device.state === 'on' ? 'success' : 'outline'}>
                            {formatDeviceState(device.state)}
                          </Badge>
                        </div>
                      ))}
                      {zoneDevices.length > 3 && (
                        <p className="text-xs text-muted-foreground">
                          {t('zones.card.moreDevices', {
                            defaultValue: '+{count} more devices',
                            values: { count: zoneDevices.length - 3 },
                          })}
                        </p>
                      )}
                      {zoneDevices.length === 0 && (
                        <p className="text-xs text-muted-foreground">
                          {t('zones.card.noDevices', { defaultValue: 'No devices in this zone' })}
                        </p>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <Button className="flex-1" variant="secondary" onClick={() => toggleZoneDevices(zone.id, true)} disabled={allOn}>
                        {t('zones.actions.turnAllOn', { defaultValue: 'Turn all on' })}
                      </Button>
                      <Button className="flex-1" variant="outline" onClick={() => toggleZoneDevices(zone.id, false)}>
                        {t('zones.actions.turnAllOff', { defaultValue: 'Turn all off' })}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )
            })}
          </div>
        </TabsContent>
        <TabsContent value="plan" className="space-y-4">
          <Zone3DEditor />
        </TabsContent>
      </Tabs>
    </div>
  )
}
