import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { useApiConfig } from '@/contexts/ApiConfigContext'

export const ALERT_SEVERITIES = ['critical', 'warning', 'info']
export const ALERT_STATES = ['active', 'acknowledged', 'resolved']

const AlertsContext = createContext()

export function AlertsProvider({ children }) {
  const { apiClient, mode } = useApiConfig()
  const [alerts, setAlerts] = useState([])
  const [history, setHistory] = useState([])
  const [alertConfig, setAlertConfig] = useState(null)
  const [filters, setFilters] = useState({ severity: 'all', state: 'active' })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [updatingConfig, setUpdatingConfig] = useState(false)

  const matchesFilters = useCallback(
    (alert) => {
      if (!alert) return false
      const severityFilter = filters.severity
      if (severityFilter && severityFilter !== 'all') {
        const severityList = Array.isArray(severityFilter) ? severityFilter : [severityFilter]
        if (!severityList.includes(alert.severity)) {
          return false
        }
      }
      const stateFilter = filters.state
      if (stateFilter && stateFilter !== 'all') {
        const states = Array.isArray(stateFilter) ? stateFilter : [stateFilter]
        if (!states.includes(alert.state)) {
          return false
        }
      }
      return true
    },
    [filters],
  )

  const refreshAlerts = useCallback(async () => {
    if (typeof apiClient.getAlerts !== 'function') {
      setLoading(false)
      setAlerts([])
      return
    }
    try {
      setLoading(true)
      setError(null)
      const response = await apiClient.getAlerts(filters)
      setAlerts(response || [])
    } catch (err) {
      console.error(err)
      setError({
        message: err.message || 'Unable to load alerts',
        messageKey: 'alerts.errors.load',
      })
    } finally {
      setLoading(false)
    }
  }, [apiClient, filters])

  const refreshHistory = useCallback(async () => {
    if (typeof apiClient.getAlertHistory !== 'function') return
    try {
      const response = await apiClient.getAlertHistory()
      setHistory(response || [])
    } catch (err) {
      console.error(err)
    }
  }, [apiClient])

  const refreshConfig = useCallback(async () => {
    if (typeof apiClient.getAlertConfig !== 'function') return
    try {
      const response = await apiClient.getAlertConfig()
      setAlertConfig(response)
    } catch (err) {
      console.error(err)
    }
  }, [apiClient])

  useEffect(() => {
    refreshAlerts()
  }, [refreshAlerts])

  useEffect(() => {
    refreshHistory()
  }, [refreshHistory])

  useEffect(() => {
    refreshConfig()
  }, [refreshConfig])

  useEffect(() => {
    if (typeof apiClient.generateRandomAlert !== 'function') return undefined
    let timeoutId
    let cancelled = false

    const schedule = () => {
      timeoutId = setTimeout(async () => {
        try {
          const generated = await apiClient.generateRandomAlert()
          if (cancelled || !generated) {
            schedule()
            return
          }
          refreshHistory()
          if (matchesFilters(generated)) {
            setAlerts((current) => {
              const withoutDuplicate = current.filter((alert) => alert.id !== generated.id)
              return [generated, ...withoutDuplicate]
            })
          }
        } catch (err) {
          console.error(err)
        } finally {
          if (!cancelled) {
            schedule()
          }
        }
      }, 12000 + Math.random() * 6000)
    }

    schedule()
    return () => {
      cancelled = true
      if (timeoutId) {
        clearTimeout(timeoutId)
      }
    }
  }, [apiClient, matchesFilters, refreshHistory, mode])

  const acknowledgeAlert = useCallback(
    async (alertId) => {
      if (typeof apiClient.acknowledgeAlert !== 'function') return null
      const updated = await apiClient.acknowledgeAlert(alertId)
      setAlerts((current) => current.map((alert) => (alert.id === alertId ? updated : alert)))
      refreshHistory()
      return updated
    },
    [apiClient, refreshHistory],
  )

  const resolveAlert = useCallback(
    async (alertId) => {
      if (typeof apiClient.resolveAlert !== 'function') return null
      const updated = await apiClient.resolveAlert(alertId)
      setAlerts((current) => current.map((alert) => (alert.id === alertId ? updated : alert)))
      refreshHistory()
      return updated
    },
    [apiClient, refreshHistory],
  )

  const markAlertRead = useCallback(
    async (alertId) => {
      if (typeof apiClient.markAlertRead !== 'function') return null
      const updated = await apiClient.markAlertRead(alertId)
      setAlerts((current) => current.map((alert) => (alert.id === alertId ? updated : alert)))
      return updated
    },
    [apiClient],
  )

  const markAllAsRead = useCallback(async () => {
    if (typeof apiClient.markAllAlertsRead !== 'function') return null
    await apiClient.markAllAlertsRead()
    setAlerts((current) => current.map((alert) => ({ ...alert, unread: false })))
    return true
  }, [apiClient])

  const updateAlertConfig = useCallback(
    async (nextConfig) => {
      if (typeof apiClient.updateAlertConfig !== 'function') return null
      try {
        setUpdatingConfig(true)
        const response = await apiClient.updateAlertConfig(nextConfig)
        setAlertConfig(response)
        return response
      } finally {
        setUpdatingConfig(false)
      }
    },
    [apiClient],
  )

  const { severityCounts, stateCounts } = useMemo(() => {
    const severityBuckets = {
      critical: 0,
      warning: 0,
      info: 0,
    }
    const stateBuckets = {
      active: 0,
      acknowledged: 0,
      resolved: 0,
    }
    alerts.forEach((alert) => {
      severityBuckets[alert.severity] = (severityBuckets[alert.severity] || 0) + 1
      stateBuckets[alert.state] = (stateBuckets[alert.state] || 0) + 1
    })
    return { severityCounts: severityBuckets, stateCounts: stateBuckets }
  }, [alerts])

  const sortedAlerts = useMemo(
    () => [...alerts].sort((a, b) => new Date(b.updatedAt || b.createdAt) - new Date(a.updatedAt || a.createdAt)),
    [alerts],
  )

  const recentAlerts = useMemo(() => sortedAlerts.slice(0, 5), [sortedAlerts])

  const unreadCount = useMemo(() => alerts.filter((alert) => alert.unread && alert.state !== 'resolved').length, [alerts])

  const activeCount = useMemo(() => alerts.filter((alert) => alert.state === 'active').length, [alerts])

  const setSeverityFilter = useCallback((value) => {
    setFilters((prev) => ({ ...prev, severity: value }))
  }, [])

  const setStateFilter = useCallback((value) => {
    setFilters((prev) => ({ ...prev, state: value }))
  }, [])

  const value = {
    alerts: sortedAlerts,
    recentAlerts,
    history,
    alertConfig,
    filters,
    setFilters,
    setSeverityFilter,
    setStateFilter,
    loading,
    error,
    refreshAlerts,
    refreshHistory,
    acknowledgeAlert,
    resolveAlert,
    markAlertRead,
    markAllAsRead,
    updateAlertConfig,
    updatingConfig,
    unreadCount,
    activeCount,
    severityCounts,
    stateCounts,
  }

  return <AlertsContext.Provider value={value}>{children}</AlertsContext.Provider>
}

export function useAlerts() {
  const ctx = useContext(AlertsContext)
  if (!ctx) {
    throw new Error('useAlerts must be used within AlertsProvider')
  }
  return ctx
}
