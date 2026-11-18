import { useCallback, useEffect, useRef, useState } from 'react'
import { getFullVocabulary, getStudySessions, reviewVocabulary } from '../lib/supabaseService.js'
import { buildStudyLists, localDay } from '../lib/vocabStudy.js'
import styles from './VocabularyStudy.module.css'

function sessionName(session) {
  return [session.courses?.course_code, session.session_title || `Session ${session.session_number ?? ''}`].filter(Boolean).join(' · ')
}

export default function VocabularyStudy({ userId, onExtract }) {
  const [words, setWords] = useState([])
  const [sessions, setSessions] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [today, setToday] = useState(localDay)
  const [practice, setPractice] = useState(null)
  const [notice, setNotice] = useState('')
  const request = useRef(0)

  const loadData = useCallback(async () => {
    if (!userId) return
    const id = ++request.current
    try {
      const [vocab, classes] = await Promise.all([getFullVocabulary(userId), getStudySessions(userId)])
      if (id !== request.current) return
      if (vocab.error || classes.error) throw vocab.error || classes.error
      setToday(localDay())
      setError('')
      setWords(vocab.data ?? [])
      setSessions(classes.data ?? [])
    } catch {
      if (id === request.current) setError('Could not load your study data. Please try again. If this keeps happening, ask the project owner to confirm the vocabulary database is set up.')
    } finally {
      if (id === request.current) setLoading(false)
    }
  }, [userId])

  function reload() {
    setLoading(true)
    setError('')
    loadData()
  }

  useEffect(() => {
    loadData()
    const updateDay = () => setToday(localDay())
    const timer = setInterval(updateDay, 60_000)
    window.addEventListener('focus', updateDay)
    // This is a request generation counter, not a rendered DOM node. Bumping
    // its current value invalidates whichever request is active at unmount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    return () => { request.current++; clearInterval(timer); window.removeEventListener('focus', updateDay) }
  }, [loadData])

  const lists = buildStudyLists(words, sessions, today)
  const newPreview = lists.preview.filter(word => word.last_reviewed_on !== today)

  function start(items, mode) {
    setNotice('')
    setPractice({ items: items.slice(0, 10), index: 0, mode })
  }

  function onRated(updated) {
    setWords(previous => previous.map(word => word.id === updated.id ? { ...word, ...updated } : word))
    const nextIndex = practice.index + 1
    if (nextIndex >= practice.items.length) {
      setPractice(null)
      setNotice(`Session complete — ${practice.items.length} item${practice.items.length !== 1 ? 's' : ''} practiced. Progress saved. Next review: ${updated.next_review}.`)
    } else {
      setPractice(previous => ({ ...previous, index: nextIndex }))
    }
  }

  return <section className={styles.study} aria-label="Today's study">
    <div className={styles.heading}>
      <div><h2>Make it part of your day</h2><p>Learn it before class. Use it after class.</p></div>
      <button className={styles.linkButton} disabled={loading || !!practice} onClick={reload}>Refresh</button>
    </div>
    {loading && <p role="status">Loading your courses and review schedule…</p>}
    {error && <p role="alert" className={styles.error}>{error}</p>}
    {notice && <p role="status" className={styles.success}>{notice}</p>}

    {!loading && !error && !practice && <>
      <div className={styles.grid}>
        <article className={styles.panel}>
          <span className={styles.eyebrow}>BEFORE CLASS</span>
          <h3>Prepare for Your Next Class</h3>
          {lists.nextSessions.length ? <>
            <p className={styles.date}>{lists.nextSessions[0].class_date}</p>
            {lists.nextSessions.map(session => <p className={styles.course} key={session.id}>{sessionName(session)}</p>)}
            <p><strong className={styles.count}>{lists.preview.length}</strong> {lists.preview.length === 1 ? 'term or phrase' : 'terms and phrases'}</p>
            <ul className={styles.wordList}>{lists.preview.slice(0, 3).map(word => <li key={word.id}>
              <strong>{word.word}</strong><span>{word.chinese}</span>
            </li>)}</ul>
            {lists.preview.length ? <button className={styles.primary} disabled={!newPreview.length}
              onClick={() => start(newPreview, 'preview')}>
              {newPreview.length ? 'Start Preview · Up to 10 Items' : 'Preview done for today'}
            </button> : <><p>No vocabulary for this session yet. Add course material to get started.</p><button className={styles.primary} onClick={onExtract}>Add Course Materials</button></>}
          </> : <><p>Add course materials and a class date to see vocabulary for your next class.</p><button className={styles.primary} onClick={onExtract}>Add Course Materials</button></>}
        </article>

        <article className={`${styles.panel} ${styles.reviewPanel}`}>
          <span className={styles.eyebrow}>REVIEW</span>
          <h3>Ready for Review</h3>
          <p><strong className={styles.count}>{lists.due.length}</strong> {lists.due.length === 1 ? 'item due for review' : 'items due for review'}</p>
          {lists.due.length ? <>
            <p>Start with the oldest due items. Try to recall the meaning, then use the word in a real context.</p>
            <ul className={styles.wordList}>{lists.due.slice(0, 3).map(word => <li key={word.id}>
              <strong>{word.word}</strong><span>{word.next_review < today ? 'Overdue' : 'Today'} · {word.sessions?.courses?.course_code || 'Personal Library'}</span>
            </li>)}</ul>
            <button className={styles.primary} onClick={() => start(lists.due, 'review')}>Start Review · Up to 10 Items</button>
          </> : <p>Nothing due for review today. Your saved items are always available in My Library.</p>}
        </article>
      </div>
      <p className={styles.scheduleNote}>Scheduled by your device's local date. After previewing before class, the first post-class review is set for the day after the class date. Once recalled, review intervals extend to 1, 3, 7, 14, then 30 days. Ratings of "can't recall" or "not quite" push the next review to tomorrow.</p>
    </>}

    {practice && <PracticeCard key={practice.items[practice.index].id}
      word={practice.items[practice.index]} index={practice.index} total={practice.items.length}
      mode={practice.mode} onRated={onRated} onClose={() => { setPractice(null); reload() }} />}
  </section>
}

function PracticeCard({ word, index, total, mode, onRated, onClose }) {
  const [direction, setDirection] = useState('en-zh')
  const [answer, setAnswer] = useState('')
  const [revealed, setRevealed] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const pending = useRef(null)
  const [pendingRating, setPendingRating] = useState(null)
  const busyRef = useRef(false)

  async function rate(rating) {
    if (busyRef.current) return
    busyRef.current = true
    setBusy(true)
    setError('')
    pending.current ??= { id: crypto.randomUUID(), rating }
    setPendingRating(pending.current.rating)
    try {
      const { data, error: saveError } = await reviewVocabulary(word, pending.current.rating, localDay(), pending.current.id)
      if (saveError) throw saveError
      if (!data?.id) throw new Error('Could not confirm save. Please retry.')
      onRated(data)
    } catch (failure) {
      setError(failure.message || 'Save failed. Your practice is still here — please retry.')
    } finally { busyRef.current = false; setBusy(false) }
  }

  return <article className={styles.practice} aria-label="Vocabulary practice">
    <div className={styles.heading}>
      <p>{mode === 'preview' ? 'Before Class' : 'Review'} · {index + 1} / {total}</p>
      <button className={styles.linkButton} disabled={busy} onClick={onClose}>End session</button>
    </div>
    <label className={styles.direction}>Practice direction
      <select value={direction} disabled={revealed || busy} onChange={event => setDirection(event.target.value)}>
        <option value="en-zh">English → recall meaning</option>
        <option value="zh-en" disabled={!word.chinese}>Chinese translation → English term</option>
      </select>
    </label>
    <span className={styles.eyebrow}>{word.item_type === 'phrase' ? 'PHRASE' : 'TERM'}</span>
    <h3 className={styles.prompt}>{direction === 'en-zh' ? word.word : word.chinese}</h3>
    <label className={styles.answerLabel} htmlFor="practice-answer">Recall the meaning, then write a sentence using it in a class discussion, case analysis, or professional context.</label>
    <textarea id="practice-answer" className={styles.answer} rows={3} value={answer} disabled={busy}
      onChange={event => setAnswer(event.target.value)} placeholder="Write your attempt, or think it through first…" />
    <p className={styles.scheduleNote}>This is self-practice. Your answer is not uploaded or graded. After reviewing the explanation and example, rate your own recall.</p>
    {!revealed ? <button className={styles.primary} onClick={() => setRevealed(true)}>Show Explanation &amp; Example</button> : <>
      <div className={styles.solution}>
        <h4>{word.word}{word.abbreviation ? ` (${word.abbreviation})` : ''}{word.chinese ? ` · ${word.chinese}` : ''}</h4>
        <p>{word.definition}</p>
        {word.zh_explanation && <p>{word.zh_explanation}</p>}
        {word.course_context && <p><strong>Course context:</strong> {word.course_context}</p>}
        {(word.en_example || word.example) && <p><strong>Example:</strong> {word.en_example || word.example}</p>}
        {word.zh_example && <p>{word.zh_example}</p>}
        {word.source_excerpt && <blockquote><strong>Source excerpt:</strong> {word.source_excerpt}</blockquote>}
        {word.item_type && <p className={styles.scheduleNote}>Explanations, translations and examples are AI-generated study aids. Cross-check with your course materials.</p>}
      </div>
      <div className={styles.ratings}>
        {[['again', "Can't recall"], ['hard', 'Not quite'], ['good', 'Can explain and use']].map(([rating, label]) =>
          <button key={rating} disabled={busy || (!!pendingRating && pendingRating !== rating)}
            className={rating === 'good' ? styles.primary : styles.secondary} onClick={() => rate(rating)}>{label}</button>)}
      </div>
      {busy && <p role="status">Saving progress…</p>}
      {error && <div role="alert" className={styles.error}><p>{error}</p><button className={styles.secondary} disabled={busy}
        onClick={() => rate(pendingRating)}>Retry saving this rating</button></div>}
    </>}
  </article>
}
