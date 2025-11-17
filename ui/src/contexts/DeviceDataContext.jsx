import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { useApiConfig } from '@/contexts/ApiConfigContext'
import { calculateDeviceStats, mergeZoneDeviceStats } from '@/lib/metrics'
import { useRealtimeDeviceUpdates } from '@/hooks/useRealtimeDeviceUpdates'

const DeviceDataContext = createContext()

export function DeviceDataProvider({ children }) {
  const { apiClient, mode, activeEndpoint } = useApiConfig()
  const [devices, setDevices] = useState([])
  const [zones, setZones] = useState([])
  const [activity, setActivity] = useState([])
  const [stats, setStats] = useState({ total: 0, online: 0, offline: 0, byType: {}, alerts: 0, byZone: {} })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [connectionStatus, setConnectionStatus] = useState('disconnected')

  const refresh = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const [deviceResponse, zoneResponse, activityResponse] = await Promise.all([
        apiClient.getDevices(),
        apiClient.getZones(),
        apiClient.getRecentActivity ? apiClient.getRecentActivity() : [],
      ])
      setDevices(deviceResponse)
      setZones(mergeZoneDeviceStats(zoneResponse || [], deviceResponse))
      setActivity(activityResponse || [])
      setStats(calculateDeviceStats(deviceResponse))
    } catch (err) {
      console.error(err)
      setError(err.message || 'Unable to load data')
    } finally {
      setLoading(false)
    }
  }, [apiClient])

  useEffect(() => {
    refresh()
  }, [refresh])

  const handleRealtimeUpdate = useCallback((message) => {
    if (message?.type !== 'device_update') return
    setDevices((current) => {
      const nextDevices = current.map((device) => {
        if (device.id !== message.deviceId) return device
        const patch = message.device ? { ...device, ...message.device } : { ...device, ...message.changes }
        return { ...patch, lastUpdated: new Date().toISOString() }
      })
      setStats(calculateDeviceStats(nextDevices))
      setZones((prevZones) => mergeZoneDeviceStats(prevZones || [], nextDevices))
      setActivity((prev) => [
        {
          id: `evt-${Date.now()}`,
          deviceId: message.deviceId,
          deviceName: message.device?.name || message.deviceId,
          description: message.description || 'Real-time update received',
          timestamp: new Date().toISOString(),
          changes: message.changes,
        },
        ...prev,
      ].slice(0, 20))
      return nextDevices
    })
  }, [])

  useRealtimeDeviceUpdates({
    mode,
    wsUrl: activeEndpoint?.ws,
    onMessage: handleRealtimeUpdate,
    onStatusChange: setConnectionStatus,
  })

  const updateDevice = useCallback(
    async (deviceId, updates) => {
      const updated = await apiClient.updateDevice(deviceId, updates)
      setDevices((current) => {
        const nextDevices = current.map((device) => (device.id === deviceId ? { ...device, ...updated } : device))
        setStats(calculateDeviceStats(nextDevices))
        setZones((prevZones) => mergeZoneDeviceStats(prevZones, nextDevices))
        return nextDevices
      })
      setActivity((prev) => [
        {
          id: `evt-${Date.now()}`,
          deviceId,
          deviceName: updated.name,
          description: 'Device updated',
          timestamp: new Date().toISOString(),
          changes: updates,
        },
        ...prev,
      ].slice(0, 20))
      return updated
    },
    [apiClient],
  )

  const toggleZoneDevices = useCallback(
    async (zoneId, turnOn) => {
      await apiClient.toggleZone(zoneId, turnOn)
      refresh()
    },
    [apiClient, refresh],
  )

  const value = useMemo(
    () => ({
      devices,
      zones,
      stats,
      activity,
      loading,
      error,
      refresh,
      updateDevice,
      toggleZoneDevices,
      connectionStatus,
    }),
    [devices, zones, stats, activity, loading, error, refresh, updateDevice, toggleZoneDevices, connectionStatus],
  )

  return <DeviceDataContext.Provider value={value}>{children}</DeviceDataContext.Provider>
}

export function useDeviceData() {
  const ctx = useContext(DeviceDataContext)
  if (!ctx) {
    throw new Error('useDeviceData must be used within DeviceDataProvider')
  }
  return ctx
}
