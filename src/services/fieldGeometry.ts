import type { Json } from './agronomyData'

export interface FieldPoint {
  x: number
  z: number
}

export interface ProjectedFieldPolygon {
  rings: FieldPoint[][]
}

export interface ProjectedField {
  polygons: ProjectedFieldPolygon[]
  widthMeters: number
  depthMeters: number
  areaHectares: number
  projectGps(latitude: number, longitude: number): FieldPoint
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const readCoordinate = (value: unknown): [number, number] | null => {
  if (!Array.isArray(value) || value.length < 2) return null
  const [longitude, latitude] = value
  if (
    typeof longitude !== 'number'
    || !Number.isFinite(longitude)
    || longitude < -180
    || longitude > 180
    || typeof latitude !== 'number'
    || !Number.isFinite(latitude)
    || latitude < -90
    || latitude > 90
  ) return null
  return [longitude, latitude]
}

const readRing = (value: unknown): [number, number][] => {
  if (!Array.isArray(value)) return []
  return value.map(readCoordinate).filter((point): point is [number, number] => point !== null)
}

const readRings = (value: unknown): [number, number][][] => {
  if (!Array.isArray(value)) return []
  return value.map(readRing).filter(ring => ring.length >= 3)
}

const readPolygons = (value: unknown): [number, number][][][] => {
  if (!isRecord(value)) return []

  if (value.type === 'FeatureCollection' && Array.isArray(value.features)) {
    return value.features.flatMap(feature => readPolygons(feature))
  }
  if (value.type === 'Feature') return readPolygons(value.geometry)
  if (value.type === 'GeometryCollection' && Array.isArray(value.geometries)) {
    return value.geometries.flatMap(geometry => readPolygons(geometry))
  }
  if (value.type === 'Polygon') {
    const rings = readRings(value.coordinates)
    return rings.length ? [rings] : []
  }
  if (value.type === 'MultiPolygon' && Array.isArray(value.coordinates)) {
    return value.coordinates.map(readRings).filter(rings => rings.length > 0)
  }
  return []
}

const ringArea = (ring: FieldPoint[]) => {
  let twiceArea = 0
  for (let index = 0; index < ring.length; index++) {
    const current = ring[index]
    const next = ring[(index + 1) % ring.length]
    twiceArea += current.x * next.z - next.x * current.z
  }
  return Math.abs(twiceArea) / 2
}

export const projectFieldGeometry = (geojson: Json | null): ProjectedField | null => {
  const sourcePolygons = readPolygons(geojson)
  const coordinates = sourcePolygons.flat(2)
  if (coordinates.length < 3) return null

  const minLongitude = Math.min(...coordinates.map(([longitude]) => longitude))
  const maxLongitude = Math.max(...coordinates.map(([longitude]) => longitude))
  const minLatitude = Math.min(...coordinates.map(([, latitude]) => latitude))
  const maxLatitude = Math.max(...coordinates.map(([, latitude]) => latitude))
  const originLongitude = (minLongitude + maxLongitude) / 2
  const originLatitude = (minLatitude + maxLatitude) / 2
  const longitudeScale = 111_320 * Math.cos(originLatitude * Math.PI / 180)

  const projectRaw = (latitude: number, longitude: number): FieldPoint => ({
    x: (longitude - originLongitude) * longitudeScale,
    z: -(latitude - originLatitude) * 110_540,
  })

  const polygons = sourcePolygons.map(rings => ({
    rings: rings.map(ring => ring.map(([longitude, latitude]) => projectRaw(latitude, longitude))),
  }))
  const allPoints = polygons.flatMap(polygon => polygon.rings.flat())
  const minX = Math.min(...allPoints.map(point => point.x))
  const maxX = Math.max(...allPoints.map(point => point.x))
  const minZ = Math.min(...allPoints.map(point => point.z))
  const maxZ = Math.max(...allPoints.map(point => point.z))
  if (maxX <= minX || maxZ <= minZ) return null
  const centerX = (minX + maxX) / 2
  const centerZ = (minZ + maxZ) / 2
  const centeredPolygons = polygons.map(polygon => ({
    rings: polygon.rings.map(ring => ring.map(point => ({
      x: point.x - centerX,
      z: point.z - centerZ,
    }))),
  }))
  const areaSquareMeters = centeredPolygons.reduce((total, polygon) => {
    const [exterior, ...holes] = polygon.rings
    return total + Math.max(0, ringArea(exterior) - holes.reduce((sum, ring) => sum + ringArea(ring), 0))
  }, 0)
  if (areaSquareMeters <= 0) return null

  return {
    polygons: centeredPolygons,
    widthMeters: maxX - minX,
    depthMeters: maxZ - minZ,
    areaHectares: areaSquareMeters / 10_000,
    projectGps: (latitude, longitude) => {
      const point = projectRaw(latitude, longitude)
      return { x: point.x - centerX, z: point.z - centerZ }
    },
  }
}
