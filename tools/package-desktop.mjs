import { packager } from '@electron/packager'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '..')

async function buildDesktopPackage() {
  console.info('Empaquetando AgronIA Desktop para Windows (x64) con aceleración GPU nativa...')
  const appPaths = await packager({
    dir: rootDir,
    name: 'AgronIA',
    platform: 'win32',
    arch: 'x64',
    out: path.join(rootDir, 'release-desktop'),
    overwrite: true,
    asar: false,
    prune: true,
    ignore: [
      /^\/release-desktop($|\/)/,
      /^\/\.git($|\/)/,
      /^\/\.github($|\/)/,
      /^\/tests($|\/)/,
      /^\/backend\/models($|\/)/,
      /^\/node_modules\/\.cache($|\/)/,
      /^\/node_modules\/@playwright($|\/)/,
      /^\/node_modules\/playwright($|\/)/,
      /^\/node_modules\/playwright-core($|\/)/,
      /^\/node_modules\/@electron\/packager($|\/)/,
    ],
  })

  console.info(`Aplicación de escritorio creada exitosamente en: ${appPaths.join(', ')}`)
}

buildDesktopPackage().catch(error => {
  console.error('Error al empaquetar AgronIA Desktop:', error)
  process.exitCode = 1
})
