import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../context/useAuth'

/**
 * Wrap routes that require authentication.
 *
 * Usage in App.jsx:
 *   <Route element={<RequireAuth />}>
 *     <Route index element={<Dashboard />} />
 *     ...
 *   </Route>
 *
 * While the initial session is loading, a minimal spinner is shown so the page
 * never flashes to /login before the persisted session has been read.
 */
export default function RequireAuth({ children }) {
  const { user, loading } = useAuth()
  const location = useLocation()

  if (loading) {
    return (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100vh',
        fontSize: '1rem',
        color: '#4a5568',
      }}>
        Loading…
      </div>
    )
  }

  if (!user) {
    // Redirect to /login and remember where the user was trying to go
    return <Navigate to="/login" state={{ from: location }} replace />
  }

  return children ?? null
}
