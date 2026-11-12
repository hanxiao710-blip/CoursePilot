import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { AuthContext } from './_authContextValue'

/**
 * Wrap the app with <AuthProvider> to make auth state available everywhere.
 * Access it with the useAuth() hook from ./useAuth.
 */
export function AuthProvider({ children }) {
  const [session, setSession] = useState(undefined) // undefined = loading
  const [user, setUser] = useState(null)

  useEffect(() => {
    // Get the initial session (handles page refresh / persistence)
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      setUser(session?.user ?? null)
    })

    // Listen for sign-in / sign-out / token refresh
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setSession(session)
        setUser(session?.user ?? null)
      }
    )

    return () => subscription.unsubscribe()
  }, [])

  const value = {
    session,
    user,
    loading: session === undefined,
    signOut: () => supabase.auth.signOut(),
  }

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  )
}
