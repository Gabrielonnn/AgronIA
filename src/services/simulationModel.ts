export interface RoutePoint {
  x: number
  z: number
}

export interface CoverageRoute {
  points: RoutePoint[]
  lengthMeters: number
  laneCount: number
  orientation: 'x' | 'z'
}

export interface PlantWaterState {
  waterStress: number
  dead: boolean
  irrigated: boolean
}

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

const buildRoute = (
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
  lanes.forEach((lane, index) => {
    const backwards = (index % 2 === 1) !== reversed
    if (orientation === 'x') {
      points.push(
        { x: backwards ? width / 2 : -width / 2, z: lane },
        { x: backwards ? -width / 2 : width / 2, z: lane },
      )
    } else {
      points.push(
        { x: lane, z: backwards ? depth / 2 : -depth / 2 },
        { x: lane, z: backwards ? -depth / 2 : depth / 2 },
      )
    }
  })
  points.push({ ...start })
  return { points, laneCount: lanes.length }
}

export const planCoverageRoute = (options: {
  widthMeters: number
  depthMeters: number
  laneSpacingMeters: number
  start: RoutePoint
}): CoverageRoute => {
  const { widthMeters, depthMeters, laneSpacingMeters, start } = options
  if (
    !Number.isFinite(widthMeters) || widthMeters <= 0
    || !Number.isFinite(depthMeters) || depthMeters <= 0
    || !Number.isFinite(laneSpacingMeters) || laneSpacingMeters <= 0
    || !Number.isFinite(start.x) || !Number.isFinite(start.z)
  ) {
    throw new RangeError('Las dimensiones y el espaciado deben ser positivos; el punto inicial debe ser finito.')
  }

  const candidates = (['x', 'z'] as const).flatMap(orientation =>
    [false, true].map(reversed => {
      const route = buildRoute(
        widthMeters,
        depthMeters,
        laneSpacingMeters,
        start,
        orientation,
        reversed,
      )
      const lengthMeters = route.points.slice(1).reduce(
        (total, point, index) => total + distance(route.points[index], point),
        0,
      )
      return { ...route, lengthMeters, orientation }
    }),
  )

  candidates.sort((left, right) => left.lengthMeters - right.lengthMeters)
  return candidates[0]
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
