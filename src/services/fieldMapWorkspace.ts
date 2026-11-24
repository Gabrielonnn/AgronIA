export interface FieldMapElement {
  id: string
  name: string | null
  geometry_data: GeoJSON.Geometry
  properties: Record<string, unknown> | null
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

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
  if (!isRecord(value) || value.type !== 'Feature' || !isGeometry(value.geometry)) return false
  return value.properties === null || value.properties === undefined || isRecord(value.properties)
}

const canonicalize = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(canonicalize)
  if (!isRecord(value)) return value
  return Object.fromEntries(
    Object.keys(value).sort().map(key => [key, canonicalize(value[key])]),
  )
}

const geometryKey = (geometry: GeoJSON.Geometry) => JSON.stringify(canonicalize(geometry))

export const readFieldMapFeatures = (value: unknown): GeoJSON.Feature[] => {
  if (isRecord(value) && value.type === 'FeatureCollection' && Array.isArray(value.features)) {
    return value.features.filter(isFeature)
  }
  if (isFeature(value)) return [value]
  if (isGeometry(value)) return [{ type: 'Feature', geometry: value, properties: {} }]
  return []
}

export const mergeFieldMapFeatures = (
  fieldGeoJson: unknown,
  elements: FieldMapElement[],
): GeoJSON.Feature[] => {
  const fieldFeatures = readFieldMapFeatures(fieldGeoJson)
  const matchedElementIds = new Set<string>()

  const featuresWithElementIds = fieldFeatures.map(feature => {
    if (!feature.geometry) return feature
    const featureElementId = feature.properties?.map_element_id
    const element = elements.find(candidate =>
      !matchedElementIds.has(candidate.id)
      && (
        candidate.id === featureElementId
        || geometryKey(candidate.geometry_data) === geometryKey(feature.geometry)
      ),
    )
    if (!element) return feature

    matchedElementIds.add(element.id)
    return {
      ...feature,
      properties: {
        ...(feature.properties ?? {}),
        ...(element.properties ?? {}),
        name: feature.properties?.name ?? element.name ?? 'Elemento guardado',
        map_element_id: element.id,
      },
    }
  })

  const remainingElements = elements
    .filter(element => !matchedElementIds.has(element.id))
    .map(element => ({
      type: 'Feature' as const,
      geometry: element.geometry_data,
      properties: {
        ...(element.properties ?? {}),
        name: element.name ?? 'Elemento guardado',
        map_element_id: element.id,
      },
    }))

  return [...featuresWithElementIds, ...remainingElements]
}
