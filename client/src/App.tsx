import { apiUrl } from './lib/api'
import './App.css'

function App() {
  return (
    <main className="app-shell">
      <h1>EazyCount</h1>
      <p className="app-step">Step 1: Vite + React + TypeScript 已就绪。</p>
      <p className="app-hint">
        与 PHP 同域时接口可用相对路径，例如{' '}
        <code>{apiUrl('/api/...')}</code>
      </p>
    </main>
  )
}

export default App
