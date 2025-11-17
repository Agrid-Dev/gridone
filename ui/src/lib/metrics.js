export function calculateDeviceStats(devices = []) {
  const total = devices.length
  const online = devices.filter((device) => device.online).length
  const byType = devices.reduce((acc, device) => {
    acc[device.type] = (acc[device.type] || 0) + 1
    return acc
  }, {})
  const byZone = devices.reduce((acc, device) => {
    acc[device.zone] = (acc[device.zone] || 0) + 1
    return acc
  }, {})

  const offline = total - online
  const alerts = devices.filter((device) => {
    const isOffline = !device.online
    const tempDelta =
      device.temperature && device.targetTemperature
        ? Math.abs(device.temperature - device.targetTemperature)
        : 0
    const needsAttention = tempDelta > 3 || device.state === 'off'
    return isOffline || needsAttention
  }).length

  return {
    total,
    online,
    offline,
    byType,
    byZone,
    alerts,
  }
}

export function mergeZoneDeviceStats(zones = [], devices = []) {
  const zoneAggregates = devices.reduce((acc, device) => {
    if (!acc[device.zone]) {
      acc[device.zone] = {
        count: 0,
        active: 0,
        temperatureSum: 0,
        temperatureSamples: 0,
        energy: 0,
      }
    }
    const bucket = acc[device.zone]
    bucket.count += 1
    if (device.state === 'on' && device.online) {
      bucket.active += 1
    }
    if (typeof device.temperature === 'number') {
      bucket.temperatureSum += device.temperature
      bucket.temperatureSamples += 1
    }
    if (typeof device.powerConsumption === 'number') {
      bucket.energy += device.powerConsumption
    }
    return acc
  }, {})

  return zones.map((zone) => {
    const bucket = zoneAggregates[zone.id] || {
      count: 0,
      active: 0,
      temperatureSum: 0,
      temperatureSamples: 0,
      energy: 0,
    }
    return {
      ...zone,
      deviceCount: bucket.count || zone.deviceCount || 0,
      activeDevices: bucket.active || zone.activeDevices || 0,
      avgTemperature:
        bucket.temperatureSamples > 0
          ? Math.round((bucket.temperatureSum / bucket.temperatureSamples) * 10) / 10
          : zone.avgTemperature || null,
      energyConsumption: bucket.energy || zone.energyConsumption || 0,
    }
  })
}
