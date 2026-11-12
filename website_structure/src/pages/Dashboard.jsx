import { useEffect, useCallback, useRef, useState } from 'react'
import { useAuth } from '../context/useAuth'
import {
  getProfile,
  updateProfile,
  getUpcomingDeadlines,
  getLatestSuggestion,
  getDailyVocab,
  setAssignmentCompleted,
  uploadBackgroundImage,
  getBackgroundImageUrl,
} from '../lib/supabaseService'
import styles from './Dashboard.module.css'

/* ── Helpers ── */

function formatDeadline(dateStr) {
  if (!dateStr) return ''
  const d = new Date(dateStr + 'T00:00:00')
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

function daysUntil(dateStr) {
  if (!dateStr) return null
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const due = new Date(dateStr + 'T00:00:00')
  return Math.round((due - today) / 86400000)
}

function DeadlineBadge({ dateStr }) {
  const days = daysUntil(dateStr)
  if (days === null) return null
  if (days < 0)  return <span className={`${styles.dueBadge} ${styles.overdue}`}>Overdue</span>
  if (days === 0) return <span className={`${styles.dueBadge} ${styles.today}`}>Today</span>
  if (days === 1) return <span className={`${styles.dueBadge} ${styles.soon}`}>Tomorrow</span>
  if (days <= 3)  return <span className={`${styles.dueBadge} ${styles.soon}`}>In {days} days</span>
  return <span className={styles.dueBadge}>Due {formatDeadline(dateStr)}</span>
}

function EmptyState({ message }) {
  return <p className={styles.empty}>{message}</p>
}

function LoadError({ message }) {
  return <p className={styles.loadError}>{message}</p>
}

/* ── Dashboard ── */

export default function Dashboard() {
  const { user } = useAuth()

  // Profile / background
  const [bgImageUrl, setBgImageUrl]   = useState(null)
  const [bgImagePath, setBgImagePath] = useState(null)
  const [bgUploading, setBgUploading] = useState(false)
  const [bgError, setBgError]         = useState(null)
  const fileInputRef                  = useRef(null)

  // Deadlines
  const [deadlines, setDeadlines]     = useState([])
  const [dlLoading, setDlLoading]     = useState(true)
  const [dlError, setDlError]         = useState(null)

  // Study suggestion
  const [suggestion, setSuggestion]   = useState(null)
  const [sgLoading, setSgLoading]     = useState(true)
  const [sgError, setSgError]         = useState(null)

  // Daily vocab
  const [vocab, setVocab]             = useState([])
  const [vcLoading, setVcLoading]     = useState(true)
  const [vcError, setVcError]         = useState(null)

  // Display name
  const displayName = user?.user_metadata?.display_name
    ?? user?.email?.split('@')[0]
    ?? 'there'

  // ── Load all dashboard data ──
  const loadData = useCallback(async () => {
    if (!user) return

    // Run all fetches in parallel
    const [profileRes, deadlinesRes, suggestionRes, vocabRes] = await Promise.all([
      getProfile(user.id),
      getUpcomingDeadlines(user.id),
      getLatestSuggestion(user.id),
      getDailyVocab(user.id),
    ])

    // Profile → background image
    if (!profileRes.error && profileRes.data?.bg_image_path) {
      const path = profileRes.data.bg_image_path
      setBgImagePath(path)
      try {
        const url = await getBackgroundImageUrl(path)
        setBgImageUrl(url)
      } catch {
        setBgImageUrl(null)
      }
    } else {
      setBgImagePath(null)
      setBgImageUrl(null)
    }

    // Deadlines
    setDlLoading(false)
    if (deadlinesRes.error) setDlError(deadlinesRes.error.message)
    else setDeadlines(deadlinesRes.data ?? [])

    // Suggestion
    setSgLoading(false)
    if (suggestionRes.error) setSgError(suggestionRes.error.message)
    else setSuggestion(suggestionRes.data)

    // Vocab
    setVcLoading(false)
    if (vocabRes.error) setVcError(vocabRes.error.message)
    else setVocab(vocabRes.data ?? [])
  }, [user])

  // Load on mount and when user changes
  useEffect(() => {
    if (!user) return
    loadData()
  }, [user, loadData])

  // Silent background refresh when the user returns to this tab/window
  useEffect(() => {
    const handleFocus = () => { if (user) loadData() }
    window.addEventListener('focus', handleFocus)
    return () => window.removeEventListener('focus', handleFocus)
  }, [user, loadData])

  // ── Toggle assignment completion ──
  async function handleToggleComplete(id, currentCompleted) {
    // Optimistic update
    setDeadlines(prev => prev.filter(d => d.id !== id))
    const { error } = await setAssignmentCompleted(id, !currentCompleted)
    if (error) {
      // Roll back on failure
      loadData()
    }
  }

  // ── Background image upload ──
  async function handleBgFileChange(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setBgUploading(true)
    setBgError(null)
    try {
      const path = await uploadBackgroundImage(user.id, file)
      await updateProfile(user.id, { bg_image_path: path })
      setBgImagePath(path)
      const url = await getBackgroundImageUrl(path)
      setBgImageUrl(url)
    } catch (err) {
      setBgError(err.message ?? 'Upload failed.')
    } finally {
      setBgUploading(false)
      // Reset file input so the same file can be re-selected after removal
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  async function handleRemoveBg() {
    setBgUploading(true)
    setBgError(null)
    try {
      await updateProfile(user.id, { bg_image_path: null })
      setBgImagePath(null)
      setBgImageUrl(null)
    } catch (err) {
      setBgError(err.message ?? 'Could not remove background.')
    } finally {
      setBgUploading(false)
    }
  }

  /* ── Render ── */

  const bgStyle = bgImageUrl
    ? { backgroundImage: `url(${bgImageUrl})`, backgroundSize: 'cover', backgroundPosition: 'center' }
    : {}

  return (
    <div className={styles.page} style={bgStyle}>
      {/* Overlay keeps text readable over any background */}
      {bgImageUrl && <div className={styles.bgOverlay} aria-hidden="true" />}

      <div className={styles.pageContent}>
        {/* ── Header row ── */}
        <div className={styles.heroRow}>
          <div>
            <h1 className={styles.pageTitle}>Welcome back, {displayName} 👋</h1>
            <p className={styles.pageSubtitle}>Here is what needs your attention today.</p>
          </div>

          {/* Background image controls */}
          <div className={styles.bgControls}>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              className={styles.fileInputHidden}
              id="bg-upload"
              onChange={handleBgFileChange}
              disabled={bgUploading}
            />
            <label
              htmlFor="bg-upload"
              className={`${styles.bgBtn} ${bgUploading ? styles.bgBtnDisabled : ''}`}
            >
              {bgUploading ? 'Uploading…' : bgImagePath ? '🖼 Change background' : '🖼 Set background'}
            </label>
            {bgImagePath && !bgUploading && (
              <button className={`${styles.bgBtn} ${styles.bgBtnRemove}`} onClick={handleRemoveBg}>
                Remove
              </button>
            )}
            {bgError && <span className={styles.bgError}>{bgError}</span>}
          </div>
        </div>

        <div className={styles.grid}>

          {/* ── Upcoming deadlines ── */}
          <section className={styles.card}>
            <h2 className={styles.cardTitle}>📅 Upcoming Deadlines</h2>
            {dlLoading && <p className={styles.loading}>Loading…</p>}
            {dlError && <LoadError message={`Could not load deadlines: ${dlError}`} />}
            {!dlLoading && !dlError && deadlines.length === 0 && (
              <EmptyState message="No upcoming deadlines — great job staying on top of things!" />
            )}
            {!dlLoading && !dlError && deadlines.length > 0 && (
              <ul className={styles.deadlineList}>
                {deadlines.map((item) => (
                  <li key={item.id} className={styles.deadlineItem}>
                    <button
                      className={styles.completeBtn}
                      title="Mark as complete"
                      onClick={() => handleToggleComplete(item.id, item.completed)}
                      aria-label={`Mark "${item.title}" as complete`}
                    >
                      ✓
                    </button>
                    <span className={styles.course}>{item.course}</span>
                    <span className={styles.task}>{item.title}</span>
                    <DeadlineBadge dateStr={item.deadline} />
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* ── Study suggestion ── */}
          <section className={styles.card}>
            <h2 className={styles.cardTitle}>💡 Study Suggestion</h2>
            {sgLoading && <p className={styles.loading}>Loading…</p>}
            {sgError && <LoadError message={`Could not load suggestion: ${sgError}`} />}
            {!sgLoading && !sgError && !suggestion && (
              <EmptyState message="No suggestions yet. Your Study Assistant will save tips here." />
            )}
            {!sgLoading && !sgError && suggestion && (
              <div className={styles.suggestion}>
                <p className={styles.suggestionDetail}>{suggestion.content}</p>
                <p className={styles.suggestionMeta}>
                  Saved {new Date(suggestion.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                </p>
              </div>
            )}
          </section>

          {/* ── Daily vocabulary ── */}
          <section className={`${styles.card} ${styles.cardWide}`}>
            <h2 className={styles.cardTitle}>📖 Vocabulary Due for Review</h2>
            {vcLoading && <p className={styles.loading}>Loading…</p>}
            {vcError && <LoadError message={`Could not load vocabulary: ${vcError}`} />}
            {!vcLoading && !vcError && vocab.length === 0 && (
              <EmptyState message="No words due for review today. Add words in the Vocabulary page." />
            )}
            {!vcLoading && !vcError && vocab.length > 0 && (
              <>
                <p className={styles.vocabCount}>
                  {vocab.length} word{vocab.length !== 1 ? 's' : ''} to review
                </p>
                <ul className={styles.vocabList}>
                  {vocab.map(({ id, word, definition, status }) => (
                    <li key={id} className={styles.vocabItem}>
                      <span className={styles.vocabWord}>{word}</span>
                      <span className={styles.vocabStatus} data-status={status}>{status}</span>
                      <span className={styles.vocabDef}>{definition}</span>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </section>

        </div>
      </div>
    </div>
  )
}
