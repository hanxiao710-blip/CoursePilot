import styles from './Dashboard.module.css'

/* ── Demo data — replace with real data when ready ── */
const DEMO_DEADLINES = [
  { id: 1, course: 'ENGL 101', task: 'Essay draft',          due: 'Nov 15' },
  { id: 2, course: 'HIST 200', task: 'Reading response',     due: 'Nov 17' },
  { id: 3, course: 'MATH 150', task: 'Problem set 4',        due: 'Nov 19' },
]

const DEMO_SUGGESTION = {
  title: 'Review your ENGL 101 notes',
  detail:
    'You have an essay due in 3 days. Spend 20 minutes re-reading your outline and adding examples.',
}

const DEMO_VOCAB = [
  { word: 'Analyze',    definition: 'To examine something carefully and in detail.' },
  { word: 'Summarize',  definition: 'To give a short account of the main points.' },
  { word: 'Evaluate',   definition: 'To judge or assess the value or quality of something.' },
]

export default function Dashboard() {
  return (
    <div className={styles.page}>
      <h1 className={styles.pageTitle}>Welcome back 👋</h1>
      <p className={styles.pageSubtitle}>
        Here is what needs your attention today.
      </p>

      <div className={styles.grid}>

        {/* ── Upcoming deadlines ── */}
        <section className={styles.card}>
          <h2 className={styles.cardTitle}>📅 Upcoming Deadlines</h2>
          <span className={styles.demoTag}>Demo</span>
          <ul className={styles.deadlineList}>
            {DEMO_DEADLINES.map((item) => (
              <li key={item.id} className={styles.deadlineItem}>
                <span className={styles.course}>{item.course}</span>
                <span className={styles.task}>{item.task}</span>
                <span className={styles.due}>Due {item.due}</span>
              </li>
            ))}
          </ul>
        </section>

        {/* ── Study suggestion ── */}
        <section className={styles.card}>
          <h2 className={styles.cardTitle}>💡 Study Suggestion</h2>
          <span className={styles.demoTag}>Demo</span>
          <div className={styles.suggestion}>
            <p className={styles.suggestionTitle}>{DEMO_SUGGESTION.title}</p>
            <p className={styles.suggestionDetail}>{DEMO_SUGGESTION.detail}</p>
          </div>
        </section>

        {/* ── Daily vocabulary ── */}
        <section className={`${styles.card} ${styles.cardWide}`}>
          <h2 className={styles.cardTitle}>📖 Daily Vocabulary</h2>
          <span className={styles.demoTag}>Demo</span>
          <ul className={styles.vocabList}>
            {DEMO_VOCAB.map(({ word, definition }) => (
              <li key={word} className={styles.vocabItem}>
                <span className={styles.vocabWord}>{word}</span>
                <span className={styles.vocabDef}>{definition}</span>
              </li>
            ))}
          </ul>
        </section>

      </div>
    </div>
  )
}
