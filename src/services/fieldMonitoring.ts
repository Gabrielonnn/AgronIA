export interface FieldMonitorPlant {
  id: string
  latitude: number
  longitude: number
  health: number | null
  waterStress: number
  dead: boolean
  status: string
}

export interface FieldMonitorTrend {
  elapsed: number
  health: number
  humidity: number
  ndvi: number
}

export interface FieldMonitorData {
  avgHealth: number | null
  avgHumidity: number | null
  avgNDVI: number | null
  avgTemp: number | null
  stressedPlants: number
  deadPlants: number
  timeline: FieldMonitorTrend[]
  plants: FieldMonitorPlant[]
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const finiteNumber = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? value : null

const isGeometry = (value: unknown): value is GeoJSON.Geometry => {
  if (!isRecord(value) || typeof value.type !== 'string') return false
  if (value.type === 'GeometryCollection') {
    return Array.isArray(value.geometries) && value.geometries.every(isGeometry)
  }
  return [
    'Point',
    'MultiPoint',
    'LineString',
    'MultiLineString',
    'Polygon',
    'MultiPolygon',
  ].includes(value.type) && Array.isArray(value.coordinates)
}

const isFeature = (value: unknown): value is GeoJSON.Feature => {
  if (!isRecord(value) || value.type !== 'Feature') return false
  if (value.geometry !== null && !isGeometry(value.geometry)) return false
  return value.properties === null || value.properties === undefined || isRecord(value.properties)
}

export const readFieldMonitorData = (value: unknown): FieldMonitorData | null => {
  if (!isRecord(value)) return null

  const telemetry = isRecord(value.telemetry) ? value.telemetry : {}
  const timeline = Array.isArray(value.timeline)
    ? value.timeline.flatMap(item => {
        if (!isRecord(item)) return []
        const elapsed = finiteNumber(item.elapsed)
        const health = finiteNumber(item.health)
        const humidity = finiteNumber(item.humidity)
        const ndvi = finiteNumber(item.ndvi)
        if (elapsed === null || health === null || humidity === null || ndvi === null) return []
        return [{ elapsed, health, humidity, ndvi }]
      })
    : []
  const plants = Array.isArray(value.plants)
    ? value.plants.flatMap(item => {
        if (!isRecord(item) || typeof item.id !== 'string') return []
        const gps = isRecord(item.gps) ? item.gps : null
        if (!gps) return []
        const latitude = finiteNumber(gps.latitude)
        const longitude = finiteNumber(gps.longitude)
        if (
          latitude === null || latitude < -90 || latitude > 90
          || longitude === null || longitude < -180 || longitude > 180
        ) return []
        return [{
          id: item.id,
          latitude,
          longitude,
          health: finiteNumber(item.health),
          waterStress: finiteNumber(item.waterStress) ?? 0,
          dead: item.dead === true,
          status: typeof item.status === 'string' ? item.status : 'Sin estado',
        }]
      })
    : []

  return {
    avgHealth: finiteNumber(telemetry.avgHealth),
    avgHumidity: finiteNumber(telemetry.avgHumidity),
    avgNDVI: finiteNumber(telemetry.avgNDVI),
    avgTemp: finiteNumber(telemetry.avgTemp),
    stressedPlants: finiteNumber(telemetry.stressedPlants) ?? plants.filter(
      plant => plant.dead || plant.waterStress >= 0.15 || (plant.health !== null && plant.health < 0.7),
    ).length,
    deadPlants: finiteNumber(telemetry.deadPlants) ?? plants.filter(plant => plant.dead).length,
    timeline,
    plants,
  }
}

export const buildFieldMonitorFeatures = (
  geojson: unknown,
  monitorData: FieldMonitorData | null,
): GeoJSON.Feature[] => {
  const fieldFeatures = isRecord(geojson) && geojson.type === 'FeatureCollection'
    ? Array.isArray(geojson.features) ? geojson.features.filter(isFeature) : []
    : isFeature(geojson)
      ? [geojson]
      : isGeometry(geojson)
        ? [{ type: 'Feature' as const, geometry: geojson, properties: {} }]
        : []
  const markedFieldFeatures = fieldFeatures.map(feature =>
    feature.geometry?.type === 'Polygon' || feature.geometry?.type === 'MultiPolygon'
      ? {
          ...feature,
          properties: {
            ...(feature.properties ?? {}),
            monitor_field_boundary: true,
          },
        }
      : feature,
  )

  const affectedFeatures = (monitorData?.plants ?? [])
    .filter(plant =>
      plant.dead || plant.waterStress >= 0.15 || (plant.health !== null && plant.health < 0.7),
    )
    .map(plant => ({
      type: 'Feature' as const,
      geometry: {
        type: 'Point' as const,
        coordinates: [plant.longitude, plant.latitude] as [number, number],
      },
      properties: {
        simulation_affected: true,
        plant_id: plant.id,
        plant_status: plant.status,
        water_stress: plant.waterStress,
        health: plant.health,
        dead: plant.dead,
      },
    }))

  return [...markedFieldFeatures, ...affectedFeatures]
}
