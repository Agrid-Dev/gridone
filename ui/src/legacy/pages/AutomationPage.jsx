import { useMemo, useState } from 'react'
import { CalendarClock, RefreshCcw, Rocket, Shield, Zap } from 'lucide-react'
import { useAutomation } from '@/legacy/contexts/AutomationContext'
import { useDeviceData } from '@/contexts/DeviceDataContext'
import { useTranslation } from '@/contexts/LanguageContext'
import { ScheduleTimeline } from '@/legacy/components/automation/ScheduleTimeline'
import { SceneGrid } from '@/legacy/components/automation/SceneGrid'
import { RuleBuilder } from '@/legacy/components/automation/RuleBuilder'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

const recurrencePresets = {
  daily: {
    type: 'daily',
    daysOfWeek: [0, 1, 2, 3, 4, 5, 6],
    description: 'Daily',
  },
  weekdays: {
    type: 'weekly',
    daysOfWeek: [1, 2, 3, 4, 5],
    description: 'Weekdays',
  },
  weekends: {
    type: 'weekly',
    daysOfWeek: [0, 6],
    description: 'Weekends',
  },
}

export function AutomationPage() {
  const { t } = useTranslation()
  const {
    schedules,
    scenes,
    rules,
    loading,
    error,
    refresh,
    pendingKeys,
    createSchedule,
    updateSchedule,
    toggleSchedule,
    overrideSchedule,
    createScene,
    updateScene,
    activateScene,
    reorderRules,
    updateRule,
    toggleRule,
  } = useAutomation()
  const { devices } = useDeviceData()
  const [manualScheduleId, setManualScheduleId] = useState(null)
  const [draft, setDraft] = useState({
    name: '',
    type: 'time',
    startTime: '18:00',
    endTime: '23:00',
    recurrence: 'daily',
    targetId: '',
    sceneId: '',
    metric: 'humidity',
    threshold: 55,
    sensorDeviceId: '',
  })
  const sensors = useMemo(() => devices.filter((device) => device.type === 'sensor'), [devices])

  const resolvedScheduleId = useMemo(() => {
    if (manualScheduleId && schedules.some((schedule) => schedule.id === manualScheduleId)) {
      return manualScheduleId
    }
    return schedules[0]?.id || null
  }, [manualScheduleId, schedules])

  const resolvedDraft = useMemo(
    () => ({
      ...draft,
      targetId: draft.targetId || devices[0]?.id || '',
      sceneId: draft.sceneId || scenes[0]?.id || '',
      sensorDeviceId: draft.sensorDeviceId || sensors[0]?.id || devices[0]?.id || '',
      metric: draft.metric || 'humidity',
      threshold: draft.threshold || 55,
      startTime: draft.startTime || '18:00',
      endTime: draft.endTime || '23:00',
    }),
    [draft, devices, scenes, sensors],
  )

  const selectedSchedule = schedules.find((schedule) => schedule.id === resolvedScheduleId)
  const selectedScene = scenes.find((scene) => scene.id === selectedSchedule?.sceneId)
  const targetDevice = devices.find((device) => device.id === selectedSchedule?.targetId)

  const handleDraftChange = (field, value) => {
    setDraft((prev) => ({ ...prev, [field]: value }))
  }

  const handleCreateSchedule = async (event) => {
    event.preventDefault()
    const config = resolvedDraft
    if (!config.name) return
    const preset = recurrencePresets[config.recurrence] || recurrencePresets.daily
    const payload = {
      name: config.name,
      type: config.type,
      startTime: config.startTime,
      endTime: config.endTime,
      recurring: preset,
      targetType: config.type === 'scene' ? 'scene' : 'device',
      targetId: config.type === 'scene' ? null : config.targetId,
      sceneId: config.type === 'scene' ? config.sceneId : null,
      actions:
        config.type === 'scene'
          ? [
              {
                id: `act-${Date.now()}`,
                type: 'scene',
                sceneId: config.sceneId,
                description: 'Activate scene',
              },
            ]
          : [
              {
                id: `act-${Date.now()}`,
                type: 'device',
                targetId: config.targetId,
                description: 'Toggle device state',
                payload: { state: 'on' },
              },
            ],
      conditions:
        config.type === 'condition'
          ? [
              {
                id: `cond-${Date.now()}`,
                type: 'sensor',
                deviceId: config.sensorDeviceId || config.targetId,
                metric: config.metric,
                operator: '>',
                value: Number(config.threshold),
              },
            ]
          : [],
    }
    const created = await createSchedule(payload)
    setDraft((prev) => ({
      ...prev,
      name: '',
    }))
    setManualScheduleId(created?.id ?? resolvedScheduleId)
  }

  const handleTimelineChange = (scheduleId, changes) => {
    updateSchedule(scheduleId, changes)
  }

  const handleOverride = (schedule, durationMinutes = 90) => {
    const expiresAt = new Date(Date.now() + durationMinutes * 60 * 1000).toISOString()
    overrideSchedule(schedule.id, {
      reason: 'Manual override from dashboard',
      expiresAt,
    })
  }

  const scheduleStats = [
    {
      label: 'Schedules',
      value: schedules.length,
      icon: CalendarClock,
    },
    {
      label: 'Scenes',
      value: scenes.length,
      icon: Rocket,
    },
    {
      label: 'Automation rules',
      value: rules.length,
      icon: Shield,
    },
  ]

  const pendingCreate = Boolean(pendingKeys['schedule:create'])
  const scheduleMutating = useMemo(
    () => Object.keys(pendingKeys || {}).some((key) => key.startsWith('schedule:update')),
    [pendingKeys],
  )
  const canSubmitSchedule =
    Boolean(resolvedDraft.name?.trim()) &&
    (resolvedDraft.type === 'scene'
      ? Boolean(resolvedDraft.sceneId)
      : Boolean(resolvedDraft.targetId)) &&
    (resolvedDraft.type !== 'condition' || Boolean(resolvedDraft.metric))

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {t('automation.title', { defaultValue: 'Automation & Scheduling' })}
          </h1>
          <p className="text-sm text-muted-foreground">
            {t('automation.subtitle', {
              defaultValue: 'Coordinate schedules, scenes, and rules from a single cockpit.',
            })}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={refresh} disabled={loading}>
            <RefreshCcw className="mr-2 h-4 w-4" />
            {t('common.refresh', { defaultValue: 'Refresh' })}
          </Button>
          {scheduleStats.map((stat) => {
            const Icon = stat.icon
            return (
              <Badge key={stat.label} variant="secondary" className="gap-1 text-xs">
                <Icon className="h-3.5 w-3.5" />
                {stat.value} {stat.label}
              </Badge>
            )
          })}
        </div>
      </div>

      {error && (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </div>
      )}

      <div className="grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Visual timeline</CardTitle>
            {scheduleMutating && <Badge variant="outline">Saving changes…</Badge>}
          </CardHeader>
          <CardContent>
            <ScheduleTimeline
              schedules={schedules}
              onTimeChange={handleTimelineChange}
              onSelect={setManualScheduleId}
              selectedId={resolvedScheduleId}
              disabled={loading}
            />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Quick schedule builder</CardTitle>
          </CardHeader>
          <CardContent>
            <form className="space-y-3" onSubmit={handleCreateSchedule}>
              <div className="space-y-1">
                <Label htmlFor="schedule-name">Name</Label>
                <Input
                  id="schedule-name"
                  value={resolvedDraft.name}
                  onChange={(event) => handleDraftChange('name', event.target.value)}
                  placeholder="Lobby sunrise lighting"
                  required
                />
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                <div className="space-y-1">
                  <Label>Type</Label>
                  <select
                    className="w-full rounded-md border bg-transparent px-2 py-2 text-sm"
                    value={resolvedDraft.type}
                    onChange={(event) => handleDraftChange('type', event.target.value)}
                  >
                    <option value="time">Time-based</option>
                    <option value="scene" disabled={!scenes.length}>
                      Scene-based
                    </option>
                    <option value="condition">Condition-based</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <Label>Recurrence</Label>
                  <select
                    className="w-full rounded-md border bg-transparent px-2 py-2 text-sm"
                    value={resolvedDraft.recurrence}
                    onChange={(event) => handleDraftChange('recurrence', event.target.value)}
                  >
                    <option value="daily">Daily</option>
                    <option value="weekdays">Weekdays</option>
                    <option value="weekends">Weekends</option>
                  </select>
                </div>
              </div>
              {resolvedDraft.type === 'scene' ? (
                <div className="space-y-1">
                  <Label>Scene</Label>
                  <select
                    className="w-full rounded-md border bg-transparent px-2 py-2 text-sm"
                    value={resolvedDraft.sceneId}
                    onChange={(event) => handleDraftChange('sceneId', event.target.value)}
                  >
                    {scenes.length === 0 && <option value="">No scenes available</option>}
                    {scenes.map((scene) => (
                      <option key={scene.id} value={scene.id}>
                        {scene.name}
                      </option>
                    ))}
                  </select>
                </div>
              ) : (
                <div className="space-y-1">
                  <Label>Target device</Label>
                  <select
                    className="w-full rounded-md border bg-transparent px-2 py-2 text-sm"
                    value={resolvedDraft.targetId}
                    onChange={(event) => handleDraftChange('targetId', event.target.value)}
                  >
                    {devices.map((device) => (
                      <option key={device.id} value={device.id}>
                        {device.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              <div className="grid gap-3 md:grid-cols-2">
                <div className="space-y-1">
                  <Label>Start time</Label>
                  <Input
                    type="time"
                    value={resolvedDraft.startTime}
                    onChange={(event) => handleDraftChange('startTime', event.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <Label>End time</Label>
                  <Input
                    type="time"
                    value={resolvedDraft.endTime}
                    onChange={(event) => handleDraftChange('endTime', event.target.value)}
                  />
                </div>
              </div>
              {resolvedDraft.type === 'condition' && (
                <div className="space-y-3 rounded-lg border bg-muted/30 p-3">
                  <div className="space-y-1">
                    <Label>Sensor</Label>
                    <select
                      className="w-full rounded-md border bg-transparent px-2 py-2 text-sm"
                      value={resolvedDraft.sensorDeviceId}
                      onChange={(event) => handleDraftChange('sensorDeviceId', event.target.value)}
                    >
                      {sensors.length === 0 && <option value="">No sensors available</option>}
                      {sensors.map((sensor) => (
                        <option key={sensor.id} value={sensor.id}>
                          {sensor.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="grid gap-3 md:grid-cols-2">
                    <div className="space-y-1">
                      <Label>Metric</Label>
                      <Input
                        value={resolvedDraft.metric}
                        onChange={(event) => handleDraftChange('metric', event.target.value)}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label>Threshold</Label>
                      <Input
                        type="number"
                        value={resolvedDraft.threshold}
                        onChange={(event) => handleDraftChange('threshold', event.target.value)}
                      />
                    </div>
                  </div>
                </div>
              )}
              <Button type="submit" disabled={pendingCreate || !canSubmitSchedule}>
                {pendingCreate ? 'Creating…' : 'Create schedule'}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Scenes & presets</CardTitle>
          </CardHeader>
          <CardContent>
            <SceneGrid
              scenes={scenes}
              schedules={schedules}
              onActivate={(sceneId) => activateScene(sceneId)}
              onUpdate={updateScene}
            />
            <div className="mt-4">
              <Button
                variant="outline"
                size="sm"
                onClick={async () => {
                  await createScene({ name: 'Custom scene', description: 'Draft scene preset' })
                }}
              >
                + New scene
              </Button>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Schedule details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            {!selectedSchedule ? (
              <p className="text-muted-foreground">Select a schedule from the timeline to inspect its configuration.</p>
            ) : (
              <>
                <div className="space-y-2 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Type</span>
                    <Badge variant="outline" className="capitalize">
                      {selectedSchedule.type}
                    </Badge>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Window</span>
                    <span className="font-medium">
                      {selectedSchedule.startTime}→{selectedSchedule.endTime}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Recurrence</span>
                    <span className="font-medium">{selectedSchedule.recurring?.description}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Next run</span>
                    <span className="font-medium">{selectedSchedule.nextRun || '—'}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Last triggered</span>
                    <span className="font-medium">{selectedSchedule.lastTriggered || '—'}</span>
                  </div>
                </div>
                {selectedSchedule.conditions?.length > 0 && (
                  <div className="space-y-1">
                    <p className="text-xs uppercase text-muted-foreground">Conditions</p>
                    <ul className="space-y-1 text-xs">
                      {selectedSchedule.conditions.map((condition) => (
                        <li key={condition.id} className="rounded bg-muted/40 px-2 py-1">
                          {condition.metric} {condition.operator} {condition.value}{' '}
                          <span className="text-muted-foreground">({condition.deviceId})</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {selectedSchedule.actions?.length > 0 && (
                  <div className="space-y-1">
                    <p className="text-xs uppercase text-muted-foreground">Actions</p>
                    <ul className="space-y-1 text-xs">
                      {selectedSchedule.actions.map((action) => (
                        <li key={action.id} className="rounded bg-muted/40 px-2 py-1">
                          <span className="font-medium uppercase">{action.type}</span> ·{' '}
                          {action.description || action.targetId || action.sceneId}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {selectedScene && (
                  <div className="rounded-lg border bg-muted/30 px-3 py-2 text-sm">
                    Linked scene: <span className="font-medium">{selectedScene.name}</span>
                  </div>
                )}
                {targetDevice && (
                  <div className="rounded-lg border bg-muted/30 px-3 py-2 text-sm">
                    Target device: <span className="font-medium">{targetDevice.name}</span>
                  </div>
                )}
                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    onClick={() => toggleSchedule(selectedSchedule.id, !selectedSchedule.enabled)}
                  >
                    {selectedSchedule.enabled ? 'Pause schedule' : 'Enable schedule'}
                  </Button>
                  {selectedSchedule.type === 'scene' && selectedSchedule.sceneId && (
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() =>
                        activateScene(selectedSchedule.sceneId, {
                          scheduleId: selectedSchedule.id,
                          context: 'manual-trigger',
                        })
                      }
                    >
                      Run scene now
                    </Button>
                  )}
                </div>
                <div className="space-y-2 rounded-lg border bg-muted/40 p-3 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Manual override</span>
                    <Badge variant="outline">
                      {selectedSchedule.override?.active ? 'Active' : 'Not active'}
                    </Badge>
                  </div>
                  {selectedSchedule.override?.active ? (
                    <>
                      <p className="text-xs text-muted-foreground">
                        Until {selectedSchedule.override.expiresAt || 'manual clear'} ·{' '}
                        {selectedSchedule.override.reason}
                      </p>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => overrideSchedule(selectedSchedule.id, null)}
                      >
                        Clear override
                      </Button>
                    </>
                  ) : (
                    <Button size="sm" variant="outline" onClick={() => handleOverride(selectedSchedule)}>
                      Override for 90 minutes
                    </Button>
                  )}
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Automation rule builder</CardTitle>
        </CardHeader>
        <CardContent>
          <RuleBuilder
            rules={rules}
            onToggle={toggleRule}
            onReorder={reorderRules}
            onUpdate={updateRule}
          />
        </CardContent>
      </Card>
    </div>
  )
}
