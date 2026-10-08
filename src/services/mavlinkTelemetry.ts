export interface MavLinkTelemetryMessage {
  name: 'HEARTBEAT' | 'GPS_RAW_INT' | 'GLOBAL_POSITION_INT' | 'VFR_HUD' | 'SYS_STATUS' | 'BATTERY_STATUS'
  systemId: number
  fields: Record<string, number | null>
}

const messageDefinitions: Record<number, {
  name: MavLinkTelemetryMessage['name']
  crcExtra: number
}> = {
  0: { name: 'HEARTBEAT', crcExtra: 50 },
  1: { name: 'SYS_STATUS', crcExtra: 124 },
  24: { name: 'GPS_RAW_INT', crcExtra: 24 },
  33: { name: 'GLOBAL_POSITION_INT', crcExtra: 104 },
  74: { name: 'VFR_HUD', crcExtra: 20 },
  147: { name: 'BATTERY_STATUS', crcExtra: 154 },
}

const crcAccumulate = (byte: number, crc: number) => {
  let temporary = (byte ^ (crc & 0xff)) & 0xff
  temporary = (temporary ^ (temporary << 4)) & 0xff
  return ((crc >>> 8) ^ (temporary << 8) ^ (temporary << 3) ^ (temporary >>> 4)) & 0xffff
}

const calculateChecksum = (bytes: Uint8Array, crcExtra: number) => {
  let crc = 0xffff
  for (const byte of bytes) crc = crcAccumulate(byte, crc)
  return crcAccumulate(crcExtra, crc)
}

const decodePayload = (
  name: MavLinkTelemetryMessage['name'],
  payload: Uint8Array,
): Record<string, number | null> | null => {
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength)
  const uint8 = (offset: number) => offset < payload.byteLength ? view.getUint8(offset) : null
  const int8 = (offset: number) => offset < payload.byteLength ? view.getInt8(offset) : null
  const uint16 = (offset: number) => offset + 2 <= payload.byteLength ? view.getUint16(offset, true) : null
  const int16 = (offset: number) => offset + 2 <= payload.byteLength ? view.getInt16(offset, true) : null
  const int32 = (offset: number) => offset + 4 <= payload.byteLength ? view.getInt32(offset, true) : null
  const float32 = (offset: number) => {
    if (offset + 4 > payload.byteLength) return null
    const value = view.getFloat32(offset, true)
    return Number.isFinite(value) ? value : null
  }

  switch (name) {
    case 'HEARTBEAT': {
      const autopilot = uint8(5)
      const baseMode = uint8(6)
      return autopilot === null || baseMode === null ? null : { autopilot, baseMode }
    }
    case 'GPS_RAW_INT': {
      const latitude = int32(8)
      const longitude = int32(12)
      const altitude = int32(16)
      return latitude === null || longitude === null || altitude === null
        ? null
        : { latitude, longitude, altitude, fixType: uint8(28), satellites: uint8(29) }
    }
    case 'GLOBAL_POSITION_INT': {
      const latitude = int32(4)
      const longitude = int32(8)
      const altitude = int32(16)
      const velocityX = int16(20)
      const velocityY = int16(22)
      return latitude === null || longitude === null || altitude === null
        ? null
        : { latitude, longitude, altitude, velocityX, velocityY, heading: uint16(26) }
    }
    case 'VFR_HUD':
      return {
        groundSpeed: float32(4),
        altitude: float32(8),
        heading: int16(16),
      }
    case 'SYS_STATUS': {
      const voltage = uint16(14)
      return {
        batteryVoltage: voltage === 65535 ? null : voltage === null ? null : voltage / 1000,
        batteryPercent: int8(18),
      }
    }
    case 'BATTERY_STATUS': {
      const cellCount = Math.min(10, Math.floor(Math.max(0, payload.byteLength - 10) / 2))
      let voltageTotal = 0
      for (let index = 0; index < cellCount; index++) {
        const cellVoltage = uint16(10 + index * 2)
        if (cellVoltage !== null && cellVoltage > 0 && cellVoltage !== 65535) voltageTotal += cellVoltage
      }
      return {
        batteryVoltage: voltageTotal > 0 ? voltageTotal / 1000 : null,
        batteryPercent: int8(35),
      }
    }
  }
}

const appendBytes = (current: Uint8Array, next: Uint8Array) => {
  const joined = new Uint8Array(current.length + next.length)
  joined.set(current)
  joined.set(next, current.length)
  return joined
}

export class MavLinkTelemetryParser {
  private buffer = new Uint8Array()
  crcErrors = 0
  signedPacketsSkipped = 0
  incompatibleFramesSkipped = 0

  feed(bytes: Uint8Array): MavLinkTelemetryMessage[] {
    this.buffer = appendBytes(this.buffer, bytes)
    const messages: MavLinkTelemetryMessage[] = []

    while (this.buffer.length > 0) {
      let start = 0
      while (start < this.buffer.length && this.buffer[start] !== 0xfd && this.buffer[start] !== 0xfe) start++
      if (start > 0) this.buffer = this.buffer.slice(start)
      if (this.buffer.length === 0) break

      const isV2 = this.buffer[0] === 0xfd
      const headerLength = isV2 ? 10 : 6
      if (this.buffer.length < headerLength) break

      const payloadLength = this.buffer[1]
      const incompatFlags = isV2 ? this.buffer[2] : 0
      if ((incompatFlags & ~1) !== 0) {
        this.incompatibleFramesSkipped++
        this.buffer = this.buffer.slice(1)
        continue
      }
      const signed = (incompatFlags & 1) !== 0
      const payloadEnd = headerLength + payloadLength
      const frameLength = payloadEnd + 2 + (signed ? 13 : 0)
      if (this.buffer.length < frameLength) break

      const messageId = isV2
        ? this.buffer[7] | (this.buffer[8] << 8) | (this.buffer[9] << 16)
        : this.buffer[5]
      const definition = messageDefinitions[messageId]

      if (definition) {
        const expected = calculateChecksum(this.buffer.subarray(1, payloadEnd), definition.crcExtra)
        const received = this.buffer[payloadEnd] | (this.buffer[payloadEnd + 1] << 8)
        if (expected !== received) {
          this.crcErrors++
          this.buffer = this.buffer.slice(1)
          continue
        }

        const fields = decodePayload(definition.name, this.buffer.subarray(headerLength, payloadEnd))
        if (signed) {
          this.signedPacketsSkipped++
        } else if (fields) {
          messages.push({
            name: definition.name,
            systemId: this.buffer[isV2 ? 5 : 3],
            fields,
          })
        }
      }

      this.buffer = this.buffer.slice(frameLength)
    }

    return messages
  }
}
