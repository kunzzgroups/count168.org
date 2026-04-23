import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './index.css'
import { ErrorBoundary } from './ErrorBoundary'
import { getRouterBasename } from './routerBase'
import App from './App.tsx'

const basename = getRouterBasename()

createRoot(document.getElementById('root')!).render(
  <ErrorBoundary>
    <BrowserRouter basename={basename}>
      <App />
    </BrowserRouter>
  </ErrorBoundary>,
)
