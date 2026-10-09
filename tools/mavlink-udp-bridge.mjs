import { createServer } from 'node:http'
import { createSocket } from 'node:dgram'
import { WebSocket, WebSocketServer } from 'ws'

const readPort = (name, fallback) => {
  const value = Number(process.env[name] ?? fallback)
  if (!Number.isInteger(value) || value < 1 || value > 65535) {
    throw new Error(`${name} debe ser un puerto entre 1 y 65535.`)
  }
  return value
}

const udpHost = process.env.AGRONIA_MAVLINK_UDP_HOST ?? '0.0.0.0'
const udpPort = readPort('AGRONIA_MAVLINK_UDP_PORT', 14550)
const wsHost = process.env.AGRONIA_MAVLINK_WS_HOST ?? '127.0.0.1'
const wsPort = readPort('AGRONIA_MAVLINK_WS_PORT', 8765)
const allowedOrigins = new Set([
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://localhost:4173',
  'http://127.0.0.1:4173',
  ...(process.env.AGRONIA_ALLOWED_ORIGINS ?? '')
    .split(',')
    .map(origin => origin.trim())
    .filter(Boolean),
])

const httpServer = createServer((_, response) => {
  response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' })
  response.end('AgronIA MAVLink bridge: WebSocket endpoint only.\n')
})
const webSocketServer = new WebSocketServer({ noServer: true, maxPayload: 1024 * 1024 })
const udpSocket = createSocket('udp4')

httpServer.on('upgrade', (request, socket, head) => {
  const origin = request.headers.origin
  if (request.url !== '/' && request.url !== '/mavlink') {
    socket.write('HTTP/1.1 404 Not Found\r\nConnection: close\r\n\r\n')
    socket.destroy()
    return
  }
  if (origin && !allowedOrigins.has(origin)) {
    socket.write('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n')
    socket.destroy()
    console.warn(`Conexión WebSocket rechazada para Origin no permitido: ${origin}`)
    return
  }

  webSocketServer.handleUpgrade(request, socket, head, client => {
    webSocketServer.emit('connection', client, request)
  })
})

webSocketServer.on('connection', client => {
  console.info('Cliente AgronIA conectado al puente MAVLink (solo telemetría).')
  client.on('message', () => {
    client.close(1008, 'El puente es de solo lectura; no acepta comandos.')
  })
  client.on('close', () => {
    console.info('Cliente AgronIA desconectado del puente MAVLink.')
  })
})

udpSocket.on('message', message => {
  for (const client of webSocketServer.clients) {
    if (client.readyState === WebSocket.OPEN) client.send(message, { binary: true })
  }
})

udpSocket.on('error', error => {
  console.error(`Error del receptor UDP MAVLink: ${error.message}`)
  process.exitCode = 1
  shutdown()
})

let closing = false
const shutdown = () => {
  if (closing) return
  closing = true
  for (const client of webSocketServer.clients) client.close(1001, 'Puente detenido')
  webSocketServer.close()
  udpSocket.close()
  httpServer.close()
}

httpServer.on('error', error => {
  console.error(`No se pudo iniciar el servidor WebSocket: ${error.message}`)
  process.exitCode = 1
  shutdown()
})

process.once('SIGINT', shutdown)
process.once('SIGTERM', shutdown)

udpSocket.bind(udpPort, udpHost, () => {
  httpServer.listen(wsPort, wsHost, () => {
    console.info(`MAVLink UDP escuchando en ${udpHost}:${udpPort}`)
    console.info(`Puente WebSocket solo lectura en ws://${wsHost}:${wsPort}/mavlink`)
    console.info(`Origins permitidos: ${[...allowedOrigins].join(', ')}`)
    console.info('El puente retransmite UDP recibido al navegador y nunca envía comandos al dron.')
  })
})
