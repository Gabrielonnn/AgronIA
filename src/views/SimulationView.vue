<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, shallowRef } from 'vue'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'

interface PlantData {
  id: string; x: number; z: number; health: number; ndvi: number; temp: number; status: string; stage: number
}

interface StressCenter {
  id: string; x: number; z: number; intensity: number; radius: number; type: 'DROUGHT' | 'PEST'
}

const canvasRef = ref<HTMLCanvasElement | null>(null)
const containerRef = ref<HTMLDivElement | null>(null)
const currentMode = ref<'rgb' | 'ndvi' | 'thermal'>('rgb')
const droneState = ref<'IDLE' | 'SCANNING' | 'FLYING' | 'ACTION' | 'RETURNING' | 'CENTINELAS'>('IDLE')
const currentAction = ref<'NONE' | 'WATER' | 'FUMIGATE' | 'CENTINELAS'>('NONE')

// Datos de interacción
const hoveredPlant = ref<PlantData | null>(null)
const hoveredSector = ref<StressCenter | null>(null)
const tooltipPos = ref({ x: 0, y: 0 })
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

// Dron y Analisis
let stressCenters: StressCenter[] = []
let droneGroup: THREE.Group
let propellers: THREE.Mesh[] = []
let sectorMarkers: THREE.Mesh[] = []
let particleSystem: THREE.Points
let particleGeo: THREE.BufferGeometry
let activeTargets: StressCenter[] = []
let activeTargetIndex = 0

let dronePath: THREE.Vector3[] = []
let currentPathIndex = 0
let feedbackTimeout: ReturnType<typeof setTimeout> | undefined

// Enjambre de Centinelas
let centinelaGroup: THREE.Group | null = null
let centinelaPropellers: THREE.Mesh[] = []
let centinelaFrameCounter = 0

const DRONE_BASE = new THREE.Vector3(-15, 0.5, 15)
const FLIGHT_HEIGHT = 8
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
  stressZones: 0
})

const updateTelemetry = () => {
  if (!allPlants || allPlants.length === 0) return
  const count = allPlants.length
  let sumHealth = 0, sumNDVI = 0, sumTemp = 0
  for (const p of allPlants) {
    sumHealth += p.health
    sumNDVI += p.ndvi
    sumTemp += p.temp
  }
  telemetry.value = {
    avgHealth: parseFloat(((sumHealth / count) * 100).toFixed(1)),
    avgHumidity: parseFloat((((sumHealth / count) * 0.8 + 0.1) * 100).toFixed(1)),
    avgPestIndex: parseFloat((Math.max(0, 1 - (sumNDVI / count)) * 100 * 0.5).toFixed(1)),
    avgNDVI: parseFloat((sumNDVI / count).toFixed(2)),
    avgTemp: parseFloat((sumTemp / count).toFixed(1)),
    plantCount: count,
    stressZones: stressCenters.length
  }
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

const getStatusName = (health: number) => {
  if (health >= 0.7) return 'Alto Vigor'
  if (health >= 0.4) return 'Moderado'
  if (health >= 0.25) return 'Bajo Vigor'
  return 'Estrés'
}

const getSectorColor = (type: string, intensity: number) => {
  const t = Math.max(0, Math.min(1, (intensity - 0.6) / 0.4))
  if (type === 'DROUGHT') {
     return new THREE.Color().lerpColors(new THREE.Color(0xfacc15), new THREE.Color(0xea580c), t).getHex()
  } else {
     return new THREE.Color().lerpColors(new THREE.Color(0xc084fc), new THREE.Color(0x7e22ce), t).getHex()
  }
}

const getColorForPlant = (plant: PlantData, mode: 'rgb' | 'ndvi' | 'thermal') => {
  if (mode === 'rgb') return lerpColor(new THREE.Color(0x84cc16), new THREE.Color(0x15803d), plant.health)
  if (mode === 'ndvi') {
    if (plant.ndvi < 0.33) return lerpColor(new THREE.Color(0xdc2626), new THREE.Color(0xf97316), plant.ndvi / 0.33)
    if (plant.ndvi < 0.66) return lerpColor(new THREE.Color(0xf97316), new THREE.Color(0xfacc15), (plant.ndvi - 0.33) / 0.33)
    return lerpColor(new THREE.Color(0xfacc15), new THREE.Color(0x16a34a), (plant.ndvi - 0.66) / 0.34)
  }
  const heat = Math.max(0, Math.min(1, (plant.temp - 25) / 12)) // 0 to 1
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
  if (groundMaterial) groundMaterial.color.setHex(mode === 'rgb' ? 0x78350f : (mode === 'ndvi' ? 0x1e40af : 0x450a0a))
  if (!trunkMesh || !leafMesh) return

  for (let i = 0; i < allPlants.length; i++) trunkMesh.setColorAt(i, mode === 'rgb' ? new THREE.Color(0x84cc16) : getColorForPlant(allPlants[i], mode))
  trunkMesh.instanceColor!.needsUpdate = true

  for (let i = 0; i < leafToPlantMap.length; i++) leafMesh.setColorAt(i, getColorForPlant(allPlants[leafToPlantMap[i]], mode))
  leafMesh.instanceColor!.needsUpdate = true

  if (tasselMesh) {
    for (let i = 0; i < tasselToPlantMap.length; i++) tasselMesh.setColorAt(i, mode === 'rgb' ? new THREE.Color(0xfef08a) : getColorForPlant(allPlants[tasselToPlantMap[i]], mode))
    tasselMesh.instanceColor!.needsUpdate = true
  }
  if (earMesh) {
    for (let i = 0; i < earToPlantMap.length; i++) earMesh.setColorAt(i, mode === 'rgb' ? new THREE.Color(0xeab308) : getColorForPlant(allPlants[earToPlantMap[i]], mode))
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
  const numCenters = Math.floor(Math.random() * 3) + 2
  for (let i=0; i<numCenters; i++) {
    stressCenters.push({
      id: `SEC-${i+1}`,
      x: (Math.random() * 40) - 20,
      z: (Math.random() * 30) - 15,
      intensity: 0.6 + Math.random() * 0.4,
      radius: 4 + Math.random() * 4,
      type: Math.random() > 0.5 ? 'DROUGHT' : 'PEST'
    })
  }
}

const regenerateFieldHealth = () => {
  allPlants.forEach(plant => {
    let dStress = 0, pStress = 0
    for (const center of stressCenters) {
      const dist = Math.sqrt(Math.pow(plant.x - center.x, 2) + Math.pow(plant.z - center.z, 2))
      if (dist < center.radius) {
        const effect = center.intensity * (1 - (dist / center.radius))
        if (center.type === 'DROUGHT') dStress = Math.max(dStress, effect)
        if (center.type === 'PEST') pStress = Math.max(pStress, effect)
      }
    }
    plant.health = Math.max(0.1, 0.9 + Math.random() * 0.1 - dStress - pStress)
    plant.temp = 25 + (dStress * 12) + (pStress * 2)
    plant.ndvi = Math.max(0.1, 0.8 - (pStress * 0.6) - (dStress * 0.2))
    plant.status = getStatusName(plant.health)
  })
  updateMaterials(currentMode.value)
  updateTelemetry()
}

const handleAction = (action: 'ANALYZE' | 'WATER' | 'FUMIGATE' | 'CENTINELAS') => {
  if (action === 'CENTINELAS') {
    if (droneState.value === 'CENTINELAS') {
      droneState.value = 'IDLE'
      currentAction.value = 'NONE'
      if (centinelaGroup) centinelaGroup.visible = false
      setActionFeedback('Modo Centinelas detenido.')
      return
    }
    if (droneState.value !== 'IDLE') return
    droneState.value = 'CENTINELAS'
    currentAction.value = 'CENTINELAS'
    
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
    generateRandomStressCenters()
    regenerateFieldHealth()
    
    // Ruta de escaneo (Zigzag sobre el campo)
    dronePath = [
       new THREE.Vector3(-25, FLIGHT_HEIGHT, -20),
       new THREE.Vector3(25, FLIGHT_HEIGHT, -20),
       new THREE.Vector3(25, FLIGHT_HEIGHT, 0),
       new THREE.Vector3(-25, FLIGHT_HEIGHT, 0),
       new THREE.Vector3(-25, FLIGHT_HEIGHT, 20),
       new THREE.Vector3(25, FLIGHT_HEIGHT, 20),
       DRONE_BASE
    ]
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
  camera.value.position.set(0, 18, 35)
  controls.value.target.set(0, 0, 0)
  controls.value.update()
}

const zoomCamera = (direction: 'in' | 'out') => {
  if (!controls.value) return
  if (direction === 'in') controls.value.dollyIn(1.2)
  else controls.value.dollyOut(1.2)
  controls.value.update()
}

const createNewScenario = () => {
  if (droneState.value !== 'IDLE') return
  if (centinelaGroup) centinelaGroup.visible = false
  currentAction.value = 'NONE'
  particleSystem.visible = false
  generateRandomStressCenters()
  regenerateFieldHealth()
  setActionFeedback('Nuevo escenario generado. Analiza el cultivo para detectar las zonas de estrés.')
}

const initThree = () => {
  if (!canvasRef.value || !containerRef.value) return
  const width = canvasRef.value.clientWidth, height = canvasRef.value.clientHeight
  const isSmallScreen = window.matchMedia('(max-width: 767px)').matches
  renderer.value = new THREE.WebGLRenderer({ canvas: canvasRef.value, antialias: !isSmallScreen })
  renderer.value.setPixelRatio(Math.min(window.devicePixelRatio, isSmallScreen ? 1.5 : 2))
  renderer.value.setSize(width, height, false)
  renderer.value.shadowMap.enabled = !isSmallScreen

  scene.value = new THREE.Scene()
  scene.value.background = new THREE.Color(0x9ba993)
  scene.value.fog = new THREE.FogExp2(0x9ba993, 0.008)

  camera.value = new THREE.PerspectiveCamera(60, width / height, 0.1, 1000)
  camera.value.position.set(0, 18, 35)
  controls.value = new OrbitControls(camera.value, renderer.value.domElement)
  controls.value.target.set(0, 0, 0)
  controls.value.enableDamping = true
  controls.value.dampingFactor = 0.075
  controls.value.minDistance = 12
  controls.value.maxDistance = 75
  controls.value.maxPolarAngle = Math.PI / 2.05

  scene.value.add(new THREE.HemisphereLight(0xe5edda, 0x483d29, 1.15))
  const dirLight = new THREE.DirectionalLight(0xffffff, 1.0)
  dirLight.position.set(-35, 65, 25); dirLight.castShadow = true
  scene.value.add(dirLight)

  groundMaterial = new THREE.MeshLambertMaterial({ color: 0x78350f })
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(150, 150), groundMaterial)
  ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.value.add(ground)

  const furrowPositions: number[] = []
  for (let x = -26; x <= 26; x += 3.5) {
    furrowPositions.push(x, 0.025, -21, x, 0.025, 21)
  }
  const furrowGeometry = new THREE.BufferGeometry()
  furrowGeometry.setAttribute('position', new THREE.Float32BufferAttribute(furrowPositions, 3))
  const furrows = new THREE.LineSegments(
    furrowGeometry,
    new THREE.LineBasicMaterial({ color: 0xc39a64, transparent: true, opacity: 0.17 })
  )
  scene.value.add(furrows)

  // Generación aleatoria de zonas inicial
  generateRandomStressCenters()

  // Dron y Particulas
  droneGroup = createDrone()
  droneGroup.position.copy(DRONE_BASE)
  scene.value.add(droneGroup)
  createParticles()

  // Generar plantas dinámicas afectadas por las zonas
  allPlants = []; leafToPlantMap = []; tasselToPlantMap = []; earToPlantMap = []
  let leafCount = 0, tasselCount = 0, earCount = 0

  for (let i = -7; i < 7; i++) {
    for (let j = -10; j < 10; j++) {
      const stage = Math.random() > 0.6 ? 3 : (Math.random() > 0.3 ? 2 : 1)
      leafCount += stage === 1 ? 5 : (stage === 2 ? 10 : 14)
      if (stage === 3) { tasselCount++; earCount += 2 } else if (stage === 2) { earCount += 1 }

      const x = i * 3.5 + (Math.random() * 0.8 - 0.4), z = j * 2.2 + (Math.random() * 0.8 - 0.4)
      
      // Usamos valores dummy iniciales, regenerateFieldHealth recalculará los reales
      const health = 1, temp = 25, ndvi = 1

      allPlants.push({ id: `P-${i+7}-${j+10}`, x, z, health, ndvi, temp, status: getStatusName(health), stage })
    }
  }

  // Meshes setup
  leafMesh = new THREE.InstancedMesh(createLeafGeometry(), new THREE.MeshLambertMaterial({ side: THREE.DoubleSide }), leafCount)
  const trunkGeo = new THREE.CylinderGeometry(0.04, 0.08, 1, 8); trunkGeo.translate(0, 0.5, 0)
  trunkMesh = new THREE.InstancedMesh(trunkGeo, new THREE.MeshLambertMaterial(), allPlants.length)
  const tasselGeo = createTasselGeometry(); tasselGeo.translate(0, -0.1, 0)
  tasselMesh = new THREE.InstancedMesh(tasselGeo, new THREE.MeshLambertMaterial(), tasselCount)
  const earGeo = new THREE.CapsuleGeometry(0.12, 0.4, 4, 8); earGeo.rotateZ(Math.PI / 8); earGeo.translate(0.15, 0.2, 0)
  earMesh = new THREE.InstancedMesh(earGeo, new THREE.MeshLambertMaterial(), earCount)
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

  scene.value.add(trunkMesh, leafMesh, tasselMesh, earMesh, hitboxMesh)
  regenerateFieldHealth()
  raycaster.value = new THREE.Raycaster(); mouse.value = new THREE.Vector2()

  let actionTimer = 0

  const animate = () => {
    animationId.value = requestAnimationFrame(animate)
    controls.value?.update()

    if (droneState.value === 'IDLE') {
      const hover = Math.sin(performance.now() * 0.0018) * 0.08
      droneGroup.position.y = DRONE_BASE.y + hover
      droneGroup.rotation.z = Math.sin(performance.now() * 0.0012) * 0.012
      propellers.forEach((propeller, index) => {
        propeller.rotation.y += index % 2 === 0 ? 0.12 : -0.12
      })
    }
    
    // Raycaster para Plantas y Zonas
    if (raycaster.value && mouse.value && camera.value && scene.value) {
      raycaster.value.setFromCamera(mouse.value, camera.value)
      
      const plantHits = raycaster.value.intersectObject(hitboxMesh)
      hoveredPlant.value = (plantHits.length > 0 && plantHits[0].instanceId !== undefined) ? allPlants[plantHits[0].instanceId] : null
      
      if (sectorMarkers.length > 0) {
        const sectorHits = raycaster.value.intersectObjects(sectorMarkers)
        hoveredSector.value = (sectorHits.length > 0) ? sectorHits[0].object.userData as StressCenter : null
      } else {
        hoveredSector.value = null
      }
    }

    // Drone Animation Logic
    if (droneState.value === 'CENTINELAS') {
      centinelaFrameCounter++
      centinelaPropellers.forEach((p, i) => p.rotation.y += (i % 2 === 0 ? 0.5 : -0.5))
      if (centinelaGroup) {
        centinelaGroup.rotation.y += 0.005 // Rotar lentamente alrededor del campo
      }
      
      // Simular actualización en tiempo real frecuente
      if (centinelaFrameCounter % 120 === 0) { // Cada ~2 segundos (a 60fps)
        // Modificar ligeramente la intensidad de estrés para que se vea vivo
        stressCenters.forEach(c => c.intensity = Math.max(0.2, Math.min(1.0, c.intensity + (Math.random()-0.5)*0.1)))
        regenerateFieldHealth()
        
        // Actualizar los colores de los marcadores de sector en tiempo real
        sectorMarkers.forEach(mesh => {
           const center = mesh.userData as StressCenter
           ;(mesh.material as THREE.MeshBasicMaterial).color.setHex(getSectorColor(center.type, center.intensity))
        })
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
              const geo = new THREE.PlaneGeometry(center.radius * 2, center.radius * 2)
              geo.rotateX(-Math.PI / 2)
              const mat = new THREE.MeshBasicMaterial({ 
                color: getSectorColor(center.type, center.intensity),
                transparent: true, opacity: 0.5, side: THREE.DoubleSide, depthWrite: false
              })
              const mesh = new THREE.Mesh(geo, mat)
              mesh.position.set(center.x, 0.2, center.z) // Ligeramente elevado
              mesh.userData = center // Guardar datos para tooltip
              scene.value?.add(mesh)
              sectorMarkers.push(mesh)
            })
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
              ? 'Misión de riego completada. Se actualizaron las métricas del cultivo.'
              : 'Misión de fumigación completada. Se actualizaron las métricas del cultivo.')
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
  containerRef.value.addEventListener('pointermove', onMouseMove)
}

const onMouseMove = (event: PointerEvent) => {
  if (!canvasRef.value || !mouse.value) return
  const rect = canvasRef.value.getBoundingClientRect()
  mouse.value.x = ((event.clientX - rect.left) / rect.width) * 2 - 1
  mouse.value.y = -((event.clientY - rect.top) / rect.height) * 2 + 1
  tooltipPos.value = {
    x: Math.max(12, Math.min(event.clientX + 15, window.innerWidth - 280)),
    y: Math.min(event.clientY + 15, window.innerHeight - 24)
  }
}

const onWindowResize = () => {
  if (!canvasRef.value || !camera.value || !renderer.value) return
  const width = canvasRef.value.clientWidth, height = canvasRef.value.clientHeight
  if (!width || !height) return
  camera.value.aspect = width / height
  camera.value.updateProjectionMatrix()
  const isSmallScreen = window.matchMedia('(max-width: 767px)').matches
  renderer.value.shadowMap.enabled = !isSmallScreen
  renderer.value.setPixelRatio(Math.min(window.devicePixelRatio, isSmallScreen ? 1.5 : 2))
  renderer.value.setSize(width, height, false)
}

onMounted(() => { initThree() })
onBeforeUnmount(() => {
  cancelAnimationFrame(animationId.value); window.removeEventListener('resize', onWindowResize)
  if (feedbackTimeout) clearTimeout(feedbackTimeout)
  resizeObserver.value?.disconnect()
  if (containerRef.value) containerRef.value.removeEventListener('pointermove', onMouseMove)
  if (renderer.value) renderer.value.dispose()
})
</script>

<template>
  <div class="simulation-view flex flex-col relative">
    <!-- Header -->
    <div class="simulation-header px-6 py-4 bg-white border-b border-gray-200 flex justify-between items-center z-20 shadow-sm relative">
      <div>
        <span class="simulation-eyebrow">LABORATORIO AGRÍCOLA</span>
        <h1 class="text-2xl font-bold text-gray-900">Simulador de cultivos</h1>
        <p class="text-sm text-gray-500 mt-1">Explora el cultivo, analiza su vigor y ejecuta misiones con drones.</p>
      </div>
      
      <div class="simulation-header-actions">
        <button class="simulation-new-scenario" type="button" @click="createNewScenario" :disabled="droneState !== 'IDLE'">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true">
            <path d="M12 3v3m0 12v3M3 12h3m12 0h3M5.64 5.64l2.12 2.12m8.48 8.48 2.12 2.12m0-12.72-2.12 2.12m-8.48 8.48-2.12 2.12M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.6" />
          </svg>
          Nuevo escenario
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
      <p class="simulation-touch-hint">Arrastra para explorar · Pellizca para acercar</p>
      <div class="simulation-demo-badge" aria-label="Entorno demostrativo">
        <span class="simulation-demo-dot"></span>
        ENTORNO DEMOSTRATIVO · DATOS SIMULADOS
      </div>
      <div class="simulation-camera-tools" role="group" aria-label="Controles de cámara">
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
      </div>

      <!-- Menú de Dron / Análisis -->
      <div class="simulation-panel simulation-controls absolute top-6 right-6 bg-black/80 backdrop-blur-md border border-white/10 rounded-xl p-4 text-white shadow-2xl z-10 w-64 transition-all">
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
        
        <p class="simulation-control-hint">Selecciona una operación para el dron.</p>
        <div class="space-y-2">
          <button @click="handleAction('ANALYZE')" :disabled="droneState !== 'IDLE'" class="simulation-action simulation-action-primary w-full disabled:cursor-not-allowed p-2 rounded-lg text-sm font-medium flex items-center justify-center gap-2">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>
            Analizar cultivo
          </button>
          
          <button @click="handleAction('CENTINELAS')" :disabled="droneState !== 'IDLE' && droneState !== 'CENTINELAS'" class="simulation-action simulation-action-sentinel w-full disabled:cursor-not-allowed p-2 rounded-lg text-sm font-medium flex items-center justify-center gap-2 mt-2">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"/></svg>
            {{ droneState === 'CENTINELAS' ? 'Detener Centinelas' : 'Activar Centinelas' }}
          </button>
          
          <div class="grid grid-cols-2 gap-2 mt-2">
            <button @click="handleAction('WATER')" :disabled="droneState !== 'IDLE'" class="simulation-action simulation-action-water disabled:cursor-not-allowed p-2 rounded-lg text-sm font-medium flex items-center justify-center gap-1.5">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 3v1m0 16v1M4.22 4.22l.71.71m14.14 14.14l.71.71M1 12h1m20 0h1M4.22 19.78l.71-.71M18.07 5.93l.71-.71M12 6a6 6 0 100 12 6 6 0 000-12z"/></svg>
              Regar
            </button>
            <button @click="handleAction('FUMIGATE')" :disabled="droneState !== 'IDLE'" class="simulation-action simulation-action-fumigate disabled:cursor-not-allowed p-2 rounded-lg text-sm font-medium flex items-center justify-center gap-1.5">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"/></svg>
              Fumigar
            </button>
          </div>
        </div>
      </div>

      <!-- Leyendas -->
      <div v-if="currentMode === 'rgb'" class="simulation-panel simulation-legend absolute top-6 left-6 bg-black/80 backdrop-blur-md border border-white/10 rounded-xl p-4 text-white shadow-2xl z-10 w-64 transition-all">
        <h3 class="font-bold text-sm mb-3 border-b border-white/20 pb-2">Vista natural · RGB</h3>
        <p class="text-xs text-gray-300 mb-3">Representación visual del estado general de las plantas.</p>
        <div class="simulation-color-key">
          <span><i class="key-healthy"></i> Vigor alto</span>
          <span><i class="key-stressed"></i> Vigor bajo</span>
        </div>
      </div>

      <div v-if="currentMode === 'ndvi'" class="simulation-panel simulation-legend absolute top-6 left-6 bg-black/80 backdrop-blur-md border border-white/10 rounded-xl p-4 text-white shadow-2xl z-10 w-64 transition-all">
        <h3 class="font-bold text-sm mb-3 border-b border-white/20 pb-2">Índice de vegetación · NDVI</h3>
        <p class="text-xs text-gray-300 mb-3">Lectura visual del vigor vegetal. Es una simulación, no un diagnóstico agronómico.</p>
        <div class="space-y-3">
          <div class="flex items-center justify-between"><div class="flex items-center gap-2"><div class="w-6 h-4 bg-[#16a34a] rounded-sm"></div><span class="text-sm font-medium">Alto Vigor</span></div></div>
          <div class="flex items-center justify-between"><div class="flex items-center gap-2"><div class="w-6 h-4 bg-[#facc15] rounded-sm"></div><span class="text-sm font-medium">Moderado</span></div></div>
          <div class="flex items-center justify-between"><div class="flex items-center gap-2"><div class="w-6 h-4 bg-[#f97316] rounded-sm"></div><span class="text-sm font-medium">Bajo Vigor</span></div></div>
          <div class="flex items-center justify-between"><div class="flex items-center gap-2"><div class="w-6 h-4 bg-[#dc2626] rounded-sm"></div><span class="text-sm font-medium">Plaga Severa</span></div></div>
        </div>
      </div>

      <div v-if="currentMode === 'thermal'" class="simulation-panel simulation-legend absolute top-6 left-6 bg-black/80 backdrop-blur-md border border-white/10 rounded-xl p-4 text-white shadow-2xl z-10 w-64 transition-all">
        <h3 class="font-bold text-lg mb-3 border-b border-white/20 pb-2">Térmico (Sequía)</h3>
        <p class="text-xs text-gray-300 mb-3">La falta de agua dispara la temperatura de la planta.</p>
        <div class="flex gap-4">
          <div class="w-4 rounded-full bg-gradient-to-b from-[#ef4444] via-[#fde047] to-[#1d4ed8] h-32"></div>
          <div class="flex flex-col justify-between py-1 flex-1">
            <div class="flex justify-between items-center"><span class="text-sm font-medium text-red-400">Crítico (>35°C)</span></div>
            <div class="flex justify-between items-center"><span class="text-sm font-medium text-yellow-400">Alerta (30°C)</span></div>
            <div class="flex justify-between items-center"><span class="text-sm font-medium text-blue-400">Óptimo (25°C)</span></div>
          </div>
        </div>
      </div>

      <!-- Leyenda de Sectores -->
      <div v-if="droneState !== 'IDLE' || sectorMarkers.length > 0" class="simulation-panel simulation-severity absolute bottom-6 left-6 bg-black/80 backdrop-blur-md border border-white/10 rounded-xl p-4 text-white shadow-2xl z-10 w-64 transition-all">
        <h3 class="font-bold text-sm mb-3 border-b border-white/20 pb-2">Severidad de Sectores</h3>
        <div class="space-y-4 text-xs">
          <div>
            <span class="block mb-1 text-gray-300 font-medium">Sequía (Requiere Riego)</span>
            <div class="h-2 w-full bg-gradient-to-r from-[#facc15] to-[#ea580c] rounded-full"></div>
            <div class="flex justify-between mt-1 text-gray-400"><span>Leve</span><span>Crítica</span></div>
          </div>
          <div>
            <span class="block mb-1 text-gray-300 font-medium">Plaga (Requiere Fumigación)</span>
            <div class="h-2 w-full bg-gradient-to-r from-[#c084fc] to-[#7e22ce] rounded-full"></div>
            <div class="flex justify-between mt-1 text-gray-400"><span>Leve</span><span>Crítica</span></div>
          </div>
        </div>
      </div>

      <!-- Panel de Telemetría en Tiempo Real -->
      <div class="simulation-panel simulation-telemetry absolute bottom-6 right-6 bg-black/85 backdrop-blur-md border border-white/10 rounded-xl p-4 text-white shadow-2xl z-10 w-64">
        <h3 class="font-bold text-sm mb-3 border-b border-white/20 pb-2 flex items-center gap-2">
          <span class="w-2 h-2 rounded-full bg-agron-green animate-pulse"></span>
          Estado del cultivo
        </h3>
        <div class="space-y-2.5 text-xs">
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
              <span class="text-gray-400">Humedad suelo</span>
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
          <div class="flex justify-between items-center border-t border-white/10 pt-2">
            <span class="text-gray-400">Zonas de estrés</span>
            <span class="font-bold" :class="telemetry.stressZones > 0 ? 'text-yellow-400' : 'text-green-400'">{{ telemetry.stressZones }}</span>
          </div>
        </div>
      </div>
    </div>
    
    <!-- Tooltip Combinado (Planta + Sector) -->
    <div 
      v-if="hoveredPlant || hoveredSector"
      class="simulation-tooltip fixed bg-white border border-gray-200 rounded-xl shadow-2xl p-4 pointer-events-none z-50 w-64 transform -translate-y-full"
      :style="{ left: `${tooltipPos.x}px`, top: `${tooltipPos.y - 10}px` }"
    >
      <template v-if="hoveredPlant">
        <div class="flex items-center gap-2 mb-2 pb-2 border-b border-gray-100">
          <div class="w-2 h-2 rounded-full" :class="hoveredPlant.health > 0.6 ? 'bg-green-500' : 'bg-red-500'"></div>
          <h4 class="font-bold text-gray-900 text-sm">Planta {{ hoveredPlant.id }}</h4>
        </div>
        <div class="space-y-2">
          <div class="flex justify-between text-xs pb-1 border-b border-gray-50">
            <span class="text-gray-500">Etapa</span>
            <span class="font-medium text-green-700">{{ hoveredPlant.stage === 1 ? 'Brote' : (hoveredPlant.stage === 2 ? 'Desarrollo' : 'Madurez') }}</span>
          </div>
          <div>
            <div class="flex justify-between text-xs mb-1">
              <span class="text-gray-500">NDVI</span>
              <span class="font-medium text-gray-900">{{ hoveredPlant.ndvi.toFixed(2) }}</span>
            </div>
            <div class="w-full bg-gray-100 h-1.5 rounded-full overflow-hidden">
              <div class="h-full bg-green-500 rounded-full" :style="`width: ${(hoveredPlant.ndvi / 1) * 100}%`"></div>
            </div>
          </div>
          <div class="flex justify-between text-xs">
            <span class="text-gray-500">Temperatura</span>
            <span class="font-medium" :class="hoveredPlant.temp > 30 ? 'text-red-500' : 'text-blue-500'">{{ hoveredPlant.temp.toFixed(1) }} °C</span>
          </div>
          <div class="flex justify-between text-xs pt-1">
            <span class="text-gray-500">Estado</span>
            <span class="font-semibold text-gray-900">{{ hoveredPlant.status }}</span>
          </div>
        </div>
      </template>


      <!-- Divisor si hay ambos -->
      <div v-if="hoveredPlant && hoveredSector" class="my-3 border-t border-dashed border-gray-300"></div>

      <template v-if="hoveredSector">
        <div class="flex items-center gap-2 mb-2">
          <div class="w-3 h-3 rounded-full animate-pulse shadow-sm" :class="hoveredSector.type === 'DROUGHT' ? 'bg-orange-500' : 'bg-purple-500'"></div>
          <h4 class="font-bold text-sm text-gray-900">
            {{ hoveredSector.type === 'DROUGHT' ? 'Sector de Sequía' : 'Sector de Plaga' }}
          </h4>
        </div>
        <div class="space-y-3">
          <div>
            <div class="flex justify-between items-end mb-1">
              <span class="text-xs text-gray-500 block">Severidad</span>
              <span class="text-xs font-bold" :class="hoveredSector.type === 'DROUGHT' ? 'text-orange-500' : 'text-purple-500'">
                {{ (hoveredSector.intensity * 100).toFixed(0) }}%
              </span>
            </div>
            <div class="w-full bg-gray-100 h-1.5 rounded-full overflow-hidden">
              <div class="h-full rounded-full transition-all" :class="hoveredSector.type === 'DROUGHT' ? 'bg-gradient-to-r from-yellow-400 to-orange-600' : 'bg-gradient-to-r from-purple-400 to-purple-800'" :style="`width: ${(hoveredSector.intensity / 1) * 100}%`"></div>
            </div>
          </div>
          <div class="bg-gray-50 rounded p-2 border border-gray-200">
            <span class="text-xs text-gray-500 block mb-1">Recomendación Autónoma:</span>
            <span class="text-xs font-bold block" :class="hoveredSector.type === 'DROUGHT' ? 'text-blue-500' : 'text-emerald-500'">
              {{ hoveredSector.type === 'DROUGHT' ? 'Requiere Irrigación' : 'Requiere Fumigación' }}
            </span>
          </div>
        </div>
      </template>
    </div>

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
        min-height: clamp(560px, 72vh, 850px);
        min-height: clamp(560px, 72dvh, 850px);
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
        touch-action: none;
        cursor: grab;
      }

      .simulation-stage > canvas:active { cursor: grabbing; }
      .simulation-touch-hint { display: none; }

      .simulation-demo-badge {
        position: absolute;
        z-index: 2;
        top: 1rem;
        left: 1rem;
        display: inline-flex;
        align-items: center;
        gap: 8px;
        padding: 8px 11px;
        border: 1px solid rgba(255, 255, 255, 0.14);
        border-radius: 999px;
        color: #eff1e9;
        background: rgba(13, 20, 16, 0.75);
        backdrop-filter: blur(12px);
        font-size: 0.58rem;
        font-weight: 750;
        letter-spacing: 0.08em;
        pointer-events: none;
      }

      .simulation-demo-dot {
        width: 6px;
        height: 6px;
        background: #efb953;
        animation: status-pulse 2s ease-in-out infinite;
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
      .simulation-panel-title { min-width: 0; }
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
        .simulation-stage { min-height: clamp(520px, 66dvh, 720px); }
        .simulation-panel { width: 220px; padding: 0.85rem; }
        .simulation-panel-heading { gap: 7px; }
        .simulation-status { gap: 4px; padding-inline: 6px; font-size: 0.56rem; }
        .simulation-legend { max-width: 220px; }
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
        .simulation-new-scenario { flex: 1; }
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
          display: block;
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

        .simulation-stage > .simulation-panel {
          position: relative;
          inset: auto;
          z-index: 1;
          width: 100%;
          margin: 0;
        }

        .simulation-demo-badge {
          top: 0.75rem;
          left: 0.75rem;
          padding: 7px 9px;
          font-size: 0.52rem;
        }

        .simulation-camera-tools {
          top: 0.65rem;
          bottom: auto;
          left: auto;
          right: 0.65rem;
          transform: none;
        }

        .simulation-camera-tools button { min-width: 42px; min-height: 42px; }
        .simulation-camera-tools button span { display: inline; }
        .simulation-panel { border-radius: 14px; }
        .simulation-panel-heading { flex-wrap: wrap; }
        .simulation-panel-icon { width: 34px; height: 34px; }
        .simulation-status { margin-left: auto; }
        .simulation-control-hint { font-size: 0.73rem; }
        .simulation-controls { order: 1; }
        .simulation-legend { order: 2; }
        .simulation-severity { order: 3; }
        .simulation-telemetry { order: 4; }
        .simulation-tooltip { display: none; }
        .simulation-controls button { min-height: 46px; font-size: 0.84rem; }
        .simulation-telemetry { margin-bottom: 0.25rem !important; }
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
        .simulation-controls .grid.grid-cols-2 { gap: 0.55rem; }
      }

      @media (prefers-reduced-motion: reduce) {
        .simulation-view, .simulation-panel { animation: none; }
        .simulation-demo-dot, .status-active > span { animation: none; }
        .simulation-controls button, .simulation-camera-tools button, .simulation-new-scenario { transition: none; }
      }
</style>
