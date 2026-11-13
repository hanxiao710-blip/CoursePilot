import { useState, useRef, lazy, Suspense } from 'react'
import styles from './SyllabusImport.module.css'

// Lazy-load the heavy PDF.js analysis module so it is only fetched when the
// Import Syllabus panel is actually opened (keeps initial bundle smaller).
let syllabusAnalysisModule = null
async function getSyllabusAnalysis() {
  if (!syllabusAnalysisModule) {
    syllabusAnalysisModule = await import('../lib/syllabusAnalysis')
  }
  return syllabusAnalysisModule
}

// Lazy-load the review table (minor split, consistent pattern)
const SyllabusReviewTable = lazy(() => import('./SyllabusReviewTable'))

/**
 * SyllabusImport
 *
 * Modal-like panel that lets students:
 *   1. Upload a PDF  OR  paste plain text
 *   2. Click "Analyze Syllabus" to extract deadlines via AI
 *   3. Review / edit extracted assignments in a table
 *   4. Confirm to add selected entries to the Planner
 *
 * Props
 *   existingAssignments  – array of current Planner rows (for duplicate detection)
 *   onImport(rows)       – called with confirmed assignment rows to save
 *   onClose()            – called to dismiss the panel
 */
export default function SyllabusImport({ existingAssignments = [], onImport, onClose }) {
  // ── Input mode ──
  const [mode, setMode] = useState('paste')   // 'pdf' | 'paste'

  // ── PDF state ──
  const fileInputRef = useRef(null)
  const [pdfFile, setPdfFile]     = useState(null)
  const [pdfError, setPdfError]   = useState(null)

  // ── Paste state ──
  const [pastedText, setPastedText] = useState('')

  // ── Analysis state ──
  const [status, setStatus]           = useState('')   // progress message
  const [analyzing, setAnalyzing]     = useState(false)
  const [analysisError, setAnalysisError] = useState(null)

  // ── Results state ──
  const [extracted, setExtracted]       = useState(null)   // null = not analyzed yet
  const [duplicatesFound, setDuplicatesFound] = useState(0)

  // ── Step: 'input' | 'review' ──
  const step = extracted === null ? 'input' : 'review'

  // ─────────────────────────────────────────────────────────────
  // File selection
  // ─────────────────────────────────────────────────────────────

  function handleFileChange(e) {
    setPdfError(null)
    const file = e.target.files?.[0]
    if (!file) { setPdfFile(null); return }

    if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
      setPdfError('Only PDF files are supported. Please choose a .pdf file.')
      setPdfFile(null)
      return
    }
    if (file.size > MAX_PDF_SIZE_MB * 1024 * 1024) {
      setPdfError(`This file is too large. Please upload a PDF smaller than ${MAX_PDF_SIZE_MB} MB.`)
      setPdfFile(null)
      return
    }
    setPdfFile(file)
  }

  // ─────────────────────────────────────────────────────────────
  // Analyze
  // ─────────────────────────────────────────────────────────────

  async function handleAnalyze() {
    setPdfError(null)
    setAnalysisError(null)
    setStatus('')
    setExtracted(null)

    try {
      setAnalyzing(true)

      // Dynamically load the analysis module (and pdfjs-dist) on first use
      const { extractTextFromPdf, analyzeWithAI, partitionDuplicates, MAX_PDF_SIZE_MB: MB }
        = await getSyllabusAnalysis()

      // Step 1: get text
      let text
      if (mode === 'pdf') {
        if (!pdfFile) { setAnalysisError('Please select a PDF file first.'); setAnalyzing(false); return }
        text = await extractTextFromPdf(pdfFile, setStatus)
      } else {
        if (!pastedText.trim()) { setAnalysisError('Please paste your syllabus text first.'); setAnalyzing(false); return }
        text = pastedText.trim()
      }

      // Step 2: AI analysis
      setStatus('Analyzing deadlines…')
      const assignments = await analyzeWithAI(text, setStatus)

      // Step 3: duplicate detection
      const { unique, duplicates } = partitionDuplicates(assignments, existingAssignments)
      setDuplicatesFound(duplicates.length)

      setExtracted(unique)
      setStatus('')
    } catch (err) {
      setAnalysisError(err.message ?? 'An unexpected error occurred.')
      setStatus('')
    } finally {
      setAnalyzing(false)
    }
  }

  // ─────────────────────────────────────────────────────────────
  // Import confirmed entries
  // ─────────────────────────────────────────────────────────────

  function handleImport(confirmedRows) {
    onImport(confirmedRows)
  }

  // ─────────────────────────────────────────────────────────────
  // Go back to input step
  // ─────────────────────────────────────────────────────────────

  function handleBack() {
    setExtracted(null)
    setAnalysisError(null)
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
              Upload or paste your course syllabus to automatically extract assignment deadlines.
            </p>
          </div>
          <button
            className={styles.closeBtn}
            onClick={onClose}
            aria-label="Close syllabus import"
            disabled={analyzing}
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
                onClick={() => { setMode('pdf'); setPdfError(null); setAnalysisError(null) }}
                disabled={analyzing}
              >
                📎 Upload PDF
              </button>
              <button
                role="tab"
                aria-selected={mode === 'paste'}
                className={`${styles.tab} ${mode === 'paste' ? styles.tabActive : ''}`}
                onClick={() => { setMode('paste'); setAnalysisError(null) }}
                disabled={analyzing}
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
                  disabled={analyzing}
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
                      <span className={styles.dropSub}>Standard text-based PDFs only · Max 10 MB</span>
                    </>
                  )}
                </label>
                {pdfError && (
                  <p className={styles.inputError} role="alert">{pdfError}</p>
                )}
                <p className={styles.hint}>
                  <strong>Note:</strong> Only PDFs with selectable text are supported.
                  If your syllabus is a scanned image, use the "Paste Text" option instead.
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
                  onChange={e => { setPastedText(e.target.value); setAnalysisError(null) }}
                  disabled={analyzing}
                  spellCheck={false}
                />
                <p className={styles.hint}>
                  Copy and paste your syllabus text directly from a document or website.
                </p>
              </div>
            )}

            {/* Analysis error */}
            {analysisError && (
              <div className={styles.analysisError} role="alert">
                <strong>⚠ Could not analyze syllabus</strong>
                <p>{analysisError}</p>
              </div>
            )}

            {/* Status / progress */}
            {analyzing && status && (
              <p className={styles.statusMsg} aria-live="polite">{status}</p>
            )}

            {/* Actions */}
            <div className={styles.inputActions}>
              <button
                className={styles.analyzeBtn}
                onClick={handleAnalyze}
                disabled={analyzing || (mode === 'pdf' && !pdfFile) || (mode === 'paste' && !pastedText.trim())}
              >
                {analyzing ? status || 'Analyzing…' : '🔍 Analyze Syllabus'}
              </button>
              <button className={styles.cancelBtn} onClick={onClose} disabled={analyzing}>
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
                ℹ {duplicatesFound} assignment{duplicatesFound !== 1 ? 's' : ''} already in your Planner
                {duplicatesFound !== 1 ? ' were' : ' was'} removed from this list to avoid duplicates.
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
