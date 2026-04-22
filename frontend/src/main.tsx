import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, HashRouter } from 'react-router-dom'

import App from '@/App.tsx'
import '@/i18n'
import '@/index.css'

// 在仅 Nginx/未启用 .htaccess 的虚拟主机上，可设 VITE_SPA_HASH_ROUTER=1 后重新 build，地址形如
// https://example.com/app/#/login，无需服务器为深链做 rewrite
const useHashRouter = import.meta.env.VITE_SPA_HASH_ROUTER === '1'

const appTree = useHashRouter ? (
  <HashRouter>
    <App />
  </HashRouter>
) : (
  <BrowserRouter basename="/app">
    <App />
  </BrowserRouter>
)

createRoot(document.getElementById('root')!).render(<StrictMode>{appTree}</StrictMode>)
