// Use local calendar dates, never UTC timestamps, for class/review scheduling.
export function localDay(now = new Date()) {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}

export function buildStudyLists(words, sessions, today = localDay()) {
  const upcoming = sessions.filter(session => session.class_date && session.class_date >= today)
    .sort((a, b) => a.class_date.localeCompare(b.class_date) || (a.session_number ?? 0) - (b.session_number ?? 0))
  const nextDay = upcoming[0]?.class_date
  // Include every course on the next teaching date, not an arbitrary first one.
  const nextSessions = upcoming.filter(session => session.class_date === nextDay)
  const sessionIds = new Set(nextSessions.map(session => session.id))
  const preview = words.filter(word => sessionIds.has(word.session_id))
  const due = words.filter(word => {
    if (word.last_reviewed_on === today) return false
    if (word.sessions?.class_date && word.sessions.class_date >= today) return false
    return word.next_review && word.next_review <= today
  }).sort((a, b) => a.next_review.localeCompare(b.next_review) || a.word.localeCompare(b.word))
  return { nextSessions, preview, due }
}
