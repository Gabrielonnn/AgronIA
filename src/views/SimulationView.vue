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

// Three.js variables
const scene = shallowRef<THREE.Scene | null>(null)
const renderer = shallowRef<THREE.WebGLRenderer | null>(null)
const camera = shallowRef<THREE.PerspectiveCamera | null>(null)
const controls = shallowRef<OrbitControls | null>(null)
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
]

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
  sectorMarkers.forEach(m => scene.value?.remove(m))
  sectorMarkers = []
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
    if (droneState.value === 'CENTINELAS') return // Ya está activo
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
          if (c.geometry instanceof THREE.BoxGeometry && c.scale.x === 1) { // Hélices
            centinelaPropellers.push(c as THREE.Mesh)
          }
        })
      }
      scene.value.add(centinelaGroup)
    }
    return
  }

  if (action === 'ANALYZE') {
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
    alert("Análisis limpio: No se detectaron zonas que requieran esta acción específica.")
    return
  }

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

const initThree = () => {
  if (!canvasRef.value || !containerRef.value) return
  const width = containerRef.value.clientWidth, height = containerRef.value.clientHeight
  renderer.value = new THREE.WebGLRenderer({ canvas: canvasRef.value, antialias: true })
  renderer.value.setSize(width, height); renderer.value.setPixelRatio(window.devicePixelRatio)
  renderer.value.shadowMap.enabled = true

  scene.value = new THREE.Scene()
  scene.value.background = new THREE.Color(0x87ceeb)
  scene.value.fog = new THREE.FogExp2(0x87ceeb, 0.01)

  camera.value = new THREE.PerspectiveCamera(60, width / height, 0.1, 1000)
  camera.value.position.set(0, 18, 35)
  controls.value = new OrbitControls(camera.value, renderer.value.domElement)
  controls.value.target.set(0, 0, 0)

  scene.value.add(new THREE.AmbientLight(0xffffff, 0.4))
  const dirLight = new THREE.DirectionalLight(0xffffff, 1.0)
  dirLight.position.set(50, 100, 30); dirLight.castShadow = true
  scene.value.add(dirLight)

  groundMaterial = new THREE.MeshLambertMaterial({ color: 0x78350f })
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(150, 150), groundMaterial)
  ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.value.add(ground)

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
            currentAction.value = 'NONE'
          }
        }
      }
    }

    if (renderer.value && scene.value && camera.value) renderer.value.render(scene.value, camera.value)
  }
  animate()

  window.addEventListener('resize', onWindowResize); containerRef.value.addEventListener('mousemove', onMouseMove)
}

const onMouseMove = (event: MouseEvent) => {
  if (!containerRef.value || !mouse.value) return
  const rect = containerRef.value.getBoundingClientRect()
  mouse.value.x = ((event.clientX - rect.left) / rect.width) * 2 - 1
  mouse.value.y = -((event.clientY - rect.top) / rect.height) * 2 + 1
  tooltipPos.value = { x: event.clientX + 15, y: event.clientY + 15 }
}

const onWindowResize = () => {
  if (!containerRef.value || !camera.value || !renderer.value) return
  const width = containerRef.value.clientWidth, height = containerRef.value.clientHeight
  camera.value.aspect = width / height; camera.value.updateProjectionMatrix(); renderer.value.setSize(width, height)
}

onMounted(() => { initThree() })
onBeforeUnmount(() => {
  cancelAnimationFrame(animationId.value); window.removeEventListener('resize', onWindowResize)
  if (containerRef.value) containerRef.value.removeEventListener('mousemove', onMouseMove)
  if (renderer.value) renderer.value.dispose()
})
</script>

<template>
  <div class="h-full flex flex-col relative overflow-hidden">
    <!-- Header -->
    <div class="px-6 py-4 bg-white border-b border-gray-200 flex justify-between items-center z-20 shadow-sm relative">
      <div>
        <h1 class="text-2xl font-bold text-gray-900">Simulación de Cultivos & Análisis</h1>
        <p class="text-sm text-gray-500 mt-1">Renderizado avanzado y gestión interactiva multizona.</p>
      </div>
      
      <div class="flex bg-gray-100 p-1 rounded-lg gap-1">
        <button 
          v-for="mode in modes" 
          :key="mode.id"
          @click="updateMaterials(mode.id as any)"
          class="flex items-center gap-2 px-4 py-2 rounded-md transition-all text-sm font-medium"
          :class="currentMode === mode.id ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-700'"
        >
          <span class="w-3 h-3 rounded-full" :class="mode.color"></span>
          {{ mode.name }}
        </button>
      </div>
    </div>
    
    <div ref="containerRef" class="flex-1 relative bg-gray-900 cursor-crosshair">
      <canvas ref="canvasRef" class="w-full h-full outline-none"></canvas>

      <!-- Menú de Dron / Análisis -->
      <div class="absolute top-6 right-6 bg-black/80 backdrop-blur-md border border-white/10 rounded-xl p-4 text-white shadow-2xl z-10 w-64 transition-all">
        <h3 class="font-bold text-lg mb-3 border-b border-white/20 pb-2 flex items-center justify-between">
          <span>Dron Autónomo</span>
          <span class="text-xs px-2 py-1 rounded-full" 
            :class="droneState === 'IDLE' ? 'bg-green-500/20 text-green-400' : 'bg-blue-500/20 text-blue-400 animate-pulse'">
            {{ droneState === 'IDLE' ? 'En Base' : (droneState === 'SCANNING' ? 'Mapeando...' : (droneState === 'CENTINELAS' ? 'Centinelas...' : 'En Misión')) }}
          </span>
        </h3>
        
        <div class="space-y-2">
          <button @click="handleAction('ANALYZE')" :disabled="droneState !== 'IDLE' && droneState !== 'CENTINELAS'" class="w-full bg-white/10 hover:bg-white/20 disabled:opacity-50 disabled:cursor-not-allowed border border-white/10 p-2 rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>
            Analizar Campo
          </button>
          
          <button @click="handleAction('CENTINELAS')" :disabled="droneState === 'CENTINELAS' || (droneState !== 'IDLE' && droneState !== 'CENTINELAS')" class="w-full bg-purple-500 hover:bg-purple-600 disabled:bg-purple-900 disabled:text-gray-400 disabled:cursor-not-allowed text-white border border-white/10 p-2 rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2 mt-2">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"/></svg>
            Modo Centinelas
          </button>
          
          <div class="grid grid-cols-2 gap-2 mt-2">
            <button @click="handleAction('WATER')" :disabled="droneState !== 'IDLE' && droneState !== 'CENTINELAS'" class="bg-blue-500 hover:bg-blue-600 disabled:bg-blue-900 disabled:text-gray-400 disabled:cursor-not-allowed text-white p-2 rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-1.5">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 3v1m0 16v1M4.22 4.22l.71.71m14.14 14.14l.71.71M1 12h1m20 0h1M4.22 19.78l.71-.71M18.07 5.93l.71-.71M12 6a6 6 0 100 12 6 6 0 000-12z"/></svg>
              Regar
            </button>
            <button @click="handleAction('FUMIGATE')" :disabled="droneState !== 'IDLE' && droneState !== 'CENTINELAS'" class="bg-emerald-500 hover:bg-emerald-600 disabled:bg-emerald-900 disabled:text-gray-400 disabled:cursor-not-allowed text-white p-2 rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-1.5">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"/></svg>
              Fumigar
            </button>
          </div>
        </div>
      </div>

      <!-- Leyendas -->
      <div v-if="currentMode === 'ndvi'" class="absolute top-6 left-6 bg-black/80 backdrop-blur-md border border-white/10 rounded-xl p-4 text-white shadow-2xl z-10 w-64 transition-all">
        <h3 class="font-bold text-lg mb-3 border-b border-white/20 pb-2">Índice NDVI (Plagas)</h3>
        <p class="text-xs text-gray-300 mb-3">Las plagas destruyen el vigor foliar sin subir la temperatura drásticamente.</p>
        <div class="space-y-3">
          <div class="flex items-center justify-between"><div class="flex items-center gap-2"><div class="w-6 h-4 bg-[#16a34a] rounded-sm"></div><span class="text-sm font-medium">Alto Vigor</span></div></div>
          <div class="flex items-center justify-between"><div class="flex items-center gap-2"><div class="w-6 h-4 bg-[#facc15] rounded-sm"></div><span class="text-sm font-medium">Moderado</span></div></div>
          <div class="flex items-center justify-between"><div class="flex items-center gap-2"><div class="w-6 h-4 bg-[#f97316] rounded-sm"></div><span class="text-sm font-medium">Bajo Vigor</span></div></div>
          <div class="flex items-center justify-between"><div class="flex items-center gap-2"><div class="w-6 h-4 bg-[#dc2626] rounded-sm"></div><span class="text-sm font-medium">Plaga Severa</span></div></div>
        </div>
      </div>

      <div v-if="currentMode === 'thermal'" class="absolute top-6 left-6 bg-black/80 backdrop-blur-md border border-white/10 rounded-xl p-4 text-white shadow-2xl z-10 w-64 transition-all">
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
      <div v-if="droneState !== 'IDLE' || sectorMarkers.length > 0" class="absolute bottom-6 left-6 bg-black/80 backdrop-blur-md border border-white/10 rounded-xl p-4 text-white shadow-2xl z-10 w-64 transition-all">
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
      <div class="absolute bottom-6 right-6 bg-black/85 backdrop-blur-md border border-white/10 rounded-xl p-4 text-white shadow-2xl z-10 w-64">
        <h3 class="font-bold text-sm mb-3 border-b border-white/20 pb-2 flex items-center gap-2">
          <span class="w-2 h-2 rounded-full bg-agron-green animate-pulse"></span>
          Telemetría — Tiempo Real
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
      class="fixed bg-white border border-gray-200 rounded-xl shadow-2xl p-4 pointer-events-none z-50 w-64 transform -translate-y-full"
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
