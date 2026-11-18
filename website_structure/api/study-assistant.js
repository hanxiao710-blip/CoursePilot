/**
 * api/study-assistant.js
 *
 * Vercel Serverless Function (Node.js) — POST /api/study-assistant
 *
 * Receives a user message and optional chat history, then streams a reply
 * from the Gemini API.  The API key is read exclusively from the server-side
 * environment and is never exposed to the browser.
 *
 * ── Request ───────────────────────────────────────────────────────────────
 * POST /api/study-assistant
 * Headers:
 *   Content-Type: application/json
 *   Authorization: Bearer <supabase-jwt>   (required — rejects unauthenticated)
 *
 * Body (JSON):
 *   {
 *     message: string,                     // the user's latest message, max MAX_INPUT_CHARS
 *     history?: { role: 'user'|'model', text: string }[],   // up to 20 turns kept
 *     assignments?: { id: string, title: string, course: string, deadline: string }[]
 *   }
 *
 * ── Response (success) ────────────────────────────────────────────────────
 * 200 { reply: string, model: string, tokensUsed: number|null }
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

const DEFAULT_MODEL   = 'gemini-3.1-flash-lite'
const GEMINI_API_URL  = 'https://generativelanguage.googleapis.com/v1beta/models'
const MAX_INPUT_CHARS = 4_000   // single message limit
const MAX_HISTORY     = 20      // max turns kept from history
const TIMEOUT_MS      = 25_000

// ── System prompt ──────────────────────────────────────────────────────────

const SYSTEM_INSTRUCTIONS = `\
You are CoursePilot's study assistant for college students who speak English as a second language. \
Explain course concepts and assignment requirements in simple, clear English with short sentences and examples, \
and define difficult words. When a student pastes an assignment prompt, break it into: what to submit, \
key requirements, suggested steps, and a timeline before the deadline. Do not write the assignment for them. \
If the student writes in another language, you may add a short explanation in that language. \
End each answer with one concrete study tip starting with 'Tip:'.`

// ── Helpers ────────────────────────────────────────────────────────────────

/** Send a JSON response. */
function send(res, status, body) {
  res.setHeader('Content-Type', 'application/json')
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.status(status).json(body)
}

/**
 * Extract and validate the Bearer token from the Authorization header.
 * Returns the token string, or null if missing / malformed.
 */
function extractBearer(req) {
  const authHeader = req.headers['authorization'] ?? ''
  if (typeof authHeader !== 'string') return null
  const match = authHeader.match(/^Bearer\s+(\S+)$/)
  if (!match) return null
  // A Supabase JWT has three base64url segments separated by dots
  const parts = match[1].split('.')
  if (parts.length !== 3) return null
  return match[1]
}

// ── Main handler ───────────────────────────────────────────────────────────

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
    console.error('[study-assistant] GEMINI_API_KEY is not set in the environment.')
    return send(res, 500, {
      error: 'The Gemini API key is not configured on this server. Contact the site administrator.',
      code: 'INTERNAL_ERROR',
    })
  }

  const model = process.env.GEMINI_MODEL || DEFAULT_MODEL

  // ── Parse request body ──
  const body = req.body
  if (!body || typeof body !== 'object') {
    return send(res, 400, { error: 'Request body must be valid JSON.', code: 'BAD_REQUEST' })
  }

  const { message, history, assignments } = body

  if (typeof message !== 'string' || !message.trim()) {
    return send(res, 400, { error: 'Missing or empty "message" field in request body.', code: 'BAD_REQUEST' })
  }

  if (message.length > MAX_INPUT_CHARS) {
    return send(res, 413, {
      error: `Message is too long (${message.length} chars). Maximum is ${MAX_INPUT_CHARS} characters.`,
      code: 'INPUT_TOO_LARGE',
    })
  }

  // ── Build Gemini contents array ──
  // Gemini multi-turn format: array of { role, parts: [{ text }] }
  const contents = []

  // Inject upcoming assignments into the first system-side context message
  let systemTurn = SYSTEM_INSTRUCTIONS
  if (Array.isArray(assignments) && assignments.length > 0) {
    const list = assignments
      .slice(0, 10)
      .map(a => `- [${a.course ?? ''}] ${a.title}${a.deadline ? ` (due ${a.deadline})` : ''}`)
      .join('\n')
    systemTurn += `\n\nThe student's upcoming assignments:\n${list}`
  }

  // Seed the conversation with a user→model exchange that sets the persona
  contents.push({ role: 'user',  parts: [{ text: 'Hello, who are you?' }] })
  contents.push({ role: 'model', parts: [{ text: systemTurn }] })

  // Append trimmed history (most recent MAX_HISTORY turns)
  if (Array.isArray(history) && history.length > 0) {
    const trimmed = history.slice(-MAX_HISTORY)
    for (const turn of trimmed) {
      if (
        (turn.role === 'user' || turn.role === 'model') &&
        typeof turn.text === 'string' &&
        turn.text.trim()
      ) {
        contents.push({ role: turn.role, parts: [{ text: turn.text.trim() }] })
      }
    }
  }

  // Append the new user message
  contents.push({ role: 'user', parts: [{ text: message.trim() }] })

  const geminiBody = JSON.stringify({
    contents,
    generationConfig: {
      temperature: 0.7,
      maxOutputTokens: 1024,
    },
  })

  // ── Call Gemini with timeout ──
  const controller = new AbortController()
  const timeoutId  = setTimeout(() => controller.abort(), TIMEOUT_MS)

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
    console.error('[study-assistant] fetch error:', err.message)
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
    console.error('[study-assistant] Gemini error:', geminiResp.status, errMsg)
    return send(res, 502, { error: errMsg, code: 'INTERNAL_ERROR' })
  }

  // ── Parse Gemini response ──
  let geminiData
  try {
    geminiData = await geminiResp.json()
  } catch {
    return send(res, 500, { error: 'Could not parse the response from the Gemini API.', code: 'INTERNAL_ERROR' })
  }

  const reply = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text
  if (!reply) {
    return send(res, 500, {
      error: 'The Gemini API returned an empty response. Please try again.',
      code: 'INTERNAL_ERROR',
    })
  }

  return send(res, 200, {
    reply,
    model:      geminiData.modelVersion ?? model,
    tokensUsed: geminiData.usageMetadata?.totalTokenCount ?? null,
  })
}
