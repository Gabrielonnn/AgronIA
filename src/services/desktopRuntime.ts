import { ref } from 'vue'

export type GraphicsQualityPreset = 'ultra' | 'balanced' | 'performance'

export interface DesktopSystemInfo {
  isDesktop: boolean
  platform: string
  arch: string
  electronVersion?: string
  chromeVersion?: string
  nodeVersion?: string
  cpuModel: string
  cpuCores: number
  totalMemoryGb: number
  freeMemoryGb: number
  processMemMb: number
  powerSaveBlocked: boolean
  gpuModel: string
  mavlinkBridge: {
    active: boolean
    udpPort: number
    wsUrl: string
    packetsForwarded: number
    error: string | null
  }
}

interface AgroniaDesktopBridge {
  isDesktop: boolean
  platform: string
  arch: string
  versions?: {
    electron?: string
    chrome?: string
    node?: string
  }
  getSystemInfo: () => Promise<Omit<DesktopSystemInfo, 'gpuModel'>>
  toggleFullscreen: () => Promise<boolean>
  openExternal: (url: string) => Promise<boolean>
}

declare global {
  interface Window {
    agroniaDesktop?: AgroniaDesktopBridge
  }
}

export const isDesktopApp =
  typeof window !== 'undefined' &&
  (Boolean(window.agroniaDesktop?.isDesktop) ||
    window.location.protocol === 'file:' ||
    navigator.userAgent.toLowerCase().includes('electron'))

const savedQuality =
  typeof window !== 'undefined'
    ? (window.localStorage.getItem('agronia-graphics-quality') as GraphicsQualityPreset | null)
    : null

export const graphicsQuality = ref<GraphicsQualityPreset>(
  savedQuality && ['ultra', 'balanced', 'performance'].includes(savedQuality)
    ? savedQuality
    : 'ultra'
)

export function setGraphicsQuality(preset: GraphicsQualityPreset) {
  graphicsQuality.value = preset
  if (typeof window !== 'undefined') {
    window.localStorage.setItem('agronia-graphics-quality', preset)
  }
}

let cachedGpuModel = ''

export function detectHardwareGpuModel(gl?: WebGLRenderingContext | WebGL2RenderingContext | null): string {
  if (cachedGpuModel) return cachedGpuModel
  if (typeof document === 'undefined') return 'GPU Acelerada por Hardware'

  try {
    const context =
      gl ??
      (() => {
        const canvas = document.createElement('canvas')
        return (
          canvas.getContext('webgl2', { powerPreference: 'high-performance' }) ||
          canvas.getContext('webgl', { powerPreference: 'high-performance' })
        )
      })()

    if (context) {
      const debugInfo = context.getExtension('WEBGL_debug_renderer_info')
      if (debugInfo) {
        const rawRenderer = String(context.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) || '')
        if (rawRenderer) {
          // Clean up ANGLE wrapper string e.g. "ANGLE (NVIDIA, NVIDIA GeForce RTX 3060 Direct3D11 vs_5_0 ps_5_0, D3D11)"
          const angleMatch = rawRenderer.match(/ANGLE \([^,]+,\s*([^,]+?)(?:\s+Direct3D|\s+OpenGL|,|\))/i)
          cachedGpuModel = (angleMatch?.[1] || rawRenderer).trim()
          return cachedGpuModel
        }
      }
    }
  } catch {
    // Fallback below
  }

  cachedGpuModel = 'GPU Direct3D / WebGL2 High-Performance'
  return cachedGpuModel
}

export const desktopSystemInfo = ref<DesktopSystemInfo>({
  isDesktop: isDesktopApp,
  platform: typeof navigator !== 'undefined' ? navigator.platform : 'Win32',
  arch: 'x64',
  cpuModel: 'Procesador Multinúcleo x64',
  cpuCores: typeof navigator !== 'undefined' ? navigator.hardwareConcurrency || 8 : 8,
  totalMemoryGb:
    typeof navigator !== 'undefined' && 'deviceMemory' in navigator
      ? Number((navigator as Navigator & { deviceMemory?: number }).deviceMemory || 8)
      : 16,
  freeMemoryGb: 8,
  processMemMb: 180,
  powerSaveBlocked: isDesktopApp,
  gpuModel: detectHardwareGpuModel(),
  mavlinkBridge: {
    active: isDesktopApp,
    udpPort: 14550,
    wsUrl: 'ws://127.0.0.1:8765/mavlink',
    packetsForwarded: 0,
    error: null,
  },
})

export async function refreshDesktopSystemInfo(): Promise<DesktopSystemInfo> {
  const gpuModel = detectHardwareGpuModel()
  if (typeof window !== 'undefined' && window.agroniaDesktop?.getSystemInfo) {
    try {
      const info = await window.agroniaDesktop.getSystemInfo()
      desktopSystemInfo.value = {
        ...info,
        gpuModel,
      }
      return desktopSystemInfo.value
    } catch {
      // Keep fallback browser hardware telemetry
    }
  }

  desktopSystemInfo.value = {
    ...desktopSystemInfo.value,
    gpuModel,
  }
  return desktopSystemInfo.value
}
