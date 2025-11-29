import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { RefreshCcw, Filter } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useAlerts, ALERT_SEVERITIES, ALERT_STATES } from '@/legacy/contexts/AlertsContext'
import { useTranslation } from '@/contexts/LanguageContext'
import { cn } from '@/lib/utils'

const stateVariants = {
  active: 'destructive',
  acknowledged: 'secondary',
  resolved: 'outline',
}

const severityBadges = {
  critical: 'bg-destructive/15 text-destructive border border-destructive/30',
  warning: 'bg-amber-100 text-amber-900 border border-amber-300',
  info: 'bg-sky-100 text-sky-900 border border-sky-200',
}

export function AlertsPage() {
  const {
    alerts,
    loading,
    error,
    filters,
    setSeverityFilter,
    setStateFilter,
    acknowledgeAlert,
    resolveAlert,
    markAlertRead,
    markAllAsRead,
    refreshAlerts,
    history,
    severityCounts,
    stateCounts,
  } = useAlerts()
  const { t } = useTranslation()
  const [selectedAlertId, setSelectedAlertId] = useState(null)

  const getAlertTitle = (alert) => {
    if (!alert) return ''
    if (alert.titleKey) {
      return t(alert.titleKey, { defaultValue: alert.title, values: alert.titleValues })
    }
    return alert.title
  }

  const getAlertMessage = (alert) => {
    if (!alert) return ''
    if (alert.messageKey) {
      return t(alert.messageKey, { defaultValue: alert.message, values: alert.messageValues })
    }
    return alert.message
  }

  const getHistoryMessage = (entry) => {
    if (!entry) return ''
    if (entry.messageKey) {
      return t(entry.messageKey, { defaultValue: entry.message, values: entry.messageValues })
    }
    return entry.message
  }

  const selectedAlert = useMemo(() => {
    const current = alerts.find((alert) => alert.id === selectedAlertId)
    return current || alerts[0] || null
  }, [alerts, selectedAlertId])

  const handleSelectAlert = (alert) => {
    setSelectedAlertId(alert.id)
    if (alert.unread) {
      markAlertRead(alert.id)
    }
  }

  const alertHistory = selectedAlert?.history || []

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">
            {t('alerts.title', { defaultValue: 'Alerts & Notifications' })}
          </h1>
          <p className="text-sm text-muted-foreground">
            {t('alerts.subtitle', {
              defaultValue: 'Monitor device health, respond to exceptions, and configure escalation policies.',
            })}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={markAllAsRead}>
            {t('alerts.actions.markAllRead', { defaultValue: 'Mark all as read' })}
          </Button>
          <Button variant="secondary" onClick={refreshAlerts}>
            <RefreshCcw className="mr-2 h-4 w-4" />
            {t('alerts.actions.refresh', { defaultValue: 'Refresh' })}
          </Button>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {typeof error === 'string'
            ? error
            : t(error.messageKey, { defaultValue: error.message })}
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-3">
        {ALERT_SEVERITIES.map((severity) => (
          <Card key={severity}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium uppercase">
                {t(`alerts.severity.${severity}`, {
                  defaultValue: severity.charAt(0).toUpperCase() + severity.slice(1),
                })}
              </CardTitle>
              <CardDescription>
                {t('alerts.cards.severityHelper', { defaultValue: 'Open incidents' })}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-semibold">{severityCounts[severity] || 0}</div>
            </CardContent>
          </Card>
        ))}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium uppercase">
              {t('alerts.state.active', { defaultValue: 'Active' })}
            </CardTitle>
            <CardDescription>{t('alerts.cards.stateHelper', { defaultValue: 'Requires action' })}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-semibold">{stateCounts.active || 0}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium uppercase">
              {t('alerts.state.acknowledged', { defaultValue: 'Acknowledged' })}
            </CardTitle>
            <CardDescription>{t('alerts.cards.ackHelper', { defaultValue: 'Being handled' })}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-semibold">{stateCounts.acknowledged || 0}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium uppercase">
              {t('alerts.state.resolved', { defaultValue: 'Resolved' })}
            </CardTitle>
            <CardDescription>{t('alerts.cards.resolvedHelper', { defaultValue: 'Closed in last 24h' })}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-semibold">{stateCounts.resolved || 0}</div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t('alerts.filters.title', { defaultValue: 'Filters' })}</CardTitle>
          <CardDescription>
            {t('alerts.filters.subtitle', { defaultValue: 'Refine by severity, status, and routing policies.' })}
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-3">
          <div>
            <p className="text-xs uppercase text-muted-foreground">
              {t('alerts.filters.severity', { defaultValue: 'Severity' })}
            </p>
            <Select value={filters.severity} onValueChange={setSeverityFilter}>
              <SelectTrigger>
                <SelectValue placeholder={t('alerts.filters.severity', { defaultValue: 'Severity' })} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">
                  {t('alerts.filters.allSeverities', { defaultValue: 'All severities' })}
                </SelectItem>
                {ALERT_SEVERITIES.map((severity) => (
                  <SelectItem key={severity} value={severity}>
                    {t(`alerts.severity.${severity}`, {
                      defaultValue: severity.charAt(0).toUpperCase() + severity.slice(1),
                    })}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <p className="text-xs uppercase text-muted-foreground">
              {t('alerts.filters.state', { defaultValue: 'Status' })}
            </p>
            <Select value={filters.state} onValueChange={setStateFilter}>
              <SelectTrigger>
                <SelectValue placeholder={t('alerts.filters.state', { defaultValue: 'Status' })} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">
                  {t('alerts.filters.allStates', { defaultValue: 'All statuses' })}
                </SelectItem>
                {ALERT_STATES.map((state) => (
                  <SelectItem key={state} value={state}>
                    {t(`alerts.state.${state}`, {
                      defaultValue: state.charAt(0).toUpperCase() + state.slice(1),
                    })}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
            <p className="flex items-center gap-2">
              <Filter className="h-4 w-4" />
              {t('alerts.filters.helper', { defaultValue: 'Use filters to route alerts to on-call teams.' })}
            </p>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-[2fr,1fr]">
        <Card className="h-full">
          <CardHeader>
            <CardTitle>{t('alerts.list.title', { defaultValue: 'Alert queue' })}</CardTitle>
            <CardDescription>
              {loading
                ? t('alerts.list.loading', { defaultValue: 'Loading alerts...' })
                : t('alerts.list.subtitle', { defaultValue: '{count} matching alerts.', values: { count: alerts.length } })}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {alerts.length === 0 && (
              <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
                {loading
                  ? t('alerts.list.loading', { defaultValue: 'Loading alerts...' })
                  : t('alerts.list.empty', { defaultValue: 'No alerts found under current filters.' })}
              </div>
            )}
            {alerts.map((alert) => (
              <div
                key={alert.id}
                className={cn(
                  'cursor-pointer rounded-xl border bg-card/80 p-4 transition hover:border-primary/60',
                  selectedAlert?.id === alert.id && 'border-primary ring-2 ring-primary/30',
                )}
                onClick={() => handleSelectAlert(alert)}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className={cn('inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase', severityBadges[alert.severity])}>
                      {t(`alerts.severity.${alert.severity}`, {
                        defaultValue: alert.severity.charAt(0).toUpperCase() + alert.severity.slice(1),
                      })}
                    </span>
                    <Badge variant={stateVariants[alert.state] || 'outline'} className="text-[11px]">
                      {t(`alerts.state.${alert.state}`, {
                        defaultValue: alert.state.charAt(0).toUpperCase() + alert.state.slice(1),
                      })}
                    </Badge>
                    {alert.unread && <span className="h-2.5 w-2.5 rounded-full bg-primary" />}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {new Date(alert.updatedAt || alert.createdAt).toLocaleString()}
                  </p>
                </div>
                <div className="mt-2">
                  <p className="text-base font-semibold">{getAlertTitle(alert)}</p>
                  <p className="text-sm text-muted-foreground">{getAlertMessage(alert)}</p>
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                  <span>{t('alerts.labels.device', { defaultValue: 'Device' })}: {alert.deviceName}</span>
                  {alert.zone && (
                    <span>
                      {t('alerts.labels.zone', { defaultValue: 'Zone' })}: {alert.zone}
                    </span>
                  )}
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {alert.state === 'active' && (
                    <Button size="sm" variant="secondary" className="h-8 px-3 text-xs" onClick={() => acknowledgeAlert(alert.id)}>
                      {t('alerts.actions.acknowledge', { defaultValue: 'Acknowledge' })}
                    </Button>
                  )}
                  {alert.state !== 'resolved' && (
                    <Button size="sm" variant="outline" className="h-8 px-3 text-xs" onClick={() => resolveAlert(alert.id)}>
                      {t('alerts.actions.resolve', { defaultValue: 'Resolve' })}
                    </Button>
                  )}
                  <Button size="sm" variant="ghost" className="h-8 px-3 text-xs" onClick={() => markAlertRead(alert.id)}>
                    {t('alerts.actions.markRead', { defaultValue: 'Mark read' })}
                  </Button>
                  {alert.deviceId && (
                    <Button asChild size="sm" variant="link" className="h-8 px-2 text-xs">
                      <Link to={`/devices/${alert.deviceId}`}>
                        {t('alerts.actions.viewDevice', { defaultValue: 'View device' })}
                      </Link>
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
        <Card className="h-full">
          <CardHeader>
            <CardTitle>{t('alerts.details.title', { defaultValue: 'Alert details' })}</CardTitle>
            <CardDescription>
              {selectedAlert
                ? t('alerts.details.subtitle', {
                    defaultValue: 'Investigate impact and trace history.',
                  })
                : t('alerts.details.empty', { defaultValue: 'Select an alert to view more details.' })}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {!selectedAlert && (
              <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
                {t('alerts.details.empty', { defaultValue: 'Select an alert to view more details.' })}
              </div>
            )}
            {selectedAlert && (
              <>
                <div className="space-y-1">
                  <p className="text-lg font-semibold">{getAlertTitle(selectedAlert)}</p>
                  <p className="text-sm text-muted-foreground">{getAlertMessage(selectedAlert)}</p>
                </div>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <p className="text-xs uppercase text-muted-foreground">
                      {t('alerts.labels.device', { defaultValue: 'Device' })}
                    </p>
                    <p className="font-medium">{selectedAlert.deviceName}</p>
                  </div>
                  <div>
                    <p className="text-xs uppercase text-muted-foreground">
                      {t('alerts.labels.state', { defaultValue: 'State' })}
                    </p>
                    <Badge variant={stateVariants[selectedAlert.state] || 'outline'}>
                      {t(`alerts.state.${selectedAlert.state}`, {
                        defaultValue: selectedAlert.state.charAt(0).toUpperCase() + selectedAlert.state.slice(1),
                      })}
                    </Badge>
                  </div>
                  <div>
                    <p className="text-xs uppercase text-muted-foreground">
                      {t('alerts.labels.raised', { defaultValue: 'Raised at' })}
                    </p>
                    <p className="font-medium">{new Date(selectedAlert.createdAt).toLocaleString()}</p>
                  </div>
                  <div>
                    <p className="text-xs uppercase text-muted-foreground">
                      {t('alerts.labels.updated', { defaultValue: 'Last update' })}
                    </p>
                    <p className="font-medium">{new Date(selectedAlert.updatedAt || selectedAlert.createdAt).toLocaleString()}</p>
                  </div>
                </div>
                {selectedAlert.metadata && Object.keys(selectedAlert.metadata).length > 0 && (
                  <div>
                    <p className="text-xs uppercase text-muted-foreground">
                      {t('alerts.labels.context', { defaultValue: 'Context' })}
                    </p>
                    <div className="mt-2 space-y-2 text-sm">
                      {Object.entries(selectedAlert.metadata).map(([key, value]) => (
                        <div key={key} className="flex items-center justify-between rounded-md bg-muted/40 px-3 py-2">
                          <span className="capitalize text-muted-foreground">{key}</span>
                          <span className="font-medium">{typeof value === 'object' ? JSON.stringify(value) : String(value)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                <div>
                  <p className="text-xs uppercase text-muted-foreground">
                    {t('alerts.details.timeline', { defaultValue: 'Timeline' })}
                  </p>
                  <div className="mt-2 space-y-2">
                    {alertHistory.map((entry) => (
                      <div key={entry.id} className="flex items-start gap-3 rounded-lg border px-3 py-2 text-sm">
                        <Badge variant={stateVariants[entry.state] || 'outline'} className="mt-0.5 text-[11px]">
                          {t(`alerts.state.${entry.state}`, {
                            defaultValue: entry.state.charAt(0).toUpperCase() + entry.state.slice(1),
                          })}
                        </Badge>
                        <div>
                          <p className="font-medium">{getHistoryMessage(entry)}</p>
                          <p className="text-xs text-muted-foreground">
                            {new Date(entry.timestamp).toLocaleString()} &bull; {entry.actor}
                          </p>
                        </div>
                      </div>
                    ))}
                    {alertHistory.length === 0 && (
                      <p className="text-sm text-muted-foreground">
                        {t('alerts.details.timelineEmpty', { defaultValue: 'No history recorded yet.' })}
                      </p>
                    )}
                  </div>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t('alerts.history.title', { defaultValue: 'Alert activity log' })}</CardTitle>
          <CardDescription>
            {t('alerts.history.subtitle', { defaultValue: 'Chronological view of acknowledgements, routing, and resolutions.' })}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {history.length === 0 && (
            <p className="text-sm text-muted-foreground">
              {t('alerts.history.empty', { defaultValue: 'No history entries yet.' })}
            </p>
          )}
          {history.slice(0, 12).map((entry) => (
            <div key={entry.id} className="flex items-center justify-between rounded-lg border px-4 py-2 text-sm">
              <div>
                <p className="font-medium">{getHistoryMessage(entry)}</p>
                <p className="text-xs text-muted-foreground">
                  {entry.deviceName} &bull; {new Date(entry.timestamp).toLocaleString()}
                </p>
              </div>
              <Badge variant={stateVariants[entry.state] || 'outline'}>
                {t(`alerts.state.${entry.state}`, {
                  defaultValue: entry.state.charAt(0).toUpperCase() + entry.state.slice(1),
                })}
              </Badge>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  )
}
