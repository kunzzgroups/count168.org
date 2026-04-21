import type { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router-dom'

import { AUTH_TOKEN_KEY } from '@/constants/authStorage'

type ProtectedRouteProps = {
  children: ReactNode
}

export function ProtectedRoute({ children }: ProtectedRouteProps) {
  const location = useLocation()
  const token = localStorage.getItem(AUTH_TOKEN_KEY)

  if (!token) {
    return <Navigate to="/login" replace state={{ from: location }} />
  }

  return children
}
