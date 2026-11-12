import { useEffect, useState } from 'react'
import { useAuth } from '../context/useAuth'
import {
  getUpcomingDeadlines,
  getLatestSuggestion,
  getDailyVocab,
} from '../lib/supabaseService'
import styles from './Dashboard.module.css'

/* ── Small helpers ── */

function formatDeadline(dateStr) {
  if (!dateStr) return ''
  const d = new Date(dateStr + 'T00:00:00') // treat as local date
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
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

  // Display name (from email)
  const displayName = user?.email?.split('@')[0] ?? 'there'

  useEffect(() => {
    if (!user) return

    // Load all three in parallel
    getUpcomingDeadlines(user.id).then(({ data, error }) => {
      setDlLoading(false)
      if (error) setDlError(error.message)
      else setDeadlines(data ?? [])
    })

    getLatestSuggestion(user.id).then(({ data, error }) => {
      setSgLoading(false)
      if (error) setSgError(error.message)
      else setSuggestion(data)
    })

    getDailyVocab(user.id).then(({ data, error }) => {
      setVcLoading(false)
      if (error) setVcError(error.message)
      else setVocab(data ?? [])
    })
  }, [user])

  return (
    <div className={styles.page}>
      <h1 className={styles.pageTitle}>Welcome back, {displayName} 👋</h1>
      <p className={styles.pageSubtitle}>
        Here is what needs your attention today.
      </p>

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
                  <span className={styles.course}>{item.course}</span>
                  <span className={styles.task}>{item.title}</span>
                  <span className={styles.due}>Due {formatDeadline(item.deadline)}</span>
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
            </div>
          )}
        </section>

        {/* ── Daily vocabulary ── */}
        <section className={`${styles.card} ${styles.cardWide}`}>
          <h2 className={styles.cardTitle}>📖 Daily Vocabulary</h2>
          {vcLoading && <p className={styles.loading}>Loading…</p>}
          {vcError && <LoadError message={`Could not load vocabulary: ${vcError}`} />}
          {!vcLoading && !vcError && vocab.length === 0 && (
            <EmptyState message="No words due for review today. Add words in the Vocabulary page." />
          )}
          {!vcLoading && !vcError && vocab.length > 0 && (
            <ul className={styles.vocabList}>
              {vocab.map(({ id, word, definition }) => (
                <li key={id} className={styles.vocabItem}>
                  <span className={styles.vocabWord}>{word}</span>
                  <span className={styles.vocabDef}>{definition}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

      </div>
    </div>
  )
}
