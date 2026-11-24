import assert from 'node:assert/strict'
import test from 'node:test'
import { mergeFieldMapFeatures, readFieldMapFeatures } from '../../src/services/fieldMapWorkspace.ts'

const polygon = {
  type: 'Polygon' as const,
  coordinates: [[[-107.4, 24.7], [-107.3, 24.7], [-107.3, 24.8], [-107.4, 24.8], [-107.4, 24.7]]],
}

test('reads saved parcel geometry and merges its matching map element without duplicating it', () => {
  const field = {
    type: 'FeatureCollection',
    features: [{ type: 'Feature', geometry: polygon, properties: { name: 'Lote norte' } }],
  }
  const elements = [{
    id: 'element-1',
    name: 'Lote norte',
    geometry_data: polygon,
    properties: { source: 'editor' },
  }]

  const features = mergeFieldMapFeatures(field, elements)

  assert.equal(features.length, 1)
  assert.equal(features[0].properties?.map_element_id, 'element-1')
  assert.equal(features[0].properties?.source, 'editor')
})

test('keeps additional elements in the selected workspace and accepts raw polygon GeoJSON', () => {
  const extraPoint = {
    id: 'element-2',
    name: 'Pozo',
    geometry_data: { type: 'Point' as const, coordinates: [-107.35, 24.75] },
    properties: null,
  }

  const features = mergeFieldMapFeatures(polygon, [extraPoint])

  assert.equal(readFieldMapFeatures(polygon).length, 1)
  assert.equal(features.length, 2)
  assert.equal(features[0].geometry?.type, 'Polygon')
  assert.equal(features[1].properties?.map_element_id, 'element-2')
})
