const { app, BrowserWindow, ipcMain, powerSaveBlocker, session, shell } = require('electron')
const path = require('node:path')
const os = require('node:os')
const http = require('node:http')
const dgram = require('node:dgram')

// Activar aceleración de hardware de máximo rendimiento en GPU y CPU
app.commandLine.appendSwitch('ignore-gpu-blacklist')
app.commandLine.appendSwitch('enable-gpu-rasterization')
app.commandLine.appendSwitch('enable-zero-copy')
app.commandLine.appendSwitch('enable-accelerated-2d-canvas')
app.commandLine.appendSwitch('enable-features', 'CanvasOopRasterization,VaapiVideoDecoder')
app.commandLine.appendSwitch('high-dpi-support', '1')
app.commandLine.appendSwitch('force-high-performance-gpu')

let mainWindow = null
let powerBlockerId = null
let mavlinkBridgeStatus = {
  active: false,
  udpPort: 14550,
  wsUrl: 'ws://127.0.0.1:8765/mavlink',
  packetsForwarded: 0,
  error: null,
}
let mavlinkCleanup = null

function startEmbeddedMavlinkBridge() {
  try {
    const { WebSocketServer, WebSocket } = require('ws')
    const udpHost = process.env.AGRONIA_MAVLINK_UDP_HOST || '0.0.0.0'
    const udpPort = Number(process.env.AGRONIA_MAVLINK_UDP_PORT || 14550)
    const wsHost = process.env.AGRONIA_MAVLINK_WS_HOST || '127.0.0.1'
    const wsPort = Number(process.env.AGRONIA_MAVLINK_WS_PORT || 8765)

    const httpServer = http.createServer((_, response) => {
      response.writeHead(200, { 'content-type': 'application/json; charset=utf-8' })
      response.end(JSON.stringify({ status: 'ok', service: 'AgronIA Embedded MAVLink Bridge', ...mavlinkBridgeStatus }))
    })
    const webSocketServer = new WebSocketServer({ noServer: true, maxPayload: 1024 * 1024 })
    const udpSocket = dgram.createSocket('udp4')

    httpServer.on('upgrade', (request, socket, head) => {
      if (request.url !== '/' && request.url !== '/mavlink') {
        socket.write('HTTP/1.1 404 Not Found\r\nConnection: close\r\n\r\n')
        socket.destroy()
        return
      }
      webSocketServer.handleUpgrade(request, socket, head, client => {
        webSocketServer.emit('connection', client, request)
      })
    })

    udpSocket.on('message', message => {
      mavlinkBridgeStatus.packetsForwarded += 1
      for (const client of webSocketServer.clients) {
        if (client.readyState === WebSocket.OPEN) {
          client.send(message, { binary: true })
        }
      }
    })

    udpSocket.on('error', err => {
      mavlinkBridgeStatus.error = err.message
    })

    httpServer.on('error', err => {
      if (err.code === 'EADDRINUSE') {
        mavlinkBridgeStatus.active = true
        mavlinkBridgeStatus.error = null
      } else {
        mavlinkBridgeStatus.error = err.message
      }
    })

    udpSocket.bind(udpPort, udpHost, () => {
      httpServer.listen(wsPort, wsHost, () => {
        mavlinkBridgeStatus.active = true
        mavlinkBridgeStatus.udpPort = udpPort
        mavlinkBridgeStatus.wsUrl = `ws://${wsHost}:${wsPort}/mavlink`
        mavlinkBridgeStatus.error = null
      })
    })

    mavlinkCleanup = () => {
      try {
        for (const client of webSocketServer.clients) client.close(1001, 'Cerrando AgronIA Desktop')
        webSocketServer.close()
        udpSocket.close()
        httpServer.close()
      } catch {
        // Ignore shutdown errors
      }
    }
  } catch (err) {
    mavlinkBridgeStatus.error = err instanceof Error ? err.message : String(err)
  }
}

function getSystemHardwareInfo() {
  const cpus = os.cpus() || []
  const cpuModel = cpus[0]?.model?.trim() || 'Procesador Multinúcleo x64'
  const cpuCores = cpus.length || 4
  const totalMemoryGb = Number((os.totalmem() / (1024 ** 3)).toFixed(1))
  const freeMemoryGb = Number((os.freemem() / (1024 ** 3)).toFixed(1))
  const processMemMb = Number((process.memoryUsage().rss / (1024 ** 2)).toFixed(0))

  return {
    isDesktop: true,
    platform: process.platform,
    arch: process.arch,
    electronVersion: process.versions.electron,
    chromeVersion: process.versions.chrome,
    nodeVersion: process.versions.node,
    cpuModel,
    cpuCores,
    totalMemoryGb,
    freeMemoryGb,
    processMemMb,
    powerSaveBlocked: powerBlockerId !== null && powerSaveBlocker.isStarted(powerBlockerId),
    mavlinkBridge: { ...mavlinkBridgeStatus },
  }
}

function configurePermissions() {
  const defaultSession = session.defaultSession
  if (!defaultSession) return

  const allowedPermissions = new Set([
    'media',
    'camera',
    'microphone',
    'geolocation',
    'fullscreen',
    'pointerLock',
    'serial',
    'usb',
    'hid',
    'clipboard-read',
    'clipboard-sanitized-write',
  ])

  defaultSession.setPermissionRequestHandler((_webContents, permission, callback) => {
    callback(allowedPermissions.has(permission))
  })

  defaultSession.setPermissionCheckHandler((_webContents, permission) => {
    return allowedPermissions.has(permission)
  })
}

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1540,
    height: 940,
    minWidth: 1080,
    minHeight: 700,
    title: 'AgronIA Desktop · Agricultura de Precisión & Simulación 3D',
    backgroundColor: '#10150e',
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false,
      spellcheck: false,
      webgl: true,
    },
  })

  mainWindow.once('ready-to-show', () => {
    mainWindow.maximize()
    mainWindow.show()
  })

  // Permitir ventanas emergentes nativas para Google Lens y visores externos sin perder la ventana principal
  mainWindow.webContents.setWindowOpenHandler(({ url, frameName }) => {
    if (url.includes('lens.google.com') || frameName === 'agronia_google_lens_tab') {
      return {
        action: 'allow',
        overrideBrowserWindowOptions: {
          width: 1120,
          height: 820,
          title: 'Google Lens · Identificación Botánica AgronIA',
          autoHideMenuBar: true,
          backgroundColor: '#10150e',
        },
      }
    }

    if (url.startsWith('https://') || url.startsWith('http://')) {
      shell.openExternal(url)
      return { action: 'deny' }
    }

    return { action: 'allow' }
  })

  const devServerUrl = process.env.VITE_DEV_SERVER_URL
  if (devServerUrl) {
    mainWindow.loadURL(devServerUrl)
  } else {
    const indexHtml = path.join(__dirname, '..', 'dist', 'index.html')
    mainWindow.loadFile(indexHtml)
  }
}

app.whenReady().then(() => {
  powerBlockerId = powerSaveBlocker.start('prevent-app-suspension')
  configurePermissions()
  startEmbeddedMavlinkBridge()

  ipcMain.handle('desktop:get-system-info', async () => {
    let gpuInfo = null
    try {
      gpuInfo = await app.getGPUFeatureStatus()
    } catch {
      gpuInfo = null
    }
    return {
      ...getSystemHardwareInfo(),
      gpuFeatures: gpuInfo,
    }
  })

  ipcMain.handle('desktop:toggle-fullscreen', () => {
    if (!mainWindow) return false
    const nextState = !mainWindow.isFullScreen()
    mainWindow.setFullScreen(nextState)
    return nextState
  })

  ipcMain.handle('desktop:open-external', (_event, targetUrl) => {
    if (typeof targetUrl === 'string' && (targetUrl.startsWith('https://') || targetUrl.startsWith('http://'))) {
      shell.openExternal(targetUrl)
      return true
    }
    return false
  })

  createMainWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow()
  })
})

app.on('window-all-closed', () => {
  if (powerBlockerId !== null && powerSaveBlocker.isStarted(powerBlockerId)) {
    powerSaveBlocker.stop(powerBlockerId)
  }
  if (mavlinkCleanup) mavlinkCleanup()
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
