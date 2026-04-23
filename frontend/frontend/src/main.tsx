import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './index.css'
import './styles/globals.css'
import App from './App.tsx'

const routerBasename = import.meta.env.BASE_URL.replace(/\/$/, '')
const basenameProp =
  routerBasename === '' || routerBasename === '/' ? undefined : routerBasename

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter basename={basenameProp}>
      <App />
    </BrowserRouter>
  </StrictMode>,
)
