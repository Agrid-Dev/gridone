import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  AlertTriangle,
  Box,
  ClipboardPaste,
  Copy,
  Layers,
  Move3D,
  PenSquare,
  Pointer,
  RotateCcw,
  Ruler,
  Square,
  Thermometer,
  Trash2,
  ZoomIn,
  ZoomOut,
  ChevronUp,
  ChevronDown,
  Plus,
  List,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useDeviceData } from '@/contexts/DeviceDataContext'
import { useTranslation } from '@/contexts/LanguageContext'
import { cn } from '@/lib/utils'
import { defaultFloors, defaultZoneLayouts } from '@/data/zoneLayout'

const ISO_ANGLE = Math.PI / 6
const cos30 = Math.cos(ISO_ANGLE)
const sin30 = Math.sin(ISO_ANGLE)
const VIEWBOX = { minX: -420, minY: -340, width: 900, height: 700 }
const GRID_SIZE = 0.5
const FLOOR_GAP = 0.45
const UNIT_SYSTEMS = {
  metric: { id: 'metric', label: 'm', ratio: 1, longLabel: 'mètres' },
  imperial: { id: 'imperial', label: 'ft', ratio: 3.28084, longLabel: 'feet' },
}
const VIEW_ROTATIONS = {
  'front-left': { id: 'front-left', label: 'Front gauche', degrees: 45, topView: false },
  'front-right': { id: 'front-right', label: 'Front droit', degrees: -45, topView: false },
  'back-left': { id: 'back-left', label: 'Arrière gauche', degrees: 135, topView: false },
  'back-right': { id: 'back-right', label: 'Arrière droit', degrees: -135, topView: false },
  top: { id: 'top', label: 'Vue plan', degrees: 45, topView: true },
}
const TOOLBAR_TOOLS = [
  { id: 'select', icon: Pointer, label: 'Sélection' },
  { id: 'rectangle', icon: Square, label: 'Rectangle' },
  { id: 'polygon', icon: PenSquare, label: 'Polygone' },
]

const DEVICE_TYPE_COLORS = {
  thermostat: '#f97316',
  light: '#fde047',
  sensor: '#38bdf8',
  fan: '#a78bfa',
  air_conditioner: '#22d3ee',
  air_purifier: '#fb7185',
}

function adjustColor(hex, delta) {
  if (!hex || !hex.startsWith('#')) return hex || '#94a3b8'
  const value = Number.parseInt(hex.slice(1), 16)
  const r = Math.min(255, Math.max(0, ((value >> 16) & 255) + delta))
  const g = Math.min(255, Math.max(0, ((value >> 8) & 255) + delta))
  const b = Math.min(255, Math.max(0, (value & 255) + delta))
  return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`
}

function polygonArea(points = []) {
  if (!points.length) return 0
  let total = 0
  for (let i = 0; i < points.length; i += 1) {
    const current = points[i]
    const next = points[(i + 1) % points.length]
    total += current.x * next.y - next.x * current.y
  }
  return Math.abs(total / 2)
}

function polygonCentroid(points = []) {
  if (!points.length) return { x: 0, y: 0 }
  const area = polygonArea(points)
  if (area === 0) {
    const avgX = points.reduce((sum, point) => sum + point.x, 0) / points.length
    const avgY = points.reduce((sum, point) => sum + point.y, 0) / points.length
    return { x: avgX, y: avgY }
  }
  let cx = 0
  let cy = 0
  for (let i = 0; i < points.length; i += 1) {
    const current = points[i]
    const next = points[(i + 1) % points.length]
    const factor = current.x * next.y - next.x * current.y
    cx += (current.x + next.x) * factor
    cy += (current.y + next.y) * factor
  }
  const factor = 1 / (6 * area)
  return { x: cx * factor, y: cy * factor }
}

function projectPoint(point, rotation, topView = false) {
  const radians = (rotation?.degrees ?? 45) * (Math.PI / 180)
  const cosTheta = Math.cos(radians)
  const sinTheta = Math.sin(radians)
  const rotatedX = point.x * cosTheta - point.y * sinTheta
  const rotatedY = point.x * sinTheta + point.y * cosTheta
  if (rotation.topView || topView) {
    return { x: rotatedX, y: rotatedY }
  }
  const x = (rotatedX - rotatedY) * cos30
  const y = (rotatedX + rotatedY) * sin30 - point.z
  return { x, y }
}

function projectPolygon(points, z, rotation) {
  return points.map((point) => projectPoint({ ...point, z }, rotation, rotation.topView))
}

function getZoneDimensions(points = []) {
  if (!points.length) {
    return { width: 0, depth: 0 }
  }
  const xs = points.map((point) => point.x)
  const ys = points.map((point) => point.y)
  const width = Math.max(...xs) - Math.min(...xs)
  const depth = Math.max(...ys) - Math.min(...ys)
  return { width, depth }
}

function resizeZonePoints(points = [], target = {}) {
  if (!points.length) return points
  const centroid = polygonCentroid(points)
  const { width: currentWidth, depth: currentDepth } = getZoneDimensions(points)
  const desiredWidth = Number.isFinite(target.width) && target.width > 0 ? target.width : currentWidth
  const desiredDepth = Number.isFinite(target.depth) && target.depth > 0 ? target.depth : currentDepth
  const scaleX = currentWidth ? desiredWidth / currentWidth : 1
  const scaleY = currentDepth ? desiredDepth / currentDepth : 1
  if (!Number.isFinite(scaleX) || !Number.isFinite(scaleY)) return points
  return points.map((point) => ({
    x: centroid.x + (point.x - centroid.x) * scaleX,
    y: centroid.y + (point.y - centroid.y) * scaleY,
  }))
}

function createFallbackZone(index = 0) {
  const baseX = -4 + index * 0.8
  const baseY = -2 + index * 0.8
  return {
    points: [
      { x: baseX, y: baseY },
      { x: baseX + 3, y: baseY },
      { x: baseX + 3, y: baseY + 2 },
      { x: baseX, y: baseY + 2 },
    ],
    floorId: defaultFloors[index % defaultFloors.length].id,
    color: '#38bdf8',
    height: 3,
    type: 'custom',
    status: 'active',
    transparency: 0.8,
  }
}

function snapValue(value) {
  return Math.round(value / GRID_SIZE) * GRID_SIZE
}

function getTemperatureColor(value) {
  if (value == null) return '#38bdf8'
  if (value < 20) return '#0ea5e9'
  if (value < 24) return '#22c55e'
  if (value < 27) return '#facc15'
  return '#ef4444'
}

function syncZoneState(previous = [], upstream = [], devices = []) {
  const prevMap = new Map(previous.map((zone) => [zone.id, zone]))
  const assignments = devices.reduce((acc, device) => {
    if (!device.zone) return acc
    if (!acc[device.zone]) acc[device.zone] = []
    acc[device.zone].push(device.id)
    return acc
  }, {})
  const merged = upstream.map((rawZone, index) => {
    const template = defaultZoneLayouts[rawZone.id] || createFallbackZone(index)
    const existing = prevMap.get(rawZone.id)
    const points = existing?.points || template.points
    const floorId = existing?.floorId || template.floorId || defaultFloors[0].id
    const base = existing || {
      id: rawZone.id,
      name: rawZone.name,
      description: '',
      notes: template.notes || '',
      labelPosition: template.labelPosition || polygonCentroid(points),
      assignedDeviceIds: assignments[rawZone.id] || [],
      transparency: template.transparency ?? 0.84,
      color: template.color || '#38bdf8',
      type: template.type || 'custom',
      height: template.height || 3,
      status: template.status || 'active',
      isCustom: false,
    }
    const assignedDeviceIds = assignments[rawZone.id] || existing?.assignedDeviceIds || []
    return {
      ...base,
      id: rawZone.id,
      name: rawZone.name,
      floorId,
      points,
      color: base.color || template.color,
      type: base.type || template.type || 'custom',
      height: base.height || template.height || 3,
      labelPosition: base.labelPosition || template.labelPosition || polygonCentroid(points),
      transparency: base.transparency ?? template.transparency ?? 0.85,
      area: polygonArea(points),
      notes: base.notes || template.notes || rawZone.description || '',
      description: base.description || rawZone.description || '',
      status: base.status || template.status || 'active',
      avgTemperature: rawZone.avgTemperature ?? base.avgTemperature ?? null,
      energyConsumption: rawZone.energyConsumption ?? base.energyConsumption ?? 0,
      deviceCount: rawZone.deviceCount ?? assignedDeviceIds.length,
      activeDevices: rawZone.activeDevices ?? base.activeDevices ?? 0,
      assignedDeviceIds,
    }
  })
  const customZones = previous.filter((zone) => zone.isCustom && !merged.find((entry) => entry.id === zone.id))
  return [...merged, ...customZones]
}

function formatDimension(value, system, isArea = false) {
  if (value == null) return '—'
  const ratio = UNIT_SYSTEMS[system]?.ratio ?? 1
  const adjusted = isArea ? value * ratio * ratio : value * ratio
  const unit = UNIT_SYSTEMS[system]?.label || ''
  return `${adjusted.toFixed(2)} ${unit}${isArea ? '²' : ''}`
}

export function Zone3DEditor() {
  const { zones: upstreamZones, devices } = useDeviceData()
  const { t } = useTranslation()
  const svgRef = useRef(null)
  const [mode, setMode] = useState('view')
  const [activeTool, setActiveTool] = useState('select')
  const [unitSystem, setUnitSystem] = useState('metric')
  const [camera, setCamera] = useState({ zoom: 1, pan: { x: 0, y: 0 }, rotation: VIEW_ROTATIONS['front-left'] })
  const [viewOptions, setViewOptions] = useState({ showDevices: true, showLabels: true, showGrid: true })
  const [floors, setFloors] = useState(() => defaultFloors.map((floor) => ({ ...floor })))
  const [activeFloorId, setActiveFloorId] = useState(defaultFloors[0].id)
  const [zoneState, setZoneState] = useState([])
  const [selectedZoneIds, setSelectedZoneIds] = useState([])
  const [hoverInfo, setHoverInfo] = useState(null)
  const [contextMenu, setContextMenu] = useState(null)
  const [draftShape, setDraftShape] = useState(null)
  const [copyBuffer, setCopyBuffer] = useState(null)
  const [measurementOverlay, setMeasurementOverlay] = useState(null)
  const [selectionBox, setSelectionBox] = useState(null)
  const [dragState, setDragState] = useState(null)
  const [showDeviceLines, setShowDeviceLines] = useState(true)
  const [gridSnapping, setGridSnapping] = useState(true)
  const [showAllFloors, setShowAllFloors] = useState(false)
  const [spacePanning, setSpacePanning] = useState(false)
  const panningRef = useRef(null)
  const initializedSelectionRef = useRef(false)

  const handleDeleteSelected = useCallback(
    (targetIds) => {
      const ids = (targetIds && targetIds.length ? targetIds : selectedZoneIds).filter(Boolean)
      if (!ids.length) return
      setZoneState((prev) => prev.filter((zone) => !ids.includes(zone.id)))
      setSelectedZoneIds((prev) => prev.filter((id) => !ids.includes(id)))
    },
    [selectedZoneIds],
  )

  const updateFloor = useCallback((floorId, patch) => {
    setFloors((prev) =>
      prev.map((floor) => {
        if (floor.id !== floorId) return floor
        return {
          ...floor,
          ...patch,
        }
      }),
    )
  }, [])

  useEffect(() => {
    if (!upstreamZones?.length) return
    // eslint-disable-next-line react-hooks/set-state-in-effect -- keep local editor state in sync with incoming API data
    setZoneState((prev) => syncZoneState(prev, upstreamZones, devices))
  }, [upstreamZones, devices])

  useEffect(() => {
    if (!zoneState.length) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- reset selection when no zones remain
      setSelectedZoneIds([])
      initializedSelectionRef.current = false
      return
    }
    if (!initializedSelectionRef.current) {
      setSelectedZoneIds([zoneState[0].id])
      setActiveFloorId(zoneState[0].floorId)
      initializedSelectionRef.current = true
    }
  }, [zoneState])

  useEffect(() => {
    const closeContext = () => setContextMenu(null)
    window.addEventListener('click', closeContext)
    return () => window.removeEventListener('click', closeContext)
  }, [])

  useEffect(() => {
    const handleKey = (event) => {
      if (event.key === 'Escape') {
        setDraftShape(null)
        setSelectionBox(null)
        setDragState(null)
        setContextMenu(null)
        return
      }
      if ((event.key === 'Delete' || event.key === 'Backspace') && selectedZoneIds.length) {
        event.preventDefault()
        handleDeleteSelected()
      }
      if (event.key === 'a' && (event.metaKey || event.ctrlKey)) {
        event.preventDefault()
        setSelectedZoneIds(zoneState.map((zone) => zone.id))
      }
      if (event.key.startsWith('Arrow')) {
        event.preventDefault()
        setCamera((prev) => {
          const delta = 20 / prev.zoom
          if (event.key === 'ArrowUp') return { ...prev, pan: { x: prev.pan.x, y: prev.pan.y + delta } }
          if (event.key === 'ArrowDown') return { ...prev, pan: { x: prev.pan.x, y: prev.pan.y - delta } }
          if (event.key === 'ArrowLeft') return { ...prev, pan: { x: prev.pan.x + delta, y: prev.pan.y } }
          return { ...prev, pan: { x: prev.pan.x - delta, y: prev.pan.y } }
        })
      }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [zoneState, selectedZoneIds, handleDeleteSelected])

  useEffect(() => {
    const handleSpaceDown = (event) => {
      if (event.code !== 'Space') return
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(event.target?.tagName)) return
      event.preventDefault()
      setSpacePanning(true)
    }
    const handleSpaceUp = (event) => {
      if (event.code === 'Space') {
        setSpacePanning(false)
      }
    }
    window.addEventListener('keydown', handleSpaceDown)
    window.addEventListener('keyup', handleSpaceUp)
    return () => {
      window.removeEventListener('keydown', handleSpaceDown)
      window.removeEventListener('keyup', handleSpaceUp)
    }
  }, [])

  const deviceMap = useMemo(() => Object.fromEntries(devices.map((device) => [device.id, device])), [devices])
  const sceneBounds = useMemo(() => {
    if (!zoneState.length) {
      return { minX: -10, maxX: 10, minY: -10, maxY: 10 }
    }
    const points = zoneState.flatMap((zone) => zone.points || [])
    if (!points.length) {
      return { minX: -10, maxX: 10, minY: -10, maxY: 10 }
    }
    const xs = points.map((point) => point.x)
    const ys = points.map((point) => point.y)
    const minX = Math.min(...xs)
    const maxX = Math.max(...xs)
    const minY = Math.min(...ys)
    const maxY = Math.max(...ys)
    if (!Number.isFinite(minX) || !Number.isFinite(maxX) || !Number.isFinite(minY) || !Number.isFinite(maxY)) {
      return { minX: -10, maxX: 10, minY: -10, maxY: 10 }
    }
    return { minX, maxX, minY, maxY }
  }, [zoneState])
  const sortedFloors = useMemo(() => [...floors].sort((a, b) => a.order - b.order), [floors])
  const activeFloor = useMemo(() => sortedFloors.find((floor) => floor.id === activeFloorId) || sortedFloors[0], [sortedFloors, activeFloorId])
  const floorOffsets = useMemo(() => {
    const offsets = {}
    let offset = 0
    sortedFloors.forEach((floor) => {
      offsets[floor.id] = offset
      offset += floor.height + FLOOR_GAP
    })
    return offsets
  }, [sortedFloors])
  const visibleFloorIds = useMemo(() => {
    if (showAllFloors) {
      return sortedFloors.map((floor) => floor.id)
    }
    return activeFloor ? [activeFloor.id] : []
  }, [showAllFloors, activeFloor, sortedFloors])
  const zonesToRender = useMemo(() => {
    if (showAllFloors) {
      return zoneState
    }
    return activeFloor ? zoneState.filter((zone) => zone.floorId === activeFloor.id) : []
  }, [zoneState, activeFloor, showAllFloors])
  
  const zonesByFloor = useMemo(() => {
    const grouped = {}
    zoneState.forEach((zone) => {
      const floorId = zone.floorId || 'unassigned'
      if (!grouped[floorId]) {
        grouped[floorId] = []
      }
      grouped[floorId].push(zone)
    })
    return grouped
  }, [zoneState])
  const viewRotation = camera.rotation || VIEW_ROTATIONS['front-left']
  const zoneRenderData = useMemo(() => {
    return zonesToRender.map((zone) => {
      const floorOffset = floorOffsets[zone.floorId] ?? 0
      const zoneHeight = zone.height || 3
      const top = projectPolygon(zone.points, floorOffset + zoneHeight, viewRotation)
      const bottom = projectPolygon(zone.points, floorOffset, viewRotation)
      const centroid = polygonCentroid(zone.points)
      const centroidPoint = projectPoint({ ...centroid, z: floorOffset + zoneHeight }, viewRotation, viewRotation.topView)
      return {
        zone,
        top,
        bottom,
        centroid,
        centroidPoint,
        floorOffset,
        zoneHeight,
      }
    })
  }, [zonesToRender, floorOffsets, viewRotation])
  const orderedZoneRenderData = useMemo(() => {
    return zoneRenderData
      .slice()
      .sort((a, b) => a.floorOffset - b.floorOffset || a.centroid.y - b.centroid.y || a.centroid.x - b.centroid.x)
  }, [zoneRenderData])
  const primaryZone = selectedZoneIds.length === 1 ? zoneState.find((zone) => zone.id === selectedZoneIds[0]) : null

  function clientToScene(event) {
    const svgEl = svgRef.current
    if (!svgEl) return { x: 0, y: 0 }
    const bounds = svgEl.getBoundingClientRect()
    const relativeX = ((event.clientX - bounds.left) / bounds.width) * VIEWBOX.width + VIEWBOX.minX
    const relativeY = ((event.clientY - bounds.top) / bounds.height) * VIEWBOX.height + VIEWBOX.minY
    const x = (relativeX - camera.pan.x) / camera.zoom
    const y = (relativeY - camera.pan.y) / camera.zoom
    return { x, y }
  }

  function screenToWorld(event, floorId) {
    const scenePoint = clientToScene(event)
    const rotation = viewRotation
    if (rotation.topView) {
      const radians = (rotation.degrees * Math.PI) / 180
      const cosTheta = Math.cos(radians)
      const sinTheta = Math.sin(radians)
      const x = scenePoint.x * cosTheta + scenePoint.y * sinTheta
      const y = -scenePoint.x * sinTheta + scenePoint.y * cosTheta
      return gridSnapping ? { x: snapValue(x), y: snapValue(y) } : { x, y }
    }
    const z = floorOffsets[floorId] ?? 0
    const a = scenePoint.x / cos30
    const b = (scenePoint.y + z) / sin30
    const xr = (a + b) / 2
    const yr = (b - a) / 2
    const radians = (rotation.degrees * Math.PI) / 180
    const cosTheta = Math.cos(radians)
    const sinTheta = Math.sin(radians)
    const x = xr * cosTheta + yr * sinTheta
    const y = -xr * sinTheta + yr * cosTheta
    return gridSnapping ? { x: snapValue(x), y: snapValue(y) } : { x, y }
  }

  function startPanning(event) {
    panningRef.current = {
      startX: event.clientX,
      startY: event.clientY,
      pan: camera.pan,
    }
  }

  function handleBackgroundMouseDown(event) {
    if (event.button === 2) return
    if (spacePanning || event.button === 1) {
      startPanning(event)
      return
    }
    if (mode === 'edit' && activeTool !== 'select') {
      if (activeTool === 'rectangle') {
        const start = screenToWorld(event, activeFloorId)
        setDraftShape({ tool: 'rectangle', floorId: activeFloorId, start, current: start })
        setMeasurementOverlay({ width: 0, height: 0, area: 0 })
        event.preventDefault()
        return
      }
      if (activeTool === 'polygon') {
        setDraftShape((prev) => {
          const point = screenToWorld(event, activeFloorId)
          if (!prev || prev.tool !== 'polygon') {
            return { tool: 'polygon', floorId: activeFloorId, points: [point] }
          }
          return { ...prev, points: [...prev.points, point] }
        })
        event.preventDefault()
        return
      }
    }
    if (event.shiftKey) {
      const scenePoint = clientToScene(event)
      setSelectionBox({ start: scenePoint, current: scenePoint })
      return
    }
    startPanning(event)
  }

  function updateSelectionBox(event) {
    setSelectionBox((prev) => {
      if (!prev) return prev
      return { ...prev, current: clientToScene(event) }
    })
  }

  function finalizeSelectionBox() {
    if (!selectionBox) return
    const minX = Math.min(selectionBox.start.x, selectionBox.current.x)
    const maxX = Math.max(selectionBox.start.x, selectionBox.current.x)
    const minY = Math.min(selectionBox.start.y, selectionBox.current.y)
    const maxY = Math.max(selectionBox.start.y, selectionBox.current.y)
    const inside = orderedZoneRenderData
      .filter(({ centroidPoint }) => centroidPoint.x >= minX && centroidPoint.x <= maxX && centroidPoint.y >= minY && centroidPoint.y <= maxY)
      .map(({ zone }) => zone.id)
    setSelectedZoneIds((prev) => Array.from(new Set([...prev, ...inside])))
    setSelectionBox(null)
  }

  function updateDraftShape(event) {
    setDraftShape((prev) => {
      if (!prev) return prev
      if (prev.tool === 'rectangle') {
        const current = screenToWorld(event, prev.floorId)
        const width = Math.abs(current.x - prev.start.x)
        const height = Math.abs(current.y - prev.start.y)
        setMeasurementOverlay({ width, height, area: width * height })
        return { ...prev, current }
      }
      if (prev.tool === 'polygon') {
        const current = screenToWorld(event, prev.floorId)
        return { ...prev, preview: current }
      }
      return prev
    })
  }

  function stopDraftShape() {
    if (!draftShape) return
    if (draftShape.tool === 'rectangle') {
      const { start, current, floorId } = draftShape
      const dx = current.x - start.x
      const dy = current.y - start.y
      if (Math.abs(dx) < 0.2 || Math.abs(dy) < 0.2) {
        setDraftShape(null)
        setMeasurementOverlay(null)
        return
      }
      const points = [
        { x: start.x, y: start.y },
        { x: current.x, y: start.y },
        { x: current.x, y: current.y },
        { x: start.x, y: current.y },
      ]
      addZoneFromShape(points, floorId)
      setDraftShape(null)
      setMeasurementOverlay(null)
    }
  }

  function finalizePolygon() {
    if (!draftShape || draftShape.tool !== 'polygon' || draftShape.points.length < 3) {
      setDraftShape(null)
      setMeasurementOverlay(null)
      return
    }
    addZoneFromShape(draftShape.points, draftShape.floorId)
    setDraftShape(null)
    setMeasurementOverlay(null)
  }

  function addZoneFromShape(points, floorId) {
    const centroid = polygonCentroid(points)
    const targetFloor = sortedFloors.find((floor) => floor.id === (floorId || activeFloorId))
    const defaultColor = targetFloor?.color || '#22c55e'
    const newZone = {
      id: `zone-${Date.now()}`,
      name: 'Nouvelle zone',
      floorId: floorId || activeFloorId,
      points,
      color: defaultColor,
      type: 'custom',
      height: targetFloor?.height ?? 3,
      labelPosition: centroid,
      transparency: 0.78,
      status: 'active',
      area: polygonArea(points),
      assignedDeviceIds: [],
      deviceCount: 0,
      activeDevices: 0,
      avgTemperature: 22,
      isCustom: true,
    }
    setZoneState((prev) => [...prev, newZone])
    setSelectedZoneIds([newZone.id])
  }
  
  function addZoneToFloor(zoneId, targetFloorId) {
    if (!zoneId) return
    setZoneState((prev) =>
      prev.map((z) => {
        if (z.id === zoneId) {
          return { ...z, floorId: targetFloorId || null }
        }
        return z
      }),
    )
  }
  
  function createNewZoneForFloor(floorId) {
    const targetFloor = sortedFloors.find((floor) => floor.id === floorId)
    const floorZones = zoneState.filter((zone) => zone.floorId === floorId)
    const offsetIndex = floorZones.length
    const offsetX = (offsetIndex % 4) * 0.9
    const offsetY = Math.floor(offsetIndex / 4) * 0.9
    const jitter = ((offsetIndex % 3) - 1) * 0.15
    const baseX = -4 + offsetX + jitter
    const baseY = -2 + offsetY
    const points = [
      { x: baseX, y: baseY },
      { x: baseX + 3, y: baseY },
      { x: baseX + 3, y: baseY + 2 },
      { x: baseX, y: baseY + 2 },
    ]
    const centroid = polygonCentroid(points)
    const newZone = {
      id: `zone-${Date.now()}`,
      name: `Nouvelle zone ${targetFloor?.label || ''}`,
      floorId: floorId,
      points,
      color: targetFloor?.color || '#22c55e',
      type: 'custom',
      height: targetFloor?.height ?? 3,
      labelPosition: centroid,
      transparency: 0.78,
      status: 'active',
      area: polygonArea(points),
      assignedDeviceIds: [],
      deviceCount: 0,
      activeDevices: 0,
      avgTemperature: 22,
      isCustom: true,
    }
    setZoneState((prev) => [...prev, newZone])
    setSelectedZoneIds([newZone.id])
    setActiveFloorId(floorId)
  }

  function handleCanvasMouseMove(event) {
    if (panningRef.current) {
      setCamera((prev) => ({
        ...prev,
        pan: {
          x: panningRef.current.pan.x + ((event.clientX - panningRef.current.startX) / (svgRef.current?.clientWidth || 1)) * VIEWBOX.width,
          y: panningRef.current.pan.y + ((event.clientY - panningRef.current.startY) / (svgRef.current?.clientHeight || 1)) * VIEWBOX.height,
        },
      }))
      return
    }
    if (selectionBox) {
      updateSelectionBox(event)
      return
    }
    if (draftShape) {
      updateDraftShape(event)
      return
    }
    if (dragState) {
      const world = screenToWorld(event, dragState.floorId)
      const dx = world.x - dragState.start.x
      const dy = world.y - dragState.start.y
      setZoneState((prev) =>
        prev.map((zone) => {
          if (zone.id !== dragState.zoneId) return zone
          if (dragState.type === 'move') {
            const points = zone.points.map((point) => ({ x: snapValue(point.x + dx), y: snapValue(point.y + dy) }))
            return { ...zone, points, labelPosition: polygonCentroid(points), area: polygonArea(points) }
          }
          if (dragState.type === 'handle') {
            const points = zone.points.map((point, index) => (index === dragState.index ? { x: world.x, y: world.y } : point))
            return { ...zone, points, labelPosition: polygonCentroid(points), area: polygonArea(points) }
          }
          return zone
        }),
      )
    }
  }

  function handleCanvasMouseUp() {
    if (panningRef.current) {
      panningRef.current = null
      return
    }
    if (selectionBox) {
      finalizeSelectionBox()
      return
    }
    if (draftShape) {
      stopDraftShape()
      return
    }
    if (dragState) {
      setDragState(null)
    }
  }

  function handleCanvasWheel(event) {
    event.preventDefault()
    const delta = event.deltaY > 0 ? -0.1 : 0.1
    setCamera((prev) => ({ ...prev, zoom: Math.min(2.8, Math.max(0.5, prev.zoom + delta)) }))
  }

  function handleZoneClick(event, zone) {
    event.stopPropagation()
    if (event.shiftKey) {
      setSelectedZoneIds((prev) => (prev.includes(zone.id) ? prev : [...prev, zone.id]))
    } else {
      setSelectedZoneIds([zone.id])
      setActiveFloorId(zone.floorId)
    }
  }

  function handleZoneDoubleClick(event, zone) {
    event.stopPropagation()
    setMode('edit')
    setActiveTool('select')
    setSelectedZoneIds([zone.id])
  }

  function handleZoneContextMenu(event, zone) {
    event.preventDefault()
    setContextMenu({
      x: event.clientX,
      y: event.clientY,
      zone,
    })
  }

  function handleZonePointerDown(event, zone) {
    if (spacePanning || event.button === 1) {
      event.stopPropagation()
      startPanning(event)
      return
    }
    if (mode !== 'edit' || activeTool !== 'select') return
    event.stopPropagation()
    const world = screenToWorld(event, zone.floorId)
    setDragState({ type: 'move', zoneId: zone.id, start: world, floorId: zone.floorId })
  }

  function handleHandlePointerDown(event, zone, index) {
    if (spacePanning || event.button === 1) {
      event.stopPropagation()
      startPanning(event)
      return
    }
    if (mode !== 'edit') return
    event.stopPropagation()
    const world = screenToWorld(event, zone.floorId)
    setDragState({ type: 'handle', zoneId: zone.id, index, start: world, floorId: zone.floorId })
  }

  function reorderFloor(floorId, direction) {
    setFloors((prev) => {
      const copy = [...prev]
      const index = copy.findIndex((floor) => floor.id === floorId)
      if (index === -1) return prev
      const swapIndex = index + direction
      if (swapIndex < 0 || swapIndex >= copy.length) return prev
      const temp = copy[index].order
      copy[index].order = copy[swapIndex].order
      copy[swapIndex].order = temp
      return [...copy]
    })
  }

  function addFloor() {
    const newFloor = {
      id: `floor-${Date.now()}`,
      name: '',
      label: '',
      level: floors.length,
      order: floors.length,
      height: 3,
      color: '#1f2937',
      visible: true,
    }
    setFloors((prev) => [...prev, newFloor])
    setActiveFloorId(newFloor.id)
  }

  function removeFloor(floorId) {
    setFloors((prev) => {
      const filtered = prev.filter((floor) => floor.id !== floorId)
      if (filtered.length === prev.length) return prev
      if (activeFloorId === floorId) {
        setActiveFloorId(filtered[0]?.id || defaultFloors[0]?.id || '')
      }
      return filtered
    })
    setZoneState((prev) => prev.filter((zone) => zone.floorId !== floorId))
  }

  function handleCopySelected() {
    if (!selectedZoneIds.length) return
    const clones = zoneState
      .filter((zone) => selectedZoneIds.includes(zone.id))
      .map((zone) => ({ ...zone, points: zone.points.map((point) => ({ ...point })), assignedDeviceIds: [...(zone.assignedDeviceIds || [])] }))
    setCopyBuffer(clones)
  }

  function handlePasteZones() {
    if (!copyBuffer?.length) return
    const duplicates = copyBuffer.map((zone) => ({
      ...zone,
      id: `zone-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      name: `${zone.name} (copie)`,
      points: zone.points.map((point) => ({ x: point.x + 0.5, y: point.y + 0.5 })),
      isCustom: true,
    }))
    setZoneState((prev) => [...prev, ...duplicates])
    setSelectedZoneIds(duplicates.map((zone) => zone.id))
  }

  function updateZoneValues(zoneId, patch) {
    setZoneState((prev) =>
      prev.map((zone) => {
        if (zone.id !== zoneId) return zone
        const updatedPoints = patch.points ? patch.points : zone.points
        return {
          ...zone,
          ...patch,
          points: updatedPoints,
          area: polygonArea(updatedPoints),
          labelPosition: patch.labelPosition || polygonCentroid(updatedPoints),
        }
      }),
    )
  }

  function zoneHasAlert(zone) {
    if (!zone) return false
    const tooHot = typeof zone.avgTemperature === 'number' && zone.avgTemperature > 26
    const offline = (zone.deviceCount || 0) - (zone.activeDevices || 0) > 1
    return tooHot || offline
  }

  const hoverTooltip =
    hoverInfo && hoverInfo.zone ? (
      <div
        className="pointer-events-none fixed z-50 min-w-[220px] rounded-lg border bg-background/95 px-3 py-2 text-xs shadow-xl"
        style={{ left: hoverInfo.position.x + 12, top: hoverInfo.position.y + 12 }}
      >
        <div className="flex items-center justify-between">
          <span className="font-semibold">{hoverInfo.zone.name}</span>
          {sortedFloors.find((f) => f.id === hoverInfo.zone.floorId) && (
            <Badge variant="secondary" style={{ backgroundColor: sortedFloors.find((f) => f.id === hoverInfo.zone.floorId)?.color + '40' }}>
              {sortedFloors.find((f) => f.id === hoverInfo.zone.floorId)?.label || sortedFloors.find((f) => f.id === hoverInfo.zone.floorId)?.name}
            </Badge>
          )}
        </div>
        <p className="text-muted-foreground">
          {t('zones.devices', {
            defaultValue: '{count} appareils',
            count: hoverInfo.zone.deviceCount ?? hoverInfo.zone.assignedDeviceIds?.length ?? 0,
          })}
        </p>
        {hoverInfo.zone.avgTemperature && (
          <p className="text-muted-foreground">
            {t('zones.temperature', { defaultValue: 'Température: {value}°C', value: hoverInfo.zone.avgTemperature })}
          </p>
        )}
      </div>
    ) : null

  const contextMenuNode =
    contextMenu && contextMenu.zone ? (
      <div
        className="fixed z-50 w-48 rounded-lg border bg-background p-2 shadow-xl"
        style={{ left: contextMenu.x, top: contextMenu.y }}
      >
        <button
          type="button"
          className="flex w-full items-center rounded-md px-2 py-1 text-left text-sm hover:bg-muted"
          onClick={() => {
            setMode('edit')
            setActiveTool('select')
            setSelectedZoneIds([contextMenu.zone.id])
            setContextMenu(null)
          }}
        >
          Modifier la zone
        </button>
        <button
          type="button"
          className="flex w-full items-center rounded-md px-2 py-1 text-left text-sm hover:bg-muted"
          onClick={() => {
            handleDeleteSelected([contextMenu.zone.id])
            setContextMenu(null)
          }}
        >
          Supprimer
        </button>
      </div>
    ) : null

  const measurementNode = measurementOverlay && (
    <div className="pointer-events-none absolute left-4 top-4 z-20 rounded-md border bg-background/90 px-3 py-1 text-xs shadow">
      <p>
        Largeur: {formatDimension(measurementOverlay.width, unitSystem)} | Profondeur: {formatDimension(measurementOverlay.height, unitSystem)}
      </p>
      <p>Surface: {formatDimension(measurementOverlay.area, unitSystem, true)}</p>
    </div>
  )

  return (
    <Card className="border-primary/20 bg-gradient-to-b from-secondary/10 via-background to-background shadow-lg">
      <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <CardTitle className="flex items-center gap-2 text-lg">
          <Box className="h-5 w-5 text-primary" />
          {t('zones.3dEditor.title', { defaultValue: 'Visualisation 3D des zones' })}
        </CardTitle>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={mode === 'edit' ? 'secondary' : 'outline'} className="uppercase">
            {mode === 'edit'
              ? t('zones.3dEditor.editMode', { defaultValue: 'Mode édition' })
              : t('zones.3dEditor.viewMode', { defaultValue: 'Mode vue' })}
          </Badge>
          <Switch id="mode-toggle" checked={mode === 'edit'} onCheckedChange={(checked) => setMode(checked ? 'edit' : 'view')} />
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="rounded-xl border bg-card/80 p-3 shadow-inner">
          <div className="flex flex-col gap-4 lg:grid lg:grid-cols-[minmax(0,2fr)_minmax(320px,1fr)]">
            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  {TOOLBAR_TOOLS.map((tool) => (
                    <Button
                      key={tool.id}
                      size="sm"
                      variant={activeTool === tool.id ? 'default' : 'outline'}
                      onClick={() => setActiveTool(tool.id)}
                      disabled={mode !== 'edit'}
                    >
                      <tool.icon className="mr-1 h-4 w-4" />
                      {tool.label}
                    </Button>
                  ))}
                  <Button size="sm" variant="outline" onClick={handleCopySelected} disabled={!selectedZoneIds.length}>
                    <Copy className="mr-1 h-4 w-4" /> Copier
                  </Button>
                  <Button size="sm" variant="outline" onClick={handlePasteZones} disabled={!copyBuffer?.length}>
                    <ClipboardPaste className="mr-1 h-4 w-4" /> Coller
                  </Button>
                  <Button size="sm" variant="outline" onClick={handleDeleteSelected} disabled={!selectedZoneIds.length}>
                    <Trash2 className="mr-1 h-4 w-4" /> Supprimer
                  </Button>
                  {mode === 'edit' && activeTool === 'polygon' && draftShape?.points?.length >= 3 && (
                    <Button size="sm" variant="secondary" onClick={finalizePolygon}>
                      Fermer le polygone
                    </Button>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Button size="icon" variant="outline" onClick={() => setCamera((prev) => ({ ...prev, zoom: Math.min(2.8, prev.zoom + 0.2) }))}>
                    <ZoomIn className="h-4 w-4" />
                  </Button>
                  <Button size="icon" variant="outline" onClick={() => setCamera((prev) => ({ ...prev, zoom: Math.max(0.5, prev.zoom - 0.2) }))}>
                    <ZoomOut className="h-4 w-4" />
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setCamera({ zoom: 1, pan: { x: 0, y: 0 }, rotation: camera.rotation })}>
                    <RotateCcw className="mr-1 h-4 w-4" /> Fit view
                  </Button>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {Object.values(VIEW_ROTATIONS).map((rotation) => (
                  <Button
                    key={rotation.id}
                    size="sm"
                    variant={camera.rotation.id === rotation.id ? 'default' : 'outline'}
                    onClick={() => setCamera((prev) => ({ ...prev, rotation }))}
                  >
                    <Move3D className="mr-1 h-4 w-4" />
                    {rotation.label}
                  </Button>
                ))}
                <div className="flex items-center gap-2 rounded-md border px-3 py-1 text-sm text-muted-foreground">
                  <Ruler className="h-4 w-4" />
                  <select className="bg-transparent text-sm" value={unitSystem} onChange={(event) => setUnitSystem(event.target.value)}>
                    {Object.values(UNIT_SYSTEMS).map((unit) => (
                      <option key={unit.id} value={unit.id}>
                        {unit.longLabel}
                      </option>
                    ))}
                  </select>
                  <label className="flex items-center gap-2 text-xs">
                    <span>Magnétisme</span>
                    <Switch checked={gridSnapping} onCheckedChange={setGridSnapping} />
                  </label>
                  <label className="flex items-center gap-2 text-xs">
                    <span>Étage actif</span>
                    <select className="rounded-md border bg-background px-2 text-xs" value={activeFloorId} onChange={(event) => setActiveFloorId(event.target.value)}>
                      {sortedFloors.map((floor) => (
                        <option key={floor.id} value={floor.id}>
                          {floor.name || floor.label || floor.id}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="flex items-center gap-2 text-xs">
                    <Switch checked={showAllFloors} onCheckedChange={setShowAllFloors} />
                    <span>Tous les étages</span>
                  </label>
                </div>
              </div>
              <div className="relative overflow-hidden rounded-xl border bg-gradient-to-b from-background/90 to-background">
                <div className="absolute inset-x-0 top-2 z-10 flex flex-wrap items-center gap-4 px-4 text-xs">
                  <label className="flex items-center gap-2">
                    <Switch checked={viewOptions.showGrid} onCheckedChange={(value) => setViewOptions((prev) => ({ ...prev, showGrid: value }))} />
                    Grille iso
                  </label>
                  <label className="flex items-center gap-2">
                    <Switch checked={viewOptions.showDevices} onCheckedChange={(value) => setViewOptions((prev) => ({ ...prev, showDevices: value }))} />
                    Appareils
                  </label>
                  <label className="flex items-center gap-2">
                    <Switch checked={viewOptions.showLabels} onCheckedChange={(value) => setViewOptions((prev) => ({ ...prev, showLabels: value }))} />
                    Labels
                  </label>
                  <label className="flex items-center gap-2">
                    <Switch checked={showDeviceLines} onCheckedChange={setShowDeviceLines} />
                    Liaisons
                  </label>
                </div>
                <div className="relative mt-10 h-[560px] cursor-grab" onWheel={handleCanvasWheel}>
                  {measurementNode}
                  <svg
                    ref={svgRef}
                    viewBox={`${VIEWBOX.minX} ${VIEWBOX.minY} ${VIEWBOX.width} ${VIEWBOX.height}`}
                    className="h-full w-full"
                    onMouseDown={handleBackgroundMouseDown}
                    onMouseMove={handleCanvasMouseMove}
                    onMouseUp={handleCanvasMouseUp}
                    onMouseLeave={handleCanvasMouseUp}
                  >
                    <rect
                      x="-1000"
                      y="-1000"
                      width="2000"
                      height="2000"
                      fill="transparent"
                      onDoubleClick={() => (draftShape?.tool === 'polygon' ? finalizePolygon() : null)}
                    />
                    <g transform={`translate(${camera.pan.x} ${camera.pan.y}) scale(${camera.zoom})`}>
                      {viewOptions.showGrid && (
                        <GridLayer
                          visibleFloorIds={visibleFloorIds}
                          rotation={viewRotation}
                          floorOffsets={floorOffsets}
                          bounds={sceneBounds}
                        />
                      )}
                      {orderedZoneRenderData.map((entry) => {
                        const floor = sortedFloors.find((f) => f.id === entry.zone.floorId)
                        return (
                          <ZoneMesh
                            key={entry.zone.id}
                            entry={entry}
                            devices={entry.zone.assignedDeviceIds?.map((id) => deviceMap[id]).filter(Boolean) || []}
                            selected={selectedZoneIds.includes(entry.zone.id)}
                            viewOptions={viewOptions}
                            showDeviceLines={showDeviceLines}
                            rotation={viewRotation}
                            onClick={(event) => handleZoneClick(event, entry.zone)}
                            onDoubleClick={(event) => handleZoneDoubleClick(event, entry.zone)}
                            onContextMenu={(event) => handleZoneContextMenu(event, entry.zone)}
                            onPointerDown={(event) => handleZonePointerDown(event, entry.zone)}
                            onHover={(event) => setHoverInfo({ zone: entry.zone, position: { x: event.clientX, y: event.clientY } })}
                            onHoverEnd={() => setHoverInfo(null)}
                            onHandlePointerDown={handleHandlePointerDown}
                            showHandles={mode === 'edit' && activeTool === 'select' && selectedZoneIds.includes(entry.zone.id)}
                            zoneHasAlert={zoneHasAlert}
                            floor={floor}
                            showAllFloors={showAllFloors}
                          />
                        )
                      })}
                      {draftShape?.tool === 'rectangle' && (
                        <DraftRectangle draft={draftShape} rotation={viewRotation} floorOffsets={floorOffsets} />
                      )}
                      {draftShape?.tool === 'polygon' && (
                        <DraftPolygon draft={draftShape} rotation={viewRotation} floorOffsets={floorOffsets} />
                      )}
                      {selectionBox && <SelectionOverlay selection={selectionBox} />}
                    </g>
                  </svg>
                </div>
                {hoverTooltip}
                {contextMenuNode}
              </div>
            </div>
            <div className="space-y-3">
              <FloorManager
                floors={sortedFloors}
                activeFloorId={activeFloorId}
                onSelectFloor={setActiveFloorId}
                onReorder={reorderFloor}
                onAddFloor={addFloor}
                onRemoveFloor={removeFloor}
                onUpdateFloor={updateFloor}
                onCreateZone={createNewZoneForFloor}
              />
              <ZoneListPanel
                zonesByFloor={zonesByFloor}
                floors={sortedFloors}
                activeFloorId={activeFloorId}
                selectedZoneIds={selectedZoneIds}
                onSelectZone={(zoneId) => {
                  const zone = zoneState.find((z) => z.id === zoneId)
                  if (zone) {
                    setSelectedZoneIds([zoneId])
                    if (zone.floorId) {
                      setActiveFloorId(zone.floorId)
                    }
                  }
                }}
                onDeleteZone={handleDeleteSelected}
                onAddZoneToFloor={addZoneToFloor}
                onCreateZone={createNewZoneForFloor}
                onSelectFloor={setActiveFloorId}
              />
              <ZonePropertiesPanel
                zone={primaryZone}
                floors={sortedFloors}
                unitSystem={unitSystem}
                onChange={(patch) => primaryZone && updateZoneValues(primaryZone.id, patch)}
              />
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

function GridLayer({ visibleFloorIds, rotation, floorOffsets, bounds }) {
  const lines = []
  const margin = 6
  const startX = Math.floor((bounds.minX - margin) / GRID_SIZE) * GRID_SIZE
  const endX = Math.ceil((bounds.maxX + margin) / GRID_SIZE) * GRID_SIZE
  const startY = Math.floor((bounds.minY - margin) / GRID_SIZE) * GRID_SIZE
  const endY = Math.ceil((bounds.maxY + margin) / GRID_SIZE) * GRID_SIZE
  visibleFloorIds.forEach((floorId) => {
    for (let x = startX; x <= endX + GRID_SIZE / 2; x += GRID_SIZE) {
      const start = projectPoint({ x, y: startY, z: floorOffsets[floorId] }, rotation)
      const end = projectPoint({ x, y: endY, z: floorOffsets[floorId] }, rotation)
      lines.push({ id: `${floorId}-vertical-${x.toFixed(2)}`, start, end })
    }
    for (let y = startY; y <= endY + GRID_SIZE / 2; y += GRID_SIZE) {
      const start = projectPoint({ x: startX, y, z: floorOffsets[floorId] }, rotation)
      const end = projectPoint({ x: endX, y, z: floorOffsets[floorId] }, rotation)
      lines.push({ id: `${floorId}-horizontal-${y.toFixed(2)}`, start, end })
    }
  })
  return (
    <g stroke="#e2e8f0" strokeWidth={0.02} opacity={0.35}>
      {lines.map((line) => (
        <line key={line.id} x1={line.start.x} y1={line.start.y} x2={line.end.x} y2={line.end.y} />
      ))}
    </g>
  )
}

function ZoneMesh({
  entry,
  devices,
  selected,
  viewOptions,
  showDeviceLines,
  rotation,
  onClick,
  onDoubleClick,
  onContextMenu,
  onPointerDown,
  onHover,
  onHoverEnd,
  onHandlePointerDown,
  showHandles,
  zoneHasAlert,
  floor,
  showAllFloors,
}) {
  const { zone, top, bottom, centroidPoint, zoneHeight, floorOffset } = entry
  const surfaces = []
  for (let i = 0; i < top.length; i += 1) {
    const next = (i + 1) % top.length
    surfaces.push({ id: `${zone.id}-face-${i}`, points: [top[i], top[next], bottom[next], bottom[i]] })
  }
  const topColor = adjustColor(zone.color, 25)
  const sideColor = adjustColor(zone.color, -20)
  const outline = selected ? '#0ea5e9' : 'rgba(15,23,42,0.6)'
  const avgTemp = zone.avgTemperature ?? devices.find((device) => typeof device?.temperature === 'number')?.temperature
  const tempColor = getTemperatureColor(avgTemp)
  const deviceCount = devices.length || zone.deviceCount || 0
  const activeDevices = devices.length ? devices.filter((device) => device?.state === 'on').length : zone.activeDevices
  const occupancySensor = devices.find((device) => device?.type === 'sensor')
  const occupancyState = occupancySensor?.state === 'on'
  return (
    <g
      className="cursor-pointer"
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      onContextMenu={onContextMenu}
      onMouseEnter={onHover}
      onMouseMove={onHover}
      onMouseLeave={onHoverEnd}
      onMouseDown={onPointerDown}
    >
      <polygon
        points={top.map((point) => `${point.x},${point.y}`).join(' ')}
        fill={topColor}
        fillOpacity={zone.transparency || 0.8}
        stroke={outline}
        strokeWidth={selected ? 0.12 : 0.05}
        className={cn('transition-all', selected && 'drop-shadow-[0_0_18px_rgba(14,165,233,0.5)]')}
      />
      {surfaces.map((surface) => (
        <polygon key={surface.id} points={surface.points.map((point) => `${point.x},${point.y}`).join(' ')} fill={sideColor} fillOpacity={0.6} stroke={outline} strokeWidth={0.04} />
      ))}
      {viewOptions.showLabels && (
        <g>
          <text x={centroidPoint.x} y={centroidPoint.y} textAnchor="middle" className="fill-foreground text-[6px] font-semibold">
            {zone.name}
          </text>
          <text x={centroidPoint.x} y={centroidPoint.y + 6} textAnchor="middle" className="fill-primary text-[5px]">
            {activeDevices}/{deviceCount} actifs
          </text>
          {avgTemp && (
            <text x={centroidPoint.x} y={centroidPoint.y + 12} textAnchor="middle" className="fill-muted-foreground text-[4.5px]">
              {avgTemp}°C · {zoneHeight.toFixed(1)}m
            </text>
          )}
          {showAllFloors && floor && (
            <text x={centroidPoint.x} y={centroidPoint.y + 18} textAnchor="middle" className="fill-muted-foreground text-[5px] font-semibold">
              {floor.label || floor.name}
            </text>
          )}
        </g>
      )}
      {viewOptions.showDevices && (
        <DeviceIcons
          zone={zone}
          devices={devices}
          rotation={rotation}
          centroid={centroidPoint}
          showLines={showDeviceLines}
          tempColor={tempColor}
          floorOffset={floorOffset}
        />
      )}
      {showHandles && (
        <g>
          {zone.points.map((point, index) => {
            const projected = projectPoint({ ...point, z: floorOffset + zoneHeight }, rotation)
            return (
              <circle
                key={`${zone.id}-handle-${index}`}
                cx={projected.x}
                cy={projected.y}
                r={0.25}
                className="fill-background stroke-primary"
                onMouseDown={(event) => onHandlePointerDown(event, zone, index)}
              />
            )
          })}
        </g>
      )}
      <g transform={`translate(${centroidPoint.x - 12}, ${centroidPoint.y - 40})`}>
        {showAllFloors && floor && (
          <Badge variant="outline" className="mb-1 gap-1 text-[7px]" style={{ backgroundColor: floor.color + '40', borderColor: floor.color }}>
            <Layers className="h-2.5 w-2.5" />
            {floor.label || floor.name}
          </Badge>
        )}
        <Badge variant="secondary" className="gap-1 text-[8px]">
          <Thermometer className="h-3 w-3" />
          {avgTemp ? `${avgTemp}°C` : '—'}
        </Badge>
        {zoneHasAlert(zone) && (
          <Badge variant="destructive" className="mt-1 gap-1 text-[8px]">
            <AlertTriangle className="h-3 w-3" />
            Alerte
          </Badge>
        )}
        {occupancySensor && (
          <Badge variant={occupancyState ? 'success' : 'outline'} className="mt-1 gap-1 text-[8px]">
            {occupancyState ? 'Occupé' : 'Libre'}
          </Badge>
        )}
      </g>
    </g>
  )
}

function DeviceIcons({ zone, devices, rotation, centroid, showLines, tempColor, floorOffset }) {
  if (!devices.length) return null
  const minX = Math.min(...zone.points.map((point) => point.x))
  const minY = Math.min(...zone.points.map((point) => point.y))
  const maxX = Math.max(...zone.points.map((point) => point.x))
  const maxY = Math.max(...zone.points.map((point) => point.y))
  const width = maxX - minX
  const depth = maxY - minY
  const cols = Math.max(1, Math.floor(width))
  const rows = Math.max(1, Math.ceil(devices.length / cols))
  const nodes = devices.map((device, index) => {
    const col = index % cols
    const row = Math.floor(index / cols)
    const x = minX + (width / Math.max(1, cols)) * (col + 0.5)
    const y = minY + (depth / Math.max(1, rows)) * (row + 0.5)
    const projected = projectPoint({ x, y, z: floorOffset + zone.height * 0.6 }, rotation)
    return { device, point: projected }
  })
  return (
    <g>
      {showLines &&
        nodes.map((node) => (
          <line
            key={`${zone.id}-${node.device.id}-line`}
            x1={centroid.x}
            y1={centroid.y}
            x2={node.point.x}
            y2={node.point.y}
            stroke="rgba(15,23,42,0.3)"
            strokeWidth={0.05}
            strokeDasharray="0.3 0.3"
          />
        ))}
      {nodes.map((node) => (
        <g key={`${zone.id}-${node.device.id}`} transform={`translate(${node.point.x - 0.6}, ${node.point.y - 0.6})`}>
          <rect width={1.2} height={1.2} rx={0.2} fill={DEVICE_TYPE_COLORS[node.device.type] || tempColor} opacity={0.9} />
          <text x={0.6} y={0.9} textAnchor="middle" className="fill-primary-foreground text-[4px]">
            {(node.device.name || '').split(' ').slice(0, 1).join('')}
          </text>
        </g>
      ))}
    </g>
  )
}

function DraftRectangle({ draft, rotation, floorOffsets }) {
  const { start, current, floorId } = draft
  const points = [
    { x: start.x, y: start.y },
    { x: current.x, y: start.y },
    { x: current.x, y: current.y },
    { x: start.x, y: current.y },
  ]
  const projected = projectPolygon(points, floorOffsets[floorId] ?? 0, rotation)
  return (
    <polygon points={projected.map((point) => `${point.x},${point.y}`).join(' ')} fill="rgba(14,165,233,0.3)" stroke="#0ea5e9" strokeDasharray="0.4 0.3" />
  )
}

function DraftPolygon({ draft, rotation, floorOffsets }) {
  const allPoints = draft.preview ? [...draft.points, draft.preview] : draft.points
  const projected = projectPolygon(allPoints, floorOffsets[draft.floorId] ?? 0, rotation)
  return (
    <polyline points={projected.map((point) => `${point.x},${point.y}`).join(' ')} fill="rgba(14,165,233,0.2)" stroke="#0ea5e9" strokeDasharray="0.4 0.3" />
  )
}

function SelectionOverlay({ selection }) {
  const x = Math.min(selection.start.x, selection.current.x)
  const y = Math.min(selection.start.y, selection.current.y)
  const width = Math.abs(selection.current.x - selection.start.x)
  const height = Math.abs(selection.current.y - selection.start.y)
  return <rect x={x} y={y} width={width} height={height} fill="rgba(14,165,233,0.15)" stroke="#0ea5e9" strokeDasharray="0.4 0.3" />
}

function FloorManager({ floors, activeFloorId, onSelectFloor, onReorder, onAddFloor, onRemoveFloor, onUpdateFloor, onCreateZone }) {
  return (
    <Card className="bg-background/80">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Layers className="h-4 w-4 text-primary" />
          Étages
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        <Tabs value={activeFloorId} onValueChange={onSelectFloor}>
          <TabsList className="flex flex-wrap">
            {floors.map((floor) => (
              <TabsTrigger key={floor.id} value={floor.id} className="flex items-center gap-1 text-xs">
                {floor.label || floor.name || 'Étage'}
              </TabsTrigger>
            ))}
          </TabsList>
          {floors.map((floor) => (
            <TabsContent key={floor.id} value={floor.id} className="mt-2 space-y-3">
              <div className="flex items-center justify-between text-sm">
                <div>
                  <p className="font-medium">{floor.name}</p>
                  <p className="text-xs text-muted-foreground">Hauteur {floor.height} m</p>
                </div>
                <div className="flex items-center gap-1">
                  <Button size="icon" variant="ghost" onClick={() => onReorder(floor.id, -1)}>
                    <ChevronUp className="h-4 w-4" />
                  </Button>
                  <Button size="icon" variant="ghost" onClick={() => onReorder(floor.id, 1)}>
                    <ChevronDown className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              <div className="space-y-2 text-xs text-muted-foreground">
                <div className="grid gap-1">
                  <Label className="text-[10px] uppercase">Nom</Label>
                  <Input
                    value={floor.name || ''}
                    placeholder="Ex : Rez-de-chaussée"
                    className="h-8"
                    onChange={(event) => onUpdateFloor(floor.id, { name: event.target.value })}
                  />
                </div>
                <div className="grid gap-1">
                  <Label className="text-[10px] uppercase">Label court</Label>
                  <Input
                    value={floor.label || ''}
                    placeholder="Ex : RDC"
                    className="h-8"
                    onChange={(event) => onUpdateFloor(floor.id, { label: event.target.value })}
                  />
                </div>
                <div className="grid gap-1">
                  <Label className="text-[10px] uppercase">Couleur</Label>
                  <input
                    type="color"
                    value={floor.color || '#22c55e'}
                    onChange={(event) => onUpdateFloor(floor.id, { color: event.target.value })}
                    className="h-8 w-full cursor-pointer rounded-md border bg-background p-1"
                  />
                </div>
                <label className="flex items-center justify-between gap-2">
                  Hauteur (m)
                  <Input
                    value={floor.height}
                    type="number"
                    className="h-8 w-20"
                    onChange={(event) => onUpdateFloor(floor.id, { height: Number(event.target.value) || floor.height })}
                  />
                </label>
                <Button size="sm" variant="default" onClick={() => onCreateZone(floor.id)} className="w-full">
                  <Plus className="mr-1 h-3 w-3" />
                  Ajouter une zone
                </Button>
                <Button size="sm" variant="ghost" onClick={() => onRemoveFloor(floor.id)}>
                  Supprimer l'étage
                </Button>
              </div>
            </TabsContent>
          ))}
        </Tabs>
        <Button size="sm" className="w-full" onClick={onAddFloor}>
          Ajouter un étage
        </Button>
      </CardContent>
    </Card>
  )
}

function ZonePropertiesPanel({ zone, floors, unitSystem, onChange }) {
  const unit = UNIT_SYSTEMS[unitSystem] || UNIT_SYSTEMS.metric
  const dimensions = useMemo(() => {
    if (!zone) {
      return { width: 0, depth: 0 }
    }
    return getZoneDimensions(zone.points)
  }, [zone])

  const handleDimensionInput = (dimension, rawValue) => {
    if (!zone) return
    const normalized = Number(rawValue?.toString().replace(',', '.'))
    if (!Number.isFinite(normalized) || normalized <= 0) return
    const baseValue = normalized / unit.ratio
    const target = {}
    if (dimension === 'width') target.width = baseValue
    if (dimension === 'depth') target.depth = baseValue
    const updatedPoints = resizeZonePoints(zone.points, target)
    onChange({ points: updatedPoints })
  }

  const handleHeightChange = (event) => {
    if (!zone) return
    const parsedValue = Number(event.target.value)
    if (!Number.isFinite(parsedValue) || parsedValue <= 0) return
    onChange({ height: parsedValue })
  }

  if (!zone) {
    return (
      <Card className="bg-background/80">
        <CardHeader>
          <CardTitle className="text-base">Propriétés</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">Sélectionnez une zone pour modifier ses propriétés.</p>
        </CardContent>
      </Card>
    )
  }

  const widthDisplay = dimensions.width ? (dimensions.width * unit.ratio).toFixed(2) : ''
  const depthDisplay = dimensions.depth ? (dimensions.depth * unit.ratio).toFixed(2) : ''

  return (
    <Card className="bg-background/80">
      <CardHeader>
        <CardTitle className="text-base">{zone.name}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        <div className="grid gap-2">
          <Label>Étage</Label>
          <div className="flex gap-2">
            <select
              className="h-9 flex-1 rounded-md border bg-background px-2"
              value={zone.floorId || ''}
              onChange={(event) => onChange({ floorId: event.target.value || null })}
            >
              <option value="">Non assignée</option>
              {floors.map((floor) => (
                <option key={floor.id} value={floor.id}>
                  {floor.name || floor.label || floor.id}
                </option>
              ))}
            </select>
            <Button size="sm" variant="ghost" onClick={() => onChange({ floorId: null })} disabled={!zone.floorId}>
              Retirer
            </Button>
          </div>
        </div>
        <div className="grid gap-2">
          <Label>Couleur</Label>
          <input type="color" value={zone.color} onChange={(event) => onChange({ color: event.target.value })} className="h-10 w-full rounded-md border bg-background" />
        </div>
        <div className="space-y-2">
          <Label>Dimensions ({unit.label})</Label>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <span className="text-[11px] uppercase text-muted-foreground">Largeur</span>
              <Input
                type="number"
                inputMode="decimal"
                min="0.1"
                step="0.1"
                value={widthDisplay}
                onChange={(event) => handleDimensionInput('width', event.target.value)}
                placeholder={`0 ${unit.label}`}
              />
            </div>
            <div className="space-y-1">
              <span className="text-[11px] uppercase text-muted-foreground">Profondeur</span>
              <Input
                type="number"
                inputMode="decimal"
                min="0.1"
                step="0.1"
                value={depthDisplay}
                onChange={(event) => handleDimensionInput('depth', event.target.value)}
                placeholder={`0 ${unit.label}`}
              />
            </div>
          </div>
          <div className="space-y-1">
            <span className="text-[11px] uppercase text-muted-foreground">Hauteur (m)</span>
            <Input type="number" inputMode="decimal" min="0.1" step="0.1" value={zone.height} onChange={handleHeightChange} />
          </div>
        </div>
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>Surface</span>
          <span>{formatDimension(zone.area, unitSystem, true)}</span>
        </div>
      </CardContent>
    </Card>
  )
}

function ZoneListPanel({ zonesByFloor, floors, activeFloorId, selectedZoneIds, onSelectZone, onDeleteZone, onAddZoneToFloor, onCreateZone, onSelectFloor }) {
  const unassignedZones = zonesByFloor.unassigned || []
  return (
    <Card className="bg-background/80">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <List className="h-4 w-4 text-primary" />
          Zones par étage
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {floors.map((floor) => {
          const zones = zonesByFloor[floor.id] || []
          const isActive = floor.id === activeFloorId
          return (
            <div key={floor.id} className={cn('rounded-lg border transition-colors', isActive ? 'border-primary bg-primary/5' : 'border-muted')}>
              <button
                type="button"
                className="flex w-full items-center justify-between px-3 py-2 text-left"
                onClick={() => onSelectFloor(floor.id)}
              >
                <div className="flex items-center gap-2">
                  <div className="h-3 w-3 rounded-full" style={{ backgroundColor: floor.color }} />
                  <span className="font-semibold text-sm">{floor.name || floor.label || floor.id}</span>
                  <Badge variant="outline" className="text-xs">
                    {zones.length}
                  </Badge>
                </div>
                <ChevronDown className={cn('h-4 w-4 transition-transform', isActive ? 'rotate-180' : 'rotate-0')} />
              </button>
              {isActive && (
                <div className="space-y-2 border-t px-3 py-2">
                  {zones.length === 0 ? (
                    <p className="text-xs text-muted-foreground italic">Aucune zone pour cet étage.</p>
                  ) : (
                    zones.map((zone) => (
                      <div
                        key={zone.id}
                        className={cn(
                          'flex items-center justify-between rounded-md border px-2 py-1.5 text-xs transition-colors',
                          selectedZoneIds.includes(zone.id) ? 'bg-primary/10 border-primary' : 'bg-muted/40',
                        )}
                      >
                        <button type="button" onClick={() => onSelectZone(zone.id)} className="flex-1 text-left">
                          <p className="font-medium">{zone.name}</p>
                          <p className="text-muted-foreground text-[10px]">{zone.area?.toFixed(1) || '—'} m²</p>
                        </button>
                        <div className="flex items-center gap-1">
                          <Button size="sm" variant="ghost" className="h-6 px-2 text-[10px]" onClick={() => onAddZoneToFloor(zone.id, null)}>
                            Retirer
                          </Button>
                          <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => onDeleteZone([zone.id])}>
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>
                    ))
                  )}
                  <Button size="sm" className="w-full" variant="outline" onClick={() => onCreateZone(floor.id)}>
                    <Plus className="mr-1 h-3 w-3" />
                    Ajouter une zone
                  </Button>
                </div>
              )}
            </div>
          )
        })}
        {unassignedZones.length > 0 && (
          <div className="rounded-lg border">
            <div className="flex items-center justify-between px-3 py-2">
              <span className="font-semibold text-sm">Zones non assignées</span>
              <Badge variant="outline" className="text-xs">
                {unassignedZones.length}
              </Badge>
            </div>
            <div className="space-y-2 border-t px-3 py-2">
              {unassignedZones.map((zone) => (
                <div
                  key={zone.id}
                  className={cn(
                    'flex items-center justify-between rounded-md border px-2 py-1.5 text-xs transition-colors',
                    selectedZoneIds.includes(zone.id) ? 'bg-primary/10 border-primary' : 'bg-muted/40',
                  )}
                >
                  <button type="button" onClick={() => onSelectZone(zone.id)} className="flex-1 text-left">
                    <p className="font-medium">{zone.name}</p>
                    <p className="text-muted-foreground text-[10px]">{zone.area?.toFixed(1) || '—'} m²</p>
                  </button>
                  <div className="flex items-center gap-1">
                    <select
                      className="h-6 rounded border bg-background px-1 text-[10px]"
                      value=""
                      onChange={(event) => {
                        if (event.target.value) {
                          onAddZoneToFloor(zone.id, event.target.value)
                          event.target.value = ''
                        }
                      }}
                    >
                      <option value="">Assigner à...</option>
                      {floors.map((floor) => (
                        <option key={floor.id} value={floor.id}>
                          {floor.name || floor.label || floor.id}
                        </option>
                      ))}
                    </select>
                    <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => onDeleteZone([zone.id])}>
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
