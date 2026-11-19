import { useEffect, useRef, useState, useCallback } from 'react'
import { useAuth } from '../context/useAuth'
import {
  getAssignments,
  getSuggestions,
  createSuggestion,
  deleteSuggestion,
} from '../lib/supabaseService'
import styles from './StudyAssistant.module.css'

// ── Constants ──────────────────────────────────────────────────────────────

const CHAT_ENDPOINT = '/api/study-assistant'

// Max history turns sent to the server (keeps payload small)
const MAX_HISTORY_TURNS = 10

// ── Helpers ────────────────────────────────────────────────────────────────

function formatDate(dateStr) {
  if (!dateStr) return ''
  const d = new Date(dateStr + 'T00:00:00')
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

/** Returns true when we are running locally without a Vercel serverless env. */
function isLocalDev() {
  return (
    typeof window !== 'undefined' &&
    (window.location.hostname === 'localhost' ||
      window.location.hostname === '127.0.0.1')
  )
}

// ── Sub-components ─────────────────────────────────────────────────────────

function OfflineNotice() {
  return (
    <div className={styles.offlineNotice}>
      <strong>AI chat is only available on the Preview / live site.</strong>
      <br />
      You are running locally with <code>npm run dev</code>, so there is no{' '}
      <code>GEMINI_API_KEY</code> and no serverless <code>/api</code> route.
      Your assignments and saved tips below still work normally.
    </div>
  )
}

// ── Main component ─────────────────────────────────────────────────────────

export default function StudyAssistant() {
  const { user, session } = useAuth()

  // ── Chat state ──
  //   Each message: { role: 'user'|'model'|'error', text: string, id: number }
  const [messages, setMessages]       = useState([])
  const [inputText, setInputText]     = useState('')
  const [isSending, setIsSending]     = useState(false)
  // Track which message indices have already been saved as a tip
  const [savedIndices, setSavedIndices] = useState(new Set())

  // ── Assignments state ──
  const [assignments, setAssignments]   = useState([])
  const [asnLoading, setAsnLoading]     = useState(true)
  const [asnError, setAsnError]         = useState(null)

  // ── Saved tips state ──
  const [tips, setTips]                 = useState([])
  const [tipsLoading, setTipsLoading]   = useState(true)
  const [tipsError, setTipsError]       = useState(null)

  // The assignment currently "in focus" for the next tip save
  const [focusedAssignment, setFocusedAssignment] = useState(null)

  const messagesEndRef = useRef(null)
  const inputRef       = useRef(null)
  const msgIdRef       = useRef(0)

  function nextId() {
    msgIdRef.current += 1
    return msgIdRef.current
  }

  // ── Load assignments and tips ──
  const loadData = useCallback(async () => {
    if (!user) return

    const [asnRes, tipsRes] = await Promise.all([
      getAssignments(user.id),
      getSuggestions(user.id),
    ])

    setAsnLoading(false)
    if (asnRes.error) setAsnError(asnRes.error.message)
    else setAssignments((asnRes.data ?? []).filter(a => !a.completed))

    setTipsLoading(false)
    if (tipsRes.error) setTipsError(tipsRes.error.message)
    else setTips(tipsRes.data ?? [])
  }, [user])

  useEffect(() => {
    if (!user) return
    loadData()
  }, [user, loadData])

  // Auto-scroll chat to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // ── Send message ──
  async function handleSend() {
    const text = inputText.trim()
    if (!text || isSending) return

    // Append user message
    setMessages(prev => [...prev, { role: 'user', text, id: nextId() }])
    setInputText('')
    setIsSending(true)

    // Build history from current messages (exclude errors, limit turns)
    const history = messages
      .filter(m => m.role === 'user' || m.role === 'model')
      .slice(-MAX_HISTORY_TURNS)
      .map(m => ({ role: m.role, text: m.text }))

    // Build the assignments payload (title + course + deadline, no IDs in AI prompt)
    const assignmentsPayload = assignments.slice(0, 10).map(a => ({
      id:       a.id,
      title:    a.title,
      course:   a.course,
      deadline: a.deadline,
    }))

    try {
      const jwt = session?.access_token
      if (!jwt) throw new Error('Not signed in. Please refresh the page.')

      const resp = await fetch(CHAT_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type':  'application/json',
          'Authorization': `Bearer ${jwt}`,
        },
        body: JSON.stringify({ message: text, history, assignments: assignmentsPayload }),
      })

      if (!resp.ok) {
        const errData = await resp.json().catch(() => ({}))
        throw new Error(errData.error ?? `Server error (HTTP ${resp.status})`)
      }

      const data = await resp.json()
      setMessages(prev => [...prev, { role: 'model', text: data.reply, id: nextId() }])
    } catch (err) {
      setMessages(prev => [
        ...prev,
        { role: 'error', text: err.message ?? 'Something went wrong. Please try again.', id: nextId() },
      ])
    } finally {
      setIsSending(false)
      inputRef.current?.focus()
    }
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  // ── Ask about an assignment ──
  function handleAskAbout(asn) {
    setFocusedAssignment(asn)
    const prompt = `I need help with this assignment:\n\nCourse: ${asn.course ?? '(unknown)'}\nTitle: ${asn.title}${asn.deadline ? `\nDue: ${asn.deadline}` : ''}\n\nCan you help me understand what I need to do?`
    setInputText(prompt)
    inputRef.current?.focus()
  }

  // ── Save a tip ──
  async function handleSaveTip(msg, msgIndex) {
    if (!user) return
    setSavedIndices(prev => new Set([...prev, msgIndex]))

    const payload = { content: msg.text }
    if (focusedAssignment?.id) {
      payload.assignment_id = focusedAssignment.id
    }

    const { data, error } = await createSuggestion(user.id, payload)
    if (error) {
      // Remove the "saved" mark on failure
      setSavedIndices(prev => {
        const next = new Set(prev)
        next.delete(msgIndex)
        return next
      })
      alert(`Could not save tip: ${error.message}`)
      return
    }
    if (data) {
      setTips(prev => [data, ...prev])
    }
  }

  // ── Delete a tip ──
  async function handleDeleteTip(id) {
    // Optimistic update
    setTips(prev => prev.filter(t => t.id !== id))
    const { error } = await deleteSuggestion(id)
    if (error) {
      // Roll back
      loadData()
    }
  }

  // ── Render ──

  const offline = isLocalDev()

  return (
    <div className={styles.page}>
      <h1 className={styles.pageTitle}>🤖 Study Assistant</h1>
      <p className={styles.pageSubtitle}>
        Ask questions, get explanations, and save study tips.
      </p>

      <div className={styles.layout}>

        {/* ── Main chat column ── */}
        <div className={styles.card}>
          <h2 className={styles.cardTitle}>💬 Chat with AI</h2>

          {offline && <OfflineNotice />}

          {/* Messages */}
          <div className={styles.chatWindow}>
            <div className={styles.messages}>
              {messages.length === 0 && (
                <p className={styles.empty}>
                  Start a conversation — ask about a concept, paste an assignment prompt, or click &ldquo;Ask about this&rdquo; from the panel on the right.
                </p>
              )}

              {messages.map((msg, idx) => (
                <div key={msg.id}>
                  <div
                    className={[
                      styles.message,
                      msg.role === 'user'  ? styles.messageUser  : '',
                      msg.role === 'model' ? styles.messageModel : '',
                      msg.role === 'error' ? styles.messageError : '',
                    ].join(' ').trim()}
                  >
                    {msg.text}
                  </div>

                  {/* Save-tip button for AI replies */}
                  {msg.role === 'model' && (
                    <button
                      className={[
                        styles.saveTipBtn,
                        savedIndices.has(idx) ? styles.saveTipBtnSaved : '',
                      ].join(' ').trim()}
                      onClick={() => handleSaveTip(msg, idx)}
                      disabled={savedIndices.has(idx)}
                      title="Save this answer as a study tip"
                    >
                      {savedIndices.has(idx) ? '✓ Saved' : '💾 Save as study tip'}
                    </button>
                  )}
                </div>
              ))}

              {isSending && (
                <p className={styles.typing}>AI is thinking…</p>
              )}

              <div ref={messagesEndRef} />
            </div>

            {/* Input row */}
            <div className={styles.inputRow}>
              <textarea
                ref={inputRef}
                className={styles.chatInput}
                placeholder={offline ? 'AI chat unavailable locally' : 'Type your question… (Enter to send, Shift+Enter for newline)'}
                value={inputText}
                onChange={e => setInputText(e.target.value)}
                onKeyDown={handleKeyDown}
                rows={1}
                disabled={isSending || offline}
              />
              <button
                className={styles.sendBtn}
                onClick={handleSend}
                disabled={isSending || !inputText.trim() || offline}
              >
                {isSending ? '…' : 'Send'}
              </button>
            </div>
          </div>
        </div>

        {/* ── Right sidebar ── */}
        <div className={styles.sidebar}>

          {/* Upcoming assignments panel */}
          <section className={styles.card}>
            <h2 className={styles.cardTitle}>📅 Upcoming Assignments</h2>

            {asnLoading && <p className={styles.loading}>Loading…</p>}
            {asnError   && <p className={styles.loadError}>Could not load assignments: {asnError}</p>}
            {!asnLoading && !asnError && assignments.length === 0 && (
              <p className={styles.empty}>No upcoming assignments. Add some in the Planner.</p>
            )}
            {!asnLoading && !asnError && assignments.length > 0 && (
              <ul className={styles.assignmentList}>
                {assignments.map(asn => (
                  <li key={asn.id} className={styles.assignmentItem}>
                    <div className={styles.assignmentMeta}>
                      {asn.course && (
                        <span className={styles.courseBadge}>{asn.course}</span>
                      )}
                      <span className={styles.assignmentTitle}>{asn.title}</span>
                    </div>
                    {asn.deadline && (
                      <span className={styles.deadline}>Due {formatDate(asn.deadline)}</span>
                    )}
                    {!offline && (
                      <button
                        className={styles.askBtn}
                        onClick={() => handleAskAbout(asn)}
                        title="Fill the chat with a question about this assignment"
                      >
                        Ask about this →
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* Saved tips panel */}
          <section className={styles.card}>
            <h2 className={styles.cardTitle}>💡 Saved Study Tips</h2>

            {tipsLoading && <p className={styles.loading}>Loading…</p>}
            {tipsError   && <p className={styles.loadError}>Could not load tips: {tipsError}</p>}
            {!tipsLoading && !tipsError && tips.length === 0 && (
              <p className={styles.empty}>
                No saved tips yet. Click &ldquo;Save as study tip&rdquo; on an AI reply to save it here.
              </p>
            )}
            {!tipsLoading && !tipsError && tips.length > 0 && (
              <ul className={styles.tipList}>
                {tips.map(tip => (
                  <li key={tip.id} className={styles.tipItem}>
                    <p className={styles.tipContent}>{tip.content}</p>
                    <div className={styles.tipMeta}>
                      <span className={styles.tipDate}>
                        {new Date(tip.created_at).toLocaleDateString(undefined, {
                          month: 'short',
                          day:   'numeric',
                        })}
                      </span>
                      <button
                        className={styles.deleteTipBtn}
                        onClick={() => handleDeleteTip(tip.id)}
                        title="Delete this tip"
                        aria-label="Delete tip"
                      >
                        Delete
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

        </div>
      </div>
    </div>
  )
}
