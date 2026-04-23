import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { Header } from '@/components/Header'
import { AUTH_TOKEN_STORAGE_KEY } from '@/config/auth'

/**
 * Token gate + shell header in one layout (single pathless Route parent).
 * Avoids nested pathless + splat stealing public routes like /owner-secondary-password.
 */
export function ProtectedLayout() {
  const location = useLocation()
  const token = localStorage.getItem(AUTH_TOKEN_STORAGE_KEY)
  if (!token) {
    return <Navigate to="/" replace state={{ from: location.pathname }} />
  }
  return (
    <div className="app-root">
      <Header />
      <main>
        <Outlet />
      </main>
    </div>
  )
}
