import { useState, useRef, lazy, Suspense } from 'react'
import { parseSyllabus } from '../lib/syllabusParser'
import styles from './SyllabusImport.module.css'

// Lazy-load pdfjs-dist only when the panel is first opened.
let pdfModule = null
async function getPdfExtractor() {
  if (!pdfModule) {
    pdfModule = await import('../lib/pdfExtract')
  }
  return pdfModule.extractTextFromPdf
}

// Lazy-load the review table (unchanged — still the same component)
const SyllabusReviewTable = lazy(() => import('./SyllabusReviewTable'))

/**
 * Adapt a ParsedEntry (from syllabusParser.js) to the ExtractedAssignment
 * shape that SyllabusReviewTable expects.
 *
 * ParsedEntry fields:  title, course, deadline, raw, needsReview, reviewReason
 * ExtractedAssignment: title, course, deadline, event_type, source_excerpt,
 *                      confidence, notes
 */
function adaptEntry(entry) {
  // Infer event_type from the title / raw line
  const lower = (entry.title + ' ' + entry.raw).toLowerCase()
  let event_type = 'assignment'
  if (/\bexam\b|\bmidterm\b|\bfinal\b/.test(lower))         event_type = 'exam'
  else if (/\bquiz\b/.test(lower))                          event_type = 'quiz'
  else if (/\bproject\b/.test(lower))                       event_type = 'project'
  else if (/\bpresentation\b/.test(lower))                  event_type = 'presentation'
  else if (/\bessay\b|\bpaper\b|\breport\b/.test(lower))    event_type = 'essay'

  // Map needsReview → confidence level
  let confidence = 'high'
  if (entry.needsReview) {
    confidence = entry.deadline === null ? 'ambiguous' : 'low'
  }

  return {
    title:          entry.title,
    course:         entry.course ?? '',
    deadline:       entry.deadline ?? '',      // empty string = blank date input
    event_type,
    source_excerpt: entry.raw,
    confidence,
    notes:          entry.reviewReason ?? '',
  }
}

/**
 * SyllabusImport
 *
 * Modal panel used by Planner → "Import Syllabus".
 * Extracts assignment deadlines from a PDF or pasted text using the
 * client-side rule-based parser (syllabusParser.js). No AI or Edge
 * Function is called.
 *
 * Props
 *   existingAssignments  – current Planner rows (for duplicate detection)
 *   onImport(rows)       – called with confirmed { course, title, deadline } rows
 *   onClose()            – close the panel
 */
export default function SyllabusImport({ existingAssignments = [], onImport, onClose }) {
  // ── Input mode ──
  const [mode, setMode] = useState('paste')   // 'pdf' | 'paste'

  // ── PDF state ──
  const fileInputRef = useRef(null)
  const [pdfFile, setPdfFile]   = useState(null)
  const [pdfError, setPdfError] = useState(null)

  // ── Paste state ──
  const [pastedText, setPastedText] = useState('')

  // ── Default course override ──
  const [defaultCourse, setDefaultCourse] = useState('')

  // ── Extraction state ──
  const [status, setStatus]           = useState('')
  const [extracting, setExtracting]   = useState(false)
  const [extractError, setExtractError] = useState(null)

  // ── Results state ──
  const [extracted, setExtracted]           = useState(null)   // null = not yet run
  const [duplicatesFound, setDuplicatesFound] = useState(0)

  // step = 'input' | 'review'
  const step = extracted === null ? 'input' : 'review'

  // ─────────────────────────────────────────────────────────────
  // File selection
  // ─────────────────────────────────────────────────────────────

  const MAX_PDF_MB = 10

  function handleFileChange(e) {
    setPdfError(null)
    const file = e.target.files?.[0]
    if (!file) { setPdfFile(null); return }

    if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
      setPdfError('Only PDF files are supported. Please choose a .pdf file.')
      setPdfFile(null)
      return
    }
    if (file.size > MAX_PDF_MB * 1024 * 1024) {
      setPdfError(`This file is too large. Max ${MAX_PDF_MB} MB.`)
      setPdfFile(null)
      return
    }
    setPdfFile(file)
  }

  // ─────────────────────────────────────────────────────────────
  // Extract dates
  // ─────────────────────────────────────────────────────────────

  async function handleExtract() {
    setPdfError(null)
    setExtractError(null)
    setStatus('')
    setExtracted(null)
    setDuplicatesFound(0)

    try {
      setExtracting(true)

      // Step 1: get plain text
      let text
      if (mode === 'pdf') {
        if (!pdfFile) {
          setExtractError('Please select a PDF file first.')
          setExtracting(false)
          return
        }
        const extractTextFromPdf = await getPdfExtractor()
        text = await extractTextFromPdf(pdfFile, setStatus)
      } else {
        if (!pastedText.trim()) {
          setExtractError('Please paste your syllabus text first.')
          setExtracting(false)
          return
        }
        text = pastedText.trim()
      }

      // Step 2: rule-based parsing (no AI, no network call)
      setStatus('Scanning for deadlines…')
      const parsed = parseSyllabus(text, {
        course: defaultCourse.trim() || undefined,
      })

      // Step 3: adapt to review table shape
      const adapted = parsed.map(adaptEntry)

      // Step 4: remove exact duplicates already in the Planner
      const keyOf = (course, title, deadline) =>
        `${(course ?? '').toLowerCase().trim()}||${(title ?? '').toLowerCase().trim()}||${deadline ?? ''}`
      const existingKeys = new Set(
        existingAssignments.map(a => keyOf(a.course, a.title, a.deadline))
      )
      const unique = adapted.filter(
        a => !existingKeys.has(keyOf(a.course, a.title, a.deadline))
      )
      setDuplicatesFound(adapted.length - unique.length)
      setExtracted(unique)
      setStatus('')
    } catch (err) {
      setExtractError(err.message ?? 'An unexpected error occurred.')
      setStatus('')
    } finally {
      setExtracting(false)
    }
  }

  function handleImport(confirmedRows) {
    onImport(confirmedRows)
  }

  function handleBack() {
    setExtracted(null)
    setExtractError(null)
    setStatus('')
    setDuplicatesFound(0)
  }

  // ─────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────

  return (
    <div className={styles.overlay} role="dialog" aria-modal="true" aria-label="Import Syllabus">
      <div className={styles.panel}>

        {/* ── Header ── */}
        <div className={styles.panelHeader}>
          <div>
            <h2 className={styles.panelTitle}>📄 Import Syllabus</h2>
            <p className={styles.panelSubtitle}>
              Upload or paste your syllabus to extract assignment deadlines.
              Works entirely in your browser — no AI or internet connection needed.
            </p>
          </div>
          <button
            className={styles.closeBtn}
            onClick={onClose}
            aria-label="Close syllabus import"
            disabled={extracting}
          >
            ✕
          </button>
        </div>

        {/* ── Step indicator ── */}
        <div className={styles.stepBar} aria-label="Import steps">
          <span className={`${styles.step} ${step === 'input'  ? styles.stepActive : styles.stepDone}`}>
            1 · Upload Syllabus
          </span>
          <span className={styles.stepArrow}>›</span>
          <span className={`${styles.step} ${step === 'review' ? styles.stepActive : ''}`}>
            2 · Review &amp; Import
          </span>
        </div>

        {/* ══════════════════════════════════════════════════ */}
        {/* STEP 1 — INPUT                                    */}
        {/* ══════════════════════════════════════════════════ */}
        {step === 'input' && (
          <div className={styles.inputStep}>

            {/* Mode tabs */}
            <div className={styles.tabBar} role="tablist" aria-label="Input method">
              <button
                role="tab"
                aria-selected={mode === 'pdf'}
                className={`${styles.tab} ${mode === 'pdf' ? styles.tabActive : ''}`}
                onClick={() => { setMode('pdf'); setPdfError(null); setExtractError(null) }}
                disabled={extracting}
              >
                📎 Upload PDF
              </button>
              <button
                role="tab"
                aria-selected={mode === 'paste'}
                className={`${styles.tab} ${mode === 'paste' ? styles.tabActive : ''}`}
                onClick={() => { setMode('paste'); setExtractError(null) }}
                disabled={extracting}
              >
                📋 Paste Text
              </button>
            </div>

            {/* ── PDF upload ── */}
            {mode === 'pdf' && (
              <div className={styles.uploadArea}>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="application/pdf,.pdf"
                  className={styles.fileInputHidden}
                  id="syllabus-pdf-input"
                  onChange={handleFileChange}
                  disabled={extracting}
                />
                <label
                  htmlFor="syllabus-pdf-input"
                  className={`${styles.dropZone} ${pdfFile ? styles.dropZoneLoaded : ''}`}
                >
                  {pdfFile ? (
                    <>
                      <span className={styles.fileIcon}>📄</span>
                      <span className={styles.fileName}>{pdfFile.name}</span>
                      <span className={styles.fileSize}>
                        ({(pdfFile.size / (1024 * 1024)).toFixed(2)} MB)
                      </span>
                      <span className={styles.fileChange}>Click to change file</span>
                    </>
                  ) : (
                    <>
                      <span className={styles.dropIcon}>⬆</span>
                      <span className={styles.dropMain}>Click to upload a PDF syllabus</span>
                      <span className={styles.dropSub}>Text-based PDFs only · Max {MAX_PDF_MB} MB</span>
                    </>
                  )}
                </label>
                {pdfError && (
                  <p className={styles.inputError} role="alert">{pdfError}</p>
                )}
                <p className={styles.hint}>
                  <strong>Note:</strong> Only PDFs with selectable text are supported.
                  If your syllabus is a scanned image, switch to <strong>Paste Text</strong> instead.
                </p>
              </div>
            )}

            {/* ── Paste text ── */}
            {mode === 'paste' && (
              <div className={styles.pasteArea}>
                <label className={styles.pasteLabel} htmlFor="syllabus-text">
                  Paste your syllabus below:
                </label>
                <textarea
                  id="syllabus-text"
                  className={styles.pasteTextarea}
                  rows={12}
                  placeholder={
                    'Example:\n\nENGL 101 — Academic Writing\n\nWeek 4 — Essay Draft due October 3\nWeek 8 — Midterm Exam on November 1\nWeek 12 — Final Project due December 10'
                  }
                  value={pastedText}
                  onChange={e => { setPastedText(e.target.value); setExtractError(null) }}
                  disabled={extracting}
                  spellCheck={false}
                />
                <p className={styles.hint}>
                  Copy and paste your syllabus text directly from a document or website.
                </p>
              </div>
            )}

            {/* ── Default course (optional) ── */}
            <div className={styles.courseRow}>
              <label className={styles.courseLabel} htmlFor="syllabus-default-course">
                Default course (used when none is detected):
              </label>
              <input
                id="syllabus-default-course"
                type="text"
                className={styles.courseInput}
                value={defaultCourse}
                onChange={e => setDefaultCourse(e.target.value)}
                placeholder="e.g. ENGL 101"
                maxLength={40}
                disabled={extracting}
              />
            </div>

            {/* Extraction error */}
            {extractError && (
              <div className={styles.analysisError} role="alert">
                <strong>⚠ Could not read syllabus</strong>
                <p>{extractError}</p>
              </div>
            )}

            {/* Status / progress */}
            {extracting && status && (
              <p className={styles.statusMsg} aria-live="polite">{status}</p>
            )}

            {/* Actions */}
            <div className={styles.inputActions}>
              <button
                className={styles.analyzeBtn}
                onClick={handleExtract}
                disabled={
                  extracting ||
                  (mode === 'pdf' && !pdfFile) ||
                  (mode === 'paste' && !pastedText.trim())
                }
              >
                {extracting ? status || 'Extracting…' : '🔍 Extract Dates'}
              </button>
              <button className={styles.cancelBtn} onClick={onClose} disabled={extracting}>
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* ══════════════════════════════════════════════════ */}
        {/* STEP 2 — REVIEW                                   */}
        {/* ══════════════════════════════════════════════════ */}
        {step === 'review' && extracted !== null && (
          <div className={styles.reviewStep}>
            {duplicatesFound > 0 && (
              <p className={styles.dupNote} role="status">
                ℹ {duplicatesFound} assignment{duplicatesFound !== 1 ? 's' : ''} already in your
                Planner {duplicatesFound !== 1 ? 'were' : 'was'} removed to avoid duplicates.
              </p>
            )}
            <Suspense fallback={<p className={styles.statusMsg} style={{padding:'1.5rem'}}>Loading review table…</p>}>
              <SyllabusReviewTable
                extracted={extracted}
                onImport={handleImport}
                onBack={handleBack}
                onClose={onClose}
              />
            </Suspense>
          </div>
        )}

      </div>
    </div>
  )
}
