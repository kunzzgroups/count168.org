import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, HashRouter } from 'react-router-dom'

import App from '@/App.tsx'
import '@/i18n'
import '@/index.css'

// 生产环境默认 Hash：能打开 /app/index.html 即可，无需为 /app/login 配置 rewrite
// 要路径式 /app/login 时：build 时设 VITE_SPA_USE_BROWSER=1 且将 includes/spa_redirect 里 C168_SPA_USE_HASH 改为 false
const useHashRouter = import.meta.env.DEV
  ? false
  : import.meta.env.VITE_SPA_USE_BROWSER === '1'
    ? false
    : true

const appTree = useHashRouter ? (
  <HashRouter>
    <App />
  </HashRouter>
) : (
  <BrowserRouter basename="/app">
    <App />
  </BrowserRouter>
)
// Dev 用 Browser+basename 便于用 /app/ 子路径与代理联调

createRoot(document.getElementById('root')!).render(<StrictMode>{appTree}</StrictMode>)
