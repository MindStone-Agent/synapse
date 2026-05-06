import { Navigate, useLocation } from 'react-router-dom'
import { useMe } from '../lib/auth'
import type { ReactNode } from 'react'

/**
 * Gates routes behind auth. While /v1/auth/me is loading we render
 * nothing (avoids flicker). 401 → /login.
 */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { data: me, isLoading } = useMe()
  const location = useLocation()

  if (isLoading) return null
  if (!me) return <Navigate to="/login" replace state={{ from: location }} />
  return <>{children}</>
}
