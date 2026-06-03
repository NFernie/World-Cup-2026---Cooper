import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'

export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth()
  const location = useLocation()

  if (loading) return <p className="text-[var(--muted)]">Loading…</p>
  if (!user) {
    sessionStorage.setItem('post_auth_redirect', location.pathname + location.search)
    return <Navigate to="/login" replace />
  }
  return <>{children}</>
}
