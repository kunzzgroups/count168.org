import { Outlet } from 'react-router-dom'
import { Header } from '@/components/Header'

export function RootLayout() {
  return (
    <div className="app-root">
      <Header />
      <main>
        <Outlet />
      </main>
    </div>
  )
}
