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
      if (id === request.current) setError('暂时无法读取学习记录。请重试；若首次使用仍失败，请联系项目负责人确认词汇数据库已配置。')
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
      setNotice(`已完成 ${practice.items.length} 项练习，进度已保存。下次复习：${updated.next_review}。`)
    } else {
      setPractice(previous => ({ ...previous, index: nextIndex }))
    }
  }

  return <section className={styles.study} aria-label="今日学习">
    <div className={styles.heading}>
      <div><h2>Make it part of your day</h2><p>课前认识它，课后说得出来。</p></div>
      <button className={styles.linkButton} disabled={loading || !!practice} onClick={reload}>刷新</button>
    </div>
    {loading && <p role="status">正在读取课程和复习进度…</p>}
    {error && <p role="alert" className={styles.error}>{error}</p>}
    {notice && <p role="status" className={styles.success}>{notice}</p>}

    {!loading && !error && !practice && <>
      <div className={styles.grid}>
        <article className={styles.panel}>
          <span className={styles.eyebrow}>BEFORE CLASS · 课前预习</span>
          <h3>下一节课先认识什么</h3>
          {lists.nextSessions.length ? <>
            <p className={styles.date}>{lists.nextSessions[0].class_date}</p>
            {lists.nextSessions.map(session => <p className={styles.course} key={session.id}>{sessionName(session)}</p>)}
            <p><strong className={styles.count}>{lists.preview.length}</strong> 个术语与表达</p>
            <ul className={styles.wordList}>{lists.preview.slice(0, 3).map(word => <li key={word.id}>
              <strong>{word.word}</strong><span>{word.chinese}</span>
            </li>)}</ul>
            {lists.preview.length ? <button className={styles.primary} disabled={!newPreview.length}
              onClick={() => start(newPreview, 'preview')}>
              {newPreview.length ? '开始预习 · 最多 10 项' : '今日预习已完成'}
            </button> : <><p>这次课还没有词汇，添加材料后即可开始。</p><button className={styles.primary} onClick={onExtract}>添加课程材料</button></>}
          </> : <><p>添加课程材料并填写课次日期，这里会显示最近一次课的词汇。</p><button className={styles.primary} onClick={onExtract}>添加课程材料</button></>}
        </article>

        <article className={`${styles.panel} ${styles.reviewPanel}`}>
          <span className={styles.eyebrow}>REVISIT · 到期复习</span>
          <h3>哪些表达该再练一次</h3>
          <p><strong className={styles.count}>{lists.due.length}</strong> 项待复习</p>
          {lists.due.length ? <>
            <p>先复习最早到期的内容。尝试回忆意思，并在一个真实场景中用出来。</p>
            <ul className={styles.wordList}>{lists.due.slice(0, 3).map(word => <li key={word.id}>
              <strong>{word.word}</strong><span>{word.next_review < today ? '已到期' : '今天'} · {word.sessions?.courses?.course_code || '个人词库'}</span>
            </li>)}</ul>
            <button className={styles.primary} onClick={() => start(lists.due, 'review')}>开始复习 · 最多 10 项</button>
          </> : <p>今天没有到期的复习。已保存的内容可随时在 My Library 查看。</p>}
        </article>
      </div>
      <p className={styles.scheduleNote}>按设备当地日期安排。课前练习后，首次复习安排在课次日期的次日；记住后逐步间隔 1、3、7、14、30 天，想不起来或不熟悉则明天再练。</p>
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
      if (!data?.id) throw new Error('无法确认保存结果，请重试。')
      onRated(data)
    } catch (failure) {
      setError(failure.message || '保存失败，你的练习仍保留在这里。请重试。')
    } finally { busyRef.current = false; setBusy(false) }
  }

  return <article className={styles.practice} aria-label="词汇练习">
    <div className={styles.heading}>
      <p>{mode === 'preview' ? '课前预习' : '到期复习'} · {index + 1} / {total}</p>
      <button className={styles.linkButton} disabled={busy} onClick={onClose}>结束本轮</button>
    </div>
    <label className={styles.direction}>练习方向
      <select value={direction} disabled={revealed || busy} onChange={event => setDirection(event.target.value)}>
        <option value="en-zh">英文 → 回忆含义</option>
        <option value="zh-en" disabled={!word.chinese}>中文 → 英文表达</option>
      </select>
    </label>
    <span className={styles.eyebrow}>{word.item_type === 'phrase' ? 'PHRASE · 场景表达' : 'TERM · 专业术语'}</span>
    <h3 className={styles.prompt}>{direction === 'en-zh' ? word.word : word.chinese}</h3>
    <label className={styles.answerLabel} htmlFor="practice-answer">先回忆含义，再用它写一句课堂讨论、案例分析或工作场景中的表达。</label>
    <textarea id="practice-answer" className={styles.answer} rows={3} value={answer} disabled={busy}
      onChange={event => setAnswer(event.target.value)} placeholder="写下你的尝试，或先在心里说出来…" />
    <p className={styles.scheduleNote}>这是自我练习，答案不上传、不自动评分。对照解释与例句后，由你判断掌握程度。</p>
    {!revealed ? <button className={styles.primary} onClick={() => setRevealed(true)}>查看双语解释与例句</button> : <>
      <div className={styles.solution}>
        <h4>{word.word}{word.abbreviation ? ` (${word.abbreviation})` : ''} · {word.chinese || '暂无中文释义'}</h4>
        <p>{word.definition}</p>
        {word.zh_explanation && <p>{word.zh_explanation}</p>}
        {word.course_context && <p><strong>课程语境：</strong>{word.course_context}</p>}
        {(word.en_example || word.example) && <p><strong>Example:</strong> {word.en_example || word.example}</p>}
        {word.zh_example && <p>{word.zh_example}</p>}
        {word.source_excerpt && <blockquote><strong>原文证据：</strong>{word.source_excerpt}</blockquote>}
        {word.item_type && <p className={styles.scheduleNote}>解释、翻译与例句为 AI 学习辅助，请结合课程材料核对。</p>}
      </div>
      <div className={styles.ratings}>
        {[['again', '想不起来'], ['hard', '还不熟悉'], ['good', '能够解释并使用']].map(([rating, label]) =>
          <button key={rating} disabled={busy || (!!pendingRating && pendingRating !== rating)}
            className={rating === 'good' ? styles.primary : styles.secondary} onClick={() => rate(rating)}>{label}</button>)}
      </div>
      {busy && <p role="status">正在保存学习进度…</p>}
      {error && <div role="alert" className={styles.error}><p>{error}</p><button className={styles.secondary} disabled={busy}
        onClick={() => rate(pendingRating)}>重试保存本次评价</button></div>}
    </>}
  </article>
}
