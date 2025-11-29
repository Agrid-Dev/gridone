import { useCallback, useEffect, useState } from 'react'
import { Bolt, RefreshCcw } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { useApiConfig } from '@/contexts/ApiConfigContext'
import { useDeviceData } from '@/contexts/DeviceDataContext'
import { useAlerts } from '@/legacy/contexts/AlertsContext'
import { useTranslation } from '@/contexts/LanguageContext'

export function SettingsPage() {
  const { mode, setMode, endpoints, updateEndpoint, apiModes } = useApiConfig()
  const { refresh, connectionStatus } = useDeviceData()
  const { alertConfig, updateAlertConfig, updatingConfig } = useAlerts()
  const { t } = useTranslation()
  const [status, setStatus] = useState(null)
  const [configStatus, setConfigStatus] = useState(null)
  const [draftConfig, setDraftConfig] = useState(alertConfig)
  const formatStatus = (value) => {
    if (!value) return ''
    const fallback = value.charAt(0).toUpperCase() + value.slice(1)
    return t(`common.status.${value}`, { defaultValue: fallback })
  }

  const formatLabel = (value = '') => value.replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase())

  const getAlertTypeLabel = useCallback(
    (value) => t(`settings.alerts.types.${value}`, { defaultValue: formatLabel(value) }),
    [t],
  )

  const getDeviceTypeLabel = useCallback(
    (value) => t(`devices.types.${value}`, { defaultValue: formatLabel(value) }),
    [t],
  )

  const getMetricLabel = useCallback(
    (value) => t(`settings.alerts.metrics.${value}`, { defaultValue: formatLabel(value) }),
    [t],
  )

  const getBoundLabel = useCallback(
    (value) => t(`settings.alerts.bounds.${value}`, { defaultValue: formatLabel(value) }),
    [t],
  )

  useEffect(() => {
    setDraftConfig(alertConfig)
  }, [alertConfig])

  const handleThresholdChange = (deviceType, metric, field, value) => {
    setDraftConfig((prev) => {
      if (!prev) return prev
      const parsed = value === '' ? null : Number(value)
      const nextValue = parsed === null || Number.isNaN(parsed)
        ? prev.thresholds[deviceType][metric][field]
        : parsed
      return {
        ...prev,
        thresholds: {
          ...prev.thresholds,
          [deviceType]: {
            ...prev.thresholds[deviceType],
            [metric]: {
              ...prev.thresholds[deviceType][metric],
              [field]: nextValue,
            },
          },
        },
      }
    })
  }

  const handleToggleAlertType = (typeKey, checked) => {
    setDraftConfig((prev) => {
      if (!prev) return prev
      return {
        ...prev,
        enabledTypes: {
          ...prev.enabledTypes,
          [typeKey]: checked,
        },
      }
    })
  }

  const handleRoutingChange = (routeId, field, value) => {
    setDraftConfig((prev) => {
      if (!prev) return prev
      return {
        ...prev,
        routingRules: prev.routingRules.map((rule) =>
          rule.id === routeId
            ? {
                ...rule,
                [field]: value
                  .split(',')
                  .map((entry) => entry.trim())
                  .filter(Boolean),
              }
            : rule,
        ),
      }
    })
  }

  const handleEscalationChange = (policyId, field, value) => {
    setDraftConfig((prev) => {
      if (!prev) return prev
      return {
        ...prev,
        escalationPolicies: prev.escalationPolicies.map((policy) =>
          policy.id === policyId
            ? {
                ...policy,
                [field]: field === 'escalateAfterMinutes'
                  ? (() => {
                      const parsed = Number(value)
                      return Number.isNaN(parsed) ? policy.escalateAfterMinutes : parsed
                    })()
                  : value
                      .split(',')
                      .map((entry) => entry.trim())
                      .filter(Boolean),
              }
            : policy,
        ),
      }
    })
  }

  const handleSaveAlertConfig = async () => {
    if (!draftConfig) return
    await updateAlertConfig(draftConfig)
    setConfigStatus(
      t('settings.alerts.saved', {
        defaultValue: 'Alert configuration saved successfully.',
      }),
    )
    setTimeout(() => setConfigStatus(null), 2500)
  }

  const handleRefresh = async () => {
    setStatus(t('settings.status.refreshing', { defaultValue: 'Refreshing data...' }))
    await refresh()
    setTimeout(() => setStatus(null), 2000)
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">
          {t('settings.title', { defaultValue: 'Settings' })}
        </h1>
        <p className="text-sm text-muted-foreground">
          {t('settings.subtitle', {
            defaultValue: 'Choose data sources, endpoints, and operational preferences.',
          })}
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>
              {t('settings.apiConfig.title', { defaultValue: 'API configuration' })}
            </CardTitle>
            <CardDescription>
              {t('settings.apiConfig.subtitle', { defaultValue: 'Switch between local, cloud, and mock APIs.' })}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>{t('settings.apiConfig.modeLabel', { defaultValue: 'Mode' })}</Label>
              <Select value={mode} onValueChange={setMode}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(apiModes).map(([key, config]) => (
                    <SelectItem key={key} value={key}>
                      {t(`settings.apiModes.${key}`, { defaultValue: config.label })}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>{t('settings.apiConfig.httpLabel', { defaultValue: 'HTTP Endpoint' })}</Label>
              <Input value={endpoints[mode].http} onChange={(event) => updateEndpoint(mode, { http: event.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>{t('settings.apiConfig.wsLabel', { defaultValue: 'WebSocket Endpoint' })}</Label>
              <Input value={endpoints[mode].ws} onChange={(event) => updateEndpoint(mode, { ws: event.target.value })} />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>
              {t('settings.connection.title', { defaultValue: 'Connection status' })}
            </CardTitle>
            <CardDescription>
              {t('settings.connection.subtitle', { defaultValue: 'Monitor reliability and reconnect as needed.' })}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between rounded-lg border px-3 py-2">
              <div>
                <p className="text-xs uppercase text-muted-foreground">
                  {t('settings.connection.realtimeLink', { defaultValue: 'Realtime link' })}
                </p>
                <p className="text-sm font-medium">{endpoints[mode].ws}</p>
              </div>
              <Badge variant={connectionStatus === 'connected' ? 'success' : 'secondary'}>
                {formatStatus(connectionStatus)}
              </Badge>
            </div>
            <div className="flex items-center justify-between rounded-lg border px-3 py-2">
              <div>
                <p className="text-xs uppercase text-muted-foreground">
                  {t('settings.connection.restEndpoint', { defaultValue: 'REST endpoint' })}
                </p>
                <p className="text-sm font-medium">{endpoints[mode].http}</p>
              </div>
              <Bolt className="h-5 w-5 text-primary" />
            </div>
            <Button className="w-full" variant="secondary" onClick={handleRefresh}>
              <RefreshCcw className="mr-2 h-4 w-4" />
              {t('settings.actions.reload', { defaultValue: 'Reload data' })}
            </Button>
            {status && <p className="text-xs text-muted-foreground">{status}</p>}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>
            {t('settings.alerts.title', { defaultValue: 'Alert automation' })}
          </CardTitle>
          <CardDescription>
            {t('settings.alerts.subtitle', {
              defaultValue: 'Enable alert types, routing rules, and escalation policies.',
            })}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {!draftConfig && (
            <p className="text-sm text-muted-foreground">
              {t('settings.alerts.loading', { defaultValue: 'Loading alert configuration...' })}
            </p>
          )}
          {draftConfig && (
            <>
              <div>
                <p className="text-xs uppercase text-muted-foreground">
                  {t('settings.alerts.types', { defaultValue: 'Alert types' })}
                </p>
                <div className="mt-3 grid gap-3 md:grid-cols-2">
                  {Object.entries(draftConfig.enabledTypes).map(([typeKey, enabled]) => (
                    <div key={typeKey} className="flex items-center justify-between rounded-lg border px-3 py-2">
                      <div>
                        <p className="text-sm font-medium capitalize">{getAlertTypeLabel(typeKey)}</p>
                        <p className="text-xs text-muted-foreground">
                          {t(`settings.alerts.typeDescriptions.${typeKey}`, {
                            defaultValue: 'Toggle alert generation for this condition.',
                          })}
                        </p>
                      </div>
                      <Switch checked={enabled} onCheckedChange={(checked) => handleToggleAlertType(typeKey, checked)} />
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <p className="text-xs uppercase text-muted-foreground">
                  {t('settings.alerts.routing', { defaultValue: 'Routing rules' })}
                </p>
                <div className="mt-3 space-y-3">
                  {(draftConfig.routingRules || []).map((rule) => (
                    <div key={rule.id} className="rounded-lg border p-4">
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-semibold">
                          {t(`alerts.severity.${rule.severity}`, {
                            defaultValue: formatLabel(rule.severity),
                          })}
                        </p>
                        <Badge variant={rule.severity === 'critical' ? 'destructive' : 'secondary'}>
                          {(rule.channels || []).join(', ') || t('settings.alerts.noChannels', { defaultValue: 'No channels' })}
                        </Badge>
                      </div>
                      <div className="mt-3 grid gap-3 md:grid-cols-2">
                        <div>
                          <Label>{t('settings.alerts.channels', { defaultValue: 'Channels' })}</Label>
                          <Input
                            value={(rule.channels || []).join(', ')}
                            onChange={(event) => handleRoutingChange(rule.id, 'channels', event.target.value)}
                          />
                        </div>
                        <div>
                          <Label>{t('settings.alerts.targets', { defaultValue: 'Targets' })}</Label>
                          <Input
                            value={(rule.targets || []).join(', ')}
                            onChange={(event) => handleRoutingChange(rule.id, 'targets', event.target.value)}
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <p className="text-xs uppercase text-muted-foreground">
                  {t('settings.alerts.escalation', { defaultValue: 'Escalation policies' })}
                </p>
                <div className="mt-3 space-y-3">
                  {(draftConfig.escalationPolicies || []).map((policy) => (
                    <div key={policy.id} className="rounded-lg border p-4">
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-semibold">
                          {t(`alerts.severity.${policy.severity}`, {
                            defaultValue: formatLabel(policy.severity),
                          })}
                        </p>
                        <Badge variant="outline">
                          {t('settings.alerts.escalateAfter', {
                            defaultValue: '{minutes} min',
                            values: { minutes: policy.escalateAfterMinutes },
                          })}
                        </Badge>
                      </div>
                      <div className="mt-3 grid gap-3 md:grid-cols-2">
                        <div>
                          <Label>{t('settings.alerts.minutes', { defaultValue: 'Minutes to escalate' })}</Label>
                          <Input
                            type="number"
                            min="1"
                            value={policy.escalateAfterMinutes}
                            onChange={(event) => handleEscalationChange(policy.id, 'escalateAfterMinutes', event.target.value)}
                          />
                        </div>
                        <div>
                          <Label>{t('settings.alerts.notify', { defaultValue: 'Notify roles' })}</Label>
                          <Input
                            value={(policy.notifyRoles || []).join(', ')}
                            onChange={(event) => handleEscalationChange(policy.id, 'notifyRoles', event.target.value)}
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <Button onClick={handleSaveAlertConfig} disabled={updatingConfig}>
                  {updatingConfig
                    ? t('common.saving', { defaultValue: 'Saving...' })
                    : t('settings.alerts.save', { defaultValue: 'Save alert rules' })}
                </Button>
                {configStatus && <p className="text-xs text-muted-foreground">{configStatus}</p>}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>
            {t('settings.alerts.thresholdsTitle', { defaultValue: 'Threshold configuration' })}
          </CardTitle>
          <CardDescription>
            {t('settings.alerts.thresholdsSubtitle', {
              defaultValue: 'Define acceptable operating ranges per device type.',
            })}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {!draftConfig && (
            <p className="text-sm text-muted-foreground">
              {t('settings.alerts.loading', { defaultValue: 'Loading alert configuration...' })}
            </p>
          )}
          {draftConfig &&
            Object.entries(draftConfig.thresholds).map(([deviceType, metrics]) => (
              <div key={deviceType} className="rounded-xl border p-4">
                <p className="text-sm font-semibold capitalize">{getDeviceTypeLabel(deviceType)}</p>
                <div className="mt-3 grid gap-3 md:grid-cols-2">
                  {Object.entries(metrics).map(([metric, bounds]) => (
                    <div key={metric} className="rounded-lg bg-muted/40 p-3">
                      <p className="text-xs uppercase text-muted-foreground">{getMetricLabel(metric)}</p>
                      <div className="mt-2 grid gap-2 sm:grid-cols-2">
                        {Object.entries(bounds).map(([boundKey, boundValue]) => (
                          <div key={boundKey}>
                            <Label>{getBoundLabel(boundKey)}</Label>
                            <Input
                              type="number"
                              value={boundValue}
                              onChange={(event) => handleThresholdChange(deviceType, metric, boundKey, event.target.value)}
                            />
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          {draftConfig && (
            <div className="flex flex-wrap items-center gap-3">
              <Button variant="outline" onClick={handleSaveAlertConfig} disabled={updatingConfig}>
                {updatingConfig
                  ? t('common.saving', { defaultValue: 'Saving...' })
                  : t('settings.alerts.saveThresholds', { defaultValue: 'Save thresholds' })}
              </Button>
              {configStatus && <p className="text-xs text-muted-foreground">{configStatus}</p>}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
