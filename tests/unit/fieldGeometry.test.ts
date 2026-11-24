import assert from 'node:assert/strict'
import test from 'node:test'
import { projectFieldGeometry } from '../../src/services/fieldGeometry.ts'

test('projects a GeoJSON parcel to meters and measures its bounding dimensions and area', () => {
  const field = projectFieldGeometry({
    type: 'FeatureCollection',
    features: [{
      type: 'Feature',
      properties: {},
      geometry: {
        type: 'Polygon',
        coordinates: [[
          [-107.3939, 24.7994],
          [-107.3929, 24.7994],
          [-107.3929, 24.8004],
          [-107.3939, 24.8004],
          [-107.3939, 24.7994],
        ]],
      },
    }],
  })

  assert.ok(field)
  assert.ok(field.widthMeters > 100 && field.widthMeters < 103)
  assert.ok(field.depthMeters > 110 && field.depthMeters < 112)
  assert.ok(field.areaHectares > 1.1 && field.areaHectares < 1.2)
  const center = field.projectGps(24.7999, -107.3934)
  assert.ok(Math.abs(center.x) < 1e-8)
  assert.ok(Math.abs(center.z) < 1e-8)
  const gps = field.unprojectGps(center)
  assert.ok(Math.abs(gps.latitude - 24.7999) < 1e-8)
  assert.ok(Math.abs(gps.longitude + 107.3934) < 1e-8)
  assert.equal(field.contains(center), true)
  assert.equal(field.contains({ x: field.widthMeters, z: field.depthMeters }), false)
})

test('supports multipolygons and rejects invalid or non-polygon geometry', () => {
  const field = projectFieldGeometry({
    type: 'MultiPolygon',
    coordinates: [
      [[[0, 0], [0.001, 0], [0.001, 0.001], [0, 0.001], [0, 0]]],
      [[[0.002, 0], [0.003, 0], [0.003, 0.001], [0.002, 0.001], [0.002, 0]]],
    ],
  })

  assert.equal(field?.polygons.length, 2)
  assert.equal(projectFieldGeometry({ type: 'Point', coordinates: [0, 0] }), null)
  assert.equal(projectFieldGeometry(null), null)
})

test('excludes interior rings when determining whether a simulated plant is in a parcel', () => {
  const field = projectFieldGeometry({
    type: 'Polygon',
    coordinates: [
      [[0, 0], [0.01, 0], [0.01, 0.01], [0, 0.01], [0, 0]],
      [[0.004, 0.004], [0.006, 0.004], [0.006, 0.006], [0.004, 0.006], [0.004, 0.004]],
    ],
  })

  assert.ok(field)
  assert.equal(field.contains(field.projectGps(0.005, 0.005)), false)
  assert.equal(field.contains(field.projectGps(0.002, 0.002)), true)
})
