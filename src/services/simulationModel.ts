import type { ProjectedField } from './fieldGeometry'

export interface RoutePoint {
  x: number
  z: number
}

export interface CoverageSegment {
  start: RoutePoint
  end: RoutePoint
}

export interface CoverageRoute {
  points: RoutePoint[]
  coverageSegments: CoverageSegment[]
  lengthMeters: number
  laneCount: number
  orientation: 'x' | 'z'
  estimatedEnergyWh: number
  distanceSavedMeters: number
}

export interface PlantWaterState {
  waterStress: number
  dead: boolean
  irrigated: boolean
}

const DEFAULT_CRUISE_SPEED_METERS_PER_SECOND = 5
const DEFAULT_POWER_WATTS = 450
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))
const distance = (from: RoutePoint, to: RoutePoint) => Math.hypot(to.x - from.x, to.z - from.z)

const makeLanes = (extent: number, spacing: number) => {
  const positions = [-extent / 2]
  for (let offset = spacing; offset < extent; offset += spacing) {
    positions.push(-extent / 2 + offset)
  }
  if (positions[positions.length - 1] !== extent / 2) positions.push(extent / 2)
  return positions
}

const makeInteriorLanes = (extent: number, spacing: number) => {
  const margin = Math.min(spacing / 2, extent / 4)
  const min = -extent / 2 + margin
  const max = extent / 2 - margin
  const positions: number[] = []
  for (let lane = min; lane <= max + 1e-8; lane += spacing) positions.push(lane)
  if (positions.length === 0) positions.push(0)
  const last = positions[positions.length - 1]
  if (max - last > spacing * 0.6) positions.push(max)
  return positions
}

const makeFieldLanes = (field: ProjectedField, orientation: 'x' | 'z', spacing: number) => {
  const extent = orientation === 'x' ? field.depthMeters : field.widthMeters
  const positions = new Set(makeInteriorLanes(extent, spacing))
  for (const polygon of field.polygons) {
    const values = polygon.rings.flatMap(ring =>
      ring.map(point => orientation === 'x' ? point.z : point.x),
    )
    if (values.length === 0) continue
    const min = Math.min(...values)
    const max = Math.max(...values)
    const span = max - min
    if (span <= spacing) {
      positions.add((min + max) / 2)
      continue
    }

    const margin = Math.min(spacing / 2, span / 4)
    const first = min + margin
    const last = max - margin
    for (let lane = first; lane <= last + 1e-8; lane += spacing) positions.add(lane)
    const currentLast = Math.max(...[...positions].filter(lane => lane <= last))
    if (last - currentLast > spacing * 0.6) positions.add(last)
  }
  return [...positions].sort((left, right) => left - right)
}

const routeLength = (points: RoutePoint[]) => points.slice(1).reduce(
  (total, point, index) => total + distance(points[index], point),
  0,
)

const buildRectangularRoute = (
  width: number,
  depth: number,
  spacing: number,
  start: RoutePoint,
  orientation: 'x' | 'z',
  reversed: boolean,
) => {
  const lanes = orientation === 'x' ? makeLanes(depth, spacing) : makeLanes(width, spacing)
  if (reversed) lanes.reverse()

  const points: RoutePoint[] = [{ ...start }]
  const coverageSegments: CoverageSegment[] = []
  lanes.forEach((lane, index) => {
    const backwards = (index % 2 === 1) !== reversed
    const segment = orientation === 'x'
      ? {
          start: { x: backwards ? width / 2 : -width / 2, z: lane },
          end: { x: backwards ? -width / 2 : width / 2, z: lane },
        }
      : {
          start: { x: lane, z: backwards ? depth / 2 : -depth / 2 },
          end: { x: lane, z: backwards ? -depth / 2 : depth / 2 },
        }
    coverageSegments.push(segment)
    points.push(segment.start, segment.end)
  })
  points.push({ ...start })
  return { points, coverageSegments, laneCount: lanes.length }
}

const closestInteriorPoint = (field: ProjectedField, point: RoutePoint): RoutePoint => {
  if (field.contains(point)) return { ...point }

  const candidates: RoutePoint[] = []
  const columns = 80
  const rows = 80
  for (let column = 0; column < columns; column++) {
    const x = -field.widthMeters / 2 + ((column + 0.5) / columns) * field.widthMeters
    for (let row = 0; row < rows; row++) {
      const z = -field.depthMeters / 2 + ((row + 0.5) / rows) * field.depthMeters
      candidates.push({ x, z })
    }
  }
  for (const polygon of field.polygons) {
    for (const ring of polygon.rings) {
      for (const vertex of ring) {
        candidates.push({ x: vertex.x * 0.999, z: vertex.z * 0.999 })
      }
    }
  }

  let nearest: RoutePoint | null = null
  let nearestDistance = Number.POSITIVE_INFINITY
  for (const candidate of candidates) {
    if (!field.contains(candidate)) continue
    const candidateDistance = distance(point, candidate)
    if (candidateDistance < nearestDistance) {
      nearest = candidate
      nearestDistance = candidateDistance
    }
  }
  if (!nearest) {
    throw new RangeError('No se encontró un punto interior para iniciar la ruta en esta parcela.')
  }
  return nearest
}

const scanlineSegments = (
  field: ProjectedField,
  orientation: 'x' | 'z',
  lane: number,
): CoverageSegment[] => {
  const intersections: number[] = []
  for (const polygon of field.polygons) {
    for (const ring of polygon.rings) {
      for (let index = 0; index < ring.length; index++) {
        const from = ring[index]
        const to = ring[(index + 1) % ring.length]
        const fromLane = orientation === 'x' ? from.z : from.x
        const toLane = orientation === 'x' ? to.z : to.x
        if ((fromLane <= lane && toLane > lane) || (toLane <= lane && fromLane > lane)) {
          const ratio = (lane - fromLane) / (toLane - fromLane)
          intersections.push(orientation === 'x'
            ? from.x + ratio * (to.x - from.x)
            : from.z + ratio * (to.z - from.z))
        }
      }
    }
  }

  intersections.sort((left, right) => left - right)
  const uniqueIntersections = intersections.filter(
    (value, index) => index === 0 || Math.abs(value - intersections[index - 1]) > 1e-6,
  )
  const segments: CoverageSegment[] = []
  for (let index = 0; index + 1 < uniqueIntersections.length; index++) {
    const from = uniqueIntersections[index]
    const to = uniqueIntersections[index + 1]
    const midpoint = orientation === 'x'
      ? { x: (from + to) / 2, z: lane }
      : { x: lane, z: (from + to) / 2 }
    if (!field.contains(midpoint)) continue
    segments.push(orientation === 'x'
      ? { start: { x: from, z: lane }, end: { x: to, z: lane } }
      : { start: { x: lane, z: to }, end: { x: lane, z: from } })
  }
  return segments
}

const buildFieldRoute = (
  field: ProjectedField,
  spacing: number,
  start: RoutePoint,
  orientation: 'x' | 'z',
  reversed: boolean,
) => {
  const lanes = makeFieldLanes(field, orientation, spacing)
  if (reversed) lanes.reverse()

  const points: RoutePoint[] = [{ ...start }]
  const coverageSegments: CoverageSegment[] = []
  for (const lane of lanes) {
    const segments = scanlineSegments(field, orientation, lane)
    if (reversed) segments.reverse()
    for (const segment of segments) {
      const startDistance = distance(points[points.length - 1], segment.start)
      const endDistance = distance(points[points.length - 1], segment.end)
      const orderedSegment = startDistance <= endDistance
        ? segment
        : { start: segment.end, end: segment.start }
      coverageSegments.push(orderedSegment)
      points.push(orderedSegment.start, orderedSegment.end)
    }
  }
  points.push({ ...start })
  return { points, coverageSegments, laneCount: coverageSegments.length }
}

const createRouteCandidate = (
  route: ReturnType<typeof buildRectangularRoute> | ReturnType<typeof buildFieldRoute>,
  orientation: 'x' | 'z',
) => ({
  ...route,
  lengthMeters: routeLength(route.points),
  orientation,
})

const estimateEnergyWh = (lengthMeters: number) =>
  lengthMeters / DEFAULT_CRUISE_SPEED_METERS_PER_SECOND * DEFAULT_POWER_WATTS / 3600

export const planCoverageRoute = (options: {
  widthMeters: number
  depthMeters: number
  laneSpacingMeters: number
  start: RoutePoint
  fieldGeometry?: ProjectedField | null
}): CoverageRoute => {
  const { widthMeters, depthMeters, laneSpacingMeters, start, fieldGeometry } = options
  if (
    !Number.isFinite(widthMeters) || widthMeters <= 0
    || !Number.isFinite(depthMeters) || depthMeters <= 0
    || !Number.isFinite(laneSpacingMeters) || laneSpacingMeters <= 0
    || !Number.isFinite(start.x) || !Number.isFinite(start.z)
  ) {
    throw new RangeError('Las dimensiones y el espaciado deben ser positivos; el punto inicial debe ser finito.')
  }

  const routeStart = fieldGeometry ? closestInteriorPoint(fieldGeometry, start) : start
  const buildCandidate = fieldGeometry
    ? (orientation: 'x' | 'z', reversed: boolean) => createRouteCandidate(
        buildFieldRoute(fieldGeometry, laneSpacingMeters, routeStart, orientation, reversed),
        orientation,
      )
    : (orientation: 'x' | 'z', reversed: boolean) => createRouteCandidate(
        buildRectangularRoute(widthMeters, depthMeters, laneSpacingMeters, routeStart, orientation, reversed),
        orientation,
      )

  const candidates = (['x', 'z'] as const).flatMap(orientation =>
    [false, true].map(reversed => buildCandidate(orientation, reversed)),
  )
  candidates.sort((left, right) => left.lengthMeters - right.lengthMeters)
  const best = candidates[0]
  const baselineLength = fieldGeometry
    ? Math.min(
        ...(['x', 'z'] as const).flatMap(orientation =>
          [false, true].map(reversed => createRouteCandidate(
            buildRectangularRoute(
              widthMeters,
              depthMeters,
              laneSpacingMeters,
              routeStart,
              orientation,
              reversed,
            ),
            orientation,
          ).lengthMeters),
        ),
      )
    : best.lengthMeters

  return {
    ...best,
    estimatedEnergyWh: estimateEnergyWh(best.lengthMeters),
    distanceSavedMeters: Math.max(0, baselineLength - best.lengthMeters),
  }
}

export const advancePlantWaterStress = (
  plant: PlantWaterState,
  droughtPressure: number,
  elapsedSeconds: number,
): PlantWaterState => {
  if (
    !Number.isFinite(droughtPressure) || droughtPressure < 0 || droughtPressure > 1
    || !Number.isFinite(elapsedSeconds) || elapsedSeconds < 0
  ) {
    throw new RangeError('La presión de sequía y el tiempo deben ser valores finitos dentro de su rango.')
  }
  if (plant.dead) return { ...plant, waterStress: 1, irrigated: false }

  const waterStress = clamp(
    plant.waterStress
      + droughtPressure * 0.006 * elapsedSeconds
      - (plant.irrigated ? 0.012 * elapsedSeconds : 0),
    0,
    1,
  )
  const dead = droughtPressure > 0 && waterStress >= 0.98
  return {
    waterStress: dead ? 1 : waterStress,
    dead,
    irrigated: plant.irrigated && waterStress > 0,
  }
}
