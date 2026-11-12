import { useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import styles from './Auth.module.css'

export default function Register() {
  const [email, setEmail]         = useState('')
  const [password, setPassword]   = useState('')
  const [confirm, setConfirm]     = useState('')
  const [error, setError]         = useState('')
  const [success, setSuccess]     = useState(false)
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
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        // emailRedirectTo must match the URL you add in Supabase → Auth → URL Configuration
        emailRedirectTo: `${window.location.origin}/`,
      },
    })
    setLoading(false)
    if (error) {
      setError(error.message)
    } else {
      setSuccess(true)
    }
  }

  if (success) {
    return (
      <div className={styles.page}>
        <div className={styles.card}>
          <div className={styles.logo}>📧</div>
          <h1 className={styles.title}>Check your email</h1>
          <p className={styles.subtitle}>
            We sent a verification link to <strong>{email}</strong>.
            Click the link in the email to activate your account, then come back here to sign in.
          </p>
          <div className={styles.links}>
            <Link to="/login">Back to sign in</Link>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <div className={styles.logo}>🎓</div>
        <h1 className={styles.title}>Create your account</h1>
        <p className={styles.subtitle}>Join CoursePilot and start learning smarter</p>

        <form className={styles.form} onSubmit={handleSubmit}>
          {error && <p className={styles.error}>{error}</p>}

          <div className={styles.field}>
            <label className={styles.label} htmlFor="email">Email</label>
            <input
              id="email"
              className={styles.input}
              type="email"
              autoComplete="email"
              required
              disabled={loading}
              value={email}
              onChange={e => setEmail(e.target.value)}
            />
          </div>

          <div className={styles.field}>
            <label className={styles.label} htmlFor="password">
              Password <span style={{ fontWeight: 400, color: '#718096' }}>(min 8 characters)</span>
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
            <label className={styles.label} htmlFor="confirm">Confirm password</label>
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
            {loading ? 'Creating account…' : 'Create account'}
          </button>
        </form>

        <div className={styles.links}>
          <span>
            Already have an account?{' '}
            <Link to="/login">Sign in</Link>
          </span>
        </div>
      </div>
    </div>
  )
}
