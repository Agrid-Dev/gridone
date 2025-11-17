import { mockActivity, mockDevices, mockZones } from '@/data/mockData'
import { calculateDeviceStats, mergeZoneDeviceStats } from '@/lib/metrics'

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const randomLatency = () => 300 + Math.floor(Math.random() * 600)
const clone = (value) => JSON.parse(JSON.stringify(value))

const mockStore = {
  devices: clone(mockDevices),
  zones: clone(mockZones),
  activity: clone(mockActivity),
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
