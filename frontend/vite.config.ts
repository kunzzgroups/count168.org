import { copyFileSync, existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'

const rootDir = path.dirname(fileURLToPath(import.meta.url))

// https://vite.dev/config/
export default defineConfig(({ command, mode }) => {
  const env = loadEnv(mode, rootDir, '')
  const proxyTarget = env.VITE_API_PROXY_TARGET || 'http://127.0.0.1:8888'

  return {
    // build：相对路径，/app/ 下任意子路径都能正确加载 .js/.css，避免少一层目录就 404
    // dev：仍用 /app/，与 Vite 开发服一致
    base: command === 'build' ? './' : '/app/',
    plugins: [
      react(),
      {
        // emptyOutDir 会删掉 app/.htaccess，build 后从 deployment 再拷回
        name: 'restore-app-htaccess',
        closeBundle() {
          if (command !== 'build') return
          const src = path.join(rootDir, 'deployment', 'app.htaccess')
          const dest = path.join(rootDir, '..', 'public_html', 'app', '.htaccess')
          if (existsSync(src)) {
            copyFileSync(src, dest)
          }
        },
      },
    ],
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
          target: proxyTarget,
          changeOrigin: true,
        },
      },
    },
  }
})
