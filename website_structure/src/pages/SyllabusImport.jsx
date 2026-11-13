/**
 * SyllabusImport.jsx
 *
 * Syllabus Import feature — fully functional without any Edge Function or AI API.
 *
 * Modes:
 *  1. Upload a text-based PDF  → pdfExtract.js reads it client-side
 *  2. Paste raw syllabus text  → fed directly to the parser
 *
 * Both modes run through the client-side rule-based parser (syllabusParser.js).
 * The resulting entries are shown in an editable review table.
 * Confirmed entries are saved to Supabase via createAssignment().
 *
 * The AI/Edge Function path is preserved as a commented-out stub at the bottom
 * of this file for optional future use.
 */

import { useState, useRef, useCallback } from 'react'
import { useAuth } from '../context/useAuth'
import { extractTextFromPDF } from '../lib/pdfExtract'
import { parseSyllabus } from '../lib/syllabusParser'
import { createAssignment } from '../lib/supabaseService'
import styles from './SyllabusImport.module.css'

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

function newId() {
  return Math.random().toString(36).slice(2)
}

// ─────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────

function StatusBadge({ needsReview, reviewReason }) {
  if (!needsReview) {
    return <span className={`${styles.badge} ${styles.badgeOk}`}>Ready</span>
  }
  return (
    <span className={`${styles.badge} ${styles.badgeReview}`} title={reviewReason ?? ''}>
      ⚠ Review
    </span>
  )
}

// ─────────────────────────────────────────────────────────────
// Main Page
// ─────────────────────────────────────────────────────────────

export default function SyllabusImport() {
  const { user } = useAuth()

  /* Input mode */
  const [mode, setMode] = useState('upload') // 'upload' | 'paste'

  /* PDF upload state */
  const [pdfFile, setPdfFile]         = useState(null)
  const [pdfError, setPdfError]       = useState(null)
  const [extracting, setExtracting]   = useState(false)
  const [extractedText, setExtractedText] = useState('')
  const [pageCount, setPageCount]     = useState(null)
  const fileInputRef                  = useRef(null)

  /* Paste mode state */
  const [pasteText, setPasteText]     = useState('')

  /* Default course override */
  const [defaultCourse, setDefaultCourse] = useState('')

  /* Parser output */
  const [entries, setEntries]         = useState([]) // { id, ...ParsedEntry, selected }
  const [parsing, setParsing]         = useState(false)

  /* Import state */
  const [importing, setImporting]     = useState(false)
  const [importResults, setImportResults] = useState(null) // { saved, errors }

  // ── PDF file selection ──
  function handleFileChange(e) {
    const file = e.target.files?.[0] ?? null
    setPdfFile(file)
    setPdfError(null)
    setExtractedText('')
    setPageCount(null)
    setEntries([])
    setImportResults(null)
  }

  // ── Extract text from selected PDF ──
  const handleExtractPDF = useCallback(async () => {
    if (!pdfFile) return
    setExtracting(true)
    setPdfError(null)
    setExtractedText('')
    setEntries([])
    setImportResults(null)
    try {
      const { text, pageCount: pc } = await extractTextFromPDF(pdfFile)
      setExtractedText(text)
      setPageCount(pc)
    } catch (err) {
      setPdfError(err.message ?? 'PDF extraction failed.')
    } finally {
      setExtracting(false)
    }
  }, [pdfFile])

  // ── Run parser on the available text ──
  function handleParse() {
    const text = mode === 'upload' ? extractedText : pasteText
    if (!text.trim()) return
    setParsing(true)
    setImportResults(null)
    try {
      const parsed = parseSyllabus(text, { course: defaultCourse.trim() || undefined })
      setEntries(
        parsed.map((entry) => ({ ...entry, id: newId(), selected: !entry.needsReview }))
      )
    } finally {
      setParsing(false)
    }
  }

  // ── Inline editing ──
  function updateEntry(id, field, value) {
    setEntries((prev) =>
      prev.map((e) => {
        if (e.id !== id) return e
        const updated = { ...e, [field]: value }
        // Re-evaluate needsReview if deadline was set manually
        if (field === 'deadline' && value) {
          updated.needsReview = false
          updated.reviewReason = null
        }
        return updated
      })
    )
  }

  function toggleSelect(id) {
    setEntries((prev) =>
      prev.map((e) => (e.id === id ? { ...e, selected: !e.selected } : e))
    )
  }

  function toggleSelectAll() {
    const allSelected = entries.every((e) => e.selected)
    setEntries((prev) => prev.map((e) => ({ ...e, selected: !allSelected })))
  }

  function removeEntry(id) {
    setEntries((prev) => prev.filter((e) => e.id !== id))
  }

  // ── Supabase import ──
  async function handleImport() {
    if (!user) return
    const toImport = entries.filter((e) => e.selected && e.deadline)
    if (toImport.length === 0) return
    setImporting(true)
    setImportResults(null)

    let saved = 0
    const errors = []

    for (const entry of toImport) {
      const { error } = await createAssignment(user.id, {
        course: entry.course || 'Unknown',
        title: entry.title,
        deadline: entry.deadline,
      })
      if (error) {
        errors.push({ title: entry.title, message: error.message })
      } else {
        saved++
        // Remove successfully saved entries from the table
        setEntries((prev) => prev.filter((e) => e.id !== entry.id))
      }
    }

    setImportResults({ saved, errors })
    setImporting(false)
  }

  // ─── Derived values ───
  const sourceText   = mode === 'upload' ? extractedText : pasteText
  const canParse     = sourceText.trim().length > 0 && !parsing
  const selectedEntries = entries.filter((e) => e.selected)
  const importableEntries = selectedEntries.filter((e) => e.deadline)
  const canImport    = importableEntries.length > 0 && !importing

  // ─────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────
  return (
    <div className={styles.page}>
      <h1 className={styles.pageTitle}>📄 Syllabus Import</h1>
      <p className={styles.pageSubtitle}>
        Upload a syllabus PDF or paste its text to automatically extract deadlines into your Planner.
        No AI or internet connection required for extraction.
      </p>

      {/* ── Step 1: Input ── */}
      <section className={styles.card}>
        <h2 className={styles.cardTitle}>Step 1 — Provide Syllabus Text</h2>

        {/* Mode toggle */}
        <div className={styles.modeToggle} role="group" aria-label="Input mode">
          <button
            className={mode === 'upload' ? `${styles.modeBtn} ${styles.modeBtnActive}` : styles.modeBtn}
            onClick={() => { setMode('upload'); setEntries([]); setImportResults(null) }}
          >
            📎 Upload PDF
          </button>
          <button
            className={mode === 'paste' ? `${styles.modeBtn} ${styles.modeBtnActive}` : styles.modeBtn}
            onClick={() => { setMode('paste'); setEntries([]); setImportResults(null) }}
          >
            📋 Paste Text
          </button>
        </div>

        {mode === 'upload' && (
          <div className={styles.uploadArea}>
            <p className={styles.hint}>
              Only text-based PDFs are supported. Scanned image PDFs cannot be read — use Paste Text instead.
            </p>
            <div className={styles.fileRow}>
              <input
                ref={fileInputRef}
                type="file"
                accept="application/pdf"
                id="pdf-upload"
                className={styles.fileInputHidden}
                onChange={handleFileChange}
              />
              <label htmlFor="pdf-upload" className={styles.chooseFileBtn}>
                {pdfFile ? `📄 ${pdfFile.name}` : 'Choose PDF…'}
              </label>
              {pdfFile && (
                <button
                  className={styles.actionBtn}
                  onClick={handleExtractPDF}
                  disabled={extracting}
                >
                  {extracting ? 'Extracting…' : 'Extract Text'}
                </button>
              )}
            </div>

            {pdfError && (
              <div className={styles.error} role="alert">
                <strong>PDF Error:</strong> {pdfError}
              </div>
            )}

            {extractedText && (
              <div className={styles.extractedPreview}>
                <div className={styles.previewHeader}>
                  <span>Extracted from {pageCount} page{pageCount !== 1 ? 's' : ''}</span>
                  <span>{extractedText.length.toLocaleString()} characters</span>
                </div>
                <textarea
                  className={styles.previewTextarea}
                  value={extractedText}
                  onChange={(e) => setExtractedText(e.target.value)}
                  rows={8}
                  aria-label="Extracted PDF text — you may edit this before parsing"
                />
                <p className={styles.hint}>You can edit the extracted text above before parsing.</p>
              </div>
            )}
          </div>
        )}

        {mode === 'paste' && (
          <div>
            <label htmlFor="paste-input" className={styles.label}>
              Paste your syllabus text below:
            </label>
            <textarea
              id="paste-input"
              className={styles.pasteTextarea}
              value={pasteText}
              onChange={(e) => setPasteText(e.target.value)}
              rows={12}
              placeholder="Paste the syllabus text here…"
              spellCheck={false}
            />
          </div>
        )}
      </section>

      {/* ── Step 2: Parse ── */}
      <section className={styles.card}>
        <h2 className={styles.cardTitle}>Step 2 — Extract Deadlines</h2>

        <div className={styles.optionRow}>
          <label htmlFor="default-course" className={styles.label}>
            Default course (used when none is detected):
          </label>
          <input
            id="default-course"
            type="text"
            className={styles.textInput}
            value={defaultCourse}
            onChange={(e) => setDefaultCourse(e.target.value)}
            placeholder="e.g. ENGL 101"
            maxLength={40}
          />
        </div>

        <button
          className={`${styles.actionBtn} ${styles.actionBtnPrimary}`}
          onClick={handleParse}
          disabled={!canParse}
        >
          {parsing ? 'Parsing…' : '🔍 Find Deadlines'}
        </button>

        {entries.length === 0 && canParse && (
          <p className={styles.hint}>Click the button above to scan for assignment deadlines.</p>
        )}
        {entries.length === 0 && sourceText && !canParse && !parsing && (
          <p className={styles.hint}>Provide text above first, then click Find Deadlines.</p>
        )}
      </section>

      {/* ── Step 3: Review table ── */}
      {entries.length > 0 && (
        <section className={styles.card}>
          <h2 className={styles.cardTitle}>
            Step 3 — Review &amp; Edit ({entries.length} entr{entries.length !== 1 ? 'ies' : 'y'} found)
          </h2>
          <p className={styles.hint}>
            Entries marked <strong>⚠ Review</strong> are missing or ambiguous dates — set a deadline before importing.
            Deselect any entries you do not want to import.
          </p>

          <div className={styles.tableWrapper}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th className={styles.thCheck}>
                    <input
                      type="checkbox"
                      checked={entries.length > 0 && entries.every((e) => e.selected)}
                      onChange={toggleSelectAll}
                      aria-label="Select all"
                    />
                  </th>
                  <th>Title</th>
                  <th>Course</th>
                  <th>Deadline (YYYY-MM-DD)</th>
                  <th>Status</th>
                  <th className={styles.thAction}>Remove</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((entry) => (
                  <tr key={entry.id} className={entry.needsReview ? styles.rowReview : ''}>
                    <td className={styles.tdCheck}>
                      <input
                        type="checkbox"
                        checked={entry.selected}
                        onChange={() => toggleSelect(entry.id)}
                        aria-label={`Select "${entry.title}"`}
                      />
                    </td>
                    <td>
                      <input
                        type="text"
                        className={styles.cellInput}
                        value={entry.title}
                        onChange={(e) => updateEntry(entry.id, 'title', e.target.value)}
                        aria-label="Assignment title"
                      />
                    </td>
                    <td>
                      <input
                        type="text"
                        className={styles.cellInput}
                        value={entry.course ?? ''}
                        onChange={(e) => updateEntry(entry.id, 'course', e.target.value)}
                        placeholder="Course"
                        aria-label="Course"
                      />
                    </td>
                    <td>
                      <input
                        type="date"
                        className={styles.cellInput}
                        value={entry.deadline ?? ''}
                        onChange={(e) => updateEntry(entry.id, 'deadline', e.target.value)}
                        aria-label="Deadline date"
                      />
                    </td>
                    <td>
                      <StatusBadge
                        needsReview={entry.needsReview}
                        reviewReason={entry.reviewReason}
                      />
                    </td>
                    <td className={styles.tdAction}>
                      <button
                        className={styles.removeBtn}
                        onClick={() => removeEntry(entry.id)}
                        aria-label={`Remove "${entry.title}"`}
                      >
                        ✕
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* ── Import results feedback ── */}
          {importResults && (
            <div
              className={importResults.errors.length > 0 ? styles.importPartial : styles.importSuccess}
              role="status"
            >
              {importResults.saved > 0 && (
                <p>✅ {importResults.saved} assignment{importResults.saved !== 1 ? 's' : ''} saved to your Planner.</p>
              )}
              {importResults.errors.map((e, i) => (
                <p key={i} className={styles.importError}>
                  ❌ <strong>{e.title}</strong>: {e.message}
                </p>
              ))}
            </div>
          )}

          {/* ── Import button ── */}
          <div className={styles.importRow}>
            <span className={styles.importCount}>
              {importableEntries.length} of {selectedEntries.length} selected entr{selectedEntries.length !== 1 ? 'ies' : 'y'} ready to import
              {selectedEntries.length > importableEntries.length && (
                <span className={styles.importWarning}> (entries without a deadline will be skipped)</span>
              )}
            </span>
            <button
              className={`${styles.actionBtn} ${styles.actionBtnPrimary}`}
              onClick={handleImport}
              disabled={!canImport}
            >
              {importing ? 'Importing…' : `⬆ Import ${importableEntries.length} Assignment${importableEntries.length !== 1 ? 's' : ''}`}
            </button>
          </div>
        </section>
      )}

      {/* ── AI stub — preserved for future use ── */}
      {/* 
        AI-powered extraction (optional future feature):
        When an VITE_SUPABASE_FUNCTIONS_URL is configured and the user opts in,
        the raw syllabus text can be posted to an Edge Function:

        const response = await fetch(`${import.meta.env.VITE_SUPABASE_FUNCTIONS_URL}/extract-syllabus`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
          body: JSON.stringify({ text: sourceText }),
        })
        const { assignments } = await response.json()
        setEntries(assignments.map(a => ({ ...a, id: newId(), selected: true })))

        The AI results would still feed into the same review table below
        so the user can verify before importing.
      */}
    </div>
  )
}
