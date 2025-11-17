import { useState } from 'react'
import { Bolt, RefreshCcw } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useApiConfig } from '@/contexts/ApiConfigContext'
import { useDeviceData } from '@/contexts/DeviceDataContext'
import { useTranslation } from '@/contexts/LanguageContext'

export function SettingsPage() {
  const { mode, setMode, endpoints, updateEndpoint, apiModes } = useApiConfig()
  const { refresh, connectionStatus } = useDeviceData()
  const { t } = useTranslation()
  const [status, setStatus] = useState(null)
  const formatStatus = (value) => {
    if (!value) return ''
    const fallback = value.charAt(0).toUpperCase() + value.slice(1)
    return t(`common.status.${value}`, { defaultValue: fallback })
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
    </div>
  )
}
