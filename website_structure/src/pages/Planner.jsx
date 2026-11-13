import { useEffect, useState } from 'react'
import { useAuth } from '../context/useAuth'
import {
  getAssignments,
  createAssignment,
  setAssignmentCompleted,
  deleteAssignment,
} from '../lib/supabaseService'
import styles from './Planner.module.css'

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Parse a YYYY-MM-DD string as a local midnight date (avoids UTC shift). */
function parseLocalDate(dateStr) {
  if (!dateStr) return null
  return new Date(dateStr + 'T00:00:00')
}

/** Format a YYYY-MM-DD string for display: "Nov 15, 2026". */
function formatDate(dateStr) {
  const d = parseLocalDate(dateStr)
  if (!d) return ''
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

/**
 * Classify an assignment's deadline relative to today.
 * Returns: 'overdue' | 'today' | 'soon' (≤3 days) | 'upcoming'
 */
function deadlineStatus(dateStr, completed) {
  if (completed) return 'completed'
  const d = parseLocalDate(dateStr)
  if (!d) return 'upcoming'
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const diff = Math.round((d - today) / 86400000)
  if (diff < 0)  return 'overdue'
  if (diff === 0) return 'today'
  if (diff <= 3)  return 'soon'
  return 'upcoming'
}

/** Human-readable urgency label for the status badge. */
function statusLabel(status) {
  switch (status) {
    case 'overdue':   return 'Overdue'
    case 'today':     return 'Due Today'
    case 'soon':      return 'Due Soon'
    case 'completed': return 'Completed'
    default:          return 'Upcoming'
  }
}

// Today's date as YYYY-MM-DD for the min attribute on the date input
const TODAY_ISO = new Date().toISOString().slice(0, 10)

// ─── Sub-components ──────────────────────────────────────────────────────────

function StatusBadge({ status }) {
  return (
    <span className={`${styles.badge} ${styles[`badge_${status}`]}`}>
      {statusLabel(status)}
    </span>
  )
}

// ─── Main component ──────────────────────────────────────────────────────────

const FILTERS = ['All', 'Upcoming', 'Completed']

export default function Planner() {
  const { user } = useAuth()

  // ── Data state ──
  const [assignments, setAssignments] = useState([])
  const [loading, setLoading]         = useState(true)
  const [loadError, setLoadError]     = useState(null)

  // ── Form state ──
  const [showForm, setShowForm]   = useState(false)
  const [course, setCourse]       = useState('')
  const [title, setTitle]         = useState('')
  const [deadline, setDeadline]   = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError]   = useState(null)

  // ── Filter state ──
  const [filter, setFilter] = useState('All')

  // ── Per-row action state (keyed by assignment id) ──
  const [togglingId, setTogglingId]   = useState(null)
  const [deletingId, setDeletingId]   = useState(null)
  const [confirmId, setConfirmId]     = useState(null)   // awaiting delete confirm
  const [actionError, setActionError] = useState(null)

  // ── Load on mount ──
  useEffect(() => {
    if (!user) return
    async function load() {
      setLoading(true)
      setLoadError(null)
      const { data, error } = await getAssignments(user.id)
      setLoading(false)
      if (error) {
        setLoadError(error.message)
      } else {
        setAssignments(data ?? [])
      }
    }
    load()
  }, [user])

  // ── Add assignment ──
  async function handleSubmit(e) {
    e.preventDefault()
    setFormError(null)
    if (!course.trim() || !title.trim() || !deadline) {
      setFormError('Please fill in all three fields.')
      return
    }
    setSubmitting(true)
    const { data, error } = await createAssignment(user.id, {
      course: course.trim(),
      title: title.trim(),
      deadline,
    })
    setSubmitting(false)
    if (error) {
      setFormError(error.message)
      return
    }
    // Insert new row in sorted position (deadline ascending)
    setAssignments(prev => {
      const next = [...prev, data]
      next.sort((a, b) => (a.deadline > b.deadline ? 1 : -1))
      return next
    })
    // Reset form
    setCourse('')
    setTitle('')
    setDeadline('')
    setShowForm(false)
  }

  // ── Toggle completed ──
  async function handleToggle(id, currentCompleted) {
    setActionError(null)
    setTogglingId(id)
    const { error } = await setAssignmentCompleted(id, !currentCompleted)
    setTogglingId(null)
    if (error) {
      setActionError(`Could not update assignment: ${error.message}`)
      return
    }
    setAssignments(prev =>
      prev.map(a => a.id === id ? { ...a, completed: !currentCompleted } : a)
    )
  }

  // ── Delete (two-step: confirm then execute) ──
  function handleDeleteRequest(id) {
    setActionError(null)
    setConfirmId(id)
  }

  async function handleDeleteConfirm(id) {
    setConfirmId(null)
    setDeletingId(id)
    const { error } = await deleteAssignment(id)
    setDeletingId(null)
    if (error) {
      setActionError(`Could not delete assignment: ${error.message}`)
      return
    }
    setAssignments(prev => prev.filter(a => a.id !== id))
  }

  function handleDeleteCancel() {
    setConfirmId(null)
  }

  // ── Filter logic ──
  const filtered = assignments.filter(a => {
    if (filter === 'Completed') return a.completed
    if (filter === 'Upcoming')  return !a.completed
    return true // 'All'
  })

  // ── Render ──
  return (
    <div className={styles.page}>

      {/* ── Page header ── */}
      <div className={styles.pageHeader}>
        <div>
          <h1 className={styles.pageTitle}>📆 My Planner</h1>
          <p className={styles.pageSubtitle}>
            Manage your assignments, track deadlines, and stay on schedule.
          </p>
        </div>
        <button
          className={styles.addBtn}
          onClick={() => { setShowForm(f => !f); setFormError(null) }}
          aria-expanded={showForm}
        >
          {showForm ? '✕ Cancel' : '+ Add Assignment'}
        </button>
      </div>

      {/* ── Add assignment form ── */}
      {showForm && (
        <section className={styles.formCard} aria-label="Add assignment form">
          <h2 className={styles.formTitle}>New Assignment</h2>
          <form onSubmit={handleSubmit} noValidate>
            <div className={styles.formGrid}>
              <div className={styles.fieldGroup}>
                <label className={styles.label} htmlFor="course">Course</label>
                <input
                  id="course"
                  className={styles.input}
                  type="text"
                  placeholder="e.g. ENGL 101"
                  value={course}
                  onChange={e => setCourse(e.target.value)}
                  maxLength={60}
                  disabled={submitting}
                />
              </div>
              <div className={styles.fieldGroup}>
                <label className={styles.label} htmlFor="asgn-title">Title</label>
                <input
                  id="asgn-title"
                  className={styles.input}
                  type="text"
                  placeholder="e.g. Essay draft"
                  value={title}
                  onChange={e => setTitle(e.target.value)}
                  maxLength={120}
                  disabled={submitting}
                />
              </div>
              <div className={styles.fieldGroup}>
                <label className={styles.label} htmlFor="deadline">Deadline</label>
                <input
                  id="deadline"
                  className={styles.input}
                  type="date"
                  value={deadline}
                  min={TODAY_ISO}
                  onChange={e => setDeadline(e.target.value)}
                  disabled={submitting}
                />
              </div>
            </div>
            {formError && <p className={styles.formError} role="alert">{formError}</p>}
            <div className={styles.formActions}>
              <button type="submit" className={styles.saveBtn} disabled={submitting}>
                {submitting ? 'Saving…' : 'Save Assignment'}
              </button>
            </div>
          </form>
        </section>
      )}

      {/* ── Filters ── */}
      <div className={styles.filterBar} role="group" aria-label="Filter assignments">
        {FILTERS.map(f => (
          <button
            key={f}
            className={`${styles.filterBtn} ${filter === f ? styles.filterBtnActive : ''}`}
            onClick={() => setFilter(f)}
          >
            {f}
            {f === 'All'       && <span className={styles.filterCount}>{assignments.length}</span>}
            {f === 'Upcoming'  && <span className={styles.filterCount}>{assignments.filter(a => !a.completed).length}</span>}
            {f === 'Completed' && <span className={styles.filterCount}>{assignments.filter(a => a.completed).length}</span>}
          </button>
        ))}
      </div>

      {/* ── Global action error ── */}
      {actionError && (
        <p className={styles.actionError} role="alert">{actionError}</p>
      )}

      {/* ── Assignment list ── */}
      {loading && <p className={styles.stateMsg}>Loading your assignments…</p>}
      {loadError && (
        <p className={styles.stateError} role="alert">
          Could not load assignments: {loadError}
        </p>
      )}
      {!loading && !loadError && filtered.length === 0 && (
        <div className={styles.emptyState}>
          <p className={styles.emptyIcon}>📭</p>
          <p className={styles.emptyMsg}>
            {filter === 'Completed'
              ? "You haven't completed any assignments yet."
              : filter === 'Upcoming'
              ? "No upcoming assignments. Add one above!"
              : "No assignments yet. Press \"+ Add Assignment\" to get started."}
          </p>
        </div>
      )}

      {!loading && !loadError && filtered.length > 0 && (
        <ul className={styles.list} aria-label="Assignment list">
          {filtered.map(a => {
            const status  = deadlineStatus(a.deadline, a.completed)
            const busy    = togglingId === a.id || deletingId === a.id
            const confirm = confirmId === a.id

            return (
              <li
                key={a.id}
                className={`${styles.item} ${a.completed ? styles.itemCompleted : ''}`}
              >
                {/* Checkbox */}
                <button
                  className={`${styles.checkbox} ${a.completed ? styles.checkboxDone : ''}`}
                  onClick={() => !busy && handleToggle(a.id, a.completed)}
                  disabled={busy}
                  aria-label={a.completed ? `Mark "${a.title}" as incomplete` : `Mark "${a.title}" as complete`}
                  title={a.completed ? 'Mark as incomplete' : 'Mark as complete'}
                >
                  {a.completed ? '✓' : ''}
                </button>

                {/* Content */}
                <div className={styles.itemContent}>
                  <div className={styles.itemTop}>
                    <span className={styles.coursePill}>{a.course}</span>
                    <StatusBadge status={status} />
                  </div>
                  <p className={`${styles.itemTitle} ${a.completed ? styles.itemTitleDone : ''}`}>
                    {a.title}
                  </p>
                  <p className={styles.itemDate}>Due {formatDate(a.deadline)}</p>
                </div>

                {/* Actions */}
                <div className={styles.itemActions}>
                  {confirm ? (
                    <>
                      <span className={styles.confirmMsg}>Delete?</span>
                      <button
                        className={`${styles.actionBtn} ${styles.actionBtnDanger}`}
                        onClick={() => handleDeleteConfirm(a.id)}
                      >
                        Yes
                      </button>
                      <button
                        className={styles.actionBtn}
                        onClick={handleDeleteCancel}
                      >
                        No
                      </button>
                    </>
                  ) : (
                    <button
                      className={`${styles.actionBtn} ${styles.actionBtnDelete}`}
                      onClick={() => !busy && handleDeleteRequest(a.id)}
                      disabled={busy}
                      aria-label={`Delete "${a.title}"`}
                      title="Delete assignment"
                    >
                      {deletingId === a.id ? '…' : '🗑'}
                    </button>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
