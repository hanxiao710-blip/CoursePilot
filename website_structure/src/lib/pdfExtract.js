/**
 * pdfExtract.js
 *
 * Client-side PDF text extraction using pdfjs-dist.
 * Returns the full plain-text content of a PDF File object.
 * Never calls any Edge Function or AI API.
 */

import * as pdfjsLib from 'pdfjs-dist'

// Point the worker at the bundled worker file (served from /node_modules via Vite).
// Using a CDN URL avoids the complex worker bundling configuration.
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`

/**
 * Extract all text from a PDF File.
 *
 * @param {File} file  A PDF File object from an <input type="file"> or drag-drop.
 * @returns {Promise<{ text: string, pageCount: number }>}
 * @throws {Error}  With a human-readable message on failure.
 */
export async function extractTextFromPDF(file) {
  if (!file || file.type !== 'application/pdf') {
    throw new Error('Please select a valid PDF file.')
  }

  let arrayBuffer
  try {
    arrayBuffer = await file.arrayBuffer()
  } catch {
    throw new Error('Could not read the file. Make sure it is not locked or corrupted.')
  }

  let pdf
  try {
    pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise
  } catch (err) {
    throw new Error(
      `PDF could not be opened: ${err?.message ?? String(err)}. ` +
      'Only text-based PDFs are supported — scanned image PDFs are not.'
    )
  }

  const pageCount = pdf.numPages
  const pageTexts = []

  for (let i = 1; i <= pageCount; i++) {
    let page
    try {
      page = await pdf.getPage(i)
    } catch {
      // Skip unreadable pages rather than aborting entirely.
      pageTexts.push('')
      continue
    }
    const content = await page.getTextContent()
    // Join items on the same line with a space; separate lines with newline.
    const lineText = content.items.map((item) => item.str).join(' ')
    pageTexts.push(lineText)
  }

  const text = pageTexts.join('\n')
  if (!text.trim()) {
    throw new Error(
      'No readable text was found in this PDF. ' +
      'It may be a scanned image — please paste the text manually instead.'
    )
  }

  return { text, pageCount }
}
