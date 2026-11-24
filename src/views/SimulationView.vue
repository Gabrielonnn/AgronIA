<script setup lang="ts">
import { computed, ref, onMounted, onBeforeUnmount, shallowRef, watch } from 'vue'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { Cpu, Download, LocateFixed, MapPinned, Maximize2, Minimize2, Move, Pause, Play, Wind } from 'lucide-vue-next'
import { RouterLink, useRoute } from 'vue-router'
import DroneConnectionPanel from '../components/simulation/DroneConnectionPanel.vue'
import {
  detectHardwareGpuModel,
  graphicsQuality,
  setGraphicsQuality,
  type GraphicsQualityPreset,
} from '../services/desktopRuntime'
import {
  createAlert,
  createSimulation,
  listFields,
  saveFieldMetric,
  type FieldRecord,
} from '../services/agronomyData'
import { projectFieldGeometry, type FieldPoint, type ProjectedField } from '../services/fieldGeometry'
import { advancePlantWaterStress, planCoverageRoute, type CoverageRoute } from '../services/simulationModel'

interface PlantData {
  id: string; x: number; z: number; health: number; ndvi: number; temp: number; status: string; stage: number
  waterStress: number; dead: boolean; irrigated: boolean
}

interface StressCenter {
  id: string; x: number; z: number; intensity: number; radius: number; type: 'DROUGHT' | 'OVERHYDRATION' | 'PEST'
}

interface AmbientCloud {
  group: THREE.Group
  speed: number
  bounds: number
  baseY: number
  phase: number
}

interface AmbientBird {
  group: THREE.Group
  leftWing: THREE.Mesh
  rightWing: THREE.Mesh
  speed: number
  bounds: number
  baseY: number
  phase: number
}

const canvasRef = ref<HTMLCanvasElement | null>(null)
const containerRef = ref<HTMLDivElement | null>(null)
const route = useRoute()
const fields = shallowRef<FieldRecord[]>([])
const selectedFieldGeometry = shallowRef<ProjectedField | null>(null)
const selectedFieldId = ref('')
const savingSnapshot = ref(false)
const liveDrone = ref<{
  connected: boolean
  hasHeartbeat: boolean
  armed: boolean | null
  latitude: number | null
  longitude: number | null
  altitude: number | null
  relativeAltitude: number | null
  groundSpeed: number | null
  heading: number | null
}>({
  connected: false,
  hasHeartbeat: false,
  armed: null,
  latitude: null,
  longitude: null,
  altitude: null,
  relativeAltitude: null,
  groundSpeed: null,
  heading: null,
})
const currentMode = ref<'rgb' | 'ndvi' | 'thermal'>('rgb')
const droneState = ref<'IDLE' | 'SCANNING' | 'FLYING' | 'ACTION' | 'RETURNING' | 'CENTINELAS'>('IDLE')
const currentAction = ref<'NONE' | 'WATER' | 'FUMIGATE' | 'CENTINELAS'>('NONE')
const simulationPaused = ref(false)
const windEnabled = ref(true)
const cameraFollowEnabled = ref(true)
const cameraPanMode = ref(false)
const isFullscreen = ref(false)

const coverageRoute = ref<CoverageRoute | null>(null)
const trendHistory = ref<Array<{ elapsed: number; health: number; humidity: number; ndvi: number }>>([])
const simulationElapsedSeconds = ref(0)
const affectedPlants = ref<PlantData[]>([])

const liveFps = ref(60)
const frameTimeMs = ref(16.6)
const gpuRendererName = ref(detectHardwareGpuModel())
let mainDirLight: THREE.DirectionalLight | null = null
let pointerDirty = true
let fieldSimulationOngoing = false


// Datos de interacción (panel fijo de inspección en la columna izquierda)
const hoveredPlant = ref<PlantData | null>(null)
const lastInspectedPlant = ref<PlantData | null>(null)
const inspectedPlant = computed(() => hoveredPlant.value ?? lastInspectedPlant.value)
const inspectedPlantGps = computed(() => inspectedPlant.value ? plantGps(inspectedPlant.value) : null)
const hoveredSector = ref<StressCenter | null>(null)
const actionFeedback = ref('')

// Three.js variables
const scene = shallowRef<THREE.Scene | null>(null)
const renderer = shallowRef<THREE.WebGLRenderer | null>(null)
const camera = shallowRef<THREE.PerspectiveCamera | null>(null)
const controls = shallowRef<OrbitControls | null>(null)
const resizeObserver = shallowRef<ResizeObserver | null>(null)
const raycaster = shallowRef<THREE.Raycaster | null>(null)
const mouse = shallowRef<THREE.Vector2 | null>(null)
const animationId = ref<number>(0)

// Data arrays para InstancedMesh
let allPlants: PlantData[] = []
let leafToPlantMap: number[] = []; let tasselToPlantMap: number[] = []; let earToPlantMap: number[] = []

// Instanced Meshes
let trunkMesh: THREE.InstancedMesh, leafMesh: THREE.InstancedMesh
let tasselMesh: THREE.InstancedMesh, earMesh: THREE.InstancedMesh, hitboxMesh: THREE.InstancedMesh
let groundMaterial: THREE.MeshLambertMaterial
let parcelSurfaceMaterials: THREE.MeshLambertMaterial[] = []
let cropGroup: THREE.Group | null = null
let parcelOutlineGroup: THREE.Group | null = null
let leafWindUniform: { value: number } | null = null
let leafWindStrengthUniform: { value: number } | null = null
let sectorFalloffTexture: THREE.CanvasTexture | null = null
let simulationTime = 0
let ambientTime = 0
let ambientMotionEnabled = true
const ambientClouds: AmbientCloud[] = []
const ambientBirds: AmbientBird[] = []
const ambientGeometries: THREE.BufferGeometry[] = []
const ambientMaterials: THREE.Material[] = []

// Dron y Analisis
let stressCenters: StressCenter[] = []
let droneGroup: THREE.Group
let droneGroupReady = false
let liveDroneGroup: THREE.Group | null = null
let liveDroneTrail: THREE.Line | null = null
let liveDronePath: FieldPoint[] = []
let fallbackGpsOrigin: { latitude: number; longitude: number } | null = null
let pendingDroneSnapshot: typeof liveDrone.value | null = null
let lastDroneMetricSavedAt = 0
let propellers: THREE.Mesh[] = []
let sectorMarkers: THREE.Mesh[] = []
let particleSystem: THREE.Points
let particleGeo: THREE.BufferGeometry
let activeTargets: StressCenter[] = []
let activeTargetIndex = 0
let scanRouteLine: THREE.Line | null = null

let dronePath: THREE.Vector3[] = []
let currentPathIndex = 0
let feedbackTimeout: ReturnType<typeof setTimeout> | undefined

// Enjambre de Centinelas
let centinelaGroup: THREE.Group | null = null
let centinelaPropellers: THREE.Mesh[] = []

const DRONE_BASE = new THREE.Vector3(-15, 0.5, 15)
const FLIGHT_HEIGHT = 8
const BASE_CROP_WIDTH = 46
const BASE_CROP_DEPTH = 44
const PARTICLE_COUNT = 500
const particlePositions = new Float32Array(PARTICLE_COUNT * 3)
const particleVelocities = new Float32Array(PARTICLE_COUNT * 3)

const modes = [
  { id: 'rgb', name: 'RGB', color: 'bg-green-500' },
  { id: 'ndvi', name: 'Multiespectral', color: 'bg-red-500' },
  { id: 'thermal', name: 'Térmico', color: 'bg-orange-500' }
] as const

// Telemetría en tiempo real derivada de la simulación
const telemetry = ref({
  avgHealth: 0,
  avgHumidity: 0,
  avgPestIndex: 0,
  avgNDVI: 0,
  avgTemp: 0,
  plantCount: 0,
  stressZones: 0,
  stressedPlants: 0,
  deadPlants: 0,
})

const fieldDimensionsLabel = computed(() => {
  const field = selectedFieldGeometry.value
  if (!field) return ''
  return `${field.widthMeters.toFixed(1)} m × ${field.depthMeters.toFixed(1)} m · ${field.areaHectares.toFixed(2)} ha`
})
const openRingPoints = (ring: FieldPoint[]) => {
  const first = ring[0]
  const last = ring[ring.length - 1]
  return ring.length > 1 && first.x === last.x && first.z === last.z
    ? ring.slice(0, -1)
    : ring
}
const scaleX = computed(() =>
  selectedFieldGeometry.value ? selectedFieldGeometry.value.widthMeters / BASE_CROP_WIDTH : 1,
)
const scaleZ = computed(() =>
  selectedFieldGeometry.value ? selectedFieldGeometry.value.depthMeters / BASE_CROP_DEPTH : 1,
)
const estimatedAreaHectares = computed(() => selectedFieldGeometry.value?.areaHectares ?? 1)
const currency = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 })
const affectedPlantRatio = computed(() =>
  telemetry.value.plantCount > 0 ? telemetry.value.stressedPlants / telemetry.value.plantCount : 0,
)
const treatmentCostAmount = computed(() => estimatedAreaHectares.value * 1650)
const preventionCostAmount = computed(() => estimatedAreaHectares.value * 520)
const estimatedSavingsAmount = computed(() =>
  estimatedAreaHectares.value * 2400 * affectedPlantRatio.value,
)
const projectedSavingsNetAmount = computed(() => Math.max(
  0,
  estimatedSavingsAmount.value - preventionCostAmount.value,
))
const treatmentCost = computed(() => currency.format(treatmentCostAmount.value))
const preventionCost = computed(() => currency.format(preventionCostAmount.value))
const estimatedSavings = computed(() => currency.format(estimatedSavingsAmount.value))
const projectedSavingsNet = computed(() => currency.format(projectedSavingsNetAmount.value))

const trendPoints = (key: 'health' | 'humidity' | 'ndvi') => {
  const history = trendHistory.value
  if (history.length < 2) return ''
  return history.map((sample, index) => {
    const x = (index / (history.length - 1)) * 300
    const y = 90 - Math.min(100, Math.max(0, sample[key])) * 0.8
    return `${x.toFixed(1)},${y.toFixed(1)}`
  }).join(' ')
}

const plantGps = (plant: PlantData) => {
  const field = selectedFieldGeometry.value
  if (!field) return null
  const point = { x: plant.x * scaleX.value, z: plant.z * scaleZ.value }
  return field.contains(point) ? field.unprojectGps(point) : null
}

const handleSelectedFieldChange = () => {
  applySelectedField()
  if (!allPlants.length) return
  if (!relocatePlantsToSelectedField()) {
    setActionFeedback('No se pudo encontrar una ubicación de muestra dentro de esta parcela; se conservaron las posiciones demostrativas.')
  }
  allPlants.forEach(plant => {
    plant.waterStress = 0
    plant.dead = false
    plant.irrigated = false
  })
  generateRandomStressCenters()
  fieldSimulationOngoing = false
  regenerateFieldHealth()
  trendHistory.value = []
  simulationElapsedSeconds.value = 0
  addTrendSample()
}

watch(() => route.query.fieldId, fieldId => {
  if (typeof fieldId !== 'string' || !fieldId) return
  const field = fields.value.find(item => item.id === fieldId)
  if (!field) {
    selectedFieldId.value = ''
    selectedFieldGeometry.value = null
    setActionFeedback('No se encontró la parcela solicitada o no tienes permiso para verla.')
    return
  }
  if (droneState.value !== 'IDLE') {
    setActionFeedback('Detén la misión actual antes de cambiar de parcela.')
    return
  }
  selectedFieldId.value = fieldId
  handleSelectedFieldChange()
  if (!selectedFieldGeometry.value) {
    setActionFeedback('La parcela existe, pero no tiene una geometría válida guardada para mostrar.')
  }
})

const disposeGroupChildren = (group: THREE.Group) => {
  for (const child of [...group.children]) {
    group.remove(child)
    if (child instanceof THREE.Mesh || child instanceof THREE.Line) {
      child.geometry.dispose()
      const materials = Array.isArray(child.material) ? child.material : [child.material]
      materials.forEach(material => material.dispose())
    }
  }
}

const clearLiveDroneTrail = () => {
  if (!liveDroneTrail) return
  scene.value?.remove(liveDroneTrail)
  liveDroneTrail.geometry.dispose()
  const materials = Array.isArray(liveDroneTrail.material) ? liveDroneTrail.material : [liveDroneTrail.material]
  materials.forEach(material => material.dispose())
  liveDroneTrail = null
}

const clearScanRouteLine = () => {
  if (!scanRouteLine) return
  scene.value?.remove(scanRouteLine)
  scanRouteLine.geometry.dispose()
  const materials = Array.isArray(scanRouteLine.material) ? scanRouteLine.material : [scanRouteLine.material]
  materials.forEach(material => material.dispose())
  scanRouteLine = null
}

const frameCameraOnField = () => {
  if (!camera.value || !controls.value) return

  const geometry = selectedFieldGeometry.value
  controls.value.target.set(0, 0, 0)
  if (!geometry) {
    camera.value.position.set(0, 29, 42)
    controls.value.minDistance = 3
    controls.value.maxDistance = 180
  } else {
    const maxDimension = Math.max(geometry.widthMeters, geometry.depthMeters)
    const fieldRadius = Math.hypot(geometry.widthMeters, geometry.depthMeters) / 2
    const aspect = Math.max(camera.value.aspect, 0.01)
    const halfVerticalFov = THREE.MathUtils.degToRad(camera.value.fov / 2)
    const halfFitFov = Math.atan(Math.tan(halfVerticalFov) * Math.min(aspect, 1))
    const distance = fieldRadius / Math.sin(halfFitFov) * 1.2
    camera.value.position.set(0, distance * 0.58, distance * 0.82)
    controls.value.minDistance = 3
    controls.value.maxDistance = Math.max(120, distance * 2, maxDimension * 4)
    camera.value.far = Math.max(1000, distance * 4)
    camera.value.updateProjectionMatrix()
  }
  controls.value.update()
}

const applySelectedField = () => {
  const field = fields.value.find(item => item.id === selectedFieldId.value)
  selectedFieldGeometry.value = field ? projectFieldGeometry(field.geojson_data) : null
  cameraFollowEnabled.value = true
  liveDronePath = []
  fallbackGpsOrigin = null
  clearLiveDroneTrail()
  clearScanRouteLine()
  coverageRoute.value = null
  if (!scene.value || !cropGroup || !parcelOutlineGroup) return
  const outlineGroup = parcelOutlineGroup

  disposeGroupChildren(outlineGroup)
  parcelSurfaceMaterials = []
  const geometry = selectedFieldGeometry.value
  if (!geometry) {
    cropGroup.scale.set(1, 1, 1)
    DRONE_BASE.set(-15, 0.5, 15)
    if (droneGroupReady) droneGroup.position.copy(DRONE_BASE)
    frameCameraOnField()
    return
  }

  DRONE_BASE.set(-geometry.widthMeters * 0.3, 0.5, geometry.depthMeters * 0.3)
  if (!geometry.contains({ x: DRONE_BASE.x, z: DRONE_BASE.z })) {
    const baseRoute = planCoverageRoute({
      widthMeters: geometry.widthMeters,
      depthMeters: geometry.depthMeters,
      laneSpacingMeters: Math.max(6, Math.min(geometry.widthMeters, geometry.depthMeters) / 8),
      start: { x: DRONE_BASE.x, z: DRONE_BASE.z },
      fieldGeometry: geometry,
    })
    DRONE_BASE.set(baseRoute.points[0].x, 0.5, baseRoute.points[0].z)
  }
  if (droneGroupReady) droneGroup.position.copy(DRONE_BASE)
  cropGroup.scale.set(
    geometry.widthMeters / BASE_CROP_WIDTH,
    1,
    geometry.depthMeters / BASE_CROP_DEPTH,
  )

  for (const polygon of geometry.polygons) {
    const [exterior, ...holes] = polygon.rings
    const exteriorPoints = openRingPoints(exterior)
    if (exteriorPoints.length >= 3) {
      const shape = new THREE.Shape()
      shape.moveTo(exteriorPoints[0].x, -exteriorPoints[0].z)
      exteriorPoints.slice(1).forEach(point => shape.lineTo(point.x, -point.z))
      shape.closePath()
      holes.forEach(ring => {
        const holePoints = openRingPoints(ring)
        if (holePoints.length < 3) return
        const hole = new THREE.Path()
        hole.moveTo(holePoints[0].x, -holePoints[0].z)
        holePoints.slice(1).forEach(point => hole.lineTo(point.x, -point.z))
        hole.closePath()
        shape.holes.push(hole)
      })
      const surfaceMaterial = new THREE.MeshLambertMaterial({
        color: currentMode.value === 'rgb' ? 0x765b40 : currentMode.value === 'ndvi' ? 0x1e40af : 0x450a0a,
        side: THREE.DoubleSide,
      })
      const surface = new THREE.Mesh(
        new THREE.ShapeGeometry(shape),
        surfaceMaterial,
      )
      parcelSurfaceMaterials.push(surfaceMaterial)
      surface.geometry.rotateX(-Math.PI / 2)
      surface.position.y = 0.035
      surface.receiveShadow = true
      surface.renderOrder = 1
      outlineGroup.add(surface)
    }

    polygon.rings.forEach((ring, ringIndex) => {
      const points = openRingPoints(ring).map(point => new THREE.Vector3(point.x, 0.09, point.z))
      const line = new THREE.LineLoop(
        new THREE.BufferGeometry().setFromPoints(points),
        new THREE.LineBasicMaterial({
          color: ringIndex === 0 ? 0xf2cf68 : 0xd7e6bd,
          linewidth: 2,
          transparent: true,
          opacity: 0.95,
        }),
      )
      line.renderOrder = 2
      outlineGroup.add(line)
    })
  }

  frameCameraOnField()
}

const relocatePlantsToSelectedField = () => {
  const field = selectedFieldGeometry.value
  if (!field || !allPlants.length) return true

  const candidates: FieldPoint[] = []
  const columns = 60
  const rows = 60
  for (let column = 0; column < columns; column++) {
    const x = -field.widthMeters / 2 + ((column + 0.5) / columns) * field.widthMeters
    for (let row = 0; row < rows; row++) {
      const z = -field.depthMeters / 2 + ((row + 0.5) / rows) * field.depthMeters
      const point = { x, z }
      if (field.contains(point)) candidates.push(point)
    }
  }
  if (candidates.length === 0) return false

  const offsets = allPlants.map(() => ({ x: 0, z: 0 }))
  const occupiedPoints: FieldPoint[] = []
  const originalPoints = allPlants.map(plant => ({
    x: plant.x * scaleX.value,
    z: plant.z * scaleZ.value,
  }))
  const reservedCandidates = new Set<number>()
  originalPoints.forEach(point => {
    if (field.contains(point)) occupiedPoints.push(point)
  })

  allPlants.forEach((plant, index) => {
    const currentPoint = originalPoints[index]
    if (field.contains(currentPoint)) return

    let nearestIndex = -1
    let nearestDistance = Number.POSITIVE_INFINITY
    let fallbackIndex = -1
    let fallbackDistance = Number.POSITIVE_INFINITY
    for (let candidateIndex = 0; candidateIndex < candidates.length; candidateIndex++) {
      if (reservedCandidates.has(candidateIndex)) continue
      const candidate = candidates[candidateIndex]
      const candidateDistance = Math.hypot(currentPoint.x - candidate.x, currentPoint.z - candidate.z)
      if (candidateDistance < fallbackDistance) {
        fallbackIndex = candidateIndex
        fallbackDistance = candidateDistance
      }
      const overlapsPlant = occupiedPoints.some(point => Math.hypot(point.x - candidate.x, point.z - candidate.z) < 0.5)
      if (!overlapsPlant && candidateDistance < nearestDistance) {
        nearestIndex = candidateIndex
        nearestDistance = candidateDistance
      }
    }
    if (nearestIndex < 0) nearestIndex = fallbackIndex
    if (nearestIndex < 0) return
    reservedCandidates.add(nearestIndex)
    const nearest = candidates[nearestIndex]
    occupiedPoints.push(nearest)
    const nextX = nearest.x / scaleX.value
    const nextZ = nearest.z / scaleZ.value
    offsets[index] = { x: nextX - plant.x, z: nextZ - plant.z }
    plant.x = nextX
    plant.z = nextZ
  })

  if (trunkMesh && hitboxMesh && leafMesh) {
    const dummy = new THREE.Object3D()
    allPlants.forEach((plant, index) => {
      const offset = offsets[index]
      if (offset.x === 0 && offset.z === 0) return
      trunkMesh.getMatrixAt(index, dummy.matrix)
      dummy.matrix.setPosition(plant.x, 0, plant.z)
      trunkMesh.setMatrixAt(index, dummy.matrix)
      hitboxMesh.getMatrixAt(index, dummy.matrix)
      dummy.matrix.setPosition(plant.x, 0, plant.z)
      hitboxMesh.setMatrixAt(index, dummy.matrix)
    })
    const shiftInstances = (mesh: THREE.InstancedMesh, plantIndices: number[]) => {
      plantIndices.forEach((plantIndex, instanceIndex) => {
        const offset = offsets[plantIndex]
        if (offset.x === 0 && offset.z === 0) return
        mesh.getMatrixAt(instanceIndex, dummy.matrix)
        dummy.matrix.elements[12] += offset.x
        dummy.matrix.elements[14] += offset.z
        mesh.setMatrixAt(instanceIndex, dummy.matrix)
      })
      mesh.instanceMatrix.needsUpdate = true
    }
    trunkMesh.instanceMatrix.needsUpdate = true
    hitboxMesh.instanceMatrix.needsUpdate = true
    shiftInstances(leafMesh, leafToPlantMap)
    shiftInstances(tasselMesh, tasselToPlantMap)
    shiftInstances(earMesh, earToPlantMap)
    trunkMesh.computeBoundingSphere()
    hitboxMesh.computeBoundingSphere()
    leafMesh.computeBoundingSphere()
    tasselMesh.computeBoundingSphere()
    earMesh.computeBoundingSphere()
  }
  return true
}

const updateLiveDrone = () => {
  const snapshot = pendingDroneSnapshot
  pendingDroneSnapshot = null
  if (snapshot) liveDrone.value = snapshot

  const state = liveDrone.value
  const hasPosition = state.connected
    && state.hasHeartbeat
    && state.latitude !== null
    && state.longitude !== null
  if (!liveDroneGroup) return
  liveDroneGroup.visible = hasPosition
  if (!hasPosition) {
    if (liveDronePath.length) {
      liveDronePath = []
      fallbackGpsOrigin = null
      clearLiveDroneTrail()
    }
    return
  }

  const latitude = state.latitude!
  const longitude = state.longitude!
  let point: FieldPoint
  if (selectedFieldGeometry.value) {
    point = selectedFieldGeometry.value.projectGps(latitude, longitude)
  } else {
    fallbackGpsOrigin ??= { latitude, longitude }
    point = {
      x: (longitude - fallbackGpsOrigin.longitude) * 111_320 * Math.cos(fallbackGpsOrigin.latitude * Math.PI / 180),
      z: -(latitude - fallbackGpsOrigin.latitude) * 110_540,
    }
  }

  const altitude = state.relativeAltitude
  liveDroneGroup.position.set(
    point.x,
    altitude === null ? (state.armed ? FLIGHT_HEIGHT : 0.6) : Math.max(0.6, altitude),
    point.z,
  )
  if (state.heading !== null) liveDroneGroup.rotation.y = state.heading * Math.PI / 180

  const previousPoint = liveDronePath[liveDronePath.length - 1]
  if (!previousPoint || Math.hypot(point.x - previousPoint.x, point.z - previousPoint.z) >= 0.75) {
    liveDronePath.push(point)
    if (liveDronePath.length > 1000) liveDronePath.shift()
    clearLiveDroneTrail()
    liveDroneTrail = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(
        liveDronePath.map(pathPoint => new THREE.Vector3(pathPoint.x, 0.18, pathPoint.z)),
      ),
      new THREE.LineBasicMaterial({ color: 0x55e6d0, transparent: true, opacity: 0.9 }),
    )
    liveDroneTrail.renderOrder = 3
    scene.value?.add(liveDroneTrail)
  }

  const now = Date.now()
  if (selectedFieldId.value && now - lastDroneMetricSavedAt >= 5000) {
    lastDroneMetricSavedAt = now
    void saveFieldMetric({
      field_id: selectedFieldId.value,
      record_date: new Date(now).toISOString(),
      raw_data: {
        source: 'drone_telemetry',
        latitude,
        longitude,
        altitude_msl: state.altitude,
        relative_altitude_m: state.relativeAltitude,
        ground_speed_mps: state.groundSpeed,
        heading_degrees: state.heading,
        armed: state.armed,
      },
    }).catch(error => {
      setActionFeedback(error instanceof Error
        ? `Telemetría recibida, pero no se pudo guardar: ${error.message}`
        : 'Telemetría recibida, pero no se pudo guardar.')
    })
  }
}

const updateCameraFollow = () => {
  if (!cameraFollowEnabled.value || !controls.value || !camera.value) return
  const targetDrone = liveDroneGroup?.visible
    ? liveDroneGroup
    : droneState.value !== 'IDLE'
      ? droneGroup
      : null
  if (!targetDrone) return

  const nextTarget = new THREE.Vector3(
    targetDrone.position.x,
    Math.max(0, targetDrone.position.y * 0.65),
    targetDrone.position.z,
  )
  const delta = nextTarget.sub(controls.value.target).multiplyScalar(0.055)
  controls.value.target.add(delta)
  camera.value.position.add(delta)
}

const handleDroneTelemetry = (snapshot: {
  connected: boolean
  hasHeartbeat: boolean
  armed: boolean | null
  latitude: number | null
  longitude: number | null
  altitude: number | null
  relativeAltitude: number | null
  groundSpeed: number | null
  heading: number | null
}) => {
  pendingDroneSnapshot = {
    connected: snapshot.connected,
    hasHeartbeat: snapshot.hasHeartbeat,
    armed: snapshot.armed,
    latitude: snapshot.latitude,
    longitude: snapshot.longitude,
    altitude: snapshot.altitude,
    relativeAltitude: snapshot.relativeAltitude,
    groundSpeed: snapshot.groundSpeed,
    heading: snapshot.heading,
  }
}

const updateTelemetry = () => {
  if (!allPlants || allPlants.length === 0) return
  const count = allPlants.length
  let sumHealth = 0, sumNDVI = 0, sumTemp = 0, sumMoisture = 0
  for (const p of allPlants) {
    sumHealth += p.health
    sumNDVI += p.ndvi
    sumTemp += p.temp
    sumMoisture += 1 - p.waterStress
  }
  const stressedPlants = allPlants.filter(plant =>
    plant.waterStress >= 0.15 || plant.health < 0.7 || plant.dead,
  ).length
  telemetry.value = {
    avgHealth: parseFloat(((sumHealth / count) * 100).toFixed(1)),
    avgHumidity: parseFloat(((sumMoisture / count) * 100).toFixed(1)),
    avgPestIndex: parseFloat((Math.max(0, 1 - (sumNDVI / count)) * 100 * 0.5).toFixed(1)),
    avgNDVI: parseFloat((sumNDVI / count).toFixed(2)),
    avgTemp: parseFloat((sumTemp / count).toFixed(1)),
    plantCount: count,
    stressZones: stressCenters.length,
    stressedPlants,
    deadPlants: allPlants.filter(plant => plant.dead).length,
  }
}

const getDroughtPressure = (plant: PlantData, center: StressCenter) => {
  const x = plant.x * scaleX.value
  const z = plant.z * scaleZ.value
  const distance = Math.hypot(x - center.x, z - center.z)
  return distance < center.radius
    ? center.intensity * (1 - distance / center.radius)
    : 0
}

const addTrendSample = () => {
  trendHistory.value.push({
    elapsed: simulationElapsedSeconds.value,
    health: telemetry.value.avgHealth,
    humidity: telemetry.value.avgHumidity,
    ndvi: telemetry.value.avgNDVI * 100,
  })
  if (trendHistory.value.length > 24) trendHistory.value.shift()
}

const advanceFieldSimulation = (elapsedSeconds: number) => {
  for (const center of stressCenters) {
    if (center.type === 'DROUGHT') {
      center.intensity = Math.min(1, center.intensity + elapsedSeconds * 0.0015)
    }
  }

  for (const plant of allPlants) {
    const droughtPressure = stressCenters
      .filter(center => center.type === 'DROUGHT')
      .reduce((highest, center) => Math.max(highest, getDroughtPressure(plant, center)), 0)
    Object.assign(
      plant,
      advancePlantWaterStress(plant, droughtPressure, elapsedSeconds),
    )
  }
  regenerateFieldHealth()
  simulationElapsedSeconds.value += elapsedSeconds
  fieldSimulationOngoing = stressCenters.some(center =>
    center.type === 'DROUGHT'
    && allPlants.some(plant => !plant.dead && !plant.irrigated && getDroughtPressure(plant, center) > 0),
  ) || allPlants.some(plant => plant.irrigated && plant.waterStress > 0)
}

const createSoilTexture = () => {
  const size = 512
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const context = canvas.getContext('2d')
  if (!context) throw new Error('No se pudo crear la textura del terreno.')

  context.fillStyle = '#765b40'
  context.fillRect(0, 0, size, size)

  let seed = 82471
  const random = () => {
    seed = (seed * 16807) % 2147483647
    return (seed - 1) / 2147483646
  }
  for (let i = 0; i < 9000; i++) {
    context.fillStyle = random() > 0.52
      ? 'rgba(42, 35, 25, 0.12)'
      : 'rgba(208, 174, 119, 0.11)'
    const diameter = 0.5 + random() * 2
    context.beginPath()
    context.ellipse(
      random() * size,
      random() * size,
      diameter * 1.8,
      diameter,
      random() * Math.PI,
      0,
      Math.PI * 2
    )
    context.fill()
  }

  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.wrapS = THREE.RepeatWrapping
  texture.wrapT = THREE.RepeatWrapping
  texture.repeat.set(12, 12)
  texture.anisotropy = 8
  return texture
}

const createSectorFalloffTexture = () => {
  const canvas = document.createElement('canvas')
  canvas.width = 128
  canvas.height = 128
  const context = canvas.getContext('2d')
  if (!context) throw new Error('No se pudo crear la textura de las zonas de estrés.')

  const gradient = context.createRadialGradient(64, 64, 5, 64, 64, 62)
  gradient.addColorStop(0, 'rgba(255, 255, 255, 0.72)')
  gradient.addColorStop(0.45, 'rgba(255, 255, 255, 0.42)')
  gradient.addColorStop(1, 'rgba(255, 255, 255, 0)')
  context.fillStyle = gradient
  context.fillRect(0, 0, 128, 128)

  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  return texture
}

// Funciones geométricas
const createLeafGeometry = () => {
  const geo = new THREE.PlaneGeometry(0.25, 2.5, 5, 12); geo.translate(0, 1.25, 0)
  const pos = geo.attributes.position
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i), t = y / 2.5
    const wScale = Math.sin((t + 0.05) * Math.PI * 0.9)
    pos.setXYZ(i, pos.getX(i) * wScale, y, -Math.pow(t, 2.2) * 1.5)
  }
  geo.computeVertexNormals(); return geo
}

const createTasselGeometry = () => {
  const numBranches = 7, segments = 4; const vertices = [], indices = []
  for(let b = 0; b < numBranches; b++) {
    const isCenter = b === 0, length = isCenter ? 0.8 : 0.6
    const angle = b * (Math.PI * 2 / (numBranches - 1)), spread = isCenter ? 0 : 0.5
    const baseIdx = (vertices.length / 3)
    for(let s = 0; s <= segments; s++) {
      const t = s / segments, wScale = 0.03 * (1 - t)
      const v0 = new THREE.Vector3(-wScale, t * length, 0), v1 = new THREE.Vector3(wScale, t * length, 0)
      if (!isCenter) {
        v0.z += Math.pow(t, 1.5) * spread; v1.z += Math.pow(t, 1.5) * spread
        v0.applyAxisAngle(new THREE.Vector3(0, 1, 0), angle); v1.applyAxisAngle(new THREE.Vector3(0, 1, 0), angle)
      }
      vertices.push(v0.x, v0.y, v0.z); vertices.push(v1.x, v1.y, v1.z)
      if (s < segments) {
         const i0 = baseIdx + s * 2, i1 = i0 + 1, i2 = i0 + 2, i3 = i0 + 3
         indices.push(i0, i1, i2, i1, i3, i2); indices.push(i0, i2, i1, i1, i2, i3)
      }
    }
  }
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3))
  geo.setIndex(indices); geo.computeVertexNormals(); return geo
}

const lerpColor = (c1: THREE.Color, c2: THREE.Color, t: number) => new THREE.Color().lerpColors(c1, c2, t)

const getStatusName = (health: number, dead = false) => {
  if (dead) return 'Muerta'
  if (health >= 0.7) return 'Alto Vigor'
  if (health >= 0.4) return 'Moderado'
  if (health >= 0.25) return 'Bajo Vigor'
  return 'Estrés'
}

const getSectorColor = (type: string, intensity: number) => {
  const t = Math.max(0, Math.min(1, (intensity - 0.6) / 0.4))
  if (type === 'DROUGHT') {
    return new THREE.Color().lerpColors(new THREE.Color(0xfacc15), new THREE.Color(0xea580c), t).getHex()
  }
  if (type === 'OVERHYDRATION') {
    return new THREE.Color().lerpColors(new THREE.Color(0x38bdf8), new THREE.Color(0x1d4ed8), t).getHex()
  }
  return new THREE.Color().lerpColors(new THREE.Color(0xc084fc), new THREE.Color(0x7e22ce), t).getHex()
}

const getColorForPlant = (plant: PlantData, mode: 'rgb' | 'ndvi' | 'thermal') => {
  if (plant.dead) return new THREE.Color(0x57534e)
  if (mode === 'rgb') return lerpColor(new THREE.Color(0x84cc16), new THREE.Color(0x15803d), plant.health)
  if (mode === 'ndvi') {
    if (plant.ndvi < 0.33) return lerpColor(new THREE.Color(0xdc2626), new THREE.Color(0xf97316), plant.ndvi / 0.33)
    if (plant.ndvi < 0.66) return lerpColor(new THREE.Color(0xf97316), new THREE.Color(0xfacc15), (plant.ndvi - 0.33) / 0.33)
    return lerpColor(new THREE.Color(0xfacc15), new THREE.Color(0x16a34a), (plant.ndvi - 0.66) / 0.34)
  }
  const heat = Math.max(0, Math.min(1, (plant.temp - 20) / 17)) // 0 to 1 (20°C cold overhydration to 37°C drought)
  if (heat < 0.33) return lerpColor(new THREE.Color(0x1d4ed8), new THREE.Color(0x06b6d4), heat / 0.33)
  if (heat < 0.66) return lerpColor(new THREE.Color(0x06b6d4), new THREE.Color(0xfde047), (heat - 0.33) / 0.33)
  return lerpColor(new THREE.Color(0xfde047), new THREE.Color(0xef4444), (heat - 0.66) / 0.34)
}

const setActionFeedback = (message: string, autoClear = true) => {
  if (feedbackTimeout) clearTimeout(feedbackTimeout)
  actionFeedback.value = message
  if (autoClear) {
    feedbackTimeout = setTimeout(() => {
      actionFeedback.value = ''
      feedbackTimeout = undefined
    }, 6000)
  }
}

const clearSectorMarkers = () => {
  sectorMarkers.forEach(marker => {
    scene.value?.remove(marker)
    marker.geometry.dispose()
    const material = marker.material
    if (Array.isArray(material)) material.forEach(item => item.dispose())
    else material.dispose()
  })
  sectorMarkers = []
}

const updateMaterials = (mode: 'rgb' | 'ndvi' | 'thermal') => {
  currentMode.value = mode
  const groundColor = mode === 'rgb' ? 0xffffff : (mode === 'ndvi' ? 0x1e40af : 0x450a0a)
  const parcelColor = mode === 'rgb' ? 0x765b40 : groundColor
  if (groundMaterial) groundMaterial.color.setHex(groundColor)
  parcelSurfaceMaterials.forEach(material => material.color.setHex(parcelColor))
  if (!trunkMesh || !leafMesh) return

  for (let i = 0; i < allPlants.length; i++) {
    trunkMesh.setColorAt(i, mode === 'rgb' && !allPlants[i].dead
      ? new THREE.Color(0x84cc16)
      : getColorForPlant(allPlants[i], mode))
  }
  trunkMesh.instanceColor!.needsUpdate = true

  for (let i = 0; i < leafToPlantMap.length; i++) leafMesh.setColorAt(i, getColorForPlant(allPlants[leafToPlantMap[i]], mode))
  leafMesh.instanceColor!.needsUpdate = true

  if (tasselMesh) {
    for (let i = 0; i < tasselToPlantMap.length; i++) {
      const plant = allPlants[tasselToPlantMap[i]]
      tasselMesh.setColorAt(i, mode === 'rgb' && !plant.dead
        ? new THREE.Color(0xfef08a)
        : getColorForPlant(plant, mode))
    }
    tasselMesh.instanceColor!.needsUpdate = true
  }
  if (earMesh) {
    for (let i = 0; i < earToPlantMap.length; i++) {
      const plant = allPlants[earToPlantMap[i]]
      earMesh.setColorAt(i, mode === 'rgb' && !plant.dead
        ? new THREE.Color(0xeab308)
        : getColorForPlant(plant, mode))
    }
    earMesh.instanceColor!.needsUpdate = true
  }
}

const createDrone = () => {
  const group = new THREE.Group()
  const bodyMat = new THREE.MeshLambertMaterial({ color: 0x333333 })
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.3, 0.8), bodyMat)
  body.castShadow = true; group.add(body)

  const armGeo = new THREE.CylinderGeometry(0.05, 0.05, 1.2, 8); armGeo.rotateZ(Math.PI / 2)
  const arm1 = new THREE.Mesh(armGeo, bodyMat); arm1.rotation.y = Math.PI / 4; group.add(arm1)
  const arm2 = new THREE.Mesh(armGeo, bodyMat); arm2.rotation.y = -Math.PI / 4; group.add(arm2)

  const propGeo = new THREE.BoxGeometry(0.6, 0.02, 0.05)
  const propMat = new THREE.MeshBasicMaterial({ color: 0xaaaaaa })
  
  const positions = [ { x: 0.6, z: 0.6 }, { x: -0.6, z: -0.6 }, { x: 0.6, z: -0.6 }, { x: -0.6, z: 0.6 } ]
  
  positions.forEach(pos => {
    const motor = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.2), bodyMat)
    motor.position.set(pos.x, 0.2, pos.z); group.add(motor)
    
    const prop = new THREE.Mesh(propGeo, propMat)
    prop.position.set(pos.x, 0.3, pos.z)
    propellers.push(prop); group.add(prop)
  })

  return group
}

const createParticles = () => {
  particleGeo = new THREE.BufferGeometry()
  particleGeo.setAttribute('position', new THREE.BufferAttribute(particlePositions, 3))
  const pMaterial = new THREE.PointsMaterial({ color: 0x3b82f6, size: 0.3, transparent: true, opacity: 0.8 })
  particleSystem = new THREE.Points(particleGeo, pMaterial)
  particleSystem.visible = false
  scene.value?.add(particleSystem)
}

const generateRandomStressCenters = () => {
  stressCenters = []
  clearSectorMarkers()

  const halfWidth = (selectedFieldGeometry.value?.widthMeters ?? BASE_CROP_WIDTH) / 2
  const halfDepth = (selectedFieldGeometry.value?.depthMeters ?? BASE_CROP_DEPTH) / 2
  const numCenters = Math.floor(Math.random() * 3) + 2
  for (let i = 0; i < numCenters; i++) {
    const type: StressCenter['type'] = i === 0 || Math.random() > 0.5 ? 'DROUGHT' : 'PEST'
    const fallbackPlant = allPlants[Math.floor(Math.random() * allPlants.length)]
    let location = fallbackPlant
      ? { x: fallbackPlant.x * scaleX.value, z: fallbackPlant.z * scaleZ.value }
      : { x: 0, z: 0 }

    if (!fallbackPlant) {
      for (let attempt = 0; attempt < 30; attempt++) {
        const candidate = {
          x: (Math.random() * 1.6 - 0.8) * halfWidth,
          z: (Math.random() * 1.6 - 0.8) * halfDepth,
        }
        if (!selectedFieldGeometry.value || selectedFieldGeometry.value.contains(candidate)) {
          location = candidate
          break
        }
      }
    }

    stressCenters.push({
      id: `SEC-${i + 1}`,
      ...location,
      intensity: 0.68 + Math.random() * 0.3,
      radius: Math.max(2, Math.min(halfWidth, halfDepth) * (0.08 + Math.random() * 0.08)),
      type,
    })
  }
}

const saveScenarioSnapshot = async (saveAlerts = false, showSuccessFeedback = true) => {
  if (savingSnapshot.value) return
  savingSnapshot.value = true
  const fieldId = selectedFieldId.value || null

  try {
    await createSimulation({
      field_id: fieldId,
      scenario_title: `Simulación ${new Date().toLocaleString('es-MX')}`,
      input_parameters: {
        visualization_mode: currentMode.value,
        wind_enabled: windEnabled.value,
        field_id: fieldId,
        data_source: 'simulated',
        route: coverageRoute.value
          ? {
              distance_meters: coverageRoute.value.lengthMeters,
              lane_count: coverageRoute.value.laneCount,
              orientation: coverageRoute.value.orientation,
              energy_wh: coverageRoute.value.estimatedEnergyWh,
              distance_saved_meters: coverageRoute.value.distanceSavedMeters,
              estimated_flight_minutes: coverageRoute.value.lengthMeters / 5 / 60,
            }
          : null,
      },
      results: {
        telemetry: { ...telemetry.value },
        timeline: trendHistory.value.map(sample => ({ ...sample })),
        estimated_costs: {
          currency: 'MXN',
          area_hectares: estimatedAreaHectares.value,
          treatment: treatmentCostAmount.value,
          prevention: preventionCostAmount.value,
          gross_savings: estimatedSavingsAmount.value,
          net_preventive_savings: projectedSavingsNetAmount.value,
          assumptions: 'Referencia editable: tratamiento 1650 MXN/ha, prevención 520 MXN/ha, pérdida potencial evitada 2400 MXN/ha.',
        },
        plants: allPlants.map(plant => ({
          ...plant,
          gps: plantGps(plant),
        })),
        stress_centers: stressCenters.map(center => ({ ...center })),
      },
    })

    if (fieldId) {
      const writes: Promise<void>[] = [
        saveFieldMetric({
          field_id: fieldId,
          soil_humidity: telemetry.value.avgHumidity,
          temperature: telemetry.value.avgTemp,
          sustainability_index: telemetry.value.avgHealth / 100,
          raw_data: {
            source: 'simulation',
            ndvi_avg: telemetry.value.avgNDVI,
            pest_index: telemetry.value.avgPestIndex,
            plant_count: telemetry.value.plantCount,
            stress_zones: telemetry.value.stressZones,
            stressed_plants: telemetry.value.stressedPlants,
            dead_plants: telemetry.value.deadPlants,
            data_source: 'simulated',
          },
        }),
      ]

      if (saveAlerts) {
        writes.push(...stressCenters.map(center => createAlert({
          field_id: fieldId,
          alert_type: center.type === 'DROUGHT' ? 'soil_humidity' : 'pest',
          severity: center.intensity >= 0.85 ? 'high' : center.intensity >= 0.7 ? 'medium' : 'low',
          message: center.type === 'DROUGHT'
            ? `Estrés hídrico detectado en ${center.id}.`
            : `Posible plaga detectada en ${center.id}.`,
        })))
      }

      await Promise.all(writes)
    }

    if (showSuccessFeedback) {
      setActionFeedback(fieldId
        ? saveAlerts
          ? 'Escenario, métricas y alertas guardados en el campo.'
          : 'Escenario y métricas guardados en el campo.'
        : 'Escenario guardado. Selecciona un campo para asociar métricas y alertas.')
    }
  } catch (error) {
    setActionFeedback(error instanceof Error
      ? `No se pudieron guardar todos los datos: ${error.message}`
      : 'No se pudieron guardar todos los datos.')
  } finally {
    savingSnapshot.value = false
  }
}

const regenerateFieldHealth = () => {
  allPlants.forEach(plant => {
    let dStress = 0, pStress = 0, oStress = 0
    for (const center of stressCenters) {
      const dist = Math.hypot(
        plant.x * scaleX.value - center.x,
        plant.z * scaleZ.value - center.z,
      )
      if (dist < center.radius) {
        const effect = center.intensity * (1 - (dist / center.radius))
        if (center.type === 'DROUGHT') dStress = Math.max(dStress, effect)
        if (center.type === 'OVERHYDRATION') oStress = Math.max(oStress, effect)
        if (center.type === 'PEST') pStress = Math.max(pStress, effect)
      }
    }
    if (dStress > 0 && plant.waterStress >= 0.98) plant.dead = true
    plant.health = plant.dead
      ? 0
      : Math.max(0, 0.96 - (plant.waterStress * 0.75) - (dStress * 0.32) - (pStress * 0.4) - (oStress * 0.25))
    plant.temp = 25 + (dStress * 12) + (pStress * 3) - (oStress * 5.2) + (plant.waterStress * 4)
    plant.ndvi = plant.dead
      ? 0
      : Math.max(0, 0.84 - (pStress * 0.65) - (dStress * 0.32) - (oStress * 0.38) - (plant.waterStress * 0.2))
    plant.status = getStatusName(plant.health, plant.dead)
  })
  affectedPlants.value = allPlants
    .filter(plant => plant.waterStress >= 0.15 || plant.health < 0.7 || plant.dead)
    .sort((left, right) => Number(right.dead) - Number(left.dead) || right.waterStress - left.waterStress)
    .slice(0, 8)
  if (!lastInspectedPlant.value && allPlants.length > 0) {
    lastInspectedPlant.value = allPlants[0]
  } else if (lastInspectedPlant.value) {
    const refreshed = allPlants.find(p => p.id === lastInspectedPlant.value?.id)
    if (refreshed) lastInspectedPlant.value = refreshed
  }
  updateMaterials(currentMode.value)
  updateTelemetry()
}

const handleAction = (action: 'ANALYZE' | 'WATER' | 'FUMIGATE' | 'CENTINELAS') => {
  if (action === 'CENTINELAS') {
    if (droneState.value === 'CENTINELAS') {
      droneState.value = 'IDLE'
      currentAction.value = 'NONE'
      if (centinelaGroup) centinelaGroup.visible = false
      void saveScenarioSnapshot(true)
      setActionFeedback('Modo Centinelas detenido.')
      return
    }
    if (droneState.value !== 'IDLE') return
    droneState.value = 'CENTINELAS'
    currentAction.value = 'CENTINELAS'
    simulationElapsedSeconds.value = 0
    trendHistory.value = []
    generateRandomStressCenters()
    regenerateFieldHealth()
    addTrendSample()
    fieldSimulationOngoing = true
    
    // Si no existe el enjambre, crearlo
    if (!centinelaGroup && scene.value) {
      centinelaGroup = new THREE.Group()
      for(let i=0; i<5; i++) {
        const drone = createDrone()
        drone.scale.set(0.5, 0.5, 0.5) // Más pequeños
        const angle = (i / 5) * Math.PI * 2
        drone.position.set(Math.cos(angle)*15, FLIGHT_HEIGHT, Math.sin(angle)*15)
        centinelaGroup.add(drone)
        
        // Agregar hélices del enjambre al arreglo global centinelaPropellers
        drone.children.forEach(c => {
          const mesh = c as THREE.Mesh
          if (mesh.isMesh && mesh.geometry instanceof THREE.BoxGeometry && mesh.scale.x === 1) { // Hélices
            centinelaPropellers.push(mesh)
          }
        })
      }
      scene.value.add(centinelaGroup)
    }
    if (centinelaGroup) centinelaGroup.visible = true
    return
  }

  if (action === 'ANALYZE') {
    if (droneState.value !== 'IDLE') return
    setActionFeedback('Escaneo del cultivo en curso…', false)
    droneState.value = 'SCANNING'
    simulationElapsedSeconds.value = 0
    trendHistory.value = []
    generateRandomStressCenters()
    regenerateFieldHealth()
    addTrendSample()

    const width = selectedFieldGeometry.value?.widthMeters ?? BASE_CROP_WIDTH
    const depth = selectedFieldGeometry.value?.depthMeters ?? BASE_CROP_DEPTH
    coverageRoute.value = planCoverageRoute({
      widthMeters: width,
      depthMeters: depth,
      laneSpacingMeters: Math.max(6, Math.min(width, depth) / 8),
      start: { x: DRONE_BASE.x, z: DRONE_BASE.z },
      fieldGeometry: selectedFieldGeometry.value,
    })
    DRONE_BASE.set(coverageRoute.value.points[0].x, 0.5, coverageRoute.value.points[0].z)
    droneGroup.position.copy(DRONE_BASE)
    dronePath = coverageRoute.value.points.map(point =>
      new THREE.Vector3(point.x, FLIGHT_HEIGHT, point.z),
    )
    clearScanRouteLine()
    scanRouteLine = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(
        dronePath.map(point => new THREE.Vector3(point.x, 0.24, point.z)),
      ),
      new THREE.LineBasicMaterial({ color: 0x4dd0e1, transparent: true, opacity: 0.8 }),
    )
    scanRouteLine.renderOrder = 3
    scene.value?.add(scanRouteLine)
    currentPathIndex = 0
    return
  }

  if (droneState.value !== 'IDLE') return
  
  // Filtrar objetivos dependiendo de la acción
  if (action === 'WATER') activeTargets = stressCenters.filter(c => c.type === 'DROUGHT')
  if (action === 'FUMIGATE') activeTargets = stressCenters.filter(c => c.type === 'PEST')
  
  if (activeTargets.length === 0) {
    setActionFeedback(action === 'WATER'
      ? 'No se encontraron zonas con estrés hídrico que requieran riego.'
      : 'No se encontraron zonas con indicios de plaga que requieran fumigación.')
    return
  }

  setActionFeedback(action === 'WATER' ? 'Dron de riego en misión…' : 'Dron de fumigación en misión…', false)
  currentAction.value = action
  droneState.value = 'FLYING'
  activeTargetIndex = 0
  
  const pMat = particleSystem.material as THREE.PointsMaterial
  if (action === 'WATER') {
    pMat.color.setHex(0x3b82f6); pMat.size = 0.3; pMat.opacity = 0.8
  } else {
    pMat.color.setHex(0xa7f3d0); pMat.size = 0.6; pMat.opacity = 0.4
  }
}

const resetCamera = () => {
  if (!camera.value || !controls.value) return
  cameraFollowEnabled.value = false
  frameCameraOnField()
}

const zoomCamera = (direction: 'in' | 'out') => {
  if (!controls.value) return
  if (direction === 'in') controls.value.dollyIn(1.2)
  else controls.value.dollyOut(1.2)
  controls.value.update()
}

const toggleCameraFollow = () => {
  cameraFollowEnabled.value = !cameraFollowEnabled.value
  setActionFeedback(cameraFollowEnabled.value
    ? 'Seguimiento de dron activado. La cámara seguirá su posición y altura.'
    : 'Seguimiento desactivado. Puedes explorar el campo libremente.')
}

const toggleCameraPanMode = () => {
  cameraPanMode.value = !cameraPanMode.value
  if (controls.value) {
    controls.value.mouseButtons.LEFT = cameraPanMode.value ? THREE.MOUSE.PAN : THREE.MOUSE.ROTATE
  }
  setActionFeedback(cameraPanMode.value
    ? 'Modo desplazar activado. Arrastra para recorrer el campo.'
    : 'Modo orbitar activado. Arrastra para girar la vista.')
}

const onFullscreenChange = () => {
  isFullscreen.value = document.fullscreenElement === containerRef.value
  onWindowResize()
}

const toggleFullscreen = async () => {
  const stage = containerRef.value
  if (!stage) return

  try {
    if (document.fullscreenElement === stage) {
      await document.exitFullscreen()
    } else {
      await stage.requestFullscreen()
    }
  } catch (error) {
    setActionFeedback(error instanceof Error
      ? `No se pudo cambiar a pantalla completa: ${error.message}`
      : 'No se pudo cambiar a pantalla completa.')
  }
}

const createNewScenario = async () => {
  if (droneState.value !== 'IDLE' || simulationPaused.value) return
  if (centinelaGroup) centinelaGroup.visible = false
  currentAction.value = 'NONE'
  particleSystem.visible = false
  clearScanRouteLine()
  coverageRoute.value = null
  allPlants.forEach(plant => {
    plant.waterStress = 0
    plant.dead = false
    plant.irrigated = false
  })
  fieldSimulationOngoing = false
  simulationElapsedSeconds.value = 0
  trendHistory.value = []
  generateRandomStressCenters()
  regenerateFieldHealth()
  addTrendSample()
  setActionFeedback('Nuevo escenario generado. Analiza el cultivo para detectar las zonas de estrés.')
  void saveScenarioSnapshot()
}

const toggleSimulation = () => {
  simulationPaused.value = !simulationPaused.value
  setActionFeedback(simulationPaused.value
    ? 'Simulación pausada. La cámara y la telemetría siguen disponibles.'
    : 'Simulación reanudada.')
}

const toggleWind = () => {
  windEnabled.value = !windEnabled.value
  setActionFeedback(windEnabled.value ? 'Viento suave activado.' : 'Viento desactivado.')
}

const exportCropData = () => {
  const rows = [
    ['ID de planta', 'Etapa', 'Estado', 'Salud (%)', 'NDVI', 'Temperatura (°C)', 'Estrés hídrico (%)', 'Latitud simulada', 'Longitud simulada'],
    ...allPlants.map(plant => {
      const gps = plantGps(plant)
      return [
        plant.id,
        plant.stage === 1 ? 'Brote' : plant.stage === 2 ? 'Desarrollo' : 'Madurez',
        plant.status,
        (plant.health * 100).toFixed(1),
        plant.ndvi.toFixed(2),
        plant.temp.toFixed(1),
        (plant.waterStress * 100).toFixed(1),
        gps?.latitude.toFixed(6) ?? '',
        gps?.longitude.toFixed(6) ?? '',
      ]
    }),
  ]
  const csv = rows.map(row => row.map(value => `"${String(value).replaceAll('"', '""')}"`).join(',')).join('\r\n')
  const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `agronia-cultivo-${new Date().toISOString().slice(0, 10)}.csv`
  link.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 0)
  setActionFeedback(`Reporte exportado: ${allPlants.length} plantas y sus métricas actuales.`)
}

const createAmbientEnvironment = (fieldExtent: number) => {
  const activeScene = scene.value
  if (!activeScene) return

  ambientMotionEnabled = !window.matchMedia('(prefers-reduced-motion: reduce)').matches
  ambientTime = 0
  const isCompact = window.matchMedia('(max-width: 767px)').matches || graphicsQuality.value === 'performance'
  const visibleExtent = Math.min(fieldExtent, 180)
  const bounds = Math.max(95, visibleExtent * 1.1)
  const cloudCount = isCompact ? 4 : 7
  const cloudGeometry = new THREE.SphereGeometry(1, 10, 8)
  const cloudMaterial = new THREE.MeshBasicMaterial({
    color: 0xf4f8ef,
    transparent: true,
    opacity: 0.68,
    depthWrite: false,
  })
  ambientGeometries.push(cloudGeometry)
  ambientMaterials.push(cloudMaterial)

  const cloudPuffs: Array<[number, number, number, number, number, number]> = [
    [-2.4, 0, 0, 2.4, 0.9, 1.3],
    [-1.1, 0.55, 0, 2.8, 1.25, 1.45],
    [0.8, 0.7, 0, 3.1, 1.4, 1.5],
    [2.4, 0.12, 0, 2.2, 0.9, 1.25],
    [0, -0.18, 0.1, 3.4, 0.72, 1.35],
  ]

  for (let index = 0; index < cloudCount; index++) {
    const group = new THREE.Group()
    for (const [x, y, z, width, height, depth] of cloudPuffs) {
      const puff = new THREE.Mesh(cloudGeometry, cloudMaterial)
      puff.position.set(x, y, z)
      puff.scale.set(width, height, depth)
      puff.renderOrder = 2
      group.add(puff)
    }

    const spacing = cloudCount > 1 ? index / (cloudCount - 1) : 0.5
    const baseY = 14 + (index % 3) * 1.8
    group.position.set(
      -bounds + bounds * 2 * spacing,
      baseY,
      -visibleExtent * 0.38 - (index % 2) * 18,
    )
    group.scale.setScalar(1.35 + (index % 2) * 0.3)
    activeScene.add(group)
    ambientClouds.push({
      group,
      speed: 0.35 + (index % 3) * 0.12,
      bounds,
      baseY,
      phase: index * 1.7,
    })
  }

  const createWingGeometry = (direction: -1 | 1) => {
    const shape = new THREE.Shape()
    shape.moveTo(0, 0)
    shape.quadraticCurveTo(direction * 0.42, 0.28, direction * 1.08, 0.62)
    shape.quadraticCurveTo(direction * 0.78, 0.11, direction * 0.2, -0.08)
    shape.lineTo(0, 0)
    return new THREE.ShapeGeometry(shape)
  }
  const leftWingGeometry = createWingGeometry(-1)
  const rightWingGeometry = createWingGeometry(1)
  const birdBodyGeometry = new THREE.SphereGeometry(0.14, 8, 6)
  birdBodyGeometry.scale(1.2, 0.32, 0.24)
  const birdMaterial = new THREE.MeshBasicMaterial({
    color: 0x30443d,
    transparent: true,
    opacity: 0.82,
    side: THREE.DoubleSide,
    depthWrite: false,
  })
  ambientGeometries.push(leftWingGeometry, rightWingGeometry, birdBodyGeometry)
  ambientMaterials.push(birdMaterial)

  const birdCount = isCompact ? 3 : 5
  for (let index = 0; index < birdCount; index++) {
    const group = new THREE.Group()
    const leftWing = new THREE.Mesh(leftWingGeometry, birdMaterial)
    const rightWing = new THREE.Mesh(rightWingGeometry, birdMaterial)
    const body = new THREE.Mesh(birdBodyGeometry, birdMaterial)
    body.position.z = 0.025
    group.add(leftWing, rightWing, body)

    const baseY = 13 + (index % 3) * 2.8
    group.position.set(
      -bounds + Math.random() * bounds * 2,
      baseY,
      -visibleExtent * 0.22 - (index % 3) * 16,
    )
    group.scale.setScalar(0.75 + Math.random() * 0.45)
    group.rotation.y = -0.12
    group.renderOrder = 3
    activeScene.add(group)
    ambientBirds.push({
      group,
      leftWing,
      rightWing,
      speed: 3.4 + Math.random() * 1.8,
      bounds,
      baseY,
      phase: index * 2.1,
    })
  }
}

const updateAmbientEnvironment = (deltaSeconds: number) => {
  if (!ambientMotionEnabled) return
  ambientTime += deltaSeconds

  for (const cloud of ambientClouds) {
    cloud.group.position.x += cloud.speed * deltaSeconds
    if (cloud.group.position.x > cloud.bounds) cloud.group.position.x = -cloud.bounds
    cloud.group.position.y = cloud.baseY + Math.sin(ambientTime * 0.12 + cloud.phase) * 0.35
  }

  for (const bird of ambientBirds) {
    bird.group.position.x += bird.speed * deltaSeconds
    if (bird.group.position.x > bird.bounds) bird.group.position.x = -bird.bounds
    const wingBeat = Math.sin(ambientTime * 5.2 + bird.phase)
    bird.group.position.y = bird.baseY + Math.sin(ambientTime * 1.4 + bird.phase) * 0.55
    bird.leftWing.rotation.z = wingBeat * 0.2
    bird.rightWing.rotation.z = -wingBeat * 0.2
    bird.group.rotation.z = Math.sin(ambientTime * 0.9 + bird.phase) * 0.025
  }
}

const disposeAmbientEnvironment = () => {
  ambientClouds.forEach(({ group }) => scene.value?.remove(group))
  ambientBirds.forEach(({ group }) => scene.value?.remove(group))
  ambientGeometries.forEach(geometry => geometry.dispose())
  ambientMaterials.forEach(material => material.dispose())
  ambientClouds.length = 0
  ambientBirds.length = 0
  ambientGeometries.length = 0
  ambientMaterials.length = 0
}

const initThree = () => {
  if (!canvasRef.value || !containerRef.value) return
  const width = canvasRef.value.clientWidth, height = canvasRef.value.clientHeight
  const isSmallScreen = window.matchMedia('(max-width: 767px)').matches
  const quality = graphicsQuality.value
  renderer.value = new THREE.WebGLRenderer({
    canvas: canvasRef.value,
    antialias: quality !== 'performance' && !isSmallScreen,
    powerPreference: 'high-performance',
    precision: 'highp',
  })
  gpuRendererName.value = detectHardwareGpuModel(renderer.value.getContext())
  const targetPixelRatio =
    quality === 'ultra'
      ? Math.min(window.devicePixelRatio, 2.5)
      : quality === 'balanced'
        ? Math.min(window.devicePixelRatio, 1.75)
        : 1.0
  renderer.value.setPixelRatio(isSmallScreen ? Math.min(window.devicePixelRatio, 1.5) : targetPixelRatio)
  renderer.value.setSize(width, height, false)
  renderer.value.shadowMap.enabled = quality !== 'performance' && !isSmallScreen
  renderer.value.shadowMap.type = quality === 'ultra' ? THREE.PCFSoftShadowMap : THREE.PCFShadowMap
  renderer.value.outputColorSpace = THREE.SRGBColorSpace
  renderer.value.toneMapping = THREE.ACESFilmicToneMapping
  renderer.value.toneMappingExposure = 1.14

  scene.value = new THREE.Scene()
  scene.value.background = new THREE.Color(0x9fc6d7)
  scene.value.fog = quality === 'performance' ? null : new THREE.FogExp2(0x9fc6d7, 0.0038)

  camera.value = new THREE.PerspectiveCamera(60, width / height, 0.1, 1000)
  camera.value.position.set(0, 29, 42)
  controls.value = new OrbitControls(camera.value, renderer.value.domElement)
  controls.value.target.set(0, 0, 0)
  controls.value.enableDamping = true
  controls.value.dampingFactor = 0.075
  controls.value.enablePan = true
  controls.value.screenSpacePanning = true
  controls.value.mouseButtons.LEFT = THREE.MOUSE.ROTATE
  controls.value.minDistance = 3
  controls.value.maxDistance = 180
  controls.value.maxPolarAngle = Math.PI / 2.02
  controls.value.addEventListener('start', () => {
    cameraFollowEnabled.value = false
  })
  controls.value.addEventListener('change', () => {
    pointerDirty = true
  })

  scene.value.add(new THREE.HemisphereLight(0xeaf1df, 0x493b2c, 1.48))
  const dirLight = new THREE.DirectionalLight(0xfff0d2, 2.15)
  dirLight.position.set(-35, 65, 25)
  dirLight.castShadow = quality !== 'performance'
  const shadowRes = quality === 'ultra' ? 4096 : quality === 'balanced' ? 2048 : 1024
  dirLight.shadow.mapSize.set(shadowRes, shadowRes)
  dirLight.shadow.camera.left = -45
  dirLight.shadow.camera.right = 45
  dirLight.shadow.camera.top = 45
  dirLight.shadow.camera.bottom = -45
  dirLight.shadow.bias = -0.0002
  mainDirLight = dirLight
  scene.value.add(dirLight)

  const soilTex = createSoilTexture()
  soilTex.anisotropy = renderer.value.capabilities.getMaxAnisotropy() || 16
  groundMaterial = new THREE.MeshLambertMaterial({ color: 0xffffff, map: soilTex })
  sectorFalloffTexture = createSectorFalloffTexture()
  const fieldExtent = selectedFieldGeometry.value
    ? Math.max(selectedFieldGeometry.value.widthMeters, selectedFieldGeometry.value.depthMeters)
    : 150
  createAmbientEnvironment(fieldExtent)
  const groundSize = Math.max(150, fieldExtent * 1.5)
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(groundSize, groundSize), groundMaterial)
  ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.value.add(ground)

  const furrowPositions: number[] = []
  const furrowWidth = selectedFieldGeometry.value?.widthMeters ?? BASE_CROP_WIDTH
  const furrowDepth = selectedFieldGeometry.value?.depthMeters ?? BASE_CROP_DEPTH
  const furrowSpacing = Math.max(3.5, furrowWidth / 80)
  for (let x = -furrowWidth / 2; x <= furrowWidth / 2; x += furrowSpacing) {
    furrowPositions.push(x, 0.025, -furrowDepth / 2, x, 0.025, furrowDepth / 2)
  }
  const furrowGeometry = new THREE.BufferGeometry()
  furrowGeometry.setAttribute('position', new THREE.Float32BufferAttribute(furrowPositions, 3))
  const furrows = new THREE.LineSegments(
    furrowGeometry,
    new THREE.LineBasicMaterial({ color: 0xc39a64, transparent: true, opacity: 0.17 })
  )
  scene.value.add(furrows)
  cropGroup = new THREE.Group()
  parcelOutlineGroup = new THREE.Group()
  scene.value.add(cropGroup, parcelOutlineGroup)
  applySelectedField()

  // Generación aleatoria de zonas inicial
  generateRandomStressCenters()

  // Dron y Particulas
  droneGroup = createDrone()
  droneGroupReady = true
  droneGroup.position.copy(DRONE_BASE)
  scene.value.add(droneGroup)
  liveDroneGroup = createDrone()
  liveDroneGroup.traverse(object => {
    if (object instanceof THREE.Mesh) {
      const materials = Array.isArray(object.material) ? object.material : [object.material]
      materials.forEach(material => {
        if (material instanceof THREE.MeshLambertMaterial) material.color.setHex(0x20cfc0)
      })
    }
  })
  liveDroneGroup.visible = false
  scene.value.add(liveDroneGroup)
  createParticles()

  // Generar plantas dinámicas afectadas por las zonas
  allPlants = []; leafToPlantMap = []; tasselToPlantMap = []; earToPlantMap = []
  let leafCount = 0, tasselCount = 0, earCount = 0

  for (let i = -7; i < 7; i++) {
    for (let j = -10; j < 10; j++) {
      const x = i * 3.5 + (Math.random() * 0.8 - 0.4)
      const z = j * 2.2 + (Math.random() * 0.8 - 0.4)
      if (selectedFieldGeometry.value && !selectedFieldGeometry.value.contains({
        x: x * scaleX.value,
        z: z * scaleZ.value,
      })) continue

      const stage = Math.random() > 0.6 ? 3 : (Math.random() > 0.3 ? 2 : 1)
      leafCount += stage === 1 ? 5 : (stage === 2 ? 10 : 14)
      if (stage === 3) { tasselCount++; earCount += 2 } else if (stage === 2) { earCount += 1 }

      // Usamos valores dummy iniciales, regenerateFieldHealth recalculará los reales
      const health = 1, temp = 25, ndvi = 1

      allPlants.push({
        id: `P-${i + 7}-${j + 10}`,
        x,
        z,
        health,
        ndvi,
        temp,
        status: getStatusName(health),
        stage,
        waterStress: 0,
        dead: false,
        irrigated: false,
      })
    }
  }

  // Meshes setup
  const leafMaterial = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    side: THREE.DoubleSide,
    roughness: 0.84,
    metalness: 0,
  })
  leafWindUniform = { value: 0 }
  leafWindStrengthUniform = { value: 1 }
  leafMaterial.onBeforeCompile = shader => {
    shader.uniforms.uWindTime = leafWindUniform!
    shader.uniforms.uWindStrength = leafWindStrengthUniform!
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uWindTime;\nuniform float uWindStrength;')
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        float leafWindWeight = smoothstep(0.05, 2.4, position.y);
        float leafWindPhase = uWindTime * 1.35 + position.y * 1.7 + instanceMatrix[3][0] * 0.24 + instanceMatrix[3][2] * 0.18;
        transformed.x += sin(leafWindPhase) * 0.11 * leafWindWeight * uWindStrength;
        transformed.z += cos(leafWindPhase * 0.83) * 0.055 * leafWindWeight * uWindStrength;`
      )
  }
  leafMaterial.customProgramCacheKey = () => 'agronia-leaf-wind-v1'
  leafMesh = new THREE.InstancedMesh(createLeafGeometry(), leafMaterial, leafCount)
  const trunkGeo = new THREE.CylinderGeometry(0.04, 0.08, 1, 8); trunkGeo.translate(0, 0.5, 0)
  trunkMesh = new THREE.InstancedMesh(
    trunkGeo,
    new THREE.MeshStandardMaterial({ roughness: 0.92, metalness: 0 }),
    allPlants.length
  )
  const tasselGeo = createTasselGeometry(); tasselGeo.translate(0, -0.1, 0)
  tasselMesh = new THREE.InstancedMesh(
    tasselGeo,
    new THREE.MeshStandardMaterial({ roughness: 0.82, metalness: 0 }),
    tasselCount
  )
  const earGeo = new THREE.CapsuleGeometry(0.12, 0.4, 4, 8); earGeo.rotateZ(Math.PI / 8); earGeo.translate(0.15, 0.2, 0)
  earMesh = new THREE.InstancedMesh(
    earGeo,
    new THREE.MeshStandardMaterial({ roughness: 0.88, metalness: 0 }),
    earCount
  )
  const hitboxGeo = new THREE.CylinderGeometry(0.5, 0.5, 3.5, 8); hitboxGeo.translate(0, 1.75, 0)
  hitboxMesh = new THREE.InstancedMesh(hitboxGeo, new THREE.MeshBasicMaterial({ visible: false }), allPlants.length)

  const dummy = new THREE.Object3D()
  let cL = 0, cT = 0, cE = 0

  allPlants.forEach((plant, pIdx) => {
    const scaleY = plant.stage === 1 ? 0.8 : (plant.stage === 2 ? 1.8 : 2.8)
    dummy.position.set(plant.x, 0, plant.z); dummy.rotation.set(0, Math.random() * Math.PI, 0); dummy.scale.set(1, scaleY, 1); dummy.updateMatrix()
    trunkMesh.setMatrixAt(pIdx, dummy.matrix); hitboxMesh.setMatrixAt(pIdx, dummy.matrix)

    const numLeaves = plant.stage === 1 ? 5 : (plant.stage === 2 ? 10 : 14)
    for (let k = 0; k < numLeaves; k++) {
      dummy.position.set(plant.x, (k / numLeaves) * scaleY * 0.9 + 0.1, plant.z)
      dummy.rotation.set(0, (k * 137.5) * (Math.PI / 180), 0)
      const lScale = (plant.stage === 1 ? 0.6 : 1.0) * (1 - (k / numLeaves) * 0.4)
      dummy.scale.set(lScale, lScale, lScale); dummy.rotateX(Math.PI / 4); dummy.translateZ(0.04)
      dummy.updateMatrix(); leafMesh.setMatrixAt(cL, dummy.matrix); leafToPlantMap.push(pIdx); cL++
    }

    if (plant.stage >= 2) {
      for (let e = 0; e < (plant.stage === 3 ? 2 : 1); e++) {
        dummy.position.set(plant.x, scaleY * (0.4 + e * 0.2), plant.z); dummy.rotation.set(0, Math.random() * Math.PI * 2, 0)
        const eScale = plant.stage === 3 ? 1.0 : 0.6; dummy.scale.set(eScale, eScale, eScale)
        dummy.updateMatrix(); earMesh.setMatrixAt(cE, dummy.matrix); earToPlantMap.push(pIdx); cE++
      }
    }

    if (plant.stage === 3) {
      dummy.position.set(plant.x, scaleY, plant.z); dummy.rotation.set(0, Math.random() * Math.PI, 0); dummy.scale.set(1, 1, 1)
      dummy.updateMatrix(); tasselMesh.setMatrixAt(cT, dummy.matrix); tasselToPlantMap.push(pIdx); cT++
    }
  })

  trunkMesh.castShadow = true
  trunkMesh.receiveShadow = true
  leafMesh.castShadow = true
  tasselMesh.castShadow = true
  earMesh.castShadow = true
  cropGroup.add(trunkMesh, leafMesh, tasselMesh, earMesh, hitboxMesh)
  applySelectedField()
  regenerateFieldHealth()
  raycaster.value = new THREE.Raycaster(); mouse.value = new THREE.Vector2()

  let actionTimer = 0

  let stressTickElapsed = 0
  let trendTickElapsed = 0
  let snapshotTickElapsed = 0
  let lastAnimationFrameAt = performance.now()

  let lastFrameTimestamp = performance.now()
  let fpsFrameCounter = 0
  let fpsWindowStart = performance.now()
  let raycastTick = 0


  const animate = () => {
    animationId.value = requestAnimationFrame(animate)
    const now = performance.now()

    const frameDelta = Math.min(0.1, Math.max(0, (now - lastAnimationFrameAt) / 1000))
    lastAnimationFrameAt = now

    const deltaSec = Math.min(0.05, Math.max(0.001, (now - lastFrameTimestamp) / 1000))
    const dtScale = deltaSec * 60
    lastFrameTimestamp = now

    fpsFrameCounter++
    if (now - fpsWindowStart >= 500) {
      const elapsed = now - fpsWindowStart
      const currentFps = Math.round((fpsFrameCounter * 1000) / elapsed)
      liveFps.value = Math.max(1, Math.min(240, currentFps))
      frameTimeMs.value = Number((elapsed / fpsFrameCounter).toFixed(1))
      fpsFrameCounter = 0
      fpsWindowStart = now
    }


    controls.value?.update()
    updateLiveDrone()
    updateCameraFollow()
    updateAmbientEnvironment(frameDelta)
    if (simulationPaused.value) {
      if (renderer.value && scene.value && camera.value) renderer.value.render(scene.value, camera.value)
      return
    }

    simulationTime += frameDelta

    const fieldSimulationActive = droneState.value !== 'IDLE' || fieldSimulationOngoing
    if (fieldSimulationActive) {
      stressTickElapsed += frameDelta
      trendTickElapsed += frameDelta
      if (selectedFieldId.value) snapshotTickElapsed += frameDelta
    } else {
      stressTickElapsed = 0
      trendTickElapsed = 0
      snapshotTickElapsed = 0
    }

    simulationTime += deltaSec

    if (leafWindUniform) leafWindUniform.value = simulationTime
    if (leafWindStrengthUniform) leafWindStrengthUniform.value = windEnabled.value ? 1 : 0
    if (fieldSimulationActive && stressTickElapsed >= 2) {
      const hadOngoingWaterStress = fieldSimulationOngoing
      advanceFieldSimulation(stressTickElapsed)
      stressTickElapsed = 0
      if (
        hadOngoingWaterStress
        && !fieldSimulationOngoing
        && droneState.value === 'IDLE'
        && selectedFieldId.value
        && !savingSnapshot.value
      ) void saveScenarioSnapshot(false, false)
      sectorMarkers.forEach(mesh => {
        const center = mesh.userData as StressCenter
        ;(mesh.material as THREE.MeshBasicMaterial).color.setHex(getSectorColor(center.type, center.intensity))
      })
    }
    if (fieldSimulationActive && trendTickElapsed >= 10) {
      addTrendSample()
      trendTickElapsed = 0
    }
    if (snapshotTickElapsed >= 30) {
      snapshotTickElapsed = 0
      if (selectedFieldId.value && !savingSnapshot.value) void saveScenarioSnapshot(false, false)
    }

    if (droneState.value === 'IDLE') {
      const hover = Math.sin(now * 0.0018) * 0.08
      droneGroup.position.y = DRONE_BASE.y + hover
      droneGroup.rotation.z = Math.sin(now * 0.0012) * 0.012
      propellers.forEach((propeller, index) => {
        propeller.rotation.y += (index % 2 === 0 ? 0.12 : -0.12) * dtScale
      })
    }
    
    // Raycaster optimizado: solo evalúa intersecciones cuando el cursor se mueve o durante barrido activo
    raycastTick++
    if ((pointerDirty || (droneState.value !== 'IDLE' && raycastTick % 12 === 0)) && raycaster.value && mouse.value && camera.value && scene.value) {
      pointerDirty = false
      raycaster.value.setFromCamera(mouse.value, camera.value)
      
      const plantHits = raycaster.value.intersectObject(hitboxMesh)
      const hitPlant = (plantHits.length > 0 && plantHits[0].instanceId !== undefined) ? allPlants[plantHits[0].instanceId] : null
      hoveredPlant.value = hitPlant
      if (hitPlant) {
        lastInspectedPlant.value = hitPlant
      }
      
      if (sectorMarkers.length > 0) {
        const sectorHits = raycaster.value.intersectObjects(sectorMarkers)
        hoveredSector.value = (sectorHits.length > 0) ? sectorHits[0].object.userData as StressCenter : null
      } else {
        hoveredSector.value = null
      }
    }

    // Drone Animation Logic
    if (droneState.value === 'CENTINELAS') {
      centinelaPropellers.forEach((p, i) => p.rotation.y += (i % 2 === 0 ? 0.5 : -0.5))
      if (centinelaGroup) {
        centinelaGroup.rotation.y += 0.005 // Rotar lentamente alrededor del campo
      }
    } else if (droneState.value !== 'IDLE') {
      propellers.forEach((p, i) => p.rotation.y += (i % 2 === 0 ? 0.5 : -0.5)) // Girar hélices
      const currentPos = droneGroup.position
      
      if (droneState.value === 'SCANNING') {
        const targetPos = dronePath[currentPathIndex]
        currentPos.lerp(targetPos, 0.05)
        // Rotar dron suavemente hacia donde vuela
        droneGroup.lookAt(targetPos.x, currentPos.y, targetPos.z)
        
        if (currentPos.distanceTo(targetPos) < 1.0) {
          currentPathIndex++
          if (currentPathIndex >= dronePath.length) {
            droneState.value = 'IDLE'
            droneGroup.rotation.set(0,0,0) // Reset rotación
            setActionFeedback('Escaneo completado. Explora las zonas de estrés detectadas.')
            // Revelar sectores escaneados
            stressCenters.forEach(center => {
              const geo = new THREE.CircleGeometry(center.radius, 48)
              geo.rotateX(-Math.PI / 2)
              const mat = new THREE.MeshBasicMaterial({ 
                color: getSectorColor(center.type, center.intensity),
                map: sectorFalloffTexture,
                transparent: true,
                opacity: 0.72,
                side: THREE.DoubleSide,
                depthWrite: false,
              })
              const mesh = new THREE.Mesh(geo, mat)
              mesh.position.set(center.x, 0.2, center.z) // Ligeramente elevado
              mesh.userData = center // Guardar datos para tooltip
              scene.value?.add(mesh)
              sectorMarkers.push(mesh)
            })
            void saveScenarioSnapshot(true)
          }
        }
      } 
      else {
        let targetPos = new THREE.Vector3()
        if (droneState.value === 'FLYING' || droneState.value === 'ACTION') {
          const targetCenter = activeTargets[activeTargetIndex]
          targetPos.set(targetCenter.x, FLIGHT_HEIGHT, targetCenter.z)
        } else if (droneState.value === 'RETURNING') {
          targetPos.copy(DRONE_BASE)
        }

        const dist = currentPos.distanceTo(targetPos)
        
        if (droneState.value === 'FLYING') {
          currentPos.lerp(targetPos, 0.05)
          droneGroup.lookAt(targetPos.x, currentPos.y, targetPos.z)
          if (dist < 0.5) {
            droneState.value = 'ACTION'
            droneGroup.rotation.set(0,0,0)
            actionTimer = 0
            particleSystem.visible = true
            for(let i=0; i<PARTICLE_COUNT; i++) {
               particlePositions[i*3] = currentPos.x + (Math.random() - 0.5) * 4
               particlePositions[i*3+1] = currentPos.y
               particlePositions[i*3+2] = currentPos.z + (Math.random() - 0.5) * 4
               particleVelocities[i*3+1] = -Math.random() * 0.2 - 0.1
            }
          }
        } else if (droneState.value === 'ACTION') {
          actionTimer++
          for(let i=0; i<PARTICLE_COUNT; i++) {
             particlePositions[i*3+1] += particleVelocities[i*3+1]
             if (particlePositions[i*3+1] < 0) {
               particlePositions[i*3] = currentPos.x + (Math.random() - 0.5) * activeTargets[activeTargetIndex].radius
               particlePositions[i*3+1] = currentPos.y - 0.5
               particlePositions[i*3+2] = currentPos.z + (Math.random() - 0.5) * activeTargets[activeTargetIndex].radius
             }
          }
          particleGeo.attributes.position.needsUpdate = true

          if (actionTimer > 150) {
            particleSystem.visible = false
            
            // "Curar" la zona tratada
            const treatedCenter = activeTargets[activeTargetIndex]
            if (currentAction.value === 'WATER') {
              for (const plant of allPlants) {
                if (getDroughtPressure(plant, treatedCenter) > 0) plant.irrigated = true
              }
            }
            stressCenters = stressCenters.filter(c => c.id !== treatedCenter.id)
            const markerIndex = sectorMarkers.findIndex(m => m.userData.id === treatedCenter.id)
            if (markerIndex !== -1) {
               scene.value?.remove(sectorMarkers[markerIndex])
               sectorMarkers.splice(markerIndex, 1)
            }
            regenerateFieldHealth()

            activeTargetIndex++
            if (activeTargetIndex >= activeTargets.length) {
              droneState.value = 'RETURNING'
            } else {
              droneState.value = 'FLYING'
            }
          }
        } else if (droneState.value === 'RETURNING') {
          currentPos.lerp(targetPos, 0.03)
          droneGroup.lookAt(targetPos.x, currentPos.y, targetPos.z)
          if (dist < 0.2) {
            droneState.value = 'IDLE'
            droneGroup.rotation.set(0,0,0)
            const completedAction = currentAction.value
            currentAction.value = 'NONE'
            setActionFeedback(completedAction === 'WATER'
              ? 'Riego aplicado. La humedad y el vigor de las plantas afectadas se recuperarán gradualmente.'
              : 'Misión de fumigación completada. Se actualizaron las métricas del cultivo.')
            void saveScenarioSnapshot(true)
          }
        }
      }
    }

    if (renderer.value && scene.value && camera.value) renderer.value.render(scene.value, camera.value)
  }
  animate()

  window.addEventListener('resize', onWindowResize)
  resizeObserver.value = new ResizeObserver(onWindowResize)
  resizeObserver.value.observe(canvasRef.value)
  resizeObserver.value.observe(containerRef.value)
  containerRef.value.addEventListener('pointermove', onMouseMove)
}

const onMouseMove = (event: PointerEvent) => {
  if (!canvasRef.value || !mouse.value) return
  const rect = canvasRef.value.getBoundingClientRect()
  mouse.value.x = ((event.clientX - rect.left) / rect.width) * 2 - 1
  mouse.value.y = -((event.clientY - rect.top) / rect.height) * 2 + 1
  pointerDirty = true
}

const onGraphicsQualityChange = (preset: GraphicsQualityPreset) => {
  setGraphicsQuality(preset)
  if (!renderer.value || !scene.value) return
  const isSmallScreen = window.matchMedia('(max-width: 767px)').matches
  const targetPixelRatio =
    preset === 'ultra'
      ? Math.min(window.devicePixelRatio, 2.5)
      : preset === 'balanced'
        ? Math.min(window.devicePixelRatio, 1.75)
        : 1.0
  renderer.value.setPixelRatio(isSmallScreen ? Math.min(window.devicePixelRatio, 1.5) : targetPixelRatio)
  renderer.value.shadowMap.enabled = preset !== 'performance' && !isSmallScreen
  renderer.value.shadowMap.type = preset === 'ultra' ? THREE.PCFSoftShadowMap : THREE.PCFShadowMap
  renderer.value.shadowMap.needsUpdate = true
  scene.value.fog = preset === 'performance' ? null : new THREE.FogExp2(0x9fc6d7, 0.0038)
  if (mainDirLight) {
    mainDirLight.castShadow = preset !== 'performance'
    const shadowRes = preset === 'ultra' ? 4096 : preset === 'balanced' ? 2048 : 1024
    mainDirLight.shadow.mapSize.set(shadowRes, shadowRes)
    mainDirLight.shadow.map?.dispose()
    mainDirLight.shadow.map = null
  }
  onWindowResize()
  setActionFeedback(
    preset === 'ultra'
      ? `Motor Gráfico Ultra PC activado: Sombras 4K, Supersampling GPU (${targetPixelRatio.toFixed(2)}x) y Anisotropía 16x.`
      : preset === 'balanced'
        ? 'Motor Gráfico Equilibrado activado: Sombras 2K y consumo optimizado.'
        : 'Modo Máximo Rendimiento (FPS Desbloqueados) activado.'
  )
}

const onWindowResize = () => {
  if (!canvasRef.value || !camera.value || !renderer.value) return
  const width = canvasRef.value.clientWidth, height = canvasRef.value.clientHeight
  if (!width || !height) return
  camera.value.aspect = width / height
  camera.value.updateProjectionMatrix()
  const isSmallScreen = window.matchMedia('(max-width: 767px)').matches
  const preset = graphicsQuality.value
  const targetPixelRatio =
    preset === 'ultra'
      ? Math.min(window.devicePixelRatio, 2.5)
      : preset === 'balanced'
        ? Math.min(window.devicePixelRatio, 1.75)
        : 1.0
  renderer.value.shadowMap.enabled = preset !== 'performance' && !isSmallScreen
  renderer.value.setPixelRatio(isSmallScreen ? Math.min(window.devicePixelRatio, 1.5) : targetPixelRatio)
  renderer.value.setSize(width, height, false)
  pointerDirty = true
}

onMounted(async () => {
  document.addEventListener('fullscreenchange', onFullscreenChange)
  try {
    fields.value = await listFields()
    const requestedFieldId = typeof route.query.fieldId === 'string' ? route.query.fieldId : ''
    const requestedField = fields.value.find(field => field.id === requestedFieldId)
    if (requestedFieldId && !requestedField) {
      selectedFieldId.value = ''
      selectedFieldGeometry.value = null
      setActionFeedback('No se encontró la parcela solicitada o no tienes permiso para verla.')
    } else {
      selectedFieldId.value = requestedFieldId || fields.value[0]?.id || ''
    }
    const field = fields.value.find(item => item.id === selectedFieldId.value)
    selectedFieldGeometry.value = field ? projectFieldGeometry(field.geojson_data) : null
    if (field && !selectedFieldGeometry.value) {
      setActionFeedback('La parcela existe, pero no tiene una geometría válida guardada para mostrar.')
    }
  } catch (error) {
    setActionFeedback(error instanceof Error
      ? `No se pudieron cargar los campos: ${error.message}`
      : 'No se pudieron cargar los campos.')
  }
  initThree()
})
onBeforeUnmount(() => {
  cancelAnimationFrame(animationId.value); window.removeEventListener('resize', onWindowResize)
  document.removeEventListener('fullscreenchange', onFullscreenChange)
  if (feedbackTimeout) clearTimeout(feedbackTimeout)
  resizeObserver.value?.disconnect()
  if (containerRef.value) containerRef.value.removeEventListener('pointermove', onMouseMove)
  controls.value?.dispose()
  disposeAmbientEnvironment()
  clearLiveDroneTrail()
  clearScanRouteLine()
  clearSectorMarkers()
  groundMaterial?.map?.dispose()
  sectorFalloffTexture?.dispose()
  renderer.value?.dispose()
})
</script>

<template>
  <div class="simulation-view flex flex-col relative">
    <!-- Header -->
    <div class="simulation-header px-6 py-4 bg-white border-b border-gray-200 flex justify-between items-center z-20 shadow-sm relative">
      <div>
        <div class="flex items-center gap-2.5 flex-wrap">
          <span class="simulation-eyebrow">LABORATORIO AGRÍCOLA · MOTOR GPU</span>
          <span
            class="inline-flex items-center gap-1.5 rounded-full border border-emerald-400/25 bg-emerald-950/60 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-300"
            :title="`Aceleración por hardware activa: ${gpuRendererName}`"
          >
            <Cpu :size="12" class="text-emerald-400" />
            <span>{{ liveFps }} FPS · {{ frameTimeMs }} ms</span>
            <span class="hidden xl:inline text-emerald-400/75">· {{ gpuRendererName.slice(0, 28) }}</span>
          </span>
        </div>
        <h1 class="text-2xl font-bold text-gray-900">Simulador de cultivos</h1>
        <p class="text-sm text-gray-500 mt-1">Explora el cultivo con aceleración GPU dedicada, analiza su vigor y ejecuta misiones con drones.</p>
      </div>
      
      <div class="simulation-header-actions">
        <select
          :value="graphicsQuality"
          class="simulation-field-select"
          aria-label="Calidad gráfica y aceleración de hardware"
          title="Nivel de optimización y calidad gráfica GPU"
          @change="onGraphicsQualityChange(($event.target as HTMLSelectElement).value as GraphicsQualityPreset)"
        >
          <option value="ultra">Gráficos: Ultra PC (4K · 16x)</option>
          <option value="balanced">Gráficos: Equilibrado (2K)</option>
          <option value="performance">Gráficos: Máx. FPS</option>
        </select>
        <select
          v-model="selectedFieldId"
          class="simulation-field-select"
          aria-label="Asociar simulación a un campo"
          :disabled="droneState !== 'IDLE'"
          @change="handleSelectedFieldChange"
        >
          <option value="">Sin campo asociado</option>
          <option v-for="field in fields" :key="field.id" :value="field.id">{{ field.name }}</option>
        </select>
        <button
          class="simulation-toolbar-button"
          type="button"
          @click="toggleSimulation"
          :aria-label="simulationPaused ? 'Reanudar simulación' : 'Pausar simulación'"
          :title="simulationPaused ? 'Reanudar simulación' : 'Pausar simulación'"
        >
          <Play v-if="simulationPaused" :size="15" />
          <Pause v-else :size="15" />
          {{ simulationPaused ? 'Reanudar' : 'Pausar' }}
        </button>
        <button
          class="simulation-toolbar-button"
          type="button"
          @click="toggleWind"
          :aria-pressed="windEnabled"
          :title="windEnabled ? 'Desactivar viento' : 'Activar viento'"
        >
          <Wind :size="15" />
          {{ windEnabled ? 'Viento' : 'Sin viento' }}
        </button>
        <button class="simulation-toolbar-button" type="button" @click="exportCropData" :disabled="allPlants.length === 0">
          <Download :size="15" />
          Exportar CSV
        </button>
        <button class="simulation-new-scenario" type="button" @click="createNewScenario" :disabled="droneState !== 'IDLE' || simulationPaused || savingSnapshot">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true">
            <path d="M12 3v3m0 12v3M3 12h3m12 0h3M5.64 5.64l2.12 2.12m8.48 8.48 2.12 2.12m0-12.72-2.12 2.12m-8.48 8.48-2.12 2.12M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.6" />
          </svg>
          {{ savingSnapshot ? 'Guardando…' : 'Nuevo escenario' }}
        </button>
        <div class="simulation-mode-switch flex p-1 rounded-lg gap-1" role="group" aria-label="Capas de visualización">
          <button
            v-for="mode in modes"
            :key="mode.id"
            @click="updateMaterials(mode.id)"
            class="flex items-center gap-2 px-4 py-2 rounded-md transition-all text-sm font-medium"
            :class="currentMode === mode.id ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-700'"
            :aria-pressed="currentMode === mode.id"
          >
            <span class="w-3 h-3 rounded-full" :class="mode.color"></span>
            {{ mode.name }}
          </button>
        </div>
      </div>
    </div>

    <div v-if="actionFeedback" class="simulation-feedback" role="status" aria-live="polite">
      <span class="simulation-feedback-dot" :class="droneState === 'IDLE' ? 'is-idle' : ''"></span>
      <span>{{ actionFeedback }}</span>
      <button type="button" aria-label="Cerrar mensaje" @click="actionFeedback = ''">×</button>
    </div>
    
    <div ref="containerRef" class="simulation-stage flex-1 relative bg-gray-900 cursor-crosshair">
      <canvas ref="canvasRef" class="w-full h-full outline-none" role="img" aria-label="Vista tridimensional interactiva del cultivo. Usa el ratón o gestos para explorar."></canvas>
      <p class="simulation-touch-hint">
        <span class="desktop-camera-hint">Arrastra para orbitar · botón derecho para desplazar · rueda para zoom</span>
        <span class="mobile-camera-hint">Un dedo: orbitar · dos dedos: desplazar y zoom</span>
      </p>
      <div class="simulation-live-badge" :class="{ 'is-tracking': liveDrone.connected && liveDrone.hasHeartbeat }" role="status">
        <span></span>
        {{ liveDrone.connected && liveDrone.hasHeartbeat
          ? `Dron real · GPS${liveDrone.relativeAltitude === null ? (liveDrone.armed ? ' · altura estimada' : ' · altura sin dato') : ` · alt. relativa ${liveDrone.relativeAltitude.toFixed(1)} m`}`
          : 'Esperando telemetría real' }}
      </div>
      <div class="simulation-camera-tools" role="group" aria-label="Controles de cámara">
        <button
          type="button"
          @click="toggleCameraPanMode"
          :aria-pressed="cameraPanMode"
          :aria-label="cameraPanMode ? 'Cambiar a modo orbitar' : 'Cambiar a modo desplazar'"
          :title="cameraPanMode ? 'Modo desplazar activo' : 'Activar modo desplazar'"
        >
          <Move />
        </button>
        <button
          type="button"
          @click="toggleCameraFollow"
          :aria-pressed="cameraFollowEnabled"
          :aria-label="cameraFollowEnabled ? 'Desactivar seguimiento del dron' : 'Seguir al dron'"
          :title="cameraFollowEnabled ? 'Desactivar seguimiento del dron' : 'Seguir al dron'"
        >
          <LocateFixed />
        </button>
        <button type="button" @click="zoomCamera('out')" aria-label="Alejar vista" title="Alejar">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true"><circle cx="10.8" cy="10.8" r="6.8" /><path d="m16 16 4.5 4.5M7.8 10.8h6" stroke-linecap="round" /></svg>
        </button>
        <button type="button" @click="zoomCamera('in')" aria-label="Acercar vista" title="Acercar">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true"><circle cx="10.8" cy="10.8" r="6.8" /><path d="m16 16 4.5 4.5M7.8 10.8h6m-3-3v6" stroke-linecap="round" /></svg>
        </button>
        <button type="button" @click="resetCamera" aria-label="Restablecer vista de cámara" title="Restablecer vista">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true"><path d="M3 12a9 9 0 1 0 2.64-6.36L3 8m0-5v5h5" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" /></svg>
          <span>Restablecer</span>
        </button>
        <button
          type="button"
          @click="toggleFullscreen"
          :aria-label="isFullscreen ? 'Salir de pantalla completa' : 'Expandir simulador a pantalla completa'"
          :title="isFullscreen ? 'Salir de pantalla completa' : 'Pantalla completa'"
        >
          <Minimize2 v-if="isFullscreen" />
          <Maximize2 v-else />
        </button>
      </div>


      <!-- Columna Izquierda Fija: Estado + Leyenda + Inspector Fijo de Planta -->
      <div class="simulation-hud-left">
        <div class="simulation-demo-badge" :aria-label="selectedFieldGeometry ? 'Geometría real del campo a escala métrica; cultivo visual demostrativo' : 'Entorno demostrativo'">
          <span class="simulation-demo-dot"></span>
          <span>{{ selectedFieldGeometry ? 'PARCELA REAL · PLANTAS SIMULADAS' : 'ENTORNO DEMOSTRATIVO · DATOS SIMULADOS' }}</span>
          <small v-if="selectedFieldGeometry">{{ fieldDimensionsLabel }} · sin lectura satelital real</small>

        </div>

        <!-- Leyendas -->
        <div v-if="currentMode === 'rgb'" class="simulation-panel simulation-legend p-3.5 text-white shadow-2xl w-64 transition-all">
          <h3 class="font-bold text-sm mb-2 border-b border-white/20 pb-1.5">Vista natural · RGB</h3>
          <p class="text-xs text-gray-300 mb-2.5">Representación visual del estado general de las plantas.</p>
          <div class="simulation-color-key">
            <span><i class="key-healthy"></i> Vigor alto</span>
            <span><i class="key-stressed"></i> Vigor bajo</span>
          </div>
        </div>

        <div v-if="currentMode === 'ndvi'" class="simulation-panel simulation-legend p-3.5 text-white shadow-2xl w-64 transition-all">
          <h3 class="font-bold text-sm mb-2 border-b border-white/20 pb-1.5">Índice de vegetación · NDVI</h3>
          <p class="text-xs text-gray-300 mb-2.5">Lectura visual del vigor vegetal en el cultivo.</p>
          <div class="space-y-2">
            <div class="flex items-center justify-between"><div class="flex items-center gap-2"><div class="w-5 h-3.5 bg-[#16a34a] rounded-sm"></div><span class="text-xs font-medium">Alto Vigor</span></div></div>
            <div class="flex items-center justify-between"><div class="flex items-center gap-2"><div class="w-5 h-3.5 bg-[#facc15] rounded-sm"></div><span class="text-xs font-medium">Moderado</span></div></div>
            <div class="flex items-center justify-between"><div class="flex items-center gap-2"><div class="w-5 h-3.5 bg-[#f97316] rounded-sm"></div><span class="text-xs font-medium">Bajo Vigor</span></div></div>
            <div class="flex items-center justify-between"><div class="flex items-center gap-2"><div class="w-5 h-3.5 bg-[#dc2626] rounded-sm"></div><span class="text-xs font-medium">Plaga Severa</span></div></div>
          </div>
        </div>

        <div v-if="currentMode === 'thermal'" class="simulation-panel simulation-legend p-3.5 text-white shadow-2xl w-64 transition-all">
          <h3 class="font-bold text-sm mb-2 border-b border-white/20 pb-1.5">Térmico (Sequía)</h3>
          <p class="text-xs text-gray-300 mb-2.5">La falta de agua dispara la temperatura de la planta.</p>
          <div class="flex gap-3">
            <div class="w-3.5 rounded-full bg-gradient-to-b from-[#ef4444] via-[#fde047] to-[#1d4ed8] h-24"></div>
            <div class="flex flex-col justify-between py-0.5 flex-1">
              <div class="flex justify-between items-center"><span class="text-xs font-medium text-red-400">Crítico (>35°C)</span></div>
              <div class="flex justify-between items-center"><span class="text-xs font-medium text-yellow-400">Alerta (30°C)</span></div>
              <div class="flex justify-between items-center"><span class="text-xs font-medium text-blue-400">Óptimo (25°C)</span></div>
            </div>
          </div>
        </div>

        <!-- Campo Fijo de Inspección de Planta y Sector (debajo de Vista natural · RGB) -->
        <div
          v-if="inspectedPlant"
          class="simulation-panel simulation-inspector p-3.5 text-white shadow-2xl w-64 transition-all"
          aria-live="polite"
        >
          <div class="flex items-center justify-between gap-2 mb-2 pb-1.5 border-b border-white/15">
            <div class="flex items-center gap-2">
              <span
                class="w-2.5 h-2.5 rounded-full shrink-0"
                :class="inspectedPlant.health > 0.6 ? 'bg-green-400' : 'bg-red-400'"
              ></span>
              <h4 class="font-bold text-white text-sm">Planta {{ inspectedPlant.id }}</h4>
            </div>
            <span
              class="rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider"
              :class="
                hoveredPlant
                  ? 'bg-emerald-400/20 text-emerald-300 border border-emerald-400/30'
                  : 'bg-white/10 text-gray-300'
              "
            >
              {{ hoveredPlant ? 'En cursor' : 'Fija' }}
            </span>
          </div>

          <div class="space-y-2 text-xs">
            <div class="flex justify-between items-center">
              <span class="text-gray-400">Etapa</span>
              <span class="font-semibold text-emerald-400">
                {{ inspectedPlant.stage === 1 ? 'Brote' : (inspectedPlant.stage === 2 ? 'Desarrollo' : 'Madurez') }}
              </span>
            </div>
            <div>
              <div class="flex justify-between mb-1">
                <span class="text-gray-400">NDVI</span>
                <span class="font-bold text-white">{{ inspectedPlant.ndvi.toFixed(2) }}</span>
              </div>
              <div class="w-full bg-white/10 h-1.5 rounded-full overflow-hidden">
                <div
                  class="h-full bg-green-400 rounded-full transition-all duration-200"
                  :style="`width: ${Math.min(100, Math.max(0, inspectedPlant.ndvi * 100))}%`"
                ></div>
              </div>
            </div>
            <div class="flex justify-between items-center">
              <span class="text-gray-400">Estrés hídrico simulado</span>
              <span class="font-bold text-sky-300">{{ (inspectedPlant.waterStress * 100).toFixed(0) }}%</span>
            </div>
            <div class="flex justify-between items-center">
              <span class="text-gray-400">Temperatura</span>
              <span
                class="font-bold"
                :class="inspectedPlant.temp > 30 ? 'text-red-400' : 'text-sky-400'"
              >
                {{ inspectedPlant.temp.toFixed(1) }} °C
              </span>
            </div>
            <div class="flex justify-between items-center pt-1 border-t border-white/10">
              <span class="text-gray-400">Estado</span>
              <span class="font-bold text-white">{{ inspectedPlant.status }}</span>
            </div>
            <div v-if="inspectedPlantGps" class="simulation-plant-location">
              Ubicación GPS simulada: {{ inspectedPlantGps.latitude.toFixed(5) }}, {{ inspectedPlantGps.longitude.toFixed(5) }}
            </div>
            <small v-else class="simulation-location-note">Sin coordenada de parcela asociada; posición demostrativa.</small>
          </div>

          <template v-if="hoveredSector">
            <div class="my-2.5 border-t border-dashed border-white/20"></div>
            <div class="flex items-center gap-2 mb-1.5">
              <div
                class="w-2.5 h-2.5 rounded-full animate-pulse"
                :class="hoveredSector.type === 'DROUGHT' ? 'bg-orange-400' : 'bg-purple-400'"
              ></div>
              <h5 class="font-bold text-xs text-white">
                {{ hoveredSector.type === 'DROUGHT' ? 'Sector de Sequía' : 'Sector de Plaga' }}
              </h5>
              <span
                class="ml-auto text-xs font-bold"
                :class="hoveredSector.type === 'DROUGHT' ? 'text-orange-400' : 'text-purple-300'"
              >
                {{ (hoveredSector.intensity * 100).toFixed(0) }}%
              </span>
            </div>
            <div class="rounded-lg bg-white/5 px-2.5 py-1.5 border border-white/10 text-[11px]">
              <span class="text-gray-400 block">Recomendación Autónoma:</span>
              <strong :class="hoveredSector.type === 'DROUGHT' ? 'text-sky-300' : 'text-emerald-300'">
                {{ hoveredSector.type === 'DROUGHT' ? 'Requiere Irrigación' : 'Requiere Fumigación' }}
              </strong>
            </div>
          </template>
        </div>

      </div>

        <!-- Leyenda de Sectores -->
        <div v-if="droneState !== 'IDLE' || sectorMarkers.length > 0" class="simulation-panel simulation-severity p-3.5 text-white shadow-2xl w-64 transition-all">
          <h3 class="font-bold text-xs mb-2 border-b border-white/20 pb-1.5">Severidad de Sectores</h3>
          <div class="space-y-2.5 text-xs">
            <div>
              <span class="block mb-1 text-gray-300 font-medium">Sequía (Requiere Riego)</span>
              <div class="h-1.5 w-full bg-gradient-to-r from-[#facc15] to-[#ea580c] rounded-full"></div>
            </div>
            <div>
              <span class="block mb-1 text-gray-300 font-medium">Plaga (Requiere Fumigación)</span>
              <div class="h-1.5 w-full bg-gradient-to-r from-[#c084fc] to-[#7e22ce] rounded-full"></div>
            </div>
          </div>
        </div>
      <!-- Columna Derecha Fija: Centro de Misión + Estado del Cultivo (sin superposición) -->
      <div class="simulation-hud-right">
        <!-- Menú de Dron / Análisis -->
        <div class="simulation-panel simulation-controls p-3.5 text-white shadow-2xl w-64 transition-all">
          <div class="simulation-panel-heading">
            <span class="simulation-panel-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                <path d="m5 10 7-4 7 4v4l-7 4-7-4v-4Zm2 1 5 3 5-3M12 6v8m-7-1-3 2m17-2 3 2" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.6" />
              </svg>
            </span>
            <span class="simulation-panel-title"><strong>Centro de misión</strong><small>Operaciones autónomas</small></span>
            <span class="simulation-status" :class="droneState === 'IDLE' ? 'status-ready' : 'status-active'">
              <span></span>
              {{ droneState === 'IDLE' ? 'Disponible' : (droneState === 'SCANNING' ? 'Escaneando' : (droneState === 'CENTINELAS' ? 'Centinelas' : 'En misión')) }}
            </span>
          </div>
          
          <p class="simulation-control-hint">
            {{ simulationPaused ? 'Simulación pausada.' : 'Selecciona una operación para el dron.' }}
          </p>

          <div class="simulation-actions">
            <button @click="handleAction('ANALYZE')" :disabled="droneState !== 'IDLE' || simulationPaused" class="simulation-action simulation-action-wide simulation-action-primary w-full disabled:cursor-not-allowed p-2 rounded-lg text-sm font-medium flex items-center justify-center gap-2">

              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>
              Analizar cultivo
            </button>
            
            <button @click="handleAction('CENTINELAS')" :disabled="simulationPaused || (droneState !== 'IDLE' && droneState !== 'CENTINELAS')" class="simulation-action simulation-action-wide simulation-action-sentinel w-full disabled:cursor-not-allowed p-2 rounded-lg text-sm font-medium flex items-center justify-center gap-2">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"/></svg>
              {{ droneState === 'CENTINELAS' ? 'Detener Centinelas' : 'Activar Centinelas' }}
            </button>
            

            <div class="simulation-action-row">
              <button @click="handleAction('WATER')" :disabled="droneState !== 'IDLE' || simulationPaused" class="simulation-action simulation-action-water disabled:cursor-not-allowed p-2 rounded-lg text-sm font-medium flex items-center justify-center gap-1.5">

                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 3v1m0 16v1M4.22 4.22l.71.71m14.14 14.14l.71.71M1 12h1m20 0h1M4.22 19.78l.71-.71M18.07 5.93l.71-.71M12 6a6 6 0 100 12 6 6 0 000-12z"/></svg>
                Regar
              </button>
              <button @click="handleAction('FUMIGATE')" :disabled="droneState !== 'IDLE' || simulationPaused || savingSnapshot" class="simulation-action simulation-action-fumigate disabled:cursor-not-allowed p-2 rounded-lg text-sm font-medium flex items-center justify-center gap-1.5">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"/></svg>
                Fumigar
              </button>
            </div>
          </div>
        </div>

        <!-- Panel de Telemetría en Tiempo Real -->
        <div class="simulation-panel simulation-telemetry p-3.5 text-white shadow-2xl w-64">
          <h3 class="font-bold text-sm mb-2 border-b border-white/20 pb-1.5 flex items-center gap-2">
            <span class="w-2 h-2 rounded-full bg-agron-green animate-pulse"></span>
            Estado del cultivo
          </h3>
          <div class="space-y-2 text-xs">
            <div class="flex justify-between items-center">
              <span class="text-gray-400">Plantas monitoreadas</span>
              <span class="font-bold text-white">{{ telemetry.plantCount }}</span>
            </div>
            <div>
              <div class="flex justify-between mb-1">
                <span class="text-gray-400">Salud promedio</span>
                <span class="font-bold" :class="telemetry.avgHealth > 60 ? 'text-green-400' : telemetry.avgHealth > 40 ? 'text-yellow-400' : 'text-red-400'">{{ telemetry.avgHealth }}%</span>
              </div>
              <div class="w-full bg-white/10 rounded-full h-1">
                <div class="h-1 rounded-full transition-all duration-500" :class="telemetry.avgHealth > 60 ? 'bg-green-400' : telemetry.avgHealth > 40 ? 'bg-yellow-400' : 'bg-red-400'" :style="`width: ${telemetry.avgHealth}%`"></div>
              </div>
            </div>
            <div>
              <div class="flex justify-between mb-1">
                <span class="text-gray-400">Humedad simulada</span>
                <span class="font-bold text-blue-400">{{ telemetry.avgHumidity }}%</span>
              </div>
              <div class="w-full bg-white/10 rounded-full h-1">
                <div class="h-1 rounded-full bg-blue-400 transition-all duration-500" :style="`width: ${telemetry.avgHumidity}%`"></div>
              </div>
            </div>
            <div>
              <div class="flex justify-between mb-1">
                <span class="text-gray-400">Índice de plagas</span>
                <span class="font-bold" :class="telemetry.avgPestIndex > 30 ? 'text-red-400' : telemetry.avgPestIndex > 15 ? 'text-orange-400' : 'text-green-400'">{{ telemetry.avgPestIndex }}%</span>
              </div>
              <div class="w-full bg-white/10 rounded-full h-1">
                <div class="h-1 rounded-full transition-all duration-500" :class="telemetry.avgPestIndex > 30 ? 'bg-red-400' : telemetry.avgPestIndex > 15 ? 'bg-orange-400' : 'bg-green-400'" :style="`width: ${telemetry.avgPestIndex}%`"></div>
              </div>
            </div>
            <div class="flex justify-between items-center">
              <span class="text-gray-400">NDVI promedio</span>
              <span class="font-bold text-green-400">{{ telemetry.avgNDVI }}</span>
            </div>
            <div class="flex justify-between items-center">
              <span class="text-gray-400">Temperatura prom.</span>
              <span class="font-bold" :class="telemetry.avgTemp > 32 ? 'text-red-400' : 'text-orange-300'">{{ telemetry.avgTemp }} °C</span>
            </div>
            <div class="flex justify-between items-center border-t border-white/10 pt-1.5">
              <span class="text-gray-400">Zonas de estrés</span>
              <span class="font-bold" :class="telemetry.stressZones > 0 ? 'text-yellow-400' : 'text-green-400'">{{ telemetry.stressZones }}</span>
            </div>
            <div class="flex justify-between items-center">
              <span class="text-gray-400">Plantas afectadas</span>
              <span class="font-bold text-yellow-300">{{ telemetry.stressedPlants }}</span>
            </div>
            <div class="flex justify-between items-center">
              <span class="text-gray-400">Plantas perdidas (sim.)</span>
              <span class="font-bold text-red-300">{{ telemetry.deadPlants }}</span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <section class="simulation-insights" aria-labelledby="simulation-insights-title">
      <header class="simulation-insights-heading">
        <div>
          <span class="simulation-eyebrow">RESULTADOS DEL ESCENARIO</span>
          <h2 id="simulation-insights-title">Seguimiento y costos estimados</h2>
          <p>Datos simulados sobre {{ fields.find(field => field.id === selectedFieldId)?.name ?? 'un campo demostrativo' }}. No son mediciones satelitales ni una cotización.</p>
        </div>
        <div class="simulation-insights-actions">
          <span class="simulation-source-badge">SIMULACIÓN · {{ telemetry.stressedPlants }} plantas con afectación</span>
          <RouterLink
            v-if="selectedFieldId"
            class="simulation-map-link"
            :to="{ name: 'maps', query: { fieldId: selectedFieldId } }"
          >
            <MapPinned :size="15" />
            Ver campo en satélite
          </RouterLink>
        </div>
      </header>

      <div class="simulation-insights-grid">
        <article class="simulation-insight-card simulation-trend-card">
          <div class="simulation-insight-title">
            <div><h3>Tendencia del cultivo</h3><p>Últimos {{ trendHistory.length }} registros · escala de 0 a 100</p></div>
            <span class="simulation-trend-live"><i></i> Actualiza cada 10 s</span>
          </div>
          <svg class="simulation-trend-chart" viewBox="0 0 300 100" role="img" aria-label="Gráfica simulada de salud, humedad y NDVI del cultivo">
            <line v-for="y in [10, 30, 50, 70, 90]" :key="y" x1="0" :y1="y" x2="300" :y2="y" />
            <polyline class="trend-health" :points="trendPoints('health')" />
            <polyline class="trend-moisture" :points="trendPoints('humidity')" />
            <polyline class="trend-ndvi" :points="trendPoints('ndvi')" />
          </svg>
          <div class="simulation-chart-legend">
            <span><i class="trend-health-key"></i> Salud {{ telemetry.avgHealth }}%</span>
            <span><i class="trend-moisture-key"></i> Humedad {{ telemetry.avgHumidity }}%</span>
            <span><i class="trend-ndvi-key"></i> NDVI {{ telemetry.avgNDVI }}</span>
          </div>
          <p class="simulation-chart-disclaimer">La evolución se acelera para demostración; el estrés sin tratar puede causar pérdida simulada de plantas.</p>
        </article>

        <article class="simulation-insight-card">
          <div class="simulation-insight-title">
            <div><h3>Tratamiento y prevención</h3><p>{{ selectedFieldGeometry ? `Referencia por ${estimatedAreaHectares.toFixed(2)} ha` : 'Área demostrativa de referencia: 1.00 ha' }}</p></div>
            <span class="simulation-cost-icon">$</span>
          </div>
          <div class="simulation-cost-row">
            <span><strong>Tratamiento correctivo</strong><small>Riego localizado para las zonas detectadas</small></span>
            <b>{{ treatmentCost }}</b>
          </div>
          <div class="simulation-cost-row">
            <span><strong>Prevención recomendada</strong><small>Revisar humedad y emisores por sector</small></span>
            <b>{{ preventionCost }}</b>
          </div>
          <div class="simulation-savings">
            <span><strong>Ahorro potencial estimado</strong><small>Valor bruto {{ estimatedSavings }} · neto preventivo {{ projectedSavingsNet }}</small></span>
            <b>{{ projectedSavingsNet }}</b>
          </div>
          <p class="simulation-chart-disclaimer">Supuestos orientativos en MXN: tratamiento $1,650/ha, prevención $520/ha y pérdida potencial evitada hasta $2,400/ha, ajustada por plantas afectadas. Confirma precios locales y cultivo antes de decidir.</p>
        </article>

        <article class="simulation-insight-card simulation-route-card">
          <div class="simulation-insight-title">
            <div><h3>Ruta optimizada del dron</h3><p>Cobertura calculada sobre la geometría real</p></div>
            <span class="simulation-route-icon">↗</span>
          </div>
          <template v-if="coverageRoute">
            <div class="simulation-route-metrics">
              <div><b>{{ coverageRoute.lengthMeters.toFixed(0) }} m</b><small>trayecto estimado</small></div>
              <div><b>{{ Math.max(1, Math.ceil(coverageRoute.lengthMeters / 5 / 60)) }} min</b><small>a 5 m/s</small></div>
              <div><b>{{ coverageRoute.estimatedEnergyWh.toFixed(1) }} Wh</b><small>energía estimada</small></div>
              <div><b>{{ coverageRoute.distanceSavedMeters.toFixed(0) }} m</b><small>ahorro vs. rectángulo</small></div>
            </div>
            <p class="simulation-chart-disclaimer">{{ coverageRoute.laneCount }} tramos de cobertura · orientación {{ coverageRoute.orientation }}. Tiempo y energía son aproximaciones (5 m/s y 450 W medios); valida límites y obstáculos. No se envía al autopiloto.</p>
          </template>
          <p v-else class="simulation-empty-route">Ejecuta «Analizar cultivo» para calcular y visualizar la ruta sobre la parcela seleccionada.</p>
        </article>

        <article class="simulation-insight-card simulation-affected-card">
          <div class="simulation-insight-title">
            <div><h3>Plantas afectadas</h3><p>Ubicaciones generadas para este escenario</p></div>
            <span class="simulation-affected-count">{{ telemetry.stressedPlants }}</span>
          </div>
          <div v-if="affectedPlants.length" class="simulation-affected-list">
            <div v-for="plant in affectedPlants" :key="plant.id" class="simulation-affected-row">
              <span><i :class="plant.dead ? 'is-dead' : ''"></i><strong>{{ plant.id }}</strong><small>{{ plant.status }} · estrés {{ (plant.waterStress * 100).toFixed(0) }}%</small></span>
              <span v-if="plantGps(plant)" class="simulation-affected-location">
                {{ plantGps(plant)?.latitude.toFixed(5) }}, {{ plantGps(plant)?.longitude.toFixed(5) }}
              </span>
              <small v-else>Coordenada no disponible</small>
            </div>
          </div>
          <p v-else class="simulation-empty-route">No se han marcado plantas afectadas. Inicia un análisis para actualizar el escenario.</p>
          <p class="simulation-chart-disclaimer">Puntos y coordenadas aproximados de la simulación; verifica la planta en campo antes de tratarla.</p>
        </article>
      </div>
    </section>

    <DroneConnectionPanel @telemetry="handleDroneTelemetry" />
  </div>
</template>

<style scoped>
      .simulation-view {
        min-width: 0;
        min-height: calc(100vh - 3rem);
        min-height: calc(100dvh - 3rem);
        gap: 0.85rem;
        animation: simulation-enter 0.45s cubic-bezier(0.16, 1, 0.3, 1) both;
      }

      .simulation-header {
        flex-wrap: wrap;
        gap: 1rem;
        border: 1px solid rgba(196, 218, 147, 0.12);
        border-radius: 16px;
        background:
          radial-gradient(ellipse at 0 0, rgba(120, 150, 76, 0.12), transparent 42%),
          rgba(28, 32, 21, 0.9);
        box-shadow: 0 14px 36px rgba(0, 0, 0, 0.16), inset 0 1px rgba(255, 255, 255, 0.035);
      }

      .simulation-header h1 {
        margin-top: 3px;
        font-size: clamp(1.4rem, 2.5vw, 1.9rem);
        line-height: 1.2;
        letter-spacing: -0.05em;
      }

      .simulation-eyebrow {
        color: #d2b65d;
        font-size: 0.62rem;
        font-weight: 800;
        letter-spacing: 0.15em;
      }

      .simulation-header p { color: #929d86; }

      .simulation-header-actions {
        display: flex;
        align-items: center;
        justify-content: flex-end;
        gap: 0.65rem;
        flex-wrap: wrap;
      }

      .simulation-field-select {
        min-height: 40px;
        max-width: 180px;
        padding: 0 10px;
        border: 1px solid rgba(196, 218, 147, 0.17);
        border-radius: 10px;
        color: #cbd4c2;
        background: #19211b;
        font-size: 0.72rem;
      }

      .simulation-toolbar-button {
        display: inline-flex;
        min-height: 40px;
        align-items: center;
        justify-content: center;
        gap: 7px;
        padding: 0 11px;
        border: 1px solid rgba(196, 218, 147, 0.17);
        border-radius: 10px;
        color: #cbd4c2;
        background: rgba(255, 255, 255, 0.035);
        font-size: 0.72rem;
        font-weight: 650;
        transition: color 0.2s ease, background 0.2s ease, border-color 0.2s ease, transform 0.2s ease;
      }

      .simulation-toolbar-button:hover:not(:disabled),
      .simulation-toolbar-button[aria-pressed="true"] {
        border-color: rgba(196, 218, 147, 0.34);
        color: #f0efdf;
        background: rgba(196, 218, 147, 0.1);
      }

      .simulation-toolbar-button:hover:not(:disabled) { transform: translateY(-1px); }
      .simulation-toolbar-button:disabled { cursor: not-allowed; opacity: 0.45; }
      .simulation-toolbar-button:focus-visible {
        outline: 2px solid #f2d474;
        outline-offset: 2px;
      }

      .simulation-new-scenario {
        display: inline-flex;
        min-height: 40px;
        align-items: center;
        justify-content: center;
        gap: 8px;
        padding: 0 13px;
        border: 1px solid rgba(211, 189, 103, 0.28);
        border-radius: 10px;
        color: #ead796;
        background: rgba(211, 189, 103, 0.08);
        font-size: 0.75rem;
        font-weight: 700;
        transition: background 0.2s ease, border-color 0.2s ease, transform 0.2s ease;
      }

      .simulation-new-scenario:hover:not(:disabled) {
        transform: translateY(-1px);
        border-color: rgba(238, 203, 113, 0.55);
        background: rgba(211, 189, 103, 0.15);
      }

      .simulation-new-scenario:disabled { cursor: not-allowed; opacity: 0.45; }
      .simulation-new-scenario svg { width: 16px; height: 16px; }

      .simulation-mode-switch {
        flex: 0 0 auto;
        border: 1px solid rgba(196, 218, 147, 0.12);
        background: rgba(7, 11, 8, 0.45);
      }

      .simulation-mode-switch button {
        color: #aab29e;
        transition: color 0.2s ease, background 0.2s ease, transform 0.2s ease;
      }

      .simulation-mode-switch button:hover { color: #eff2e7; }

      .simulation-mode-switch button[aria-pressed="true"] {
        color: #211a08;
        background: linear-gradient(135deg, #f6d977, #dfb53d);
        box-shadow: 0 5px 14px rgba(214, 172, 58, 0.18);
      }

      .simulation-mode-switch button[aria-pressed="true"] span {
        box-shadow: 0 0 0 2px rgba(20, 26, 16, 0.22);
      }

      .simulation-feedback {
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 10px 14px;
        border: 1px solid rgba(196, 218, 147, 0.15);
        border-radius: 12px;
        color: #e4e9dc;
        background: rgba(28, 32, 21, 0.86);
        font-size: 0.82rem;
        animation: panel-enter 0.25s ease both;
      }

      .simulation-feedback-dot,
      .simulation-demo-dot {
        flex: 0 0 auto;
        width: 7px;
        height: 7px;
        border-radius: 50%;
        background: #efb953;
        box-shadow: 0 0 12px rgba(239, 185, 83, 0.4);
      }

      .simulation-feedback-dot.is-idle {
        background: #96bf61;
        box-shadow: 0 0 12px rgba(150, 191, 97, 0.42);
      }

      .simulation-feedback button {
        margin-left: auto;
        color: #929d86;
        font-size: 1.2rem;
      }

      .simulation-stage {
        height: clamp(600px, 75vh, 860px);
        height: clamp(600px, 75dvh, 860px);
        flex: 0 0 auto;
        overflow: hidden;
        border: 1px solid rgba(196, 218, 147, 0.14);
        border-radius: 18px;
        background:
          radial-gradient(ellipse at 50% 5%, rgba(206, 210, 172, 0.25), transparent 42%),
          linear-gradient(145deg, #1b2921, #101713);
        box-shadow: 0 22px 52px rgba(0, 0, 0, 0.23), inset 0 1px rgba(255, 255, 255, 0.035);
        isolation: isolate;
      }

      .simulation-stage > canvas {
        display: block;
        position: absolute;
        inset: 0;
        width: 100%;
        height: 100%;
        touch-action: none;
        cursor: grab;
      }

      .simulation-stage > canvas:active { cursor: grabbing; }

      .simulation-hud-left {
        position: absolute;
        z-index: 10;
        top: 0.9rem;
        left: 0.9rem;
        bottom: 3.3rem;
        display: flex;
        flex-direction: column;
        align-items: flex-start;
        gap: 0.55rem;
        width: min(15.5rem, calc(50% - 1.25rem));
        overflow-y: auto;
        overflow-x: hidden;
        pointer-events: none;
        scrollbar-width: thin;
      }

      .simulation-hud-right {
        position: absolute;
        z-index: 10;
        top: 0.9rem;
        right: 0.9rem;
        bottom: 0.9rem;
        display: flex;
        flex-direction: column;
        align-items: flex-end;
        justify-content: flex-start;
        gap: 0.55rem;
        width: min(15.5rem, calc(50% - 1.25rem));
        overflow-y: auto;
        overflow-x: hidden;
        pointer-events: none;
        scrollbar-width: thin;
      }

      .simulation-hud-left > *,
      .simulation-hud-right > * {
        box-sizing: border-box;
        width: 100%;
        max-width: 100%;
        pointer-events: auto;
        flex-shrink: 0;

      }

      .simulation-touch-hint {
        position: absolute;
        z-index: 3;
        bottom: 0.85rem;
        left: 0.9rem;
        display: block;
        margin: 0;
        padding: 6px 10px;
        border: 1px solid rgba(255, 255, 255, 0.14);
        border-radius: 9px;
        color: #e4ecdf;
        background: rgba(13, 20, 16, 0.76);
        backdrop-filter: blur(10px);
        font-size: 0.62rem;
        pointer-events: none;
      }
      .mobile-camera-hint { display: none; }

      .simulation-demo-badge {
        position: relative;
        z-index: 2;

        top: 1rem;
        left: 50%;

        width: fit-content;
        max-width: 100%;

        display: grid;
        grid-template-columns: 6px auto;
        align-items: center;
        column-gap: 8px;
        row-gap: 2px;
        padding: 6px 10px;
        border: 1px solid rgba(255, 255, 255, 0.14);
        border-radius: 14px;
        color: #eff1e9;
        background: rgba(13, 20, 16, 0.78);
        backdrop-filter: blur(12px);
        font-size: 0.56rem;
        font-weight: 750;
        letter-spacing: 0.08em;
        transform: translateX(-50%);

        letter-spacing: 0.06em;

        pointer-events: none;
      }

      .simulation-demo-dot {
        width: 6px;
        height: 6px;
        background: #efb953;
        animation: status-pulse 2s ease-in-out infinite;
      }

      .simulation-demo-badge small {
        grid-column: 2;
        color: #c5d0ba;
        font-size: 0.55rem;
        font-weight: 550;
        letter-spacing: 0.02em;
      }

      .simulation-live-badge {
        position: absolute;
        z-index: 3;
        top: 1rem;
        right: 18rem;
        display: inline-flex;
        align-items: center;
        gap: 8px;
        max-width: calc(100% - 20rem);
        padding: 8px 11px;
        border: 1px solid rgba(255, 255, 255, 0.14);
        border-radius: 999px;
        color: #d3ddce;
        background: rgba(13, 20, 16, 0.78);
        font-size: 0.62rem;
        pointer-events: none;
      }

      .simulation-live-badge > span {
        width: 7px;
        height: 7px;
        flex: 0 0 auto;
        border-radius: 50%;
        background: #899187;
      }

      .simulation-live-badge.is-tracking > span {
        background: #55e6d0;
        box-shadow: 0 0 12px rgba(85, 230, 208, 0.7);
        animation: status-pulse 1.5s ease-in-out infinite;
      }

      .simulation-camera-tools {
        position: absolute;
        z-index: 5;
        bottom: 1rem;
        left: 50%;
        display: inline-flex;
        align-items: center;
        gap: 4px;
        padding: 5px;
        border: 1px solid rgba(255, 255, 255, 0.14);
        border-radius: 12px;
        color: #edf1e6;
        background: rgba(13, 20, 16, 0.82);
        backdrop-filter: blur(12px);
        transform: translateX(-50%);
        box-shadow: 0 8px 25px rgba(0, 0, 0, 0.2);
      }

      .simulation-camera-tools button {
        display: inline-flex;
        min-width: 36px;
        min-height: 36px;
        align-items: center;
        justify-content: center;
        gap: 7px;
        padding: 0 9px;
        border: 1px solid transparent;
        border-radius: 8px;
        color: #e7ecdf;
        font-size: 0.69rem;
        font-weight: 650;
        transition: background 0.2s ease, border-color 0.2s ease, transform 0.2s ease;
      }

      .simulation-camera-tools button:hover {
        transform: translateY(-1px);
        border-color: rgba(238, 203, 113, 0.42);
        background: rgba(29, 39, 29, 0.92);
      }

      .simulation-camera-tools svg { width: 16px; height: 16px; }
      .simulation-camera-tools button[aria-pressed="true"] {
        border-color: rgba(85, 230, 208, 0.45);
        color: #8af0dd;
        background: rgba(38, 161, 140, 0.18);
      }

      .simulation-stage:fullscreen {
        width: 100vw;
        height: 100vh;
        height: 100dvh;
        min-height: 100vh;
        min-height: 100dvh;
        max-height: 100dvh;
        flex: none;
        padding: 0;
        border: 0;
        border-radius: 0;
        background: #9fc6d7;
      }

      .simulation-stage:fullscreen > canvas {
        position: absolute;
        inset: 0;
        width: 100%;
        height: 100%;
        border: 0;
        border-radius: 0;
      }

      .simulation-stage:fullscreen > .simulation-legend {
        position: absolute;
        inset: 1rem auto auto 1rem;
        width: min(270px, calc(100vw - 2rem));
      }

      .simulation-stage:fullscreen > .simulation-hud-left {
        top: 1rem;
        left: 1rem;
        bottom: 3.6rem;
        max-height: calc(100dvh - 4.8rem);
      }

      .simulation-stage:fullscreen > .simulation-hud-right {
        top: 1rem;
        right: 1rem;
        bottom: 1rem;

        max-height: calc(100dvh - 2rem);
      }

      .simulation-stage:fullscreen > .simulation-severity {
        position: absolute;
        inset: auto auto 4.5rem 1rem;
        width: min(270px, calc(100vw - 2rem));
        max-height: calc(100dvh - 7rem);
        overflow: auto;
      }

      .simulation-stage:fullscreen > .simulation-camera-tools {
        top: auto;
        right: auto;
        bottom: 1rem;
        left: 50%;
        transform: translateX(-50%);
      }

      .simulation-stage:fullscreen > .simulation-touch-hint {
        top: auto;
        bottom: 1.1rem;
        left: 1rem;
      }

      .simulation-panel {
        border: 1px solid rgba(196, 218, 147, 0.18);
        border-radius: 16px;
        background:
          linear-gradient(145deg, rgba(24, 31, 23, 0.92), rgba(12, 18, 14, 0.9));
        box-shadow: 0 18px 42px rgba(0, 0, 0, 0.32), inset 0 1px rgba(255, 255, 255, 0.06);
        backdrop-filter: blur(16px);
        -webkit-backdrop-filter: blur(16px);
        animation: panel-enter 0.35s cubic-bezier(0.16, 1, 0.3, 1) both;
      }

      .simulation-panel-heading {
        display: flex;
        align-items: center;
        flex-wrap: wrap;
        gap: 10px;
        margin-bottom: 12px;
        padding-bottom: 12px;
        border-bottom: 1px solid rgba(255, 255, 255, 0.11);
      }

      .simulation-panel-icon {
        display: grid;
        flex: 0 0 auto;
        width: 36px;
        height: 36px;
        place-items: center;
        border: 1px solid rgba(196, 218, 147, 0.16);
        border-radius: 11px;
        color: #e6c961;
        background: rgba(196, 218, 147, 0.08);
      }

      .simulation-panel-icon svg { width: 19px; height: 19px; }
      .simulation-panel-title { min-width: 0; flex: 1 1 5rem; }
      .simulation-panel-title strong,
      .simulation-panel-title small { display: block; }
      .simulation-panel-title strong { color: #f1f2eb; font-size: 0.86rem; }
      .simulation-panel-title small { margin-top: 2px; color: #929d86; font-size: 0.66rem; }

      .simulation-status {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        margin-left: auto;
        padding: 5px 8px;
        border: 1px solid rgba(196, 218, 147, 0.12);
        border-radius: 999px;
        font-size: 0.61rem;
        font-weight: 700;
        white-space: nowrap;
      }

      .simulation-status > span {
        width: 6px;
        height: 6px;
        border-radius: 50%;
        background: currentColor;
      }

      .status-ready { color: #b8d986; background: rgba(116, 153, 70, 0.13); }
      .status-active { color: #f2cd71; background: rgba(203, 150, 56, 0.13); }
      .status-active > span { animation: status-pulse 1.2s ease-in-out infinite; }
      .simulation-control-hint { margin: 0 0 11px; color: #909b86; font-size: 0.69rem; }

      .simulation-controls button {
        min-height: 42px;
        transition: filter 0.2s ease, transform 0.2s ease, box-shadow 0.2s ease;
      }

      .simulation-controls button:hover:not(:disabled) {
        transform: translateY(-1px);
        filter: brightness(1.09);
      }

      .simulation-controls button:disabled { opacity: 0.48; }
      .simulation-controls { box-sizing: border-box; min-width: 0; }
      .simulation-actions { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 0.55rem; }
      .simulation-action-wide { grid-column: 1 / -1; }
      .simulation-action-row { display: grid; grid-column: 1 / -1; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 0.55rem; }
      .simulation-actions .simulation-action { width: 100%; min-width: 0; padding-inline: 0.45rem; line-height: 1.25; white-space: normal; }
      .simulation-actions .simulation-action svg { flex: 0 0 auto; }

      .simulation-action {
        color: #f2f2e9;
        border: 1px solid rgba(255, 255, 255, 0.12);
        transition: filter 0.2s ease, transform 0.2s ease, box-shadow 0.2s ease, background 0.2s ease;
      }

      .simulation-action-primary { background: linear-gradient(135deg, #b99d4e, #907a3c); }
      .simulation-action-sentinel { background: linear-gradient(135deg, #63518a, #453661); }
      .simulation-action-water { background: linear-gradient(135deg, #386e83, #285164); }
      .simulation-action-fumigate { background: linear-gradient(135deg, #467a5b, #31583f); }
      .simulation-action:disabled { filter: saturate(0.45); }

      .simulation-controls .simulation-action:disabled { opacity: 0.46; }

      .simulation-controls .simulation-action:not(:disabled):hover {
        box-shadow: 0 5px 16px rgba(0, 0, 0, 0.22);
      }

      .simulation-controls button:focus-visible,
      .simulation-camera-tools button:focus-visible,
      .simulation-new-scenario:focus-visible,
      .simulation-mode-switch button:focus-visible {
        outline: 2px solid #f2d474;
        outline-offset: 2px;
      }

      .simulation-tooltip {
        max-width: calc(100vw - 24px);
        border-color: rgba(196, 218, 147, 0.18);
        background: #1c2015;
        color: #f5f1df;
      }

      .simulation-color-key { display: grid; gap: 9px; color: #d6ddce; font-size: 0.72rem; }
      .simulation-color-key span { display: inline-flex; align-items: center; gap: 9px; }
      .simulation-color-key i { width: 12px; height: 12px; border-radius: 4px; }
      .simulation-color-key .key-healthy { background: #15803d; }
      .simulation-color-key .key-stressed { background: #84cc16; }

      .simulation-insights {
        display: grid;
        gap: 1rem;
        padding: 1.15rem;
        border: 1px solid rgba(196, 218, 147, 0.13);
        border-radius: 16px;
        background: rgba(25, 30, 22, 0.82);
      }

      .simulation-insights-heading,
      .simulation-insight-title {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 1rem;
      }

      .simulation-insights-actions {
        display: flex;
        align-items: center;
        justify-content: flex-end;
        gap: 0.6rem;
        flex-wrap: wrap;
      }

      .simulation-map-link {
        display: inline-flex;
        min-height: 34px;
        align-items: center;
        justify-content: center;
        gap: 7px;
        padding: 0 10px;
        border: 1px solid rgba(142, 180, 91, 0.3);
        border-radius: 9px;
        color: #dcedc1;
        background: rgba(55, 151, 93, 0.11);
        font-size: 0.68rem;
        font-weight: 750;
        text-decoration: none;
        white-space: nowrap;
      }
      .simulation-map-link:hover { border-color: rgba(142, 180, 91, 0.58); background: rgba(55, 151, 93, 0.19); }
      .simulation-map-link:focus-visible { outline: 2px solid #c1e19a; outline-offset: 2px; }
      .simulation-map-link svg { color: #a9d287; }

      .simulation-insights-heading h2 {
        margin-top: 0.25rem;
        color: #f0f2e9;
        font-size: 1.25rem;
        font-weight: 750;
        letter-spacing: -0.035em;
      }

      .simulation-insights-heading p,
      .simulation-insight-title p {
        margin-top: 0.3rem;
        color: #9aa38f;
        font-size: 0.74rem;
      }

      .simulation-source-badge,
      .simulation-trend-live {
        display: inline-flex;
        flex: 0 0 auto;
        align-items: center;
        gap: 0.45rem;
        padding: 0.42rem 0.65rem;
        border: 1px solid rgba(211, 189, 103, 0.2);
        border-radius: 999px;
        color: #e7d48e;
        background: rgba(211, 189, 103, 0.07);
        font-size: 0.62rem;
        font-weight: 750;
      }

      .simulation-insights-grid {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 0.8rem;
      }

      .simulation-insight-card {
        min-width: 0;
        padding: 1rem;
        border: 1px solid rgba(196, 218, 147, 0.12);
        border-radius: 13px;
        background: linear-gradient(145deg, rgba(33, 39, 29, 0.92), rgba(17, 23, 18, 0.88));
      }

      .simulation-insight-title { align-items: center; margin-bottom: 0.8rem; }
      .simulation-insight-title h3 { color: #f0f2e9; font-size: 0.88rem; font-weight: 750; }
      .simulation-trend-live { color: #b7d89a; border-color: rgba(143, 191, 111, 0.18); background: rgba(143, 191, 111, 0.07); }
      .simulation-trend-live i,
      .simulation-affected-row > span > i {
        display: block;
        width: 7px;
        height: 7px;
        border-radius: 50%;
        background: #a3d477;
      }

      .simulation-trend-chart {
        display: block;
        width: 100%;
        height: 8rem;
        overflow: visible;
      }

      .simulation-trend-chart line { stroke: rgba(226, 232, 220, 0.11); stroke-width: 1; }
      .simulation-trend-chart polyline { fill: none; stroke-width: 2.5; stroke-linecap: round; stroke-linejoin: round; }
      .simulation-trend-chart .trend-health { stroke: #a3d477; }
      .simulation-trend-chart .trend-moisture { stroke: #60a5fa; }
      .simulation-trend-chart .trend-ndvi { stroke: #f6d977; }

      .simulation-chart-legend {
        display: flex;
        flex-wrap: wrap;
        gap: 0.55rem 1rem;
        color: #d3dacb;
        font-size: 0.67rem;
      }

      .simulation-chart-legend span { display: inline-flex; align-items: center; gap: 0.4rem; }
      .simulation-chart-legend i { width: 9px; height: 9px; border-radius: 3px; }
      .trend-health-key { background: #a3d477; }
      .trend-moisture-key { background: #60a5fa; }
      .trend-ndvi-key { background: #f6d977; }
      .simulation-chart-disclaimer { margin-top: 0.8rem; color: #929d86; font-size: 0.63rem; line-height: 1.55; }

      .simulation-cost-icon,
      .simulation-route-icon,
      .simulation-affected-count {
        display: grid;
        flex: 0 0 auto;
        width: 2rem;
        height: 2rem;
        place-items: center;
        border: 1px solid rgba(211, 189, 103, 0.2);
        border-radius: 10px;
        color: #e8d286;
        background: rgba(211, 189, 103, 0.08);
        font-size: 1rem;
        font-weight: 800;
      }

      .simulation-cost-row,
      .simulation-savings {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 0.8rem;
        padding: 0.7rem 0;
        border-top: 1px solid rgba(255, 255, 255, 0.075);
      }

      .simulation-cost-row span,
      .simulation-savings span,
      .simulation-affected-row > span {
        display: grid;
        gap: 0.18rem;
        min-width: 0;
      }

      .simulation-cost-row strong,
      .simulation-savings strong { color: #e7eadf; font-size: 0.72rem; }
      .simulation-cost-row small,
      .simulation-savings small { color: #929d86; font-size: 0.62rem; }
      .simulation-cost-row b { color: #f0f2e9; font-size: 0.88rem; white-space: nowrap; }
      .simulation-savings { margin-top: 0.3rem; padding: 0.8rem; border: 1px solid rgba(143, 191, 111, 0.18); border-radius: 10px; background: rgba(143, 191, 111, 0.07); }
      .simulation-savings strong,
      .simulation-savings b { color: #bce29a; }
      .simulation-savings b { font-size: 1rem; white-space: nowrap; }

      .simulation-route-metrics {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 0.5rem;
      }

      .simulation-route-metrics > div {
        display: grid;
        gap: 0.22rem;
        padding: 0.7rem 0.5rem;
        border: 1px solid rgba(196, 218, 147, 0.11);
        border-radius: 10px;
        background: rgba(255, 255, 255, 0.025);
      }

      .simulation-route-metrics b { color: #c7e9ef; font-size: 0.95rem; }
      .simulation-route-metrics small { color: #929d86; font-size: 0.6rem; }
      .simulation-empty-route { padding: 0.85rem; border: 1px dashed rgba(196, 218, 147, 0.16); border-radius: 10px; color: #a5ad9b; font-size: 0.72rem; line-height: 1.5; }

      .simulation-affected-list { display: grid; max-height: 17rem; overflow: auto; }
      .simulation-affected-row {
        display: grid;
        grid-template-columns: minmax(0, 1fr) auto;
        align-items: center;
        gap: 0.65rem;
        padding: 0.55rem 0;
        border-top: 1px solid rgba(255, 255, 255, 0.075);
      }

      .simulation-affected-row > span { grid-template-columns: 8px 1fr; align-items: center; }
      .simulation-affected-row > span > i.is-dead { background: #ef7373; }
      .simulation-affected-row strong { color: #e7eadf; font-size: 0.68rem; }
      .simulation-affected-row > span small { grid-column: 2; color: #929d86; font-size: 0.59rem; }
      .simulation-affected-location,
      .simulation-affected-row > small { color: #9bc9fb; font-size: 0.59rem; text-align: right; text-decoration: underline; text-underline-offset: 2px; }
      .simulation-affected-location { justify-self: end; text-decoration: none; }
      .simulation-affected-row > small { color: #929d86; text-decoration: none; }
      .simulation-plant-location { padding-top: 0.5rem; border-top: 1px solid rgba(255, 255, 255, 0.08); color: #9bc9fb; font-size: 0.61rem; line-height: 1.5; }
      .simulation-location-note { display: block; color: #929d86; font-size: 0.61rem; line-height: 1.5; }

      @keyframes simulation-enter {
        from { opacity: 0; transform: translateY(10px); }
        to { opacity: 1; transform: translateY(0); }
      }

      @keyframes panel-enter {
        from { opacity: 0; transform: translateY(6px); }
        to { opacity: 1; transform: translateY(0); }
      }

      @keyframes status-pulse {
        0%, 100% { opacity: 0.65; box-shadow: 0 0 0 0 rgba(239, 185, 83, 0.25); }
        50% { opacity: 1; box-shadow: 0 0 0 5px rgba(239, 185, 83, 0); }
      }

      @media (min-width: 768px) and (max-width: 1023px) {
        .simulation-stage { min-height: clamp(580px, 72dvh, 760px); }
        .simulation-hud-left,
        .simulation-hud-right { width: 220px; }
        .simulation-panel { width: 220px; padding: 0.8rem; }
        .simulation-panel-heading { gap: 7px; }
        .simulation-status { gap: 4px; padding-inline: 6px; font-size: 0.56rem; }
        .simulation-legend,
        .simulation-inspector,
        .simulation-telemetry,
        .simulation-severity { max-width: 220px; }
      }

      @media (max-width: 767px) {
        .simulation-view {
          min-height: 0;
          gap: 0.75rem;
          overflow: visible;
          padding-bottom: max(0.75rem, env(safe-area-inset-bottom));
        }

        .simulation-header {
          align-items: stretch;
          padding: 1rem;
          border-radius: 14px;
        }

        .simulation-header > div:first-child { min-width: 0; }
        .simulation-header p { font-size: 0.8rem; }
        .simulation-header-actions { width: 100%; align-items: stretch; }
        .simulation-header-actions > button { flex: 1 1 calc(50% - 0.65rem); }
        .simulation-header-actions > .simulation-new-scenario { flex: 1; }
        .simulation-toolbar-button { padding-inline: 8px; }
        .simulation-mode-switch {
          width: 100%;
          justify-content: space-between;
          flex-wrap: wrap;
        }
        .simulation-mode-switch button {
          flex: 1 1 auto;
          justify-content: center;
          padding-inline: 0.65rem;
          font-size: 0.75rem;
        }

        .simulation-stage {
          display: flex;
          flex: none;
          flex-direction: column;
          gap: 0.6rem;
          height: auto;
          min-height: 0;
          padding-top: clamp(260px, 44vh, 390px);
          padding-top: clamp(260px, 44dvh, 390px);
          overflow: visible;
          border: 0;
          border-radius: 14px;
          background: transparent;
          box-shadow: none;
        }

        .simulation-stage > canvas {
          position: absolute;
          inset: 0 0 auto;
          width: 100%;
          height: clamp(260px, 44vh, 390px);
          height: clamp(260px, 44dvh, 390px);
          border: 1px solid rgba(196, 218, 147, 0.18);
          border-radius: 14px;
        }

        .simulation-touch-hint {
          position: absolute;
          top: calc(clamp(260px, 44vh, 390px) - 2.65rem);
          top: calc(clamp(260px, 44dvh, 390px) - 2.65rem);
          left: 50%;
          z-index: 3;
          max-width: calc(100% - 1rem);
          margin: 0;
          padding: 6px 9px;
          border: 1px solid rgba(255, 255, 255, 0.12);
          border-radius: 8px;
          color: #dce4d5;
          background: rgba(13, 20, 16, 0.72);
          backdrop-filter: blur(10px);
          font-size: 0.62rem;
          white-space: nowrap;
          transform: translateX(-50%);
          pointer-events: none;
        }
        .desktop-camera-hint { display: none; }
        .mobile-camera-hint { display: inline; }

        .simulation-hud-left,
        .simulation-hud-right {
          display: contents;
        }

        .simulation-stage .simulation-panel {

          position: relative;
          inset: auto;
          z-index: 1;
          width: 100%;
          max-width: 100%;
          margin: 0;
        }

        .simulation-demo-badge {
          position: absolute;
          top: 0.75rem;
          left: 0.75rem;
          padding: 7px 9px;
          font-size: 0.52rem;
          transform: none;
        }

        .simulation-live-badge {
          top: 3.2rem;
          right: auto;
          left: 0.75rem;
          max-width: calc(100% - 1.5rem);
          padding: 7px 9px;
          font-size: 0.57rem;
        }

        .simulation-camera-tools {
          top: 0.65rem;
          bottom: auto;
          left: auto;
          right: 0.65rem;
          transform: none;
        }

        .simulation-camera-tools button { min-width: 42px; min-height: 42px; }
        .simulation-camera-tools button span { display: none; }
        .simulation-stage:fullscreen {
          display: block;
          height: 100vh;
          height: 100dvh;
          min-height: 100vh;
          min-height: 100dvh;
          max-height: 100dvh;
          padding: 0;
          overflow: hidden;
          border: 0;
          border-radius: 0;
          background: #9fc6d7;
          box-shadow: none;
        }
        .simulation-stage:fullscreen > canvas {
          position: absolute;
          inset: 0;
          width: 100%;
          height: 100%;
          border: 0;
          border-radius: 0;
        }

        .simulation-stage:fullscreen .simulation-panel {
          position: absolute;

          inset: 1rem 1rem auto auto;
          width: min(340px, calc(100vw - 2rem));
          max-height: 64dvh;
          overflow: auto;
          padding-top: 0.85rem;
        }
        .simulation-stage:fullscreen > .simulation-legend {
          display: none;
        }
        .simulation-stage:fullscreen > .simulation-severity {
          display: none;
        }
        .simulation-stage:fullscreen > .simulation-camera-tools {
          position: absolute;
          top: auto;
          right: auto;
          bottom: 0.65rem;
          left: auto;
          transform: none;
          width: calc(50vw - 1rem);
          flex-wrap: wrap;
          justify-content: center;
        }
        .simulation-stage:fullscreen > .simulation-touch-hint {
          display: none;
        }
        .simulation-stage:fullscreen > .simulation-camera-tools {
          left: 0.5rem;
        }
        .simulation-panel { border-radius: 14px; }
        .simulation-panel-heading { flex-wrap: wrap; }
        .simulation-panel-icon { width: 34px; height: 34px; }
        .simulation-status { margin-left: auto; }
        .simulation-control-hint { font-size: 0.73rem; }
        .simulation-controls { order: 1; }
        .simulation-inspector { order: 2; }
        .simulation-legend { order: 3; }
        .simulation-severity { order: 4; }
        .simulation-telemetry { order: 5; }
        .simulation-controls button { min-height: 46px; font-size: 0.84rem; }
        .simulation-telemetry { margin-bottom: 0.25rem !important; }
        .simulation-insights { padding: 0.9rem; }
        .simulation-insights-heading { align-items: flex-start; flex-direction: column; }
        .simulation-insights-actions { justify-content: flex-start; }
        .simulation-insights-grid { grid-template-columns: minmax(0, 1fr); }
        .simulation-insight-card { padding: 0.85rem; }
        .simulation-source-badge { white-space: normal; }
        .simulation-affected-row { grid-template-columns: minmax(0, 1fr); }
        .simulation-affected-location,
        .simulation-affected-row > small { text-align: left; padding-left: 1rem; }
      }

      @media (max-width: 420px) {
        .simulation-mode-switch { flex-wrap: nowrap; }
        .simulation-mode-switch button { gap: 0.35rem; padding-inline: 0.4rem; font-size: 0.68rem; }
        .simulation-new-scenario { min-height: 44px; }
        .simulation-controls { padding: 0.9rem; }
        .simulation-panel-heading { gap: 8px; }
        .simulation-status { padding-inline: 6px; font-size: 0.57rem; }
        .simulation-demo-badge { max-width: calc(100% - 8.5rem); font-size: 0.47rem; }
        .simulation-camera-tools { gap: 2px; }
        .simulation-camera-tools button { min-width: 40px; min-height: 42px; padding-inline: 7px; }
        .simulation-action-row { gap: 0.55rem; }
      }

      @media (prefers-reduced-motion: reduce) {
        .simulation-view, .simulation-panel, .simulation-feedback { animation: none; }
        .simulation-demo-dot, .status-active > span { animation: none; }
        .simulation-controls button, .simulation-camera-tools button,
        .simulation-new-scenario, .simulation-toolbar-button { transition: none; }
      }
</style>
