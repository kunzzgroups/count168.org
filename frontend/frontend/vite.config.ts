import { fileURLToPath, URL } from 'node:url'
import { defineConfig, loadEnv } from 'vite'
import react, { reactCompilerPreset } from '@vitejs/plugin-react'
import babel from '@rolldown/plugin-babel'

const workspaceRoot = fileURLToPath(new URL('../..', import.meta.url))

/** Public URL base for built assets (trailing slash). Default site root `/` so React shares the same origin as PHP. */
function resolvePublicBase(env: Record<string, string>): string {
  if (env.VITE_BASE_PATH !== undefined) {
    const t = env.VITE_BASE_PATH.trim()
    if (t === '' || t === '/') {
      return '/'
    }
    return t.endsWith('/') ? t : `${t}/`
  }
  return '/'
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const apiProxyTarget = env.VITE_DEV_API_PROXY || 'http://127.0.0.1:80'
  const base = resolvePublicBase(env)

  return {
    base,
    plugins: [react(), babel({ presets: [reactCompilerPreset()] })],
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
      },
    },
    server: {
      fs: {
        allow: [workspaceRoot],
      },
      proxy: {
        '/api': {
          target: apiProxyTarget,
          changeOrigin: true,
        },
        '/login_process.php': {
          target: apiProxyTarget,
          changeOrigin: true,
        },
        '/login.php': {
          target: apiProxyTarget,
          changeOrigin: true,
        },
        '/images': {
          target: apiProxyTarget,
          changeOrigin: true,
        },
      },
    },
  }
})