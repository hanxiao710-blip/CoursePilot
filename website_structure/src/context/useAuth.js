import { useContext } from 'react'
import { AuthContext } from './_authContextValue'

/** Hook to read auth state inside any component. */
export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>')
  return ctx
}
