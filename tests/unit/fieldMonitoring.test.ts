import assert from 'node:assert/strict'
import test from 'node:test'
import { buildFieldMonitorFeatures, readFieldMonitorData } from '../../src/services/fieldMonitoring.ts'

test('monitoring extracts valid plant coordinates, trends, and affected map markers', () => {
  const results = readFieldMonitorData({
    telemetry: { avgHealth: 72, avgHumidity: 48, avgNDVI: 0.64, avgTemp: 29, stressedPlants: 1, deadPlants: 0 },
    timeline: [
      { elapsed: 0, health: 80, humidity: 52, ndvi: 70 },
      { elapsed: 'invalid', health: 80, humidity: 52, ndvi: 70 },
    ],
    plants: [
      { id: 'PL-1', health: 0.52, waterStress: 0.3, dead: false, status: 'Estrés hídrico', gps: { latitude: 24.8, longitude: -107.4 } },
      { id: 'PL-2', health: 0.95, waterStress: 0, dead: false, status: 'Saludable', gps: { latitude: 24.81, longitude: -107.41 } },
      { id: 'PL-3', health: 0.1, waterStress: 1, dead: true, status: 'Muerta', gps: null },
    ],
  })

  assert.ok(results)
  assert.equal(results.timeline.length, 1)
  assert.equal(results.plants.length, 2)
  const features = buildFieldMonitorFeatures({
    type: 'Feature',
    geometry: {
      type: 'Polygon',
      coordinates: [[[-107.5, 24.7], [-107.3, 24.7], [-107.3, 24.9], [-107.5, 24.9], [-107.5, 24.7]]],
    },
    properties: { name: 'Parcela' },
  }, results)

  assert.equal(features.length, 2)
  assert.equal(features[1].geometry?.type, 'Point')
  assert.equal(features[1].properties?.plant_id, 'PL-1')
})
