/**
 * syllabusAnalysis.js
 *
 * Syllabus text extraction and AI-powered deadline analysis for CoursePilot.
 *
 * ─── Architecture note ────────────────────────────────────────────────────────
 * AI analysis is intentionally NOT performed in the browser.  Browser code
 * cannot safely hold an OpenAI / Anthropic / IBM watsonx API key.
 *
 * The analyzeWithAI() function calls a Supabase Edge Function at:
 *   /functions/v1/analyze-syllabus
 *
 * That Edge Function holds the private API key server-side and returns
 * structured JSON.  Until the Edge Function is deployed, this module returns
 * a clear "not configured" error — it never fakes results.
 *
 * ─── To enable AI analysis ────────────────────────────────────────────────────
 * 1. Create a Supabase Edge Function (Deno):
 *      supabase/functions/analyze-syllabus/index.ts
 * 2. Store your AI key as a Supabase secret:
 *      supabase secrets set OPENAI_API_KEY=sk-...
 * 3. The Edge Function receives { syllabusText: string } and returns:
 *    {
 *      course: string,
 *      assignments: [
 *        {
 *          title: string,
 *          course: string,
 *          deadline: string | null,   // YYYY-MM-DD or null
 *          event_type: string,        // 'assignment'|'quiz'|'exam'|'project'|'presentation'|'other'
 *          source_excerpt: string,
 *          confidence: 'high'|'medium'|'low'|'ambiguous',
 *          notes: string              // e.g. "TBA", "tentative", "no year stated"
 *        }
 *      ]
 *    }
 * 4. Set VITE_SUPABASE_FUNCTIONS_URL in .env.local if using a custom region,
 *    otherwise the default (project URL + /functions/v1) is used automatically.
 *
 * ─── Security note ────────────────────────────────────────────────────────────
 * Syllabus content is sent to the Edge Function as untrusted user content.
 * The Edge Function must instruct the AI to treat it as data only (prompt
 * injection defence), and must enforce a reasonable character limit.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { supabase } from './supabase'
import * as pdfjsLib from 'pdfjs-dist'

// ── PDF.js worker ─────────────────────────────────────────────────────────────
// Point the worker at the copy bundled with pdfjs-dist so Vite can resolve it.
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.mjs',
  import.meta.url
).href

// ── Constants ─────────────────────────────────────────────────────────────────
export const MAX_PDF_SIZE_MB = 10
export const MAX_TEXT_LENGTH = 80_000   // characters sent to AI

// ─────────────────────────────────────────────────────────────────────────────
// PDF TEXT EXTRACTION
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Extract plain text from a PDF File object.
 *
 * @param {File} file
 * @param {(msg: string) => void} [onStatus]  optional progress callback
 * @returns {Promise<string>}  extracted text
 * @throws {Error}  with a user-facing message on failure
 */
export async function extractTextFromPdf(file, onStatus) {
  // ── Validate file ──
  if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
    throw new Error('Please upload a PDF file (.pdf).')
  }
  if (file.size > MAX_PDF_SIZE_MB * 1024 * 1024) {
    throw new Error(`The file is too large. Please upload a PDF smaller than ${MAX_PDF_SIZE_MB} MB.`)
  }

  onStatus?.('Reading PDF…')

  const arrayBuffer = await file.arrayBuffer()
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise

  onStatus?.(`Extracting text from ${pdf.numPages} page${pdf.numPages !== 1 ? 's' : ''}…`)

  const pageTexts = []
  for (let i = 1; i <= pdf.numPages; i++) {
    const page    = await pdf.getPage(i)
    const content = await page.getTextContent()
    const text    = content.items.map(item => item.str).join(' ')
    pageTexts.push(text)
  }

  const fullText = pageTexts.join('\n\n').trim()

  if (!fullText) {
    throw new Error(
      'This PDF appears to contain only scanned images — no selectable text was found. ' +
      'OCR (optical character recognition) is not yet supported. ' +
      'Please try copying and pasting the syllabus text directly instead.'
    )
  }

  return fullText
}

// ─────────────────────────────────────────────────────────────────────────────
// AI ANALYSIS  (via Supabase Edge Function)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Send syllabus text to the Supabase Edge Function for AI analysis.
 *
 * Returns an array of extracted assignment objects, or throws a descriptive
 * error if the Edge Function is not deployed or returns an unexpected response.
 *
 * @param {string} syllabusText
 * @param {(msg: string) => void} [onStatus]
 * @returns {Promise<ExtractedAssignment[]>}
 */
export async function analyzeWithAI(syllabusText, onStatus) {
  if (!syllabusText?.trim()) {
    throw new Error('Please provide syllabus text before analyzing.')
  }

  onStatus?.('Analyzing deadlines…')

  // Truncate to avoid runaway token usage
  const text = syllabusText.length > MAX_TEXT_LENGTH
    ? syllabusText.slice(0, MAX_TEXT_LENGTH) + '\n[truncated — text exceeded limit]'
    : syllabusText

  // supabase.functions.invoke() handles auth headers automatically
  const { data, error } = await supabase.functions.invoke('analyze-syllabus', {
    body: { syllabusText: text },
  })

  // ── Edge Function not yet deployed ────────────────────────────────────────
  // Supabase returns a 404 / relay error when the function doesn't exist.
  if (error) {
    const msg = error.message ?? ''
    if (
      msg.includes('404') ||
      msg.includes('not found') ||
      msg.includes('FunctionsHttpError') ||
      msg.includes('FunctionsFetchError')
    ) {
      throw new Error(
        'AI analysis is not yet configured. ' +
        'A Supabase Edge Function named "analyze-syllabus" must be deployed first. ' +
        'See src/lib/syllabusAnalysis.js for full setup instructions.'
      )
    }
    throw new Error(`Analysis failed: ${msg}`)
  }

  // ── Validate response shape ───────────────────────────────────────────────
  if (!data || !Array.isArray(data.assignments)) {
    throw new Error(
      'The analysis service returned an unexpected response. ' +
      'Please check the Edge Function implementation.'
    )
  }

  return data.assignments
}

// ─────────────────────────────────────────────────────────────────────────────
// DUPLICATE DETECTION
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Filter out extracted assignments that already exist in the user's Planner.
 * Matching is case-insensitive on (course + title + deadline).
 *
 * @param {ExtractedAssignment[]} extracted
 * @param {{ course: string, title: string, deadline: string }[]} existing
 * @returns {{ unique: ExtractedAssignment[], duplicates: ExtractedAssignment[] }}
 */
export function partitionDuplicates(extracted, existing) {
  const key = (course, title, deadline) =>
    `${(course ?? '').toLowerCase().trim()}||${(title ?? '').toLowerCase().trim()}||${deadline ?? ''}`

  const existingKeys = new Set(existing.map(a => key(a.course, a.title, a.deadline)))

  const unique     = []
  const duplicates = []

  for (const item of extracted) {
    if (existingKeys.has(key(item.course, item.title, item.deadline))) {
      duplicates.push(item)
    } else {
      unique.push(item)
    }
  }

  return { unique, duplicates }
}

// ─────────────────────────────────────────────────────────────────────────────
// TYPE DEFINITIONS  (JSDoc — no TypeScript required)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @typedef {Object} ExtractedAssignment
 * @property {string}      title          - Assignment name
 * @property {string}      course         - Course name / code
 * @property {string|null} deadline       - YYYY-MM-DD or null if unknown / TBA
 * @property {string}      event_type     - 'assignment'|'quiz'|'exam'|'project'|'presentation'|'other'
 * @property {string}      source_excerpt - Verbatim text from the syllabus
 * @property {'high'|'medium'|'low'|'ambiguous'} confidence
 * @property {string}      notes          - Human-readable caveats (TBA, tentative, etc.)
 */
