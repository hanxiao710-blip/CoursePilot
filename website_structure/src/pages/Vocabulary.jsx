/**
 * Vocabulary.jsx
 *
 * Vocabulary module: Today (preview/review), Extract, My Library and Courses.
 *
 * Database dependency: migrations 004_vocab_integrity.sql and 005_vocab_review.sql
 * must be applied
 * before the save and library features will work. Until then, extraction
 * and candidate review work normally; saving will return a database error
 * which is shown clearly to the user.
 */

import { useState, useRef, useCallback, useEffect, useId, cloneElement } from 'react'
import { useAuth } from '../context/useAuth'
import {
  getCourses,
  createCourse,
  getSessions,
  getStudySessions,
  createSession,
  saveVocabItems,
  getFullVocabulary,
  editVocabWord,
  deleteVocabWord,
} from '../lib/supabaseService'
import styles from './Vocabulary.module.css'
import { attachIds, editCandidate, remainingSelection } from '../lib/vocabCandidates.js'
import { requestJson } from '../lib/requestJson.js'
import VocabularyStudy from '../components/VocabularyStudy.jsx'

// ── Constants ─────────────────────────────────────────────────────────────

const EXTRACT_ENDPOINT = '/api/extract-vocab'
const MAX_INPUT_CHARS  = 50_000

// ── Helpers ───────────────────────────────────────────────────────────────

function sourceLabel(sourceNote, excerpt, edited) {
  // "extracted_from_material" means the term was found verbatim in the
  // pasted text — the badge confirms the term's origin, not every field.
  // Definitions and examples are always AI-generated regardless of source_note.
  return sourceNote === 'extracted_from_material' && excerpt
    ? { text: edited ? 'Original material · edited' : 'Term in material', mod: 'material' }
    : { text: 'AI generated', mod: 'ai' }
}

function formatDate(dateStr) {
  if (!dateStr) return 'Unscheduled'
  const d = new Date(dateStr + 'T00:00:00')
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

// ── Sub-components ────────────────────────────────────────────────────────

function StatusBanner({ message, variant }) {
  if (!message) return null
  return (
    <div className={`${styles.statusBanner} ${styles[`banner_${variant}`]}`} role="alert">
      {message}
    </div>
  )
}

/** Expandable candidate card used in the Extract tab review list */
function CandidateCard({ item, checked, onToggle, onEdit, busy }) {
  const [expanded, setExpanded] = useState(false)
  const src = sourceLabel(item.source_note, item.source_excerpt, item.user_edited)

  return (
    <div className={`${styles.card} ${checked ? styles.cardChecked : ''}`}>
      <div className={styles.cardHeader}>
        <label className={styles.checkboxWrap}>
          <input
            type="checkbox"
            checked={checked}
            disabled={busy || item._saved}
            onChange={onToggle}
            aria-label={`Select ${item.english}`}
          />
        </label>
        <span className={`${styles.typeBadge} ${styles[`type_${item.item_type}`]}`}>
          {item.item_type === 'term' ? 'TERM' : 'PHRASE'}
        </span>
        <div className={styles.cardTitle}>
          <span className={styles.english}>{item.english}</span>
          {item.abbreviation && <span className={styles.abbreviation}> ({item.abbreviation})</span>}
          <span className={styles.chinese}>{item.chinese}</span>
        </div>
        <span className={`${styles.sourceBadge} ${styles[`source_${src.mod}`]}`}>{src.text}</span>
        {item.user_edited && <span className={styles.editedBadge}>Edited</span>}
        {item._saved && <span className={styles.editedBadge}>Saved</span>}
        <button
          className={styles.expandBtn}
          onClick={() => setExpanded(e => !e)}
          aria-expanded={expanded}
          aria-label={expanded ? 'Collapse' : 'Expand'}
        >
          {expanded ? '▲' : '▼'}
        </button>
      </div>

      {expanded && (
        <div className={styles.cardDetail}>
          <p className={styles.aiNote}>Explanations, translations and examples are AI-generated. Cross-check with your course materials. Source excerpt shown below if available.</p>
          {item._saved && <p className={styles.aiNote}>Saved to your library. Open My Library to make further changes.</p>}
          <fieldset className={styles.candidateControls} disabled={busy || item._saved}>
          <div className={styles.fieldGroup}>
            <FieldRow label="English term / expression">
              <input className={styles.fieldInput} value={item.english}
                onChange={e => onEdit('english', e.target.value)} />
            </FieldRow>
            <FieldRow label="Chinese Translation">
              <input className={styles.fieldInput} value={item.chinese}
                onChange={e => onEdit('chinese', e.target.value)} />
            </FieldRow>
            {item.item_type === 'term' && (
              <FieldRow label="Abbreviation">
                <input className={styles.fieldInput} value={item.abbreviation ?? ''}
                  placeholder="e.g. DCF"
                  onChange={e => onEdit('abbreviation', e.target.value || null)} />
              </FieldRow>
            )}
          </div>
          <div className={styles.fieldGroup}>
            <FieldRow label="English definition">
              <textarea className={styles.fieldTextarea} rows={3} value={item.en_definition}
                onChange={e => onEdit('en_definition', e.target.value)} />
            </FieldRow>
            <FieldRow label="Chinese Explanation">
              <textarea className={styles.fieldTextarea} rows={3} value={item.zh_explanation}
                onChange={e => onEdit('zh_explanation', e.target.value)} />
            </FieldRow>
          </div>
          <div className={styles.fieldGroup}>
            <FieldRow label="Course context">
              <textarea className={styles.fieldTextarea} rows={2} value={item.course_context}
                onChange={e => onEdit('course_context', e.target.value)} />
            </FieldRow>
          </div>
          <div className={styles.fieldGroup}>
            <FieldRow label="English example">
              <textarea className={styles.fieldTextarea} rows={2} value={item.en_example}
                onChange={e => onEdit('en_example', e.target.value)} />
            </FieldRow>
            <FieldRow label="Chinese Example">
              <textarea className={styles.fieldTextarea} rows={2} value={item.zh_example}
                onChange={e => onEdit('zh_example', e.target.value)} />
            </FieldRow>
          </div>
          {item.source_excerpt ? (
            <div className={styles.sourceExcerpt}>
              <span className={styles.sourceExcerptLabel}>Source excerpt:</span>
              <blockquote className={styles.sourceExcerptText}>"{item.source_excerpt}"</blockquote>
            </div>
          ) : (
            <p className={styles.aiNote}>
              ⚠️ This item was generated by AI and does not appear verbatim in your material. Review before saving.
            </p>
          )}
          </fieldset>
        </div>
      )}
    </div>
  )
}

function FieldRow({ label, children }) {
  const id = useId()
  return (
    <div className={styles.fieldRow}>
      <label className={styles.fieldLabel} htmlFor={id}>{label}</label>
      {cloneElement(children, { id })}
    </div>
  )
}

/** Compact saved word card used in the My Library tab */
function SavedWordCard({ word, onEdit, onDelete }) {
  const [expanded, setExpanded] = useState(false)
  const [editing, setEditing]   = useState(false)
  const [draft, setDraft]       = useState(null)
  const [saving, setSaving]     = useState(false)
  const [saveErr, setSaveErr]   = useState(null)

  function startEdit() {
    setDraft({
      word:          word.word,
      definition:    word.definition,
      chinese:       word.chinese ?? '',
      zh_explanation: word.zh_explanation ?? '',
      course_context: word.course_context ?? '',
      en_example:    word.en_example ?? word.example ?? '',
      zh_example:    word.zh_example ?? '',
      abbreviation:  word.abbreviation ?? '',
    })
    setEditing(true)
    setExpanded(true)
  }

  async function commitEdit() {
    if (saving) return
    setSaving(true)
    setSaveErr(null)
    try {
    const { error } = await onEdit(word.id, {
      word:          draft.word.trim(),
      definition:    draft.definition.trim(),
      chinese:       draft.chinese.trim() || null,
      zh_explanation: draft.zh_explanation.trim() || null,
      course_context: draft.course_context.trim() || null,
      en_example:    draft.en_example.trim() || null,
      zh_example:    draft.zh_example.trim() || null,
      abbreviation:  draft.abbreviation.trim() || null,
    })
    if (error) {
      setSaveErr(error.message ?? 'Save failed. Please try again.')
    } else {
      setEditing(false)
      setDraft(null)
    }
    } catch (error) {
      setSaveErr(error.message || 'Save failed. Your changes are still here.')
    } finally {
      setSaving(false)
    }
  }

  const src = word.source_note ? sourceLabel(word.source_note, word.source_excerpt, word.user_edited) : null
  const session = word.sessions
  const course  = session?.courses

  return (
    <div className={`${styles.savedCard} ${word.user_edited ? styles.savedCardEdited : ''}`}>
      <div className={styles.savedCardHeader}>
        {word.item_type && (
          <span className={`${styles.typeBadge} ${styles[`type_${word.item_type}`]}`}>
            {word.item_type === 'term' ? 'TERM' : 'PHRASE'}
          </span>
        )}
        <div className={styles.savedCardTitle}>
          <span className={styles.english}>{word.word}</span>
          {word.abbreviation && <span className={styles.abbreviation}> ({word.abbreviation})</span>}
          {word.chinese && <span className={styles.chinese}>{word.chinese}</span>}
        </div>
        <div className={styles.savedCardMeta}>
          {course && <span className={styles.courseBadge}>{course.course_code}</span>}
          {session && (
            <span className={styles.sessionBadge}>
              {session.session_number ? `S${session.session_number}` : 'Session'}
              {session.class_date ? ` · ${formatDate(session.class_date)}` : ''}
            </span>
          )}
          {src && (
            <span className={`${styles.sourceBadge} ${styles[`source_${src.mod}`]}`}>{src.text}</span>
          )}
          {word.user_edited && <span className={styles.editedBadge}>Edited</span>}
        </div>
        <div className={styles.savedCardActions}>
          <button className={styles.btnLink} onClick={() => setExpanded(e => !e)}
            aria-expanded={expanded}>{expanded ? 'Less' : 'More'}</button>
          <button className={styles.btnLink} onClick={startEdit} disabled={saving}>Edit</button>
          <button className={`${styles.btnLink} ${styles.btnDangerLink}`}
            disabled={saving} onClick={() => onDelete(word.id, word.word)}>Delete</button>
        </div>
      </div>

      {/* Compact summary always visible */}
      <p className={styles.savedCardSummary}>
        {word.definition}
      </p>

      {expanded && !editing && (
        <div className={styles.savedCardDetail}>
          {word.item_type && <p className={styles.aiNote}>Explanations, translations and examples are AI-generated study aids. Cross-check with your course materials.</p>}
          {word.zh_explanation && (
            <p className={styles.savedField}><strong>Chinese explanation:</strong> {word.zh_explanation}</p>
          )}
          {word.course_context && (
            <p className={styles.savedField}><strong>Course context:</strong> {word.course_context}</p>
          )}
          {word.en_example && (
            <p className={styles.savedField}><strong>Example:</strong> {word.en_example}</p>
          )}
          {word.zh_example && (
            <p className={styles.savedField}><strong>Chinese example:</strong> {word.zh_example}</p>
          )}
          {word.source_excerpt && (
            <div className={styles.sourceExcerpt}>
              <span className={styles.sourceExcerptLabel}>Source excerpt:</span>
              <blockquote className={styles.sourceExcerptText}>"{word.source_excerpt}"</blockquote>
            </div>
          )}
          {word.source_material_name && (
            <p className={styles.savedMeta}>Material: {word.source_material_name}</p>
          )}
          {!word.source_excerpt && word.source_note === 'ai_generated' && (
            <p className={styles.aiNote}>⚠️ AI-generated content — not from source material</p>
          )}
        </div>
      )}

      {editing && draft && (
        <fieldset className={`${styles.editForm} ${styles.candidateControls}`} disabled={saving}>
          <FieldRow label="English term">
            <input className={styles.fieldInput} value={draft.word}
              onChange={e => setDraft(d => ({ ...d, word: e.target.value }))} />
          </FieldRow>
          <FieldRow label="Chinese Translation">
            <input className={styles.fieldInput} value={draft.chinese}
              onChange={e => setDraft(d => ({ ...d, chinese: e.target.value }))} />
          </FieldRow>
          <FieldRow label="English definition">
            <textarea className={styles.fieldTextarea} rows={2} value={draft.definition}
              onChange={e => setDraft(d => ({ ...d, definition: e.target.value }))} />
          </FieldRow>
          <FieldRow label="Chinese Explanation">
            <textarea className={styles.fieldTextarea} rows={2} value={draft.zh_explanation}
              onChange={e => setDraft(d => ({ ...d, zh_explanation: e.target.value }))} />
          </FieldRow>
          <FieldRow label="Course context">
            <textarea className={styles.fieldTextarea} rows={2} value={draft.course_context}
              onChange={e => setDraft(d => ({ ...d, course_context: e.target.value }))} />
          </FieldRow>
          <FieldRow label="English example">
            <textarea className={styles.fieldTextarea} value={draft.en_example}
              onChange={e => setDraft(d => ({ ...d, en_example: e.target.value }))} />
          </FieldRow>
          <FieldRow label="Chinese Example">
            <textarea className={styles.fieldTextarea} value={draft.zh_example}
              onChange={e => setDraft(d => ({ ...d, zh_example: e.target.value }))} />
          </FieldRow>
          {saveErr && <p className={styles.fieldError}>{saveErr}</p>}
          <div className={styles.editFormActions}>
            <button className={styles.btnPrimary} onClick={commitEdit} disabled={saving}>
              {saving ? 'Saving…' : 'Save changes'}
            </button>
            <button className={styles.btnSecondary} onClick={() => { setEditing(false); setDraft(null) }}
              disabled={saving}>Cancel</button>
          </div>
        </fieldset>
      )}
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────

export default function Vocabulary() {
  const { user } = useAuth()
  return <VocabularyWorkspace key={user?.id ?? 'signed-out'} />
}

function VocabularyWorkspace() {
  const { user, session: authSession } = useAuth()

  // ── Active tab ──
  const [activeTab, setActiveTab] = useState('study')

  // ── EXTRACT TAB STATE ──────────────────────────────────────────────────
  const [courseLabel, setCourseLabel] = useState('')
  const [materialText, setMaterialText] = useState('')
  const [materialName, setMaterialName] = useState('')

  const [extracting, setExtracting]     = useState(false)
  const [extractError, setExtractError] = useState(null)
  const [extractInfo, setExtractInfo]   = useState(null)

  const [candidates, setCandidates] = useState(null)
  const [checked, setChecked]       = useState(new Set())

  const [confirmReExtract, setConfirmReExtract] = useState(false)
  const extractingRef = useRef(false)

  // ── Save state ──
  const [selectedCourseId, setSelectedCourseId] = useState('')
  const [selectedSessionId, setSelectedSessionId] = useState('')
  const [courses, setCourses]   = useState([])
  const [sessions, setSessions] = useState([])
  const [saving, setSaving]     = useState(false)
  const [saveResult, setSaveResult] = useState(null)  // { saved, skipped, errors }
  const savingRef = useRef(false)
  const [courseError, setCourseError] = useState(null)

  // New course/session creation inline
  const [newCourseCode, setNewCourseCode]   = useState('')
  const [newCourseName, setNewCourseName]   = useState('')
  const [creatingCourse, setCreatingCourse] = useState(false)
  const [showNewCourse, setShowNewCourse]   = useState(false)
  const [newSessionTitle, setNewSessionTitle] = useState('')
  const [newSessionNum, setNewSessionNum]   = useState('')
  const [newSessionDate, setNewSessionDate] = useState('')
  const [creatingSession, setCreatingSession] = useState(false)
  const [showNewSession, setShowNewSession] = useState(false)

  // ── LIBRARY TAB STATE ──────────────────────────────────────────────────
  const [libWords, setLibWords]     = useState([])
  const [libLoading, setLibLoading] = useState(false)
  const [libError, setLibError]     = useState(null)
  const [libFilter, setLibFilter]   = useState({ itemType: '', sessionId: '' })
  const [libSessions, setLibSessions] = useState([])
  const [deleteConfirm, setDeleteConfirm] = useState(null) // { id, word }
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState(null)
  const libraryRequest = useRef(0)

  // ── COURSES TAB STATE ──────────────────────────────────────────────────
  const [coursesData, setCoursesData]       = useState([])
  const [coursesLoading, setCoursesLoading] = useState(false)
  const [coursesError, setCoursesError]     = useState(null)
  const [expandedCourse, setExpandedCourse] = useState(null)
  const [courseSessionsMap, setCourseSessionsMap] = useState({})

  // ── Load courses (shared between extract + courses tabs) ──
  const loadCourses = useCallback(async () => {
    if (!user) return
    try {
    const { data, error } = await getCourses(user.id)
    if (error) throw error
    if (!error && data) {
      setCourses(data)
      setCoursesData(data)
    }
    } catch {
      setCourseError('Could not load your courses. Your material is still here; try again or contact the project owner.')
    }
  }, [user])

  useEffect(() => {
    if (user) loadCourses()
  }, [user, loadCourses])

  // Load sessions when a course is selected in Extract tab
  useEffect(() => {
    let cancelled = false
    setSessions([])
    setSelectedSessionId('')
    if (!selectedCourseId) return
    getSessions(selectedCourseId).then(({ data, error }) => {
      if (cancelled) return
      if (error) setCourseError('Could not load the sessions for this course. Please try again.')
      else setSessions(data ?? [])
    }).catch(() => {
      if (!cancelled) setCourseError('Could not load sessions. Please check your connection.')
    })
    return () => { cancelled = true }
  }, [selectedCourseId])

  // ── EXTRACT TAB — handlers ─────────────────────────────────────────────

  const doExtract = useCallback(async () => {
    if (extractingRef.current) return
    extractingRef.current = true
    setExtracting(true)
    setExtractError(null)
    setExtractInfo(null)
    setConfirmReExtract(false)
    setSaveResult(null)

    try {
      const text = materialText.trim()
      if (!text) { setExtractError('Please paste your course material text first.'); return }
      if (text.length > MAX_INPUT_CHARS) {
        setExtractError(`Text is too long (${text.length.toLocaleString()} chars). Limit: ${MAX_INPUT_CHARS.toLocaleString()}.`)
        return
      }
      const jwt = authSession?.access_token
      if (!jwt) { setExtractError('You are not signed in. Please refresh and sign in again.'); return }

      let resp, data
      try {
        const result = await requestJson(EXTRACT_ENDPOINT, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${jwt}` },
          body: JSON.stringify({ text, courseName: courseLabel.trim() || undefined }),
        })
        resp = result.response
        data = result.data
      } catch (networkErr) {
        setExtractError(`Network error: ${networkErr.message}. Check your connection and try again.`)
        return
      }

      if (!resp.ok) { setExtractError(data?.error ?? `Server error (HTTP ${resp.status}).`); return }

      const rawItems = Array.isArray(data.items) ? data.items : []
      if (rawItems.length === 0) {
        setExtractError('No terms or phrases were found. Try adding more content.')
        setCandidates([]); setChecked(new Set()); return
      }

      const items = attachIds(rawItems)
      setCandidates(items)
      setChecked(new Set(items.map(item => item._id)))
      setExtractInfo({ model: data.model ?? 'unknown', inputChars: data.inputChars ?? text.length, tokensUsed: data.tokensUsed ?? null })
    } finally {
      setExtracting(false)
      extractingRef.current = false
    }
  }, [materialText, courseLabel, authSession])

  function handleExtractClick() {
    if (candidates !== null && candidates.length > 0) { setConfirmReExtract(true); return }
    doExtract()
  }

  function handleEdit(id, field, value) {
    // Mark the candidate as user-edited so saveVocabItems stores user_edited:true.
    setCandidates(prev => editCandidate(prev, id, field, value))
  }

  function handleToggle(id) {
    setChecked(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  // ── EXTRACT TAB — course/session creation ────────────────────────────

  async function handleCreateCourse() {
    if (!newCourseCode.trim() || !user || creatingCourse) return
    setCreatingCourse(true)
    setCourseError(null)
    try {
    const { data, error } = await createCourse(user.id, {
      course_code: newCourseCode.trim(),
      course_name: newCourseName.trim() || null,
    })
    if (error) throw error
    if (!error && data) {
      await loadCourses()
      setSelectedCourseId(data.id)
      setNewCourseCode(''); setNewCourseName(''); setShowNewCourse(false)
    }
    } catch {
      setCourseError('Could not create the course. Your entries are preserved; check your connection and try again.')
    } finally { setCreatingCourse(false) }
  }

  async function handleCreateSession() {
    if (!selectedCourseId || !user || creatingSession) return
    if (newSessionNum && (!Number.isInteger(Number(newSessionNum)) || Number(newSessionNum) < 1)) {
      setCourseError('Session number must be a positive whole number.'); return
    }
    setCreatingSession(true)
    setCourseError(null)
    try {
    const { data, error } = await createSession(user.id, selectedCourseId, {
      session_number: newSessionNum ? parseInt(newSessionNum, 10) : null,
      session_title:  newSessionTitle.trim() || null,
      class_date:     newSessionDate || null,  // user must type explicitly; never inferred
    })
    if (error) throw error
    if (!error && data) {
      const { data: s } = await getSessions(selectedCourseId)
      if (s) setSessions(s)
      setSelectedSessionId(data.id)
      setNewSessionNum(''); setNewSessionTitle(''); setNewSessionDate(''); setShowNewSession(false)
    }
    } catch {
      setCourseError('Could not create the session. Your entries are preserved; check your connection and try again.')
    } finally { setCreatingSession(false) }
  }

  // ── EXTRACT TAB — save ────────────────────────────────────────────────

  async function handleSave() {
    if (!user || savingRef.current) return
    if (selectedCourseId && !selectedSessionId) {
      setCourseError('Choose or create a session to link these words to your course, or select “No course”.')
      return
    }
    const selectedItems = candidates.filter(c => !c._saved && checked.has(c._id))
    if (selectedItems.length === 0) return

    setSaving(true)
    savingRef.current = true
    setSaveResult(null)

    let result
    try {
      result = await saveVocabItems(
        user.id,
        selectedSessionId || null,
        materialName.trim() || null,
        selectedItems,
      )
    } catch (err) {
      result = { saved: 0, skipped: 0, errors: selectedItems.map(c => ({ id: c._id, word: c.english, error: err.message })) }
    } finally {
      // Always re-enable the button, even if saveVocabItems throws unexpectedly.
      setSaving(false)
      savingRef.current = false
    }

    setSaveResult(result)

    setChecked(remainingSelection(checked, result))
    const storedIds = new Set((result.results ?? []).filter(item => item.status !== 'failed').map(item => item.id))
    setCandidates(prev => prev.map(item => storedIds.has(item._id) ? { ...item, _saved: true } : item))
  }

  // ── LIBRARY TAB — load ────────────────────────────────────────────────

  async function loadLibrary() {
    if (!user) return
    const request = ++libraryRequest.current
    setLibLoading(true)
    setLibError(null)
    try {
    const filters = {}
    if (libFilter.itemType) filters.itemType = libFilter.itemType
    if (libFilter.sessionId) filters.sessionId = libFilter.sessionId
    const [{ data, error }, classes] = await Promise.all([getFullVocabulary(user.id, filters), getStudySessions(user.id)])
    if (request !== libraryRequest.current) return
    if (error) throw error
    else setLibWords(data ?? [])
    if (!classes.error) setLibSessions(classes.data ?? [])
    } catch (error) {
      if (request === libraryRequest.current) setLibError(error.message || 'Check your connection and try again.')
    } finally {
      if (request === libraryRequest.current) setLibLoading(false)
    }
  }

  useEffect(() => {
    if (activeTab === 'library') loadLibrary()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, libFilter, user])

  async function handleLibEdit(wordId, updates) {
    const { error } = await editVocabWord(wordId, updates)
    if (!error) await loadLibrary()
    return { error }
  }

  async function handleLibDelete(wordId) {
    if (deleting) return
    setDeleting(true)
    setDeleteError(null)
    try {
    const { error } = await deleteVocabWord(wordId)
    if (error) throw error
    if (!error) { setDeleteConfirm(null); await loadLibrary() }
    } catch {
      setDeleteError('Could not delete this item. Please try again.')
    } finally { setDeleting(false) }
  }

  // ── COURSES TAB ───────────────────────────────────────────────────────

  async function loadCoursesTab() {
    if (!user) return
    setCoursesLoading(true)
    setCoursesError(null)
    try {
    const { data, error } = await getCourses(user.id)
    if (error) throw error
    else { setCoursesData(data ?? []) }
    } catch (error) {
      setCoursesError(error.message || 'Check your connection and try again.')
    } finally { setCoursesLoading(false) }
  }

  useEffect(() => {
    if (activeTab === 'courses') loadCoursesTab()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, user])

  async function handleExpandCourse(courseId) {
    if (expandedCourse === courseId) { setExpandedCourse(null); return }
    setExpandedCourse(courseId)
    if (!courseSessionsMap[courseId]) {
      try {
      const { data, error } = await getSessions(courseId)
      if (error) throw error
      setCourseSessionsMap(m => ({ ...m, [courseId]: data ?? [] }))
      } catch { setCoursesError('Could not load sessions. Please try again.') }
    }
  }

  // ── Derived values ────────────────────────────────────────────────────

  const selectedCount  = checked.size
  const termCount      = candidates?.filter(c => c.item_type === 'term').length   ?? 0
  const phraseCount    = candidates?.filter(c => c.item_type === 'phrase').length ?? 0
  const charCount      = materialText.length
  const charOverLimit  = charCount > MAX_INPUT_CHARS

  const saveButtonLabel = saving
    ? 'Saving…'
    : `Save ${selectedCount} to Vocabulary Library`

  // ── Render ────────────────────────────────────────────────────────────

  return (
    <div className={styles.page}>
      <div className={styles.pageHeader}>
        <h1 className={styles.pageTitle}>📚 Vocabulary</h1>
        <p className={styles.pageSubtitle}>Build your bilingual academic vocabulary, one course at a time.</p>
      </div>

      {/* ── Tabs ── */}
      <div className={styles.tabs} role="tablist">
        {[
          { id: 'study', label: 'Today' },
          { id: 'extract', label: '✨ Extract' },
          { id: 'library', label: '📖 My Library' },
          { id: 'courses', label: '🎓 Courses' },
        ].map(tab => (
          <button
            key={tab.id}
            role="tab"
            aria-selected={activeTab === tab.id}
            className={`${styles.tab} ${activeTab === tab.id ? styles.tabActive : ''}`}
            onClick={() => setActiveTab(tab.id)}
            disabled={saving || extracting}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'study' && <VocabularyStudy userId={user?.id} onExtract={() => setActiveTab('extract')} />}

      {/* ══════════════════════════════════════════════════════════════
          TAB 1 — EXTRACT
      ══════════════════════════════════════════════════════════════ */}
      {activeTab === 'extract' && (
        <div>
          {/* Input panel */}
          <section className={styles.inputPanel}>
            <div className={styles.inputRow}>
              <label className={styles.inputLabel} htmlFor="course-label">
                Course / Session hint <span className={styles.optional}>(helps the AI)</span>
              </label>
              <input id="course-label" className={styles.textInput} type="text"
                value={courseLabel} onChange={e => setCourseLabel(e.target.value)}
                placeholder="e.g. MGMT 8710 · Session 3" maxLength={100} disabled={extracting} />
            </div>
            <div className={styles.inputRow}>
              <label className={styles.inputLabel} htmlFor="material-name">
                Material name <span className={styles.optional}>(optional label for source tracking)</span>
              </label>
              <input id="material-name" className={styles.textInput} type="text"
                value={materialName} onChange={e => setMaterialName(e.target.value)}
                placeholder="e.g. Session 3 lecture slides" maxLength={100} disabled={extracting} />
            </div>
            <div className={styles.inputRow}>
              <label className={styles.inputLabel} htmlFor="material-text">
                Course material
                <span className={`${styles.charCount} ${charOverLimit ? styles.charOver : ''}`}>
                  {charCount.toLocaleString()} / {MAX_INPUT_CHARS.toLocaleString()}
                </span>
              </label>
              <textarea id="material-text" className={`${styles.textareaInput} ${charOverLimit ? styles.textareaOver : ''}`}
                value={materialText} onChange={e => setMaterialText(e.target.value)}
                placeholder="Paste lecture notes, slides text, readings…" rows={9}
                disabled={extracting}
                aria-describedby={charOverLimit ? 'char-error' : undefined} />
              {charOverLimit && (
                <p id="char-error" className={styles.fieldError} role="alert">
                  Text exceeds the {MAX_INPUT_CHARS.toLocaleString()}-character limit.
                </p>
              )}
            </div>

            {confirmReExtract && (
              <div className={styles.confirmBox} role="alertdialog">
                <p className={styles.confirmMsg}>
                  You have <strong>{candidates.length}</strong> existing candidate{candidates.length !== 1 ? 's' : ''}.
                  Re-extracting will replace them. Any edits will be lost.
                </p>
                <div className={styles.confirmBtns}>
                  <button className={styles.btnDanger} onClick={doExtract}>Yes, replace</button>
                  <button className={styles.btnSecondary} onClick={() => setConfirmReExtract(false)}>Cancel</button>
                </div>
              </div>
            )}

            <div className={styles.extractRow}>
              <button className={styles.btnPrimary} onClick={handleExtractClick}
                disabled={extracting || charOverLimit || !materialText.trim()} aria-busy={extracting}>
                {extracting ? '⏳ Extracting…' : '✨ Extract Terms & Phrases'}
              </button>
              {extracting && <span className={styles.extractingNote}>Sending to Gemini AI — up to 30 seconds…</span>}
            </div>

            {extractError && !extracting && <StatusBanner message={extractError} variant="error" />}
          </section>

          {/* Candidate results */}
          {candidates !== null && !extracting && (
            <section className={styles.resultsPanel}>
              {extractInfo && (
                <div className={styles.extractMeta}>
                  <span>Found <strong>{termCount}</strong> term{termCount !== 1 ? 's' : ''} and{' '}
                    <strong>{phraseCount}</strong> phrase{phraseCount !== 1 ? 's' : ''}</span>
                </div>
              )}

              {/* Unsaved warning */}
              {candidates.some(item => !item._saved) && <div className={styles.unsavedBanner} role="note">
                ⚠️ <strong>{candidates.filter(item => !item._saved).length} item{candidates.filter(item => !item._saved).length !== 1 ? 's' : ''} not yet saved — they will be lost if you refresh.</strong>
                {' '}Select a course and session below, then click Save.
              </div>}

              {candidates.length > 0 && (
                <>
                  {/* Selection bar */}
                  <div className={styles.selectionBar}>
                    <span className={styles.selectionCount}>{selectedCount} of {candidates.length} selected</span>
                    <button className={styles.btnLink}
                      disabled={saving}
                      onClick={() => setChecked(new Set(candidates.filter(c => !c._saved).map(c => c._id)))}>Select all</button>
                    <button className={styles.btnLink} disabled={saving} onClick={() => setChecked(new Set())}>Deselect all</button>
                  </div>

                  {/* Candidate cards */}
                  <ul className={styles.candidateList}>
                    {candidates.map(item => (
                      <li key={item._id} className={styles.candidateItem}>
                        <CandidateCard
                          item={item}
                          checked={checked.has(item._id)}
                          onToggle={() => handleToggle(item._id)}
                          onEdit={(field, value) => handleEdit(item._id, field, value)}
                          busy={saving}
                        />
                      </li>
                    ))}
                  </ul>
                </>
              )}

              {candidates.length === 0 && (
                <div className={styles.emptyResult}>
                  <p>No terms or phrases were extracted from this material.</p>
                </div>
              )}

              {/* ── Course/session selector for saving ── */}
              {candidates.length > 0 && (
                <div className={styles.savePanel}>
                  <h3 className={styles.savePanelTitle}>Save selected items to your vocabulary library</h3>
                  {courseError && <StatusBanner message={courseError} variant="error" />}

                  <div className={styles.saveRow}>
                    <label className={styles.inputLabel} htmlFor="select-course">Course</label>
                    <div className={styles.selectWithAction}>
                      <select id="select-course" className={styles.selectInput}
                        value={selectedCourseId} onChange={e => setSelectedCourseId(e.target.value)}
                        disabled={saving}>
                        <option value="">— No course selected (save without course) —</option>
                        {courses.map(c => (
                          <option key={c.id} value={c.id}>
                            {c.course_code}{c.course_name ? ` · ${c.course_name}` : ''}
                          </option>
                        ))}
                      </select>
                      <button className={styles.btnSecondary} onClick={() => setShowNewCourse(v => !v)}
                        disabled={saving} type="button">
                        {showNewCourse ? 'Cancel' : '+ New course'}
                      </button>
                    </div>
                  </div>

                  {showNewCourse && (
                    <div className={styles.inlineCreate}>
                      <input className={styles.textInput} placeholder="Course code e.g. MGMT 8710"
                        aria-label="Course code" disabled={creatingCourse || saving}
                        value={newCourseCode} onChange={e => setNewCourseCode(e.target.value)} maxLength={30} />
                      <input className={styles.textInput} placeholder="Course name (optional)"
                        aria-label="Course name" disabled={creatingCourse || saving}
                        value={newCourseName} onChange={e => setNewCourseName(e.target.value)} maxLength={100} />
                      <button className={styles.btnPrimary} onClick={handleCreateCourse}
                        disabled={!newCourseCode.trim() || creatingCourse}>
                        {creatingCourse ? 'Creating…' : 'Create course'}
                      </button>
                    </div>
                  )}

                  {selectedCourseId && (
                    <div className={styles.saveRow}>
                      <label className={styles.inputLabel} htmlFor="select-session">Session</label>
                      <div className={styles.selectWithAction}>
                        <select id="select-session" className={styles.selectInput}
                          value={selectedSessionId} onChange={e => setSelectedSessionId(e.target.value)}
                          disabled={saving}>
                          <option value="">— No session selected —</option>
                          {sessions.map(s => (
                            <option key={s.id} value={s.id}>
                              {s.session_number ? `Session ${s.session_number}` : 'Session'}{s.session_title ? ` · ${s.session_title}` : ''}
                              {s.class_date ? ` (${formatDate(s.class_date)})` : ' (Unscheduled)'}
                            </option>
                          ))}
                        </select>
                        <button className={styles.btnSecondary} onClick={() => setShowNewSession(v => !v)}
                          disabled={saving} type="button">
                          {showNewSession ? 'Cancel' : '+ New session'}
                        </button>
                      </div>
                    </div>
                  )}

                  {showNewSession && selectedCourseId && (
                    <div className={styles.inlineCreate}>
                      <input className={styles.textInput} type="number" placeholder="Session number e.g. 3"
                        aria-label="Session number" disabled={creatingSession || saving}
                        value={newSessionNum} onChange={e => setNewSessionNum(e.target.value)} min={1} max={999} />
                      <input className={styles.textInput} placeholder="Session title (optional)"
                        aria-label="Session title" disabled={creatingSession || saving}
                        value={newSessionTitle} onChange={e => setNewSessionTitle(e.target.value)} maxLength={100} />
                      <div className={styles.inlineDateRow}>
                        <label className={styles.fieldLabel} htmlFor="new-class-date">Class date (confirmed by you — not inferred)</label>
                        <input id="new-class-date" className={styles.textInput} type="date" value={newSessionDate}
                          disabled={creatingSession || saving}
                          onChange={e => setNewSessionDate(e.target.value)} />
                      </div>
                      <button className={styles.btnPrimary} onClick={handleCreateSession}
                        disabled={creatingSession}>
                        {creatingSession ? 'Creating…' : 'Create session'}
                      </button>
                    </div>
                  )}

                  {/* Save result feedback */}
                  {saveResult && (
                    <div className={`${styles.statusBanner} ${saveResult.errors.length === 0 ? styles.banner_success : styles.banner_warning}`} role="status">
                      {saveResult.errors.length === 0 ? (
                        <>
                          ✅ Saved {saveResult.saved} item{saveResult.saved !== 1 ? 's' : ''}.
                          {saveResult.skipped > 0 && ` ${saveResult.skipped} already existed and were skipped.`}
                          {' '}<button className={styles.btnLink} onClick={() => setActiveTab('library')}>
                            View my library →
                          </button>
                        </>
                      ) : (
                        <>
                          ⚠️ Saved {saveResult.saved}, skipped {saveResult.skipped}, failed {saveResult.errors.length}.
                          Failed: {saveResult.errors.map(e => e.word).join(', ')}.
                          <ul>{saveResult.errors.map(error => <li key={error.id}>{error.word}: {error.error}</li>)}</ul>
                          The failed items are still checked above. Your edits are preserved.
                        </>
                      )}
                    </div>
                  )}

                  <div className={styles.actionStrip}>
                    <span className={styles.selectionCount}>
                      {selectedCount} item{selectedCount !== 1 ? 's' : ''} selected
                    </span>
                    <button className={styles.btnPrimary} onClick={handleSave}
                      disabled={saving || selectedCount === 0} aria-busy={saving}>
                      {saveButtonLabel}
                    </button>
                    <span className={styles.saveNote}>
                      {!saving && selectedCount === 0 && 'Select at least one item to save.'}
                    </span>
                  </div>
                </div>
              )}
            </section>
          )}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════
          TAB 2 — MY LIBRARY
      ══════════════════════════════════════════════════════════════ */}
      {activeTab === 'library' && (
        <div>
          <div className={styles.libraryHeader}>
            <div className={styles.filterBar}>
              <select className={styles.filterSelect}
                aria-label="Filter by type"
                value={libFilter.itemType}
                onChange={e => setLibFilter(f => ({ ...f, itemType: e.target.value }))}>
                <option value="">All types</option>
                <option value="term">Terms only</option>
                <option value="phrase">Phrases only</option>
              </select>
              <select className={styles.filterSelect}
                aria-label="Filter by session"
                value={libFilter.sessionId}
                onChange={e => setLibFilter(f => ({ ...f, sessionId: e.target.value }))}>
                <option value="">All sessions</option>
                {libSessions.map(s => (
                  <option key={s.id} value={s.id}>
                    Session {s.session_number}{s.class_date ? ` · ${formatDate(s.class_date)}` : ''}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {libLoading && <p className={styles.loading}>Loading…</p>}
          {libError && <StatusBanner message={`Could not load vocabulary: ${libError}`} variant="error" />}

          {!libLoading && !libError && libWords.length === 0 && (
            <div className={styles.emptyResult}>
              <p>No vocabulary saved yet.</p>
              <p>Use the <button className={styles.btnLink} onClick={() => setActiveTab('extract')}>Extract tab</button> to add words from course material.</p>
            </div>
          )}

          {/* Delete confirmation */}
          {deleteConfirm && (
            <div className={styles.confirmBox} role="alertdialog">
              <p className={styles.confirmMsg}>
                Delete <strong>{deleteConfirm.word}</strong> from your library? This cannot be undone.
              </p>
              <div className={styles.confirmBtns}>
                <button className={styles.btnDanger} disabled={deleting} onClick={() => handleLibDelete(deleteConfirm.id)}>
                  Delete
                </button>
                <button className={styles.btnSecondary} disabled={deleting} onClick={() => setDeleteConfirm(null)}>
                  Cancel
                </button>
              </div>
              {deleteError && <StatusBanner message={deleteError} variant="error" />}
            </div>
          )}

          {!libLoading && !libError && libWords.length > 0 && (
            <>
              <p className={styles.libCount}>
                {libWords.length} item{libWords.length !== 1 ? 's' : ''}
                {libFilter.itemType && ` · ${libFilter.itemType}s only`}
              </p>
              <ul className={styles.savedList}>
                {libWords.map(word => (
                  <li key={word.id} className={styles.savedItem}>
                    <SavedWordCard
                      word={word}
                      onEdit={handleLibEdit}
                      onDelete={(id, w) => setDeleteConfirm({ id, word: w })}
                    />
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════
          TAB 3 — COURSES
      ══════════════════════════════════════════════════════════════ */}
      {activeTab === 'courses' && (
        <div>
          {coursesLoading && <p className={styles.loading}>Loading…</p>}
          {coursesError && <StatusBanner message={`Could not load courses: ${coursesError}`} variant="error" />}

          {!coursesLoading && coursesData.length === 0 && (
            <div className={styles.emptyResult}>
              <p>No courses yet. Create one in the Extract tab when saving your first vocabulary items.</p>
            </div>
          )}

          {coursesData.length > 0 && (
            <ul className={styles.courseList}>
              {coursesData.map(course => (
                <li key={course.id} className={styles.courseItem}>
                  <div className={styles.courseHeader}>
                    <strong className={styles.courseCode}>{course.course_code}</strong>
                    {course.course_name && <span className={styles.courseName}>{course.course_name}</span>}
                    <button className={styles.btnLink} onClick={() => handleExpandCourse(course.id)}>
                      {expandedCourse === course.id ? 'Hide sessions' : 'Show sessions'}
                    </button>
                  </div>
                  {expandedCourse === course.id && (
                    <ul className={styles.sessionList}>
                      {(courseSessionsMap[course.id] ?? []).length === 0 && (
                        <li className={styles.sessionEmpty}>No sessions yet.</li>
                      )}
                      {(courseSessionsMap[course.id] ?? []).map(s => (
                        <li key={s.id} className={styles.sessionItem}>
                          <span className={styles.sessionNum}>
                            {s.session_number ? `Session ${s.session_number}` : 'Session'}
                          </span>
                          {s.session_title && <span className={styles.sessionTitle}>{s.session_title}</span>}
                          <span className={styles.sessionDate}>
                            {s.class_date ? formatDate(s.class_date) : 'Unscheduled'}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
