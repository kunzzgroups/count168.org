import path from 'node:path'
import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

const rootDir = path.dirname(fileURLToPath(import.meta.url))

// https://vite.dev/config/
export default defineConfig({
  base: '/app/',
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(rootDir, './src'),
    },
  },
  build: {
    outDir: '../public_html/app',
    emptyOutDir: true,
  },
  server: {
    proxy: {
      '/api/v1': {
        target: 'http://127.0.0.1:8888',
        changeOrigin: true,
      },
    },
  },
})
