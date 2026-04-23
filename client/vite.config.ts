import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

function normalizeBase(raw: string | undefined): string {
  const fallback = '/'
  let s = (raw || fallback).trim()
  if (s === '') s = fallback
  if (!s.startsWith('/')) s = `/${s}`
  if (s.length > 1 && !s.endsWith('/')) s = `${s}/`
  return s
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const target = env.DEV_PHP_ORIGIN || 'http://127.0.0.1'
  const toPhp = { target, changeOrigin: true, secure: false }
  return {
    base: normalizeBase(env.VITE_BASE_PATH),
    plugins: [react()],
    server: {
      proxy: {
        '^/api': toPhp,
        '^/login_process\\.php$': toPhp,
        '^/reset-password\\.php$': toPhp,
      },
    },
  }
})
