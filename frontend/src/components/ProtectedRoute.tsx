import type { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router-dom'

import { AUTH_TOKEN_KEY, AUTH_USER_KEY } from '@/constants/authStorage'
import type { AuthUser } from '@/services/authService'

type ProtectedRouteProps = {
  children: ReactNode
  allowedRoles?: string[]
}

export function ProtectedRoute({ children, allowedRoles }: ProtectedRouteProps) {
  const location = useLocation()
  const token = localStorage.getItem(AUTH_TOKEN_KEY)

  if (!token) {
    return <Navigate to="/login" replace state={{ from: location }} />
  }

  if (allowedRoles && allowedRoles.length > 0) {
    const rawUser = localStorage.getItem(AUTH_USER_KEY)
    let role = ''
    if (rawUser) {
      try {
        role = ((JSON.parse(rawUser) as AuthUser).role || '').toLowerCase()
      } catch {
        role = ''
      }
    }
    const roleAllowed = allowedRoles.map((r) => r.toLowerCase()).includes(role)
    if (!roleAllowed) {
      return <Navigate to="/dashboard" replace />
    }
  }

  return children
}
