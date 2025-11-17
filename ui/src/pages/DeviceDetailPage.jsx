import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Loader2, Settings2, Zap } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Slider } from '@/components/ui/slider'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { useDeviceData } from '@/contexts/DeviceDataContext'

const modeOptions = ['cool', 'heat', 'fan', 'auto']
const fanSpeeds = ['low', 'medium', 'high', 'auto']

export function DeviceDetailPage() {
  const { deviceId } = useParams()
  const navigate = useNavigate()
  const { devices, activity, updateDevice, loading } = useDeviceData()
  const [device, setDevice] = useState(() => devices.find((entry) => entry.id === deviceId))
  const [statusMessage, setStatusMessage] = useState(null)
  const [isSaving, setIsSaving] = useState(false)

  useEffect(() => {
    const currentDevice = devices.find((entry) => entry.id === deviceId)
    if (currentDevice) {
      setDevice(currentDevice)
    }
  }, [devices, deviceId])

  const relatedActivity = useMemo(
    () => activity.filter((event) => event.deviceId === deviceId).slice(0, 8),
    [activity, deviceId],
  )

  if (!device && loading) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-sm text-muted-foreground">Loading device…</CardContent>
      </Card>
    )
  }

  if (!device && !loading) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <p className="mb-4 text-sm text-muted-foreground">Device not found.</p>
          <Button onClick={() => navigate('/devices')}>Back to devices</Button>
        </CardContent>
      </Card>
    )
  }

  const handleUpdate = async (updates) => {
    setIsSaving(true)
    try {
      await updateDevice(device.id, updates)
      setStatusMessage({ type: 'success', text: 'Device updated successfully.' })
    } catch (error) {
      setStatusMessage({ type: 'error', text: error.message || 'Unable to update device.' })
    } finally {
      setIsSaving(false)
      setTimeout(() => setStatusMessage(null), 4000)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <Button variant="ghost" size="sm" asChild className="px-0 text-muted-foreground">
            <Link to="/devices" className="flex items-center gap-1 text-sm">
              <ArrowLeft className="h-4 w-4" />
              Back to devices
            </Link>
          </Button>
          <h1 className="text-2xl font-semibold">{device.name}</h1>
          <p className="text-sm text-muted-foreground capitalize">
            {device.type.replace('_', ' ')} • {device.zone.replace('_', ' ')}
          </p>
        </div>
        <Badge variant={device.online ? 'success' : 'destructive'}>
          {device.online ? 'Online' : 'Offline'}
        </Badge>
      </div>

      {statusMessage && (
        <div
          className={`rounded-lg border px-4 py-3 text-sm ${
            statusMessage.type === 'success' ? 'border-emerald-300 bg-emerald-50 text-emerald-900' : 'border-destructive/40 bg-destructive/5 text-destructive'
          }`}
        >
          {statusMessage.text}
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Controls</CardTitle>
            <CardDescription>Modify available settings in real-time.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between rounded-xl border bg-muted/40 px-4 py-3">
              <div>
                <p className="text-sm font-medium">Power</p>
                <p className="text-xs text-muted-foreground">Switch the device on or off</p>
              </div>
              <Switch
                checked={device.state === 'on'}
                onCheckedChange={(checked) => handleUpdate({ state: checked ? 'on' : 'off' })}
                disabled={!device.online || isSaving}
              />
            </div>

            {(device.type === 'air_conditioner' || device.type === 'thermostat') && (
              <div className="space-y-4 rounded-xl border bg-background/80 p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium">Target temperature</p>
                    <p className="text-xs text-muted-foreground">16°C - 30°C</p>
                  </div>
                  <Badge variant="outline">{device.targetTemperature ?? '—'}°C</Badge>
                </div>
                <Slider
                  min={16}
                  max={30}
                  step={0.5}
                  value={[device.targetTemperature ?? 22]}
                  onValueChange={([value]) => handleUpdate({ targetTemperature: value })}
                  disabled={isSaving}
                />
                <div className="grid gap-3 md:grid-cols-2">
                  <div className="space-y-2">
                    <p className="text-xs uppercase text-muted-foreground">Mode</p>
                    <Select value={device.mode || 'auto'} onValueChange={(value) => handleUpdate({ mode: value })} disabled={isSaving}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select mode" />
                      </SelectTrigger>
                      <SelectContent>
                        {modeOptions.map((option) => (
                          <SelectItem key={option} value={option}>
                            {option}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <p className="text-xs uppercase text-muted-foreground">Fan speed</p>
                    <Select value={device.fanSpeed || 'auto'} onValueChange={(value) => handleUpdate({ fanSpeed: value })} disabled={isSaving}>
                      <SelectTrigger>
                        <SelectValue placeholder="Auto" />
                      </SelectTrigger>
                      <SelectContent>
                        {fanSpeeds.map((speed) => (
                          <SelectItem key={speed} value={speed}>
                            {speed}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>
            )}

            {device.type === 'light' && (
              <div className="space-y-4 rounded-xl border bg-background/80 p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium">Brightness</p>
                    <p className="text-xs text-muted-foreground">Dim or brighten light</p>
                  </div>
                  <Badge variant="outline">{device.brightness ?? 0}%</Badge>
                </div>
                <Slider
                  min={0}
                  max={100}
                  step={1}
                  value={[device.brightness ?? 0]}
                  onValueChange={([value]) => handleUpdate({ brightness: value, state: value > 0 ? 'on' : 'off' })}
                  disabled={isSaving}
                />
                <div className="space-y-2">
                  <p className="text-xs uppercase text-muted-foreground">Color</p>
                  <Input
                    type="color"
                    value={device.color || '#ffffff'}
                    className="h-10 w-24 cursor-pointer rounded-md border"
                    onChange={(event) => handleUpdate({ color: event.target.value })}
                    disabled={isSaving}
                  />
                </div>
              </div>
            )}

            {device.type === 'air_purifier' && (
              <div className="space-y-2 rounded-xl border bg-background/80 p-4">
                <p className="text-sm font-medium">Purifier speed</p>
                <Select value={device.fanSpeed || 'auto'} onValueChange={(value) => handleUpdate({ fanSpeed: value })} disabled={isSaving}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select speed" />
                  </SelectTrigger>
                  <SelectContent>
                    {fanSpeeds.map((speed) => (
                      <SelectItem key={speed} value={speed}>
                        {speed}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Device summary</CardTitle>
            <CardDescription>Live metrics pulled from the device.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="rounded-lg border bg-muted/30 px-3 py-2">
              <p className="text-xs uppercase text-muted-foreground">State</p>
              <p className="text-sm font-medium capitalize">{device.state}</p>
            </div>
            {typeof device.temperature === 'number' && (
              <SummaryItem label="Current Temp" value={`${device.temperature}°C`} icon={ThermalIcon} />
            )}
            {typeof device.currentTemperature === 'number' && (
              <SummaryItem label="Current Temp" value={`${device.currentTemperature}°C`} icon={ThermalIcon} />
            )}
            {typeof device.humidity === 'number' && <SummaryItem label="Humidity" value={`${device.humidity}%`} icon={DropletIcon} />}
            {typeof device.powerConsumption === 'number' && (
              <SummaryItem label="Power" value={`${device.powerConsumption.toFixed(1)} kW`} icon={Zap} />
            )}
            <SummaryItem label="Last updated" value={new Date(device.lastUpdated).toLocaleTimeString()} icon={Settings2} />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Activity log</CardTitle>
          <CardDescription>Chronological updates for this device.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {relatedActivity.length === 0 && <p className="text-sm text-muted-foreground">No updates yet.</p>}
          {relatedActivity.map((event) => (
            <div key={event.id} className="flex items-center justify-between border-b pb-3 last:border-0 last:pb-0">
              <div>
                <p className="text-sm font-medium">{event.description}</p>
                <p className="text-xs text-muted-foreground">{JSON.stringify(event.changes)}</p>
              </div>
              <p className="text-xs text-muted-foreground">{new Date(event.timestamp).toLocaleTimeString()}</p>
            </div>
          ))}
        </CardContent>
      </Card>
      {isSaving && (
        <div className="fixed bottom-4 right-4 flex items-center gap-2 rounded-full bg-background/90 px-4 py-2 text-sm shadow-lg">
          <Loader2 className="h-4 w-4 animate-spin" /> Applying changes…
        </div>
      )}
    </div>
  )
}

function SummaryItem({ label, value, icon: Icon = Settings2 }) {
  return (
    <div className="flex items-center justify-between rounded-lg border bg-background/70 px-3 py-2 text-sm">
      <div className="flex items-center gap-2 text-muted-foreground">
        <Icon className="h-4 w-4" />
        <span>{label}</span>
      </div>
      <p className="font-medium">{value}</p>
    </div>
  )
}

function ThermalIcon(props) {
  return <svg viewBox="0 0 24 24" className="h-4 w-4" {...props}><path fill="currentColor" d="M12 2a2 2 0 0 1 2 2v9.28a4 4 0 1 1-4 0V4a2 2 0 0 1 2-2zm0 14a2 2 0 0 0 1.995 2h.01A2 2 0 0 0 14 16a2 2 0 0 0-2-2 2 2 0 0 0-2 2zm0-8a1 1 0 1 0 0 2 1 1 0 0 0 0-2z"/></svg>
}

function DropletIcon(props) {
  return <svg viewBox="0 0 24 24" className="h-4 w-4" {...props}><path fill="currentColor" d="M12 2c4 5 6 8 6 11a6 6 0 1 1-12 0c0-3 2-6 6-11z"/></svg>
}
