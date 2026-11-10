import assert from 'node:assert/strict'
import test from 'node:test'
import { MavLinkTelemetryParser } from '../../src/services/mavlinkTelemetry.ts'

const globalPositionFrame = new Uint8Array([
  254, 28, 0, 1, 1, 33, 210, 4, 0, 0, 240, 45, 149, 11, 96, 121, 233, 196,
  168, 94, 188, 0, 136, 151, 103, 0, 100, 0, 200, 0, 0, 0, 40, 35, 42, 156,
])

test('parses GPS position and relative altitude from a buffered MAVLink frame', () => {
  const parser = new MavLinkTelemetryParser()
  assert.deepEqual(parser.feed(globalPositionFrame.subarray(0, 12)), [])

  const [message] = parser.feed(globalPositionFrame.subarray(12))
  assert.equal(message?.name, 'GLOBAL_POSITION_INT')
  assert.equal(message?.fields.latitude, 194_326_000)
  assert.equal(message?.fields.longitude, -991_332_000)
  assert.equal(message?.fields.altitude, 12_345_000)
  assert.equal(message?.fields.relativeAltitude, 6_789_000)
  assert.equal(message?.fields.heading, 9_000)
})

test('rejects a MAVLink frame with an invalid checksum', () => {
  const parser = new MavLinkTelemetryParser()
  const invalidFrame = globalPositionFrame.slice()
  invalidFrame[invalidFrame.length - 1] ^= 0xff

  assert.deepEqual(parser.feed(invalidFrame), [])
  assert.equal(parser.crcErrors, 1)
})
