import { useMemo, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { cn } from '@/lib/utils'

function formatTimestamp(value) {
  if (!value) return '—'
  try {
    return new Date(value).toLocaleString()
  } catch {
    return value
  }
}

function DeviceLine({ device }) {
  const settings = device.settings
    ? Object.entries(device.settings)
        .map(([key, value]) => `${key}: ${value}`)
        .join(', ')
    : null
  return (
    <li className="flex items-center justify-between rounded-md border border-border/50 bg-background/30 px-2 py-1">
      <div>
        <p className="text-sm font-medium">{device.label}</p>
        <p className="text-xs text-muted-foreground">
          {settings ? settings : 'State change'}
        </p>
      </div>
      {device.state && (
        <Badge variant={device.state === 'off' ? 'secondary' : 'default'} className="capitalize">
          {device.state}
        </Badge>
      )}
    </li>
  )
}

function SceneCard({ scene, schedules, onActivate, onUpdate }) {
  const [selectedSchedule, setSelectedSchedule] = useState('')
  const availableSchedules = useMemo(
    () =>
      schedules.filter(
        (schedule) =>
          !scene.linkedSchedules?.includes(schedule.id) &&
          schedule.targetType === 'scene',
      ),
    [schedules, scene.linkedSchedules],
  )

  const scheduleLabels = useMemo(() => {
    const lookup = Object.fromEntries(schedules.map((schedule) => [schedule.id, schedule.name]))
    return (scene.linkedSchedules || []).map((scheduleId) => ({
      id: scheduleId,
      label: lookup[scheduleId] || scheduleId,
    }))
  }, [scene.linkedSchedules, schedules])

  const handleLinkSchedule = () => {
    if (!selectedSchedule) return
    const nextLinks = [...new Set([...(scene.linkedSchedules || []), selectedSchedule])]
    onUpdate?.(scene.id, { linkedSchedules: nextLinks })
    setSelectedSchedule('')
  }

  const handleRemoveLink = (scheduleId) => {
    const nextLinks = (scene.linkedSchedules || []).filter((id) => id !== scheduleId)
    onUpdate?.(scene.id, { linkedSchedules: nextLinks })
  }

  return (
    <Card className="flex flex-col border shadow-sm">
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle className="flex items-center gap-2 text-base">
            <span
              className="h-2.5 w-2.5 rounded-full"
              style={{ background: scene.accentColor || 'var(--primary)' }}
            />
            {scene.name}
          </CardTitle>
          <p className="text-xs text-muted-foreground">{scene.description}</p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => onActivate?.(scene.id)}>
            Activate
          </Button>
          <Button size="sm" variant="ghost" onClick={() => onUpdate?.(scene.id, { favorite: !scene.favorite })}>
            {scene.favorite ? 'Unfavorite' : 'Favorite'}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col gap-4 text-sm">
        <div className="space-y-2">
          <p className="text-xs uppercase text-muted-foreground">Devices</p>
          <ul className="space-y-2">
            {(scene.devices || []).map((device) => (
              <DeviceLine key={device.deviceId} device={device} />
            ))}
          </ul>
        </div>
        <div className="space-y-2">
          <p className="text-xs uppercase text-muted-foreground">Linked schedules</p>
          <div className="flex flex-wrap gap-2">
            {scheduleLabels.length === 0 && (
              <p className="text-xs text-muted-foreground">No schedules attached</p>
            )}
            {scheduleLabels.map((entry) => (
              <Badge
                key={entry.id}
                className="flex items-center gap-1 bg-muted text-xs text-foreground"
              >
                {entry.label}
                <button
                  type="button"
                  className="ml-1 text-muted-foreground hover:text-foreground"
                  onClick={() => handleRemoveLink(entry.id)}
                >
                  ×
                </button>
              </Badge>
            ))}
          </div>
          {availableSchedules.length > 0 && (
            <div className="flex items-center gap-2">
              <select
                value={selectedSchedule}
                onChange={(event) => setSelectedSchedule(event.target.value)}
                className="flex-1 rounded-md border bg-transparent px-2 py-1 text-sm"
              >
                <option value="">Attach schedule…</option>
                {availableSchedules.map((schedule) => (
                  <option key={schedule.id} value={schedule.id}>
                    {schedule.name}
                  </option>
                ))}
              </select>
              <Button size="sm" variant="secondary" onClick={handleLinkSchedule} disabled={!selectedSchedule}>
                Link
              </Button>
            </div>
          )}
        </div>
        <div className="mt-auto grid grid-cols-2 gap-2 text-xs text-muted-foreground">
          <div>
            <p className="uppercase">Last activated</p>
            <p className="text-sm text-foreground">{formatTimestamp(scene.metadata?.lastActivated)}</p>
          </div>
          <div>
            <p className="uppercase">Usage count</p>
            <p className="text-sm text-foreground">{scene.metadata?.usageCount ?? 0}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

export function SceneGrid({ scenes = [], schedules = [], onActivate, onUpdate, className }) {
  if (!scenes.length) {
    return <p className="text-sm text-muted-foreground">No scenes created yet.</p>
  }
  return (
    <div className={cn('grid gap-4 md:grid-cols-2', className)}>
      {scenes.map((scene) => (
        <SceneCard
          key={scene.id}
          scene={scene}
          schedules={schedules}
          onActivate={onActivate}
          onUpdate={onUpdate}
        />
      ))}
    </div>
  )
}
