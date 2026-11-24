import assert from 'node:assert/strict'
import test from 'node:test'
import { advancePlantWaterStress, planCoverageRoute } from '../../src/services/simulationModel.ts'
import { projectFieldGeometry } from '../../src/services/fieldGeometry.ts'

test('water stress accumulates gradually, recovers with irrigation, and eventually kills an untreated plant', () => {
  const healthy = { waterStress: 0, dead: false, irrigated: false }
  const firstStep = advancePlantWaterStress(healthy, 1, 10)
  assert.equal(firstStep.waterStress, 0.06)
  assert.equal(firstStep.dead, false)
  const secondStep = advancePlantWaterStress(firstStep, 1, 10)
  assert.ok(secondStep.waterStress > firstStep.waterStress)
  assert.equal(advancePlantWaterStress(secondStep, 0, 10).waterStress, secondStep.waterStress)

  const recovering = advancePlantWaterStress({ ...firstStep, irrigated: true }, 0, 10)
  assert.equal(recovering.waterStress, 0)
  assert.equal(recovering.irrigated, false)

  const dying = advancePlantWaterStress({ waterStress: 0.97, dead: false, irrigated: false }, 1, 10)
  assert.equal(dying.dead, true)
  assert.equal(dying.waterStress, 1)
  assert.equal(advancePlantWaterStress(dying, 0, 10).dead, true)
})

test('coverage planner covers both field edges and returns to base on its shortest tested orientation', () => {
  const route = planCoverageRoute({
    widthMeters: 80,
    depthMeters: 40,
    laneSpacingMeters: 10,
    start: { x: -30, z: 15 },
  })

  assert.equal(route.points[0].x, -30)
  assert.equal(route.points[0].z, 15)
  assert.deepEqual(route.points[route.points.length - 1], route.points[0])
  assert.equal(route.laneCount, route.orientation === 'x' ? 5 : 9)
  assert.ok(route.points.some(point => point.x === -40))
  assert.ok(route.points.some(point => point.x === 40))
  assert.ok(route.points.some(point => point.z === -20))
  assert.ok(route.points.some(point => point.z === 20))
  assert.ok(route.lengthMeters > 0)
})

test('coverage planner rejects invalid dimensions', () => {
  assert.throws(() => planCoverageRoute({
    widthMeters: 0,
    depthMeters: 10,
    laneSpacingMeters: 2,
    start: { x: 0, z: 0 },
  }), RangeError)
})

test('coverage planner follows parcel boundaries and excludes holes', () => {
  const field = projectFieldGeometry({
    type: 'Polygon',
    coordinates: [
      [[0, 0], [0.004, 0], [0.004, 0.004], [0, 0.004], [0, 0]],
      [[0.0015, 0.0015], [0.0025, 0.0015], [0.0025, 0.0025], [0.0015, 0.0025], [0.0015, 0.0015]],
    ],
  })
  assert.ok(field)

  const route = planCoverageRoute({
    widthMeters: field.widthMeters,
    depthMeters: field.depthMeters,
    laneSpacingMeters: 40,
    start: { x: 0, z: 0 },
    fieldGeometry: field,
  })

  assert.ok(field.contains(route.points[0]))
  assert.ok(route.coverageSegments.length > 0)
  for (const segment of route.coverageSegments) {
    const midpoint = {
      x: (segment.start.x + segment.end.x) / 2,
      z: (segment.start.z + segment.end.z) / 2,
    }
    assert.ok(field.contains(midpoint))
  }
  assert.ok(route.estimatedEnergyWh > 0)
})
