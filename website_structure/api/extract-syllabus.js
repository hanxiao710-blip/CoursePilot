/**
 * api/extract-syllabus.js
 *
 * Vercel Serverless Function (Node.js) — POST /api/extract-syllabus
 *
 * Receives syllabus text from the browser and returns structured assignment
 * data extracted by the Gemini API.  The API key is read exclusively from
 * the server-side environment and is never exposed to the browser.
 *
 * ── Request ───────────────────────────────────────────────────────────────
 * POST /api/extract-syllabus
 * Headers:
 *   Content-Type: application/json
 *   Authorization: Bearer <supabase-jwt>   (required — rejects unauthenticated)
 *
 * Body (JSON):
 *   { text: string }   // syllabus text, max MAX_INPUT_CHARS characters
 *
 * ── Response (success) ────────────────────────────────────────────────────
 * 200 { assignments, model, inputChars, tokensUsed }
 *
 * ── Error responses ───────────────────────────────────────────────────────
 * 400  BAD_REQUEST        — missing/invalid body
 * 401  UNAUTHENTICATED    — missing/invalid Authorization header
 * 405  METHOD_NOT_ALLOWED
 * 413  INPUT_TOO_LARGE
 * 429  QUOTA_EXCEEDED
 * 500  INTERNAL_ERROR
 * 503  MODEL_UNAVAILABLE
 * 504  TIMEOUT
 *
 * ── Deployment ────────────────────────────────────────────────────────────
 * Set in Vercel project → Settings → Environment Variables (NOT committed):
 *   GEMINI_API_KEY   your Gemini API key from Google AI Studio
 *   GEMINI_MODEL     optional override (default: gemini-3.1-flash-lite)
 *
 * For local dev add to website_structure/.env.local (no VITE_ prefix):
 *   GEMINI_API_KEY=your-key-here
 */

// ── Constants ──────────────────────────────────────────────────────────────

const DEFAULT_MODEL  = 'gemini-3.1-flash-lite'
const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models'
const MAX_INPUT_CHARS = 60_000
const TIMEOUT_MS      = 25_000

// ── Prompt ─────────────────────────────────────────────────────────────────

const SYSTEM_INSTRUCTIONS = `\
You are a university syllabus parser. Your job is to extract student assignment deadlines from syllabus text.

RULES:
1. Return ONLY student deadlines: assignments, exams, quizzes, papers, projects, presentations, labs.
2. EXCLUDE: syllabus update dates, course description dates, grading scale descriptions, office hours, room numbers, instructor contact info, and policies.
3. If a year is missing from a date, do NOT invent one. Set deadline to null and set notes to "no year stated".
4. If a deadline is listed as TBA or TBD, set deadline to null and notes to "TBA".
5. Set confidence to "high" if the date is explicit and unambiguous, "low" if inferred or partial, "ambiguous" if the date format is unclear.
6. source_excerpt must be the verbatim line or sentence from the syllabus where you found this entry.
7. course: extract the course code (e.g. "PSYC 101") if present on the same line or in a nearby heading; otherwise null.
8. event_type: one of assignment, quiz, exam, project, presentation, essay, lab, other.
9. Do not deduplicate — if the same deadline appears twice with different wording, return both.
10. Return a JSON object with key "assignments" containing an array. If nothing qualifies, return {"assignments":[]}.`

// ── Helpers ────────────────────────────────────────────────────────────────

/** Send a JSON response using Node.js (res) object. */
function send(res, status, body) {
  res.setHeader('Content-Type', 'application/json')
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.status(status).json(body)
}

/** Validate a YYYY-MM-DD string. */
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/
function isValidDate(s) {
  if (!ISO_DATE_RE.test(s)) return false
  const [y, m, d] = s.split('-').map(Number)
  return m >= 1 && m <= 12 && d >= 1 && d <= 31 && y >= 2000 && y <= 2100
}

const VALID_EVENT_TYPES = new Set(['assignment','quiz','exam','project','presentation','essay','lab','other'])
const VALID_CONFIDENCES = new Set(['high','low','ambiguous'])

/** Sanitize and validate a single assignment object from Gemini output. */
function sanitize(raw) {
  if (!raw || typeof raw !== 'object') return null

  // Model sometimes omits title — fall back to source_excerpt as title
  const rawTitle  = typeof raw.title          === 'string' ? raw.title.trim()          : ''
  const rawExcerpt = typeof raw.source_excerpt === 'string' ? raw.source_excerpt.trim() : ''
  const title = rawTitle || rawExcerpt
  if (!title) return null

  const deadline = (typeof raw.deadline === 'string' && isValidDate(raw.deadline))
    ? raw.deadline
    : null

  return {
    title,
    course:         (typeof raw.course === 'string' && raw.course.trim()) ? raw.course.trim() : null,
    deadline,
    event_type:     VALID_EVENT_TYPES.has(raw.event_type)  ? raw.event_type  : 'assignment',
    confidence:     VALID_CONFIDENCES.has(raw.confidence)  ? raw.confidence  : 'low',
    source_excerpt: (typeof raw.source_excerpt === 'string') ? raw.source_excerpt.trim().slice(0, 500) : '',
    notes:          (typeof raw.notes === 'string')          ? raw.notes.trim().slice(0, 200)          : '',
  }
}

/**
 * Extract and validate the Bearer token from the Authorization header.
 * Uses Node.js req.headers (plain object, lowercase keys).
 * Returns the token string, or null if missing / malformed.
 */
function extractBearer(req) {
  // req.headers is a plain object with lowercase keys in Node.js
  const authHeader = req.headers['authorization'] ?? ''
  if (typeof authHeader !== 'string') return null
  const match = authHeader.match(/^Bearer\s+(\S+)$/)
  if (!match) return null
  // A Supabase JWT has three base64url segments separated by dots
  const parts = match[1].split('.')
  if (parts.length !== 3) return null
  return match[1]
}

// ── Main handler (Node.js convention) ─────────────────────────────────────

export default async function handler(req, res) {
  // ── CORS pre-flight ──
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
    res.status(204).end()
    return
  }

  if (req.method !== 'POST') {
    return send(res, 405, { error: 'Method not allowed. Use POST.', code: 'METHOD_NOT_ALLOWED' })
  }

  // ── Authentication check ──
  const jwt = extractBearer(req)
  if (!jwt) {
    return send(res, 401, {
      error: 'Authentication required. Include your Supabase session token as Authorization: Bearer <token>.',
      code: 'UNAUTHENTICATED',
    })
  }

  // ── API key check ──
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) {
    console.error('[extract-syllabus] GEMINI_API_KEY is not set in the environment.')
    return send(res, 500, {
      error: 'The Gemini API key is not configured on this server. Contact the site administrator.',
      code: 'INTERNAL_ERROR',
    })
  }

  const model = process.env.GEMINI_MODEL || DEFAULT_MODEL

  // ── Parse request body ──
  // Vercel parses JSON bodies automatically when Content-Type is application/json
  const body = req.body
  if (!body || typeof body !== 'object') {
    return send(res, 400, { error: 'Request body must be valid JSON.', code: 'BAD_REQUEST' })
  }

  const text = body.text
  if (typeof text !== 'string' || !text.trim()) {
    return send(res, 400, { error: 'Missing or empty "text" field in request body.', code: 'BAD_REQUEST' })
  }

  if (text.length > MAX_INPUT_CHARS) {
    return send(res, 413, {
      error: `Syllabus text is too long (${text.length} chars). Maximum is ${MAX_INPUT_CHARS} characters. Please trim the text and try again.`,
      code: 'INPUT_TOO_LARGE',
    })
  }

  // ── Build Gemini request ──
  const prompt = `${SYSTEM_INSTRUCTIONS}\n\nSYLLABUS TEXT:\n${text}`

  const geminiBody = JSON.stringify({
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: {
      responseMimeType: 'application/json',
      temperature: 0,
    },
  })

  // ── Call Gemini with timeout ──
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS)

  let geminiResp
  try {
    geminiResp = await fetch(
      `${GEMINI_API_URL}/${model}:generateContent?key=${apiKey}`,
      {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', 'User-Agent': 'CoursePilot/1.0' },
        body:    geminiBody,
        signal:  controller.signal,
      }
    )
  } catch (err) {
    clearTimeout(timeoutId)
    if (err.name === 'AbortError') {
      return send(res, 504, {
        error: 'The Gemini API did not respond in time. Please try again in a moment.',
        code: 'TIMEOUT',
      })
    }
    console.error('[extract-syllabus] fetch error:', err.message)
    return send(res, 503, {
      error: 'Could not reach the Gemini API. Check your internet connection.',
      code: 'MODEL_UNAVAILABLE',
    })
  } finally {
    clearTimeout(timeoutId)
  }

  // ── Handle Gemini error responses ──
  if (!geminiResp.ok) {
    let errMsg = `Gemini API returned HTTP ${geminiResp.status}.`
    try {
      const errData = await geminiResp.json()
      const msg = errData?.error?.message ?? ''
      if (geminiResp.status === 429 || msg.toLowerCase().includes('quota')) {
        return send(res, 429, {
          error: 'The free-tier request quota has been reached. Please wait a few minutes and try again.',
          code: 'QUOTA_EXCEEDED',
        })
      }
      if (geminiResp.status === 503 || msg.toLowerCase().includes('unavailable')) {
        return send(res, 503, {
          error: 'The Gemini model is temporarily overloaded. Please try again in a moment.',
          code: 'MODEL_UNAVAILABLE',
        })
      }
      if (geminiResp.status === 404) {
        return send(res, 503, {
          error: `The configured model "${model}" is not available. Contact the site administrator to update GEMINI_MODEL.`,
          code: 'MODEL_UNAVAILABLE',
        })
      }
      errMsg = msg || errMsg
    } catch { /* ignore JSON parse failure on error body */ }
    console.error('[extract-syllabus] Gemini error:', geminiResp.status, errMsg)
    return send(res, 502, { error: errMsg, code: 'INTERNAL_ERROR' })
  }

  // ── Parse Gemini response ──
  let geminiData
  try {
    geminiData = await geminiResp.json()
  } catch {
    return send(res, 500, { error: 'Could not parse the response from the Gemini API.', code: 'INTERNAL_ERROR' })
  }

  const rawText = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text
  if (!rawText) {
    return send(res, 500, {
      error: 'The Gemini API returned an empty response. Please try again.',
      code: 'INTERNAL_ERROR',
    })
  }

  // ── Parse structured JSON from model output ──
  let parsed
  try {
    parsed = JSON.parse(rawText)
  } catch {
    // Gemini sometimes wraps JSON in a markdown code fence — strip it
    const fenced = rawText.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '')
    try {
      parsed = JSON.parse(fenced)
    } catch {
      return send(res, 500, {
        error: 'The model returned output that could not be parsed as JSON. Please try again.',
        code: 'INTERNAL_ERROR',
      })
    }
  }

  if (!Array.isArray(parsed?.assignments)) {
    return send(res, 500, {
      error: 'Unexpected response shape from the model. Please try again.',
      code: 'INTERNAL_ERROR',
    })
  }

  // ── Sanitize and return ──
  const assignments = parsed.assignments.map(sanitize).filter(Boolean)

  return send(res, 200, {
    assignments,
    model:      geminiData.modelVersion ?? model,
    inputChars: text.length,
    tokensUsed: geminiData.usageMetadata?.totalTokenCount ?? null,
  })
}
