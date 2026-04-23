import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { AUTH_TOKEN_STORAGE_KEY } from '@/config/auth'

/**
 * Gate for SPA routes that expect a Bearer token (set after JSON login).
 * Legacy PHP pages keep using cookies; this only guards React routes.
 */
export function RequireAuth() {
  const location = useLocation()
  const token = localStorage.getItem(AUTH_TOKEN_STORAGE_KEY)
  if (!token) {
    return <Navigate to="/" replace state={{ from: location.pathname }} />
  }
  return <Outlet />
}
