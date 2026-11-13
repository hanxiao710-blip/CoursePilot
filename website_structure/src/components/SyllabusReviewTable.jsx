import { useState, useId } from 'react'
import styles from './SyllabusReviewTable.module.css'

/**
 * SyllabusReviewTable
 *
 * Displays extracted assignments in an editable table.
 * Users can select/deselect rows, edit titles/courses/deadlines,
 * remove rows, and then confirm the import.
 *
 * Props
 *   extracted   – array of ExtractedAssignment from syllabusAnalysis.js
 *   onImport(rows) – called with { course, title, deadline } rows to save
 *   onBack()    – go back to the input step
 *   onClose()   – close the whole panel
 */
export default function SyllabusReviewTable({ extracted, onImport, onBack, onClose }) {
  const baseId = useId()

  // Build editable rows: add a `selected` flag and a stable `_key`
  const [rows, setRows] = useState(() =>
    extracted.map((item, i) => ({
      _key:         `${baseId}-${i}`,
      selected:     item.confidence !== 'ambiguous' && item.deadline !== null,
      title:        item.title        ?? '',
      course:       item.course       ?? '',
      deadline:     item.deadline     ?? '',
      event_type:   item.event_type   ?? 'assignment',
      source_excerpt: item.source_excerpt ?? '',
      confidence:   item.confidence   ?? 'medium',
      notes:        item.notes        ?? '',
    }))
  )

  const [importing, setImporting] = useState(false)
  const [importError, setImportError] = useState(null)
  const [showSource, setShowSource] = useState(false)

  // ── Selection helpers ──
  const selectedCount = rows.filter(r => r.selected).length
  const allSelected   = rows.length > 0 && rows.every(r => r.selected)
  const someSelected  = rows.some(r => r.selected)

  function toggleAll() {
    setRows(prev => prev.map(r => ({ ...r, selected: !allSelected })))
  }

  function toggleRow(key) {
    setRows(prev => prev.map(r => r._key === key ? { ...r, selected: !r.selected } : r))
  }

  function updateField(key, field, value) {
    setRows(prev => prev.map(r => r._key === key ? { ...r, [field]: value } : r))
  }

  function removeRow(key) {
    setRows(prev => prev.filter(r => r._key !== key))
  }

  // ── Import ──
  async function handleImport() {
    setImportError(null)

    const selected = rows.filter(r => r.selected)

    if (selected.length === 0) {
      setImportError('Please select at least one assignment to import.')
      return
    }

    // Validate: selected rows need title + deadline
    const invalid = selected.filter(r => !r.title.trim() || !r.deadline)
    if (invalid.length > 0) {
      setImportError(
        `${invalid.length} selected assignment${invalid.length !== 1 ? 's are' : ' is'} missing a title or deadline. ` +
        'Please fill in the missing fields or deselect those rows.'
      )
      return
    }

    setImporting(true)
    try {
      await onImport(
        selected.map(r => ({
          course:   r.course.trim()  || 'Unknown Course',
          title:    r.title.trim(),
          deadline: r.deadline,
        }))
      )
    } catch (err) {
      setImportError(err.message ?? 'Could not save assignments. Please try again.')
      setImporting(false)
    }
  }

  // ── Empty state ──
  if (rows.length === 0) {
    return (
      <div className={styles.empty}>
        <p className={styles.emptyIcon}>🔍</p>
        <p className={styles.emptyMsg}>
          No assignments were found in this syllabus.
          This may mean the syllabus does not list explicit deadlines,
          or the format was not recognized.
        </p>
        <div className={styles.emptyActions}>
          <button className={styles.backBtn} onClick={onBack}>← Try Again</button>
          <button className={styles.cancelBtn} onClick={onClose}>Close</button>
        </div>
      </div>
    )
  }

  return (
    <div className={styles.wrapper}>

      {/* ── Toolbar ── */}
      <div className={styles.toolbar}>
        <p className={styles.toolbarInfo}>
          {rows.length} assignment{rows.length !== 1 ? 's' : ''} found
          {selectedCount > 0 && ` · ${selectedCount} selected`}
        </p>
        <div className={styles.toolbarActions}>
          <button
            className={styles.toggleSourceBtn}
            onClick={() => setShowSource(s => !s)}
          >
            {showSource ? 'Hide source text' : 'Show source text'}
          </button>
        </div>
      </div>

      {/* ── Legend ── */}
      <div className={styles.legend}>
        <span className={`${styles.confidence} ${styles.confidenceHigh}`}>● High confidence</span>
        <span className={`${styles.confidence} ${styles.confidenceMedium}`}>● Medium</span>
        <span className={`${styles.confidence} ${styles.confidenceLow}`}>● Low</span>
        <span className={`${styles.confidence} ${styles.confidenceAmbiguous}`}>⚠ Review needed</span>
      </div>

      {/* ── Table (scroll container) ── */}
      <div className={styles.tableScroll}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th className={styles.thCheck}>
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={toggleAll}
                  aria-label="Select all assignments"
                  title={allSelected ? 'Deselect all' : 'Select all'}
                  className={styles.checkbox}
                />
              </th>
              <th className={styles.thTitle}>Assignment Title</th>
              <th className={styles.thCourse}>Course</th>
              <th className={styles.thDeadline}>Deadline</th>
              <th className={styles.thType}>Type</th>
              {showSource && <th className={styles.thSource}>Source</th>}
              <th className={styles.thActions} />
            </tr>
          </thead>
          <tbody>
            {rows.map(row => (
              <tr
                key={row._key}
                className={`${styles.tr} ${!row.selected ? styles.trDeselected : ''} ${row.confidence === 'ambiguous' ? styles.trAmbiguous : ''}`}
              >
                {/* Select */}
                <td className={styles.tdCheck}>
                  <input
                    type="checkbox"
                    checked={row.selected}
                    onChange={() => toggleRow(row._key)}
                    aria-label={`Select "${row.title || 'this assignment'}"`}
                    className={styles.checkbox}
                  />
                </td>

                {/* Title */}
                <td className={styles.tdTitle}>
                  <div className={styles.confidenceDot}>
                    <span
                      className={`${styles.dot} ${styles[`dot_${row.confidence}`]}`}
                      title={`Confidence: ${row.confidence}${row.notes ? ' — ' + row.notes : ''}`}
                    />
                    <input
                      type="text"
                      className={`${styles.cellInput} ${!row.title.trim() && row.selected ? styles.cellInputError : ''}`}
                      value={row.title}
                      onChange={e => updateField(row._key, 'title', e.target.value)}
                      placeholder="Assignment title"
                      maxLength={120}
                      aria-label="Assignment title"
                      disabled={importing}
                    />
                  </div>
                  {row.notes && (
                    <p className={styles.rowNote}>⚠ {row.notes}</p>
                  )}
                </td>

                {/* Course */}
                <td className={styles.tdCourse}>
                  <input
                    type="text"
                    className={styles.cellInput}
                    value={row.course}
                    onChange={e => updateField(row._key, 'course', e.target.value)}
                    placeholder="Course name"
                    maxLength={60}
                    aria-label="Course"
                    disabled={importing}
                  />
                </td>

                {/* Deadline */}
                <td className={styles.tdDeadline}>
                  <input
                    type="date"
                    className={`${styles.cellInput} ${!row.deadline && row.selected ? styles.cellInputError : ''}`}
                    value={row.deadline}
                    onChange={e => updateField(row._key, 'deadline', e.target.value)}
                    aria-label="Deadline"
                    disabled={importing}
                  />
                  {!row.deadline && (
                    <p className={styles.rowNote}>Set a date to include this item</p>
                  )}
                </td>

                {/* Type */}
                <td className={styles.tdType}>
                  <select
                    className={`${styles.cellInput} ${styles.cellSelect}`}
                    value={row.event_type}
                    onChange={e => updateField(row._key, 'event_type', e.target.value)}
                    aria-label="Assignment type"
                    disabled={importing}
                  >
                    <option value="assignment">Assignment</option>
                    <option value="quiz">Quiz</option>
                    <option value="exam">Exam</option>
                    <option value="project">Project</option>
                    <option value="presentation">Presentation</option>
                    <option value="essay">Essay</option>
                    <option value="other">Other</option>
                  </select>
                </td>

                {/* Source excerpt (optional) */}
                {showSource && (
                  <td className={styles.tdSource}>
                    <span className={styles.sourceText}>{row.source_excerpt || '—'}</span>
                  </td>
                )}

                {/* Remove */}
                <td className={styles.tdActions}>
                  <button
                    className={styles.removeBtn}
                    onClick={() => removeRow(row._key)}
                    aria-label={`Remove "${row.title || 'this assignment'}" from list`}
                    title="Remove from list"
                    disabled={importing}
                  >
                    ✕
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ── Import error ── */}
      {importError && (
        <p className={styles.importError} role="alert">{importError}</p>
      )}

      {/* ── Footer actions ── */}
      <div className={styles.footer}>
        <button className={styles.backBtn} onClick={onBack} disabled={importing}>
          ← Back
        </button>
        <div className={styles.footerRight}>
          <button className={styles.cancelBtn} onClick={onClose} disabled={importing}>
            Cancel
          </button>
          <button
            className={styles.importBtn}
            onClick={handleImport}
            disabled={importing || !someSelected}
          >
            {importing
              ? 'Saving…'
              : `Add ${selectedCount > 0 ? selectedCount : ''} Selected to Planner`}
          </button>
        </div>
      </div>
    </div>
  )
}
