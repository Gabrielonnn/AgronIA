const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('agroniaDesktop', {
  isDesktop: true,
  platform: process.platform,
  arch: process.arch,
  versions: {
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    node: process.versions.node,
  },
  getSystemInfo: () => ipcRenderer.invoke('desktop:get-system-info'),
  toggleFullscreen: () => ipcRenderer.invoke('desktop:toggle-fullscreen'),
  openExternal: url => ipcRenderer.invoke('desktop:open-external', url),
})
