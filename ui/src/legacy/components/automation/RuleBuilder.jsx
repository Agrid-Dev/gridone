import { ArrowDown, ArrowUp, ShieldAlert, Sparkles } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Switch } from '@/components/ui/switch'
import { cn } from '@/lib/utils'

function formatTrigger(trigger) {
  if (!trigger) return 'Manual trigger'
  switch (trigger.type) {
    case 'time':
      return `Time window • ${trigger.schedule?.at || '—'} (${(trigger.schedule?.daysOfWeek || []).length} days)`
    case 'sensor':
      return `Sensor • ${trigger.sourceDeviceId || trigger.sensor} ${trigger.metric || ''}`
    case 'manual':
      return 'Manual activation'
    case 'device_state':
      return `Device state • ${trigger.deviceId || 'device'}`
    default:
      return trigger.description || 'Custom trigger'
  }
}

function formatCondition(condition) {
  if (!condition) return ''
  switch (condition.type) {
    case 'metric':
      return `${condition.deviceId || 'device'} ${condition.metric || ''} ${condition.operator || ''} ${condition.value}`
    case 'sensor':
      return `${condition.sensor || 'sensor'} ${condition.metric || ''} ${condition.operator || ''} ${condition.value}`
    case 'time':
      return `Time between ${condition.after || '00:00'}-${condition.before || '23:59'}`
    case 'alert_state':
      return `Alerts ${condition.operator || '>'} ${condition.threshold || 0} (${(condition.severity || []).join(', ')})`
    case 'device_state':
      return `${condition.deviceId} ${condition.field} ${condition.operator} ${condition.value}`
    default:
      return condition.description || 'Condition'
  }
}

function formatAction(action) {
  if (!action) return ''
  switch (action.type) {
    case 'device': {
      const details = Object.entries(action.payload || {})
        .map(([key, value]) => `${key}: ${value}`)
        .join(', ')
      return `${action.label || action.targetId} (${details || 'state change'})`
    }
    case 'scene':
      return `Scene • ${action.sceneId}`
    case 'notification':
      return `${(action.channel || '').toUpperCase()} → ${action.message || 'Send notification'}`
    case 'log':
      return action.message || 'Audit log entry'
    default:
      return action.label || 'Custom action'
  }
}

function RuleBlock({ title, children }) {
  return (
    <div className="rounded-lg border bg-muted/20 p-3">
      <p className="text-xs uppercase text-muted-foreground">{title}</p>
      <div className="mt-2 space-y-2 text-sm">{children}</div>
    </div>
  )
}

function ActionPill({ action }) {
  return (
    <div className="flex items-center gap-2 rounded-md border border-dashed border-border/60 bg-background/70 px-2 py-1 text-sm">
      <Badge variant="secondary" className="uppercase">
        {action.type}
      </Badge>
      <span className="text-muted-foreground">{formatAction(action)}</span>
    </div>
  )
}

export function RuleBuilder({ rules = [], onToggle, onReorder, onUpdate, className }) {
  const conflictOptions = [
    { value: 'prefer_highest_priority', label: 'Highest priority wins' },
    { value: 'prefer_manual_override', label: 'Respect manual override' },
    { value: 'pause_lower_priority', label: 'Pause lower priority rules' },
    { value: 'merge', label: 'Merge actions' },
  ]

  if (!rules.length) {
    return <p className="text-sm text-muted-foreground">No automation rules defined.</p>
  }

  return (
    <div className={cn('space-y-4', className)}>
      {[...rules]
        .sort((a, b) => a.priority - b.priority)
        .map((rule, index, array) => (
          <Card key={rule.id} className={cn('border shadow-sm', !rule.enabled && 'opacity-80')}>
            <CardHeader className="flex flex-row items-center justify-between gap-4">
              <div>
                <CardTitle className="flex items-center gap-3 text-base">
                  <Badge variant="outline">Priority {rule.priority}</Badge>
                  {rule.name}
                  {rule.tags?.map((tag) => (
                    <Badge key={tag} variant="secondary" className="ml-1 uppercase">
                      {tag}
                    </Badge>
                  ))}
                </CardTitle>
                <p className="text-xs text-muted-foreground">{rule.description}</p>
              </div>
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span>Enabled</span>
                  <Switch checked={rule.enabled} onCheckedChange={(value) => onToggle?.(rule.id, value)} />
                </div>
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={index === 0}
                    onClick={() => onReorder?.(rule.id, { direction: 'up' })}
                  >
                    <ArrowUp className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={index === array.length - 1}
                    onClick={() => onReorder?.(rule.id, { direction: 'down' })}
                  >
                    <ArrowDown className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                <RuleBlock title="Trigger">
                  <div className="flex items-center gap-2 rounded-md bg-background/80 px-2 py-1 text-sm">
                    <Sparkles className="h-4 w-4 text-primary" />
                    <span>{formatTrigger(rule.trigger)}</span>
                  </div>
                </RuleBlock>
                <RuleBlock title="Conditions">
                  {(rule.conditions || []).length === 0 && (
                    <p className="text-xs text-muted-foreground">No guard conditions.</p>
                  )}
                  {(rule.conditions || []).map((condition) => (
                    <div key={condition.id} className="rounded bg-background/70 px-2 py-1 text-sm">
                      {formatCondition(condition)}
                    </div>
                  ))}
                </RuleBlock>
                <RuleBlock title="Conflict strategy">
                  <div className="flex flex-col gap-2">
                    <select
                      className="rounded-md border bg-transparent px-2 py-1 text-sm"
                      value={rule.conflictStrategy}
                      onChange={(event) => onUpdate?.(rule.id, { conflictStrategy: event.target.value })}
                    >
                      {conflictOptions.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                    <p className="text-xs text-muted-foreground">
                      {rule.conflictStrategy?.replaceAll('_', ' ')}
                    </p>
                  </div>
                </RuleBlock>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <RuleBlock title="Then actions">
                  {(rule.actions || []).length === 0 && (
                    <p className="text-xs text-muted-foreground">No actions configured.</p>
                  )}
                  {(rule.actions || []).map((action) => (
                    <ActionPill key={action.id || action.label} action={action} />
                  ))}
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      onUpdate?.(rule.id, {
                        actions: [
                          ...(rule.actions || []),
                          {
                            id: `action-${Date.now()}`,
                            type: 'notification',
                            channel: 'email',
                            message: 'Custom notification from dashboard',
                            recipients: ['operations@aurorahotel.local'],
                          },
                        ],
                      })
                    }
                  >
                    + Notification
                  </Button>
                </RuleBlock>
                <RuleBlock title="Else fallback">
                  {(rule.elseActions || []).length === 0 && (
                    <p className="text-xs text-muted-foreground">No fallback configured.</p>
                  )}
                  {(rule.elseActions || []).map((action) => (
                    <ActionPill key={action.id || `${action.type}-${action.sceneId || action.targetId}`} action={action} />
                  ))}
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() =>
                      onUpdate?.(rule.id, {
                        elseActions: [
                          ...(rule.elseActions || []),
                          {
                            id: `else-${Date.now()}`,
                            type: 'log',
                            message: 'Rule skipped — audit recorded',
                          },
                        ],
                      })
                    }
                  >
                    + Audit log
                  </Button>
                </RuleBlock>
              </div>
              <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                <div className="flex items-center gap-1">
                  <ShieldAlert className="h-4 w-4" />
                  <span>Last evaluated: {rule.lastEvaluatedAt ? new Date(rule.lastEvaluatedAt).toLocaleString() : '—'}</span>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
    </div>
  )
}
