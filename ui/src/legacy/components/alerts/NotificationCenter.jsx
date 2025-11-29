import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { AlertCircle, Bell, Check, CheckCircle2, ShieldAlert } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useAlerts, ALERT_SEVERITIES, ALERT_STATES } from '@/legacy/contexts/AlertsContext'
import { useTranslation } from '@/contexts/LanguageContext'
import { cn } from '@/lib/utils'

const severityStyles = {
  critical: 'bg-destructive/15 text-destructive border-destructive/40',
  warning: 'bg-amber-100 text-amber-900 border-amber-200',
  info: 'bg-sky-100 text-sky-900 border-sky-200',
}

const severityIcons = {
  critical: ShieldAlert,
  warning: AlertCircle,
  info: CheckCircle2,
}

const stateVariants = {
  active: 'destructive',
  acknowledged: 'secondary',
  resolved: 'outline',
}

export function NotificationCenter() {
  const {
    recentAlerts,
    unreadCount,
    filters,
    setSeverityFilter,
    setStateFilter,
    acknowledgeAlert,
    resolveAlert,
    markAllAsRead,
  } = useAlerts()
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const panelRef = useRef(null)

  const getAlertTitle = (alert) => {
    if (!alert) return ''
    if (alert.titleKey) {
      return t(alert.titleKey, {
        defaultValue: alert.title,
        values: alert.titleValues,
      })
    }
    return alert.title
  }

  const getAlertMessage = (alert) => {
    if (!alert) return ''
    if (alert.messageKey) {
      return t(alert.messageKey, {
        defaultValue: alert.message,
        values: alert.messageValues,
      })
    }
    return alert.message
  }

  useEffect(() => {
    function handleClick(event) {
      if (panelRef.current && !panelRef.current.contains(event.target)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => {
      document.removeEventListener('mousedown', handleClick)
    }
  }, [])

  const handleAcknowledge = async (alertId) => {
    await acknowledgeAlert(alertId)
  }

  const handleResolve = async (alertId) => {
    await resolveAlert(alertId)
  }

  return (
    <div className="relative" ref={panelRef}>
      <Button
        variant="ghost"
        size="icon"
        className="relative"
        onClick={() => setOpen((prev) => !prev)}
        aria-label={t('alerts.notificationCenter', { defaultValue: 'Notifications' })}
      >
        <Bell className="h-5 w-5" />
        {unreadCount > 0 && (
          <Badge className="absolute -right-1 -top-1 h-5 min-w-[20px] rounded-full px-1 py-0 text-[10px]" variant="destructive">
            {unreadCount}
          </Badge>
        )}
      </Button>
      {open && (
        <div className="absolute right-0 top-12 z-30 w-96 rounded-xl border bg-background p-4 shadow-xl">
          <div className="flex items-center justify-between">
            <p className="text-base font-semibold">
              {t('alerts.recent', { defaultValue: 'Recent alerts' })}
            </p>
            <Button variant="ghost" size="sm" onClick={markAllAsRead} className="text-xs">
              <Check className="mr-1 h-3.5 w-3.5" />
              {t('alerts.actions.markAllRead', { defaultValue: 'Mark all read' })}
            </Button>
          </div>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            <div>
              <p className="text-[11px] uppercase text-muted-foreground">
                {t('alerts.filters.severity', { defaultValue: 'Severity' })}
              </p>
              <Select value={filters.severity} onValueChange={setSeverityFilter}>
                <SelectTrigger className="h-8 text-xs">
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
              <p className="text-[11px] uppercase text-muted-foreground">
                {t('alerts.filters.state', { defaultValue: 'Status' })}
              </p>
              <Select value={filters.state} onValueChange={setStateFilter}>
                <SelectTrigger className="h-8 text-xs">
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
          </div>
          <div className="mt-4 space-y-3">
            {recentAlerts.length === 0 && (
              <div className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">
                {t('alerts.empty', { defaultValue: 'No alerts matching the current filters.' })}
              </div>
            )}
            {recentAlerts.map((alert) => {
              const SeverityIcon = severityIcons[alert.severity] || AlertCircle
              return (
                <div key={alert.id} className="rounded-lg border p-3">
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <span
                          className={cn(
                            'inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium uppercase',
                            severityStyles[alert.severity] || 'bg-muted text-foreground',
                          )}
                        >
                          <SeverityIcon className="mr-1 h-3 w-3" />
                          {t(`alerts.severity.${alert.severity}`, {
                            defaultValue: alert.severity.charAt(0).toUpperCase() + alert.severity.slice(1),
                          })}
                        </span>
                        <Badge variant={stateVariants[alert.state] || 'outline'} className="text-[11px]">
                          {t(`alerts.state.${alert.state}`, {
                            defaultValue: alert.state.charAt(0).toUpperCase() + alert.state.slice(1),
                          })}
                        </Badge>
                      </div>
                      <p className="mt-2 text-sm font-semibold">{getAlertTitle(alert)}</p>
                      <p className="text-xs text-muted-foreground">{getAlertMessage(alert)}</p>
                      <p className="mt-1 text-[11px] text-muted-foreground">
                        {t('alerts.labels.device', { defaultValue: 'Device' })}: {alert.deviceName}
                      </p>
                    </div>
                    {alert.unread && <span className="h-2 w-2 rounded-full bg-primary" />}
                  </div>
                  <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
                    <span>{new Date(alert.updatedAt || alert.createdAt).toLocaleTimeString()}</span>
                    <span>&bull;</span>
                    <Link to={alert.deviceId ? `/devices/${alert.deviceId}` : '/devices'} className="text-primary">
                      {t('alerts.actions.viewDevice', { defaultValue: 'View device' })}
                    </Link>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {alert.state === 'active' && (
                      <Button
                        size="sm"
                        variant="secondary"
                        className="h-7 px-2 text-xs"
                        onClick={() => handleAcknowledge(alert.id)}
                      >
                        {t('alerts.actions.acknowledge', { defaultValue: 'Acknowledge' })}
                      </Button>
                    )}
                    {alert.state !== 'resolved' && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 px-2 text-xs"
                        onClick={() => handleResolve(alert.id)}
                      >
                        {t('alerts.actions.resolve', { defaultValue: 'Resolve' })}
                      </Button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
          <div className="mt-4 flex items-center justify-between">
            <p className="text-xs text-muted-foreground">
              {t('alerts.actions.manage', { defaultValue: 'Manage alerts in detail' })}
            </p>
            <Button asChild size="sm" variant="link">
              <Link to="/alerts" onClick={() => setOpen(false)}>
                {t('alerts.actions.viewAll', { defaultValue: 'View all' })}
              </Link>
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
