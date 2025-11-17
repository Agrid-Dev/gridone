import { useMemo, useRef } from 'react'
import { Clock3, Sparkles, Workflow, Zap } from 'lucide-react'
import { cn } from '@/lib/utils'

const MINUTES_IN_DAY = 24 * 60
const typeIcons = {
  time: Clock3,
  condition: Workflow,
  scene: Sparkles,
}

const FALLBACK_DURATION = 60

function getMinutes(value) {
  if (typeof value === 'number') return value
  if (typeof value !== 'string') return 0
  const [hoursStr, minutesStr] = value.split(':')
  const hours = Number.parseInt(hoursStr, 10)
  const minutes = Number.parseInt(minutesStr, 10)
  if (Number.isNaN(hours) || Number.isNaN(minutes)) return 0
  return Math.min(Math.max(hours * 60 + minutes, 0), MINUTES_IN_DAY)
}

function formatWindow(schedule) {
  const start = schedule.startTime ?? '00:00'
  const end = schedule.endTime ?? '01:00'
  return `${start} → ${end}`
}

export function ScheduleTimeline({
  schedules = [],
  onTimeChange,
  onSelect,
  selectedId,
  disabled = false,
}) {
  const hours = useMemo(() => Array.from({ length: 24 }, (_, index) => index), [])
  const containerRef = useRef(null)
  const sortedSchedules = useMemo(
    () =>
      [...schedules].sort((a, b) => {
        const left = getMinutes(a.startMinutes ?? getMinutes(a.startTime))
        const right = getMinutes(b.startMinutes ?? getMinutes(b.startTime))
        return left - right
      }),
    [schedules],
  )

  const computeMinutesFromPointer = (event) => {
    const rect = containerRef.current?.getBoundingClientRect()
    if (!rect) return null
    const ratio = Math.min(Math.max((event.clientX - rect.left) / rect.width, 0), 1)
    return Math.round(ratio * MINUTES_IN_DAY)
  }

  const parsePayload = (event) => {
    const payload =
      event.dataTransfer.getData('application/x-schedule') || event.dataTransfer.getData('text/plain')
    if (!payload) return null
    try {
      return typeof payload === 'string' ? JSON.parse(payload) : payload
    } catch {
      return { id: payload, mode: 'move' }
    }
  }

  const handleDrop = (event) => {
    event.preventDefault()
    if (!onTimeChange || disabled) return
    const payload = parsePayload(event)
    if (!payload?.id) return
    const schedule = sortedSchedules.find((entry) => entry.id === payload.id)
    if (!schedule) return
    const pointerMinutes = computeMinutesFromPointer(event)
    if (pointerMinutes === null) return
    const duration = Math.max(schedule.durationMinutes || FALLBACK_DURATION, 15)
    if (payload.mode === 'resize') {
      const nextDuration = Math.max(pointerMinutes - getMinutes(schedule.startMinutes ?? schedule.startTime), 15)
      onTimeChange(schedule.id, {
        durationMinutes: Math.min(nextDuration, MINUTES_IN_DAY - getMinutes(schedule.startMinutes ?? schedule.startTime)),
      })
      return
    }
    const boundedStart = Math.max(0, Math.min(pointerMinutes, MINUTES_IN_DAY - duration))
    onTimeChange(schedule.id, { startMinutes: boundedStart })
  }

  const handleDragStart = (event, scheduleId, mode = 'move') => {
    const payload = JSON.stringify({ id: scheduleId, mode })
    event.dataTransfer.setData('application/x-schedule', payload)
    event.dataTransfer.setData('text/plain', payload)
    event.dataTransfer.effectAllowed = 'move'
  }

  return (
    <div className="space-y-3">
      <div
        ref={containerRef}
        className={cn(
          'relative h-48 w-full rounded-lg border bg-muted/40',
          disabled && 'opacity-60',
        )}
        onDragOver={(event) => event.preventDefault()}
        onDrop={handleDrop}
      >
        <div className="absolute inset-0 flex text-[10px] text-muted-foreground">
          {hours.map((hour) => (
            <div
              key={hour}
              className="flex flex-1 flex-col border-l border-dashed border-border/60 px-1"
            >
              <span className="mt-auto">{hour.toString().padStart(2, '0')}</span>
            </div>
          ))}
        </div>
        <div className="absolute inset-0">
          {sortedSchedules.map((schedule) => {
            const startMinutes = getMinutes(schedule.startMinutes ?? schedule.startTime)
            const length = Math.max(schedule.durationMinutes || FALLBACK_DURATION, 15)
            const Icon = typeIcons[schedule.type] || Zap
            const left = (startMinutes / MINUTES_IN_DAY) * 100
            const width = Math.min((length / MINUTES_IN_DAY) * 100, 100)
            return (
              <div
                key={schedule.id}
                draggable
                onDragStart={(event) => handleDragStart(event, schedule.id, 'move')}
                onClick={() => onSelect?.(schedule.id)}
                className={cn(
                  'absolute top-4 flex h-28 cursor-grab flex-col rounded-lg border text-xs text-white shadow-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
                  schedule.override?.active && 'ring-2 ring-amber-400',
                  !schedule.enabled && 'opacity-60',
                  selectedId === schedule.id && 'ring-2 ring-primary',
                )}
                style={{
                  left: `${left}%`,
                  width: `${width}%`,
                  background: schedule.color || 'var(--primary)',
                  minWidth: '4%',
                }}
              >
                <div className="flex items-center gap-2 border-b border-white/20 px-2 py-1 text-[11px] uppercase tracking-wide">
                  <Icon className="h-3.5 w-3.5" />
                  <span className="truncate font-semibold">{schedule.name}</span>
                  <span className="ml-auto rounded bg-white/15 px-1 py-px text-[10px]">{formatWindow(schedule)}</span>
                </div>
                <div className="flex flex-1 flex-col gap-1 px-2 py-1">
                  <p className="text-[11px] leading-tight">{schedule.metadata?.notes || schedule.recurring?.description}</p>
                  <div className="mt-auto flex flex-wrap gap-1 text-[10px] uppercase text-white/80">
                    {schedule.recurring?.description && (
                      <span className="rounded bg-black/25 px-1 py-px">{schedule.recurring.description}</span>
                    )}
                    {schedule.override?.active && (
                      <span className="rounded bg-black/25 px-1 py-px">Overridden</span>
                    )}
                    {!schedule.enabled && <span className="rounded bg-black/25 px-1 py-px">Disabled</span>}
                  </div>
                </div>
                <div
                  className="absolute bottom-1 right-1 flex h-4 w-4 cursor-ew-resize items-center justify-center rounded border border-white/40 bg-white/50 text-[9px] text-black"
                  draggable
                  onDragStart={(event) => {
                    event.stopPropagation()
                    handleDragStart(event, schedule.id, 'resize')
                  }}
                >
                  ⋮
                </div>
              </div>
            )
          })}
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        Drag blocks to adjust start times, or drag the handle at the end to stretch the duration.
      </p>
    </div>
  )
}
