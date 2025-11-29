import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '@/legacy/contexts/AuthContext'

export function ProtectedRoute({ children }) {
  const location = useLocation()
  const { isAuthenticated } = useAuth()

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />
  }

  return children
}
