import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'

export default defineConfig(({ mode }) => {
  const isDesktop = mode === 'desktop' || process.env.VITE_DESKTOP === 'true'
  return {
    base: isDesktop ? './' : '/AgronIA/',
    optimizeDeps: {
      exclude: ['onnxruntime-web'],
    },
    plugins: [
      vue(),
      tailwindcss(),
    ],
  }
})

