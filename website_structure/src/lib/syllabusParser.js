/**
 * syllabusParser.js
 *
 * Client-side, API-free rule-based parser for syllabus text.
 *
 * Returns an array of ParsedEntry objects:
 * {
 *   title:    string               — assignment / event title
 *   course:   string | null        — course name/code if detected
 *   deadline: string | null        — ISO 8601 date string 'YYYY-MM-DD', or null
 *   raw:      string               — the original matched line
 *   needsReview: boolean           — true when date is missing or ambiguous
 *   reviewReason: string | null    — human-readable reason for flagging
 * }
 *
 * Design principles:
 *  - Never invent dates. If a date cannot be reliably parsed, leave deadline null.
 *  - Flag entries that need manual review rather than silently dropping them.
 *  - Preserve the original text for the review table.
 */

// ─────────────────────────────────────────────────────────────
// KEYWORD TRIGGERS
// Lines containing these words are candidates for entries.
// ─────────────────────────────────────────────────────────────
const ASSIGNMENT_KEYWORDS = [
  'due', 'deadline', 'submit', 'submission',
  'assignment', 'homework', 'hw',
  'exam', 'midterm', 'final exam', 'quiz',
  'paper', 'essay', 'report',
  'project', 'presentation', 'lab',
  'reading', 'discussion',
]

// Regex built once from keyword list.
const KEYWORD_RE = new RegExp(
  ASSIGNMENT_KEYWORDS.map((k) => k.replace(/\s+/g, '\\s+')).join('|'),
  'i'
)

// ─────────────────────────────────────────────────────────────
// DATE PATTERNS
// Each entry: { regex, toISO(match, refYear) }
// refYear is passed so we can default to the current year.
// ─────────────────────────────────────────────────────────────
const MONTHS = {
  jan: 1, january: 1,
  feb: 2, february: 2,
  mar: 3, march: 3,
  apr: 4, april: 4,
  may: 5,
  jun: 6, june: 6,
  jul: 7, july: 7,
  aug: 8, august: 8,
  sep: 9, sept: 9, september: 9,
  oct: 10, october: 10,
  nov: 11, november: 11,
  dec: 12, december: 12,
}

function pad(n) { return String(n).padStart(2, '0') }

function monthNum(str) {
  return MONTHS[str.toLowerCase()] ?? null
}

/**
 * Build an ISO date string, returning null if month/day are invalid.
 */
function iso(year, month, day) {
  const y = Number(year)
  const m = Number(month)
  const d = Number(day)
  if (!y || !m || !d || m < 1 || m > 12 || d < 1 || d > 31) return null
  return `${y}-${pad(m)}-${pad(d)}`
}

const DATE_PATTERNS = [
  // "January 15, 2025" / "Jan. 15, 2025" / "January 15 2025"
  {
    re: /\b(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|sept|oct|nov|dec)\.?\s+(\d{1,2}),?\s+(\d{4})\b/i,
    toISO: (m) => iso(m[3], monthNum(m[1]), m[2]),
  },
  // "15 January 2025" / "15 Jan 2025"
  {
    re: /\b(\d{1,2})\s+(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|sept|oct|nov|dec)\.?\s+(\d{4})\b/i,
    toISO: (m) => iso(m[3], monthNum(m[2]), m[1]),
  },
  // "2025-01-15" / "2025/01/15"
  {
    re: /\b(\d{4})[-/](\d{1,2})[-/](\d{1,2})\b/,
    toISO: (m) => iso(m[1], m[2], m[3]),
  },
  // "01/15/2025" or "1/15/2025" (MM/DD/YYYY)
  {
    re: /\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b/,
    toISO: (m) => iso(m[3], m[1], m[2]),
  },
  // "01-15-2025" (MM-DD-YYYY)
  {
    re: /\b(\d{1,2})-(\d{1,2})-(\d{4})\b/,
    toISO: (m) => iso(m[3], m[1], m[2]),
  },
  // "January 15" / "Jan 15" — no year; will be flagged for review
  {
    re: /\b(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|sept|oct|nov|dec)\.?\s+(\d{1,2})\b/i,
    toISO: (m, refYear) => iso(refYear, monthNum(m[1]), m[2]),
    noYear: true,
  },
  // "15 January" / "15 Jan"
  {
    re: /\b(\d{1,2})\s+(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|sept|oct|nov|dec)\.?\b/i,
    toISO: (m, refYear) => iso(refYear, monthNum(m[2]), m[1]),
    noYear: true,
  },
  // "03/15" (MM/DD, no year) — most ambiguous
  {
    re: /\b(\d{1,2})\/(\d{1,2})\b/,
    toISO: (m, refYear) => iso(refYear, m[1], m[2]),
    noYear: true,
    ambiguous: true,
  },
]

/**
 * Try to extract the first date from a text string.
 * Returns { deadline: string|null, noYear: boolean, ambiguous: boolean }
 */
function extractDate(text, refYear) {
  for (const pat of DATE_PATTERNS) {
    const match = text.match(pat.re)
    if (match) {
      const deadline = pat.toISO(match, refYear)
      return {
        deadline,
        noYear: pat.noYear ?? false,
        ambiguous: pat.ambiguous ?? false,
      }
    }
  }
  return { deadline: null, noYear: false, ambiguous: false }
}

// ─────────────────────────────────────────────────────────────
// COURSE DETECTION
// Look for patterns like "CS 101", "ENGL 200", "MATH3400"
// ─────────────────────────────────────────────────────────────
const COURSE_CODE_RE = /\b([A-Z]{2,6})\s*(\d{3,4}[A-Z]?)\b/

function extractCourse(text) {
  const m = text.match(COURSE_CODE_RE)
  return m ? `${m[1]} ${m[2]}` : null
}

// ─────────────────────────────────────────────────────────────
// TITLE EXTRACTION
// Strip the matched date text and common noise words to get a title.
// ─────────────────────────────────────────────────────────────
const NOISE_RE = /\b(due|deadline|by|on|at|submit|submitted|please|see|refer|check|note|reminder|will\s+be)\b/gi

function extractTitle(line) {
  let title = line
    // Remove date-like substrings (rough pass)
    .replace(/\d{1,2}[/-]\d{1,2}([/-]\d{2,4})?/g, '')
    .replace(/\b(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|sept|oct|nov|dec)\.?\s+\d{1,2}(,?\s+\d{4})?\b/gi, '')
    .replace(/\d{4}[-/]\d{2}[-/]\d{2}/g, '')
    // Remove time-like substrings
    .replace(/\d{1,2}:\d{2}(\s*(am|pm))?/gi, '')
    // Remove punctuation run-ons
    .replace(NOISE_RE, ' ')
    .replace(/[:\-–—|]+/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim()

  // Capitalise first character
  if (title.length > 0) {
    title = title.charAt(0).toUpperCase() + title.slice(1)
  }

  return title || line.trim()
}

// ─────────────────────────────────────────────────────────────
// PUBLIC API
// ─────────────────────────────────────────────────────────────

/**
 * Parse syllabus text and return a list of assignment/deadline entries.
 *
 * @param {string} text          Full syllabus text.
 * @param {object} [opts]
 * @param {string} [opts.course] Default course name to use when none is detected.
 * @returns {ParsedEntry[]}
 */
export function parseSyllabus(text, opts = {}) {
  if (!text || !text.trim()) return []

  const refYear = new Date().getFullYear()
  const lines = text.split(/\r?\n/)
  const entries = []
  const seen = new Set() // deduplicate by normalised line content

  for (const rawLine of lines) {
    const line = rawLine.trim()
    if (!line || line.length < 5) continue

    // Only process lines that contain assignment-related keywords.
    if (!KEYWORD_RE.test(line)) continue

    // Deduplicate
    const key = line.toLowerCase().replace(/\s+/g, ' ')
    if (seen.has(key)) continue
    seen.add(key)

    const { deadline, noYear, ambiguous } = extractDate(line, refYear)
    const course = extractCourse(line) ?? opts.course ?? null
    const title = extractTitle(line)

    // Determine review flag
    let needsReview = false
    let reviewReason = null

    if (!deadline) {
      needsReview = true
      reviewReason = 'No date found — please set the deadline manually.'
    } else if (ambiguous) {
      needsReview = true
      reviewReason = 'Date format is ambiguous (MM/DD assumed) — verify the deadline.'
    } else if (noYear) {
      needsReview = true
      reviewReason = `No year found — assumed ${refYear}. Please verify.`
    }

    entries.push({
      title,
      course,
      deadline,
      raw: line,
      needsReview,
      reviewReason,
    })
  }

  return entries
}
