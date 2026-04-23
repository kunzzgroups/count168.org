import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const target = env.DEV_PHP_ORIGIN || 'http://127.0.0.1'
  const toPhp = { target, changeOrigin: true, secure: false }
  return {
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
