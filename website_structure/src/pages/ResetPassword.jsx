import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import styles from './Auth.module.css'

/**
 * Supabase sends the user to /reset-password?code=<token> after they click the
 * email link. The SDK automatically exchanges the token for a session on page
 * load. We just need to call updateUser with the new password.
 */
export default function ResetPassword() {
  const navigate = useNavigate()
  const [password, setPassword]   = useState('')
  const [confirm, setConfirm]     = useState('')
  const [error, setError]         = useState('')
  const [loading, setLoading]     = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    if (password !== confirm) {
      setError('Passwords do not match.')
      return
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters.')
      return
    }
    setLoading(true)
    const { error } = await supabase.auth.updateUser({ password })
    setLoading(false)
    if (error) {
      setError(error.message)
    } else {
      navigate('/login', { replace: true, state: { message: 'Password updated. Please sign in.' } })
    }
  }

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <div className={styles.logo}>🔒</div>
        <h1 className={styles.title}>Set a new password</h1>
        <p className={styles.subtitle}>Choose a strong password for your account.</p>

        <form className={styles.form} onSubmit={handleSubmit}>
          {error && <p className={styles.error}>{error}</p>}

          <div className={styles.field}>
            <label className={styles.label} htmlFor="password">
              New password <span style={{ fontWeight: 400, color: '#718096' }}>(min 8 characters)</span>
            </label>
            <input
              id="password"
              className={styles.input}
              type="password"
              autoComplete="new-password"
              required
              disabled={loading}
              value={password}
              onChange={e => setPassword(e.target.value)}
            />
          </div>

          <div className={styles.field}>
            <label className={styles.label} htmlFor="confirm">Confirm new password</label>
            <input
              id="confirm"
              className={styles.input}
              type="password"
              autoComplete="new-password"
              required
              disabled={loading}
              value={confirm}
              onChange={e => setConfirm(e.target.value)}
            />
          </div>

          <button className={styles.btn} type="submit" disabled={loading}>
            {loading ? 'Updating…' : 'Update password'}
          </button>
        </form>
      </div>
    </div>
  )
}
