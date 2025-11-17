import { mockActivity, mockAlertConfig, mockAlerts, mockDevices, mockZones } from '@/data/mockData'
import { calculateDeviceStats, mergeZoneDeviceStats } from '@/lib/metrics'

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const randomLatency = () => 300 + Math.floor(Math.random() * 600)
const clone = (value) => JSON.parse(JSON.stringify(value))

const ALERT_TYPE_DEFAULTS = {
  device_offline: {
    severity: 'critical',
    title: 'Device offline',
  },
  threshold_violation: {
    severity: 'warning',
    title: 'Threshold violated',
  },
  energy_spike: {
    severity: 'critical',
    title: 'Energy spike detected',
  },
  maintenance_due: {
    severity: 'info',
    title: 'Maintenance due',
  },
  security_event: {
    severity: 'critical',
    title: 'Security event',
  },
}

const mockStore = {
  devices: clone(mockDevices),
  zones: clone(mockZones),
  activity: clone(mockActivity),
  alerts: clone(mockAlerts),
  alertConfig: clone(mockAlertConfig),
  alertHistory: [],
}

mockStore.alertHistory = mockStore.alerts
  .flatMap((alert) =>
    (alert.history || []).map((entry) => ({
      ...entry,
      alertId: alert.id,
      deviceId: alert.deviceId,
      deviceName: alert.deviceName,
      messageKey: entry.messageKey || null,
      messageValues: entry.messageValues || {},
    })),
  )
  .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))

const maxAlertHistory = 150

const ALERT_STATE_HISTORY_MESSAGES = {
  acknowledged: {
    messageKey: 'alerts.history.acknowledged',
    message: 'Acknowledged by {actor}',
  },
  resolved: {
    messageKey: 'alerts.history.resolved',
    message: 'Resolved by {actor}',
  },
}

function appendAlertHistory(alert, entry) {
  if (!alert.history) {
    alert.history = []
  }
  const normalized = {
    id: entry.id || `hist-${alert.id}-${Date.now()}`,
    state: entry.state || alert.state,
    message: entry.message || '',
    messageKey: entry.messageKey || null,
    messageValues: entry.messageValues || {},
    actor: entry.actor || 'system',
    timestamp: entry.timestamp || new Date().toISOString(),
  }
  alert.history.push(normalized)
  mockStore.alertHistory.unshift({
    ...normalized,
    alertId: alert.id,
    deviceId: alert.deviceId,
    deviceName: alert.deviceName,
  })
  mockStore.alertHistory = mockStore.alertHistory.slice(0, maxAlertHistory)
  return normalized
}

function findOpenAlert(deviceId, type, dedupKey) {
  return mockStore.alerts.find(
    (alert) =>
      alert.deviceId === deviceId &&
      alert.type === type &&
      alert.state !== 'resolved' &&
      (typeof dedupKey === 'undefined' || alert.dedupKey === dedupKey),
  )
}

function createAlertEntry(payload) {
  const now = new Date().toISOString()
  const defaults = ALERT_TYPE_DEFAULTS[payload.type] || {}
  const alert = {
    id: payload.id || `alert-${Date.now()}`,
    title: payload.title || defaults.title || 'System alert',
    titleKey: payload.titleKey || null,
    titleValues: payload.titleValues || {},
    message: payload.message || defaults.title || 'New alert',
    messageKey: payload.messageKey || null,
    messageValues: payload.messageValues || {},
    severity: payload.severity || defaults.severity || 'info',
    state: payload.state || 'active',
    type: payload.type || 'general',
    deviceId: payload.deviceId || null,
    deviceName: payload.deviceName || payload.deviceId || 'Unknown device',
    zone: payload.zone || null,
    unread: payload.unread ?? true,
    createdAt: payload.createdAt || now,
    updatedAt: payload.updatedAt || now,
    acknowledgedAt: payload.acknowledgedAt || null,
    resolvedAt: payload.resolvedAt || null,
    metadata: payload.metadata || {},
    history: payload.history ? clone(payload.history) : [],
    dedupKey: payload.dedupKey,
  }
  mockStore.alerts.unshift(alert)
  mockStore.alerts = mockStore.alerts.slice(0, 150)
  if (!payload.history?.length) {
    appendAlertHistory(alert, {
      state: alert.state,
      message: payload.historyMessage || alert.message,
      messageKey: payload.historyMessageKey || payload.messageKey || null,
      messageValues: payload.historyMessageValues || payload.messageValues || {},
      actor: payload.actor || 'system',
      timestamp: alert.createdAt,
    })
  } else {
    ;(payload.history || []).forEach((entry) => {
      appendAlertHistory(alert, entry)
    })
  }
  return alert
}

function upsertAlert(payload) {
  const dedupKey = payload.dedupKey
  const existing = payload.deviceId && payload.type ? findOpenAlert(payload.deviceId, payload.type, dedupKey) : null
  const updatedAt = new Date().toISOString()
  if (existing) {
    existing.title = payload.title || existing.title
    existing.titleKey = payload.titleKey || existing.titleKey
    existing.titleValues = payload.titleValues || existing.titleValues
    existing.message = payload.message || existing.message
    existing.messageKey = payload.messageKey || existing.messageKey
    existing.messageValues = payload.messageValues || existing.messageValues
    existing.severity = payload.severity || existing.severity
    existing.updatedAt = updatedAt
    existing.metadata = {
      ...existing.metadata,
      ...(payload.metadata || {}),
    }
    existing.unread = payload.unread ?? true
    appendAlertHistory(existing, {
      state: existing.state,
      message: payload.historyMessage || payload.message || 'Alert updated',
      messageKey: payload.historyMessageKey || payload.messageKey || null,
      messageValues: payload.historyMessageValues || payload.messageValues || {},
      actor: payload.actor || 'system',
    })
    return existing
  }
  return createAlertEntry({ ...payload, updatedAt })
}

function resolveAlertByType(deviceId, type, message, dedupKey, messageKey, messageValues) {
  const existing = findOpenAlert(deviceId, type, dedupKey)
  if (!existing) return null
  const now = new Date().toISOString()
  existing.state = 'resolved'
  existing.updatedAt = now
  existing.resolvedAt = now
  existing.unread = false
  appendAlertHistory(existing, {
    state: 'resolved',
    message: message || 'Condition recovered',
    messageKey: messageKey || null,
    messageValues: messageValues || {},
    actor: 'system',
  })
  return existing
}

function setAlertState(alertId, nextState, actor = 'operator') {
  const alert = mockStore.alerts.find((entry) => entry.id === alertId)
  if (!alert) {
    throw new Error('Alert not found')
  }
  const now = new Date().toISOString()
  alert.state = nextState
  alert.updatedAt = now
  if (nextState === 'acknowledged') {
    alert.acknowledgedAt = now
  }
  if (nextState === 'resolved') {
    alert.resolvedAt = now
  }
  alert.unread = nextState === 'active' ? alert.unread : false
  const template = ALERT_STATE_HISTORY_MESSAGES[nextState]
  const fallback = template?.message?.replace('{actor}', actor) || `${nextState.charAt(0).toUpperCase() + nextState.slice(1)} by ${actor}`
  appendAlertHistory(alert, {
    state: nextState,
    message: fallback,
    messageKey: template?.messageKey,
    messageValues: { actor },
    actor,
  })
  return alert
}

function markAlertAsRead(alertId) {
  const alert = mockStore.alerts.find((entry) => entry.id === alertId)
  if (!alert) {
    throw new Error('Alert not found')
  }
  alert.unread = false
  alert.updatedAt = new Date().toISOString()
  return alert
}

function evaluateAlertTriggers(device, changes = {}) {
  const { alertConfig } = mockStore
  if (!alertConfig) return
  const enabled = alertConfig.enabledTypes || {}
  const thresholds = alertConfig.thresholds?.[device.type] || {}

  if (enabled.device_offline) {
    if (!device.online) {
      upsertAlert({
        type: 'device_offline',
        severity: 'critical',
        title: `${device.name} offline`,
        titleKey: 'alerts.deviceOffline.title',
        titleValues: { device: device.name },
        message: `${device.name} has stopped responding.`,
        messageKey: 'alerts.deviceOffline.message',
        messageValues: { device: device.name },
        deviceId: device.id,
        deviceName: device.name,
        zone: device.zone,
        metadata: {
          offlineSince: device.lastUpdated,
        },
        historyMessage: 'Device reported offline',
        historyMessageKey: 'alerts.history.deviceOfflineTriggered',
        historyMessageValues: { device: device.name },
      })
    } else if (changes.online === true) {
      resolveAlertByType(
        device.id,
        'device_offline',
        `${device.name} is back online`,
        undefined,
        'alerts.deviceOffline.resolved',
        { device: device.name },
      )
    }
  }

  if (enabled.threshold_violation && thresholds.temperature) {
    const reading =
      typeof device.temperature === 'number'
        ? device.temperature
        : typeof device.currentTemperature === 'number'
          ? device.currentTemperature
          : null
    if (reading !== null) {
      const min = thresholds.temperature.min
      const max = thresholds.temperature.max
      if ((typeof min === 'number' && reading < min) || (typeof max === 'number' && reading > max)) {
        upsertAlert({
          type: 'threshold_violation',
          dedupKey: 'temperature',
          severity: reading > (max || reading) ? 'warning' : 'info',
          title: `${device.name} temperature drift`,
          titleKey: 'alerts.threshold.temperatureHigh.title',
          titleValues: { device: device.name },
          message: `${device.name} reading ${reading}°C (range ${min ?? '-'}-${max ?? '-'})`,
          messageKey: 'alerts.threshold.temperatureHigh.message',
          messageValues: { device: device.name, value: reading, min: min ?? '-', max: max ?? '-' },
          deviceId: device.id,
          deviceName: device.name,
          zone: device.zone,
          metadata: {
            metric: 'temperature',
            value: reading,
            range: { min, max },
          },
        })
      } else {
        resolveAlertByType(
          device.id,
          'threshold_violation',
          'Temperature back within range',
          'temperature',
          'alerts.threshold.temperatureResolved',
          { device: device.name },
        )
      }
    }
  }

  if (enabled.threshold_violation && thresholds.humidity && typeof device.humidity === 'number') {
    const min = thresholds.humidity.min
    const max = thresholds.humidity.max
    if ((typeof min === 'number' && device.humidity < min) || (typeof max === 'number' && device.humidity > max)) {
      upsertAlert({
        type: 'threshold_violation',
        dedupKey: 'humidity',
        severity: 'warning',
        title: `${device.name} humidity out of range`,
        titleKey: 'alerts.threshold.humidity.title',
        titleValues: { device: device.name },
        message: `${device.name} humidity ${device.humidity}% (range ${min ?? '-'}-${max ?? '-'})`,
        messageKey: 'alerts.threshold.humidity.message',
        messageValues: { device: device.name, value: device.humidity, min: min ?? '-', max: max ?? '-' },
        deviceId: device.id,
        deviceName: device.name,
        zone: device.zone,
        metadata: {
          metric: 'humidity',
          value: device.humidity,
          range: { min, max },
        },
      })
    } else {
      resolveAlertByType(
        device.id,
        'threshold_violation',
        'Humidity back within range',
        'humidity',
        'alerts.threshold.humidityResolved',
        { device: device.name },
      )
    }
  }

  if (enabled.energy_spike && typeof device.powerConsumption === 'number') {
    const limit = thresholds.power?.max || 2.5
    if (device.powerConsumption > limit * 1.2) {
      upsertAlert({
        type: 'energy_spike',
        severity: 'critical',
        title: `${device.name} energy spike`,
        titleKey: 'alerts.energySpike.title',
        titleValues: { device: device.name },
        message: `${device.name} consuming ${device.powerConsumption.toFixed(2)}kW (limit ${limit}kW)`,
        messageKey: 'alerts.energySpike.message',
        messageValues: { device: device.name, limit, value: device.powerConsumption },
        deviceId: device.id,
        deviceName: device.name,
        zone: device.zone,
        metadata: {
          limit,
          value: device.powerConsumption,
        },
      })
    } else {
      resolveAlertByType(
        device.id,
        'energy_spike',
        'Energy usage normalized',
        undefined,
        'alerts.energySpike.resolved',
        { device: device.name },
      )
    }
  }

  if (enabled.security_event && Object.prototype.hasOwnProperty.call(changes, 'doorOpen')) {
    if (changes.doorOpen) {
      upsertAlert({
        type: 'security_event',
        severity: 'critical',
        title: `${device.name} detected access`,
        titleKey: 'alerts.securityEvent.title',
        titleValues: { device: device.name },
        message: 'Door or window sensor triggered outside schedule.',
        messageKey: 'alerts.securityEvent.message',
        messageValues: { device: device.name },
        deviceId: device.id,
        deviceName: device.name,
        zone: device.zone,
        metadata: {
          metric: 'door',
        },
      })
    } else {
      resolveAlertByType(
        device.id,
        'security_event',
        'Entry point secured',
        undefined,
        'alerts.securityEvent.resolved',
        { device: device.name },
      )
    }
  }
}

function generateRandomAlertFromDevice() {
  const enabledTypes = Object.entries(mockStore.alertConfig.enabledTypes || {}).filter(([, enabled]) => enabled)
  if (!enabledTypes.length) return null
  const device = mockStore.devices[Math.floor(Math.random() * mockStore.devices.length)]
  const [type] = enabledTypes[Math.floor(Math.random() * enabledTypes.length)]
  const now = new Date().toISOString()
  const payload = {
    type,
    deviceId: device?.id,
    deviceName: device?.name,
    zone: device?.zone,
    createdAt: now,
    updatedAt: now,
  }
  switch (type) {
    case 'device_offline':
      payload.title = `${device.name} offline`
      payload.titleKey = 'alerts.deviceOffline.title'
      payload.titleValues = { device: device.name }
      payload.message = `${device.name} lost connectivity at ${new Date().toLocaleTimeString()}`
      payload.messageKey = 'alerts.deviceOffline.message'
      payload.messageValues = { device: device.name }
      payload.severity = 'critical'
      payload.metadata = { offlineSince: now }
      break
    case 'threshold_violation':
      payload.title = `${device.name} temp warning`
      payload.titleKey = 'alerts.threshold.temperatureHigh.title'
      payload.titleValues = { device: device.name }
      payload.message = `${device.name} temperature drift detected.`
      payload.messageKey = 'alerts.threshold.temperatureHigh.message'
      payload.messageValues = { device: device.name }
      payload.severity = 'warning'
      payload.metadata = { metric: 'temperature' }
      payload.dedupKey = 'temperature'
      break
    case 'energy_spike':
      payload.title = `${device.name} energy spike`
      payload.titleKey = 'alerts.energySpike.title'
      payload.titleValues = { device: device.name }
      payload.message = `${device.name} energy usage exceeded expected baseline.`
      payload.messageKey = 'alerts.energySpike.message'
      payload.messageValues = { device: device.name }
      payload.severity = 'critical'
      break
    case 'maintenance_due':
      payload.title = `${device.name} maintenance due`
      payload.titleKey = 'alerts.maintenanceDue.title'
      payload.titleValues = { device: device.name }
      payload.message = `${device.name} requires maintenance check.`
      payload.messageKey = 'alerts.maintenanceDue.message'
      payload.messageValues = { device: device.name }
      payload.severity = 'info'
      break
    case 'security_event':
      payload.title = `${device.name} security event`
      payload.titleKey = 'alerts.securityEvent.title'
      payload.titleValues = { device: device.name }
      payload.message = 'Unauthorized access detected.'
      payload.messageKey = 'alerts.securityEvent.message'
      payload.messageValues = { device: device.name }
      payload.severity = 'critical'
      break
    default:
      payload.title = 'System alert'
      payload.message = 'New alert generated.'
      payload.severity = 'info'
      break
  }
  const alert = upsertAlert(payload)
  return clone(alert)
}

const API_MODES = {
  mock: {
    label: 'Mock API',
    http: 'mock://local',
    ws: 'mock-ws',
  },
  local: {
    label: 'Local API',
    http: 'http://localhost:3000',
    ws: 'ws://localhost:3000/ws',
  },
  cloud: {
    label: 'Cloud API',
    http: 'https://api.example.com',
    ws: 'wss://api.example.com/ws',
  },
}

function applyDeviceChanges(deviceId, changes, actor = 'system') {
  const device = mockStore.devices.find((entry) => entry.id === deviceId)
  if (!device) {
    throw new Error('Device not found')
  }

  Object.assign(device, changes, { lastUpdated: new Date().toISOString() })
  persistActivity({
    deviceId,
    deviceName: device.name,
    description: describeChanges(device.name, changes, actor),
    changes,
  })
  evaluateAlertTriggers(device, changes)
  syncZones()
  return device
}

function persistActivity({ deviceId, deviceName, description, changes }) {
  mockStore.activity.unshift({
    id: `evt-${Date.now()}`,
    deviceId,
    deviceName,
    description,
    timestamp: new Date().toISOString(),
    changes,
  })
  mockStore.activity = mockStore.activity.slice(0, 25)
}

function describeChanges(name, changes, actor) {
  if (changes.state) {
    return `${name} turned ${changes.state}`
  }
  if (typeof changes.targetTemperature !== 'undefined') {
    return `${actor === 'system' ? 'Auto' : 'Manual'} target set to ${changes.targetTemperature}°C`
  }
  if (typeof changes.brightness !== 'undefined') {
    return `Brightness set to ${changes.brightness}%`
  }
  if (typeof changes.mode !== 'undefined') {
    return `Mode changed to ${changes.mode}`
  }
  if (typeof changes.humidity !== 'undefined') {
    return `Humidity reading updated`
  }
  return 'Device updated'
}

function syncZones() {
  mockStore.zones = mergeZoneDeviceStats(mockZones, mockStore.devices)
}

syncZones()

class MockApiClient {
  async getDevices() {
    await wait(randomLatency())
    return clone(mockStore.devices)
  }

  async getDevice(deviceId) {
    await wait(randomLatency())
    const device = mockStore.devices.find((entry) => entry.id === deviceId)
    if (!device) throw new Error('Device not found')
    return clone(device)
  }

  async updateDevice(deviceId, updates) {
    await wait(randomLatency())
    const updated = applyDeviceChanges(deviceId, updates, 'operator')
    return clone(updated)
  }

  async getZones() {
    await wait(randomLatency())
    return clone(mockStore.zones)
  }

  async toggleZone(zoneId, turnOn) {
    await wait(randomLatency())
    mockStore.devices
      .filter((device) => device.zone === zoneId)
      .forEach((device) => {
        applyDeviceChanges(device.id, { state: turnOn ? 'on' : 'off' }, 'zone-control')
      })
    return this.getZones()
  }

  async getRecentActivity(limit = 10) {
    await wait(randomLatency())
    return clone(mockStore.activity.slice(0, limit))
  }

  async getStats() {
    await wait(randomLatency())
    return calculateDeviceStats(mockStore.devices)
  }

  async getAlerts(filters = {}) {
    await wait(randomLatency())
    const { severity, state } = filters
    let alerts = [...mockStore.alerts]
    if (severity && severity !== 'all') {
      const severityList = Array.isArray(severity) ? severity : [severity]
      alerts = alerts.filter((alert) => severityList.includes(alert.severity))
    }
    if (state && state !== 'all') {
      const states = Array.isArray(state) ? state : [state]
      alerts = alerts.filter((alert) => states.includes(alert.state))
    }
    return clone(alerts)
  }

  async getAlert(alertId) {
    await wait(randomLatency())
    const alert = mockStore.alerts.find((entry) => entry.id === alertId)
    if (!alert) {
      throw new Error('Alert not found')
    }
    return clone(alert)
  }

  async acknowledgeAlert(alertId, actor = 'operator') {
    await wait(randomLatency())
    const alert = setAlertState(alertId, 'acknowledged', actor)
    return clone(alert)
  }

  async resolveAlert(alertId, actor = 'operator') {
    await wait(randomLatency())
    const alert = setAlertState(alertId, 'resolved', actor)
    return clone(alert)
  }

  async markAlertRead(alertId) {
    await wait(randomLatency())
    const alert = markAlertAsRead(alertId)
    return clone(alert)
  }

  async markAllAlertsRead() {
    await wait(randomLatency())
    mockStore.alerts.forEach((alert) => {
      alert.unread = false
    })
    return { success: true }
  }

  async getAlertHistory(alertId) {
    await wait(randomLatency())
    if (alertId) {
      return clone(mockStore.alertHistory.filter((entry) => entry.alertId === alertId))
    }
    return clone(mockStore.alertHistory)
  }

  async getAlertConfig() {
    await wait(randomLatency())
    return clone(mockStore.alertConfig)
  }

  async updateAlertConfig(partial) {
    await wait(randomLatency())
    mockStore.alertConfig = {
      ...mockStore.alertConfig,
      ...partial,
      thresholds: {
        ...mockStore.alertConfig.thresholds,
        ...(partial?.thresholds || {}),
      },
      enabledTypes: {
        ...mockStore.alertConfig.enabledTypes,
        ...(partial?.enabledTypes || {}),
      },
      routingRules: partial?.routingRules || mockStore.alertConfig.routingRules,
      escalationPolicies: partial?.escalationPolicies || mockStore.alertConfig.escalationPolicies,
    }
    return clone(mockStore.alertConfig)
  }

  async generateRandomAlert() {
    const shouldGenerate = Math.random() > 0.6
    if (!shouldGenerate) return null
    await wait(50)
    const alert = generateRandomAlertFromDevice()
    return alert
  }
}

class RestApiClient {
  constructor(baseUrl) {
    this.baseUrl = baseUrl?.replace(/\/$/, '') || ''
  }

  async request(path, options = {}) {
    if (!this.baseUrl) {
      throw new Error('API endpoint missing')
    }
    const url = `${this.baseUrl}${path}`
    const response = await fetch(url, {
      headers: {
        'Content-Type': 'application/json',
        ...(options.headers || {}),
      },
      ...options,
    })
    if (!response.ok) {
      const message = await response.text()
      throw new Error(message || 'API request failed')
    }
    if (response.status === 204) return null
    return response.json()
  }

  getDevices() {
    return this.request('/api/devices')
  }

  getDevice(deviceId) {
    return this.request(`/api/devices/${deviceId}`)
  }

  updateDevice(deviceId, updates) {
    return this.request(`/api/devices/${deviceId}`, {
      method: 'PATCH',
      body: JSON.stringify(updates),
    })
  }

  getZones() {
    return this.request('/api/zones')
  }

  toggleZone(zoneId, turnOn) {
    return this.request(`/api/zones/${zoneId}/state`, {
      method: 'POST',
      body: JSON.stringify({ state: turnOn ? 'on' : 'off' }),
    })
  }

  getRecentActivity(limit = 10) {
    return this.request(`/api/activity?limit=${limit}`)
  }

  getStats() {
    return this.request('/api/stats')
  }

  getAlerts(filters = {}) {
    const params = new URLSearchParams()
    if (filters.severity && filters.severity !== 'all') {
      params.set('severity', Array.isArray(filters.severity) ? filters.severity.join(',') : filters.severity)
    }
    if (filters.state && filters.state !== 'all') {
      params.set('state', Array.isArray(filters.state) ? filters.state.join(',') : filters.state)
    }
    const query = params.toString()
    return this.request(`/api/alerts${query ? `?${query}` : ''}`)
  }

  getAlert(alertId) {
    return this.request(`/api/alerts/${alertId}`)
  }

  acknowledgeAlert(alertId) {
    return this.request(`/api/alerts/${alertId}/acknowledge`, { method: 'POST' })
  }

  resolveAlert(alertId) {
    return this.request(`/api/alerts/${alertId}/resolve`, { method: 'POST' })
  }

  markAlertRead(alertId) {
    return this.request(`/api/alerts/${alertId}/read`, { method: 'POST' })
  }

  markAllAlertsRead() {
    return this.request('/api/alerts/read-all', { method: 'POST' })
  }

  getAlertHistory(alertId) {
    if (alertId) {
      return this.request(`/api/alerts/${alertId}/history`)
    }
    return this.request('/api/alerts/history')
  }

  getAlertConfig() {
    return this.request('/api/alerts/config')
  }

  updateAlertConfig(partial) {
    return this.request('/api/alerts/config', {
      method: 'PATCH',
      body: JSON.stringify(partial),
    })
  }
}

const sharedMockClient = new MockApiClient()

export function createApiClient({ mode, endpoints }) {
  if (mode === 'mock') {
    return sharedMockClient
  }
  return new RestApiClient(endpoints?.http)
}

export function generateMockRealtimeMessage() {
  const onlineDevices = mockStore.devices.filter((device) => device.online)
  if (!onlineDevices.length) return null
  const device = onlineDevices[Math.floor(Math.random() * onlineDevices.length)]
  const changes = {}
  if (device.type === 'light') {
    changes.brightness = Math.min(100, Math.max(0, (device.brightness || 0) + (Math.random() > 0.5 ? 10 : -10)))
    changes.state = changes.brightness > 5 ? 'on' : 'off'
  } else if (typeof device.temperature === 'number' || typeof device.currentTemperature === 'number') {
    const original = typeof device.temperature === 'number' ? device.temperature : device.currentTemperature
    const delta = (Math.random() > 0.5 ? 1 : -1) * (Math.random() * 1.5)
    const next = Math.round((original + delta) * 10) / 10
    if (typeof device.temperature === 'number') {
      changes.temperature = next
    } else {
      changes.currentTemperature = next
    }
    if (typeof device.humidity === 'number') {
      changes.humidity = Math.max(30, Math.min(70, device.humidity + (Math.random() > 0.5 ? 1 : -1)))
    }
  } else if (device.type === 'fan') {
    const speeds = [0, 1, 2, 3]
    changes.speed = speeds[Math.floor(Math.random() * speeds.length)]
    changes.state = changes.speed > 0 ? 'on' : 'off'
  } else {
    changes.state = device.state === 'on' ? 'off' : 'on'
  }
  const updatedDevice = applyDeviceChanges(device.id, changes, 'telemetry')
  const description = describeChanges(updatedDevice.name, changes, 'telemetry')
  return {
    type: 'device_update',
    deviceId: device.id,
    device: clone(updatedDevice),
    description,
    changes,
  }
}

export { API_MODES }
