/**
 * pdfExtract.js
 *
 * Client-side PDF text extraction using pdfjs-dist.
 * No AI, no network calls — runs entirely in the browser.
 *
 * Extracted from syllabusAnalysis.js when the AI-powered import
 * path was removed in favour of the client-side rule-based parser.
 */

import * as pdfjsLib from 'pdfjs-dist'

// Point the worker at the copy bundled with pdfjs-dist so Vite can resolve it.
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.mjs',
  import.meta.url
).href

export const MAX_PDF_SIZE_MB = 10

/**
 * Extract plain text from a PDF File object.
 *
 * @param {File} file
 * @param {(msg: string) => void} [onStatus]  optional progress callback
 * @returns {Promise<string>}  extracted text
 * @throws {Error}  with a user-facing message on failure
 */
export async function extractTextFromPdf(file, onStatus) {
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
      'Please try copying and pasting the syllabus text directly instead.'
    )
  }

  return fullText
}
