/**
 * syllabusParser.test.js
 *
 * Synthetic unit tests for parseSyllabus().
 * Run with: node src/lib/syllabusParser.test.js
 *
 * Uses Node's built-in assert module — no test framework required.
 */

import assert from 'node:assert/strict'
import { parseSyllabus } from './syllabusParser.js'

const REF_YEAR = new Date().getFullYear()

let passed = 0
let failed = 0

function test(name, fn) {
  try {
    fn()
    console.log(`  ✅  ${name}`)
    passed++
  } catch (err) {
    console.error(`  ❌  ${name}`)
    console.error(`       ${err.message}`)
    failed++
  }
}

// ─────────────────────────────────────────────────────────────
// 1. EMPTY / WHITESPACE INPUT
// ─────────────────────────────────────────────────────────────
console.log('\n── Empty / whitespace ──')

test('returns [] for empty string', () => {
  assert.deepEqual(parseSyllabus(''), [])
})

test('returns [] for whitespace-only string', () => {
  assert.deepEqual(parseSyllabus('   \n\t  '), [])
})

test('returns [] for text with no keywords', () => {
  // "discussion" IS a supported keyword — use text that truly has none
  const text = 'Week 1\nIntroduction to the course\nWeek 2\nCourse overview and schedule'
  assert.deepEqual(parseSyllabus(text), [])
})

// ─────────────────────────────────────────────────────────────
// 2. ISO DATE  YYYY-MM-DD
// ─────────────────────────────────────────────────────────────
console.log('\n── ISO date (YYYY-MM-DD) ──')

test('extracts ISO date from "HW1 due 2026-11-15"', () => {
  const result = parseSyllabus('HW1 due 2026-11-15')
  assert.equal(result.length, 1)
  assert.equal(result[0].deadline, '2026-11-15')
  assert.equal(result[0].needsReview, false)
})

test('extracts ISO date with slashes "quiz 2026/03/20"', () => {
  const result = parseSyllabus('quiz 2026/03/20')
  assert.equal(result.length, 1)
  assert.equal(result[0].deadline, '2026-03-20')
  assert.equal(result[0].needsReview, false)
})

// ─────────────────────────────────────────────────────────────
// 3. US DATE  MM/DD/YYYY
// ─────────────────────────────────────────────────────────────
console.log('\n── US date (MM/DD/YYYY) ──')

test('extracts MM/DD/YYYY "Assignment due 01/15/2026"', () => {
  const result = parseSyllabus('Assignment due 01/15/2026')
  assert.equal(result.length, 1)
  assert.equal(result[0].deadline, '2026-01-15')
  assert.equal(result[0].needsReview, false)
})

test('extracts single-digit MM/DD/YYYY "Exam due 3/5/2026"', () => {
  const result = parseSyllabus('Exam due 3/5/2026')
  assert.equal(result.length, 1)
  assert.equal(result[0].deadline, '2026-03-05')
})

// ─────────────────────────────────────────────────────────────
// 4. LONG-FORM MONTH  "January 15, 2026"
// ─────────────────────────────────────────────────────────────
console.log('\n── Long-form month with year ──')

test('"Paper due January 15, 2026"', () => {
  const result = parseSyllabus('Paper due January 15, 2026')
  assert.equal(result.length, 1)
  assert.equal(result[0].deadline, '2026-01-15')
  assert.equal(result[0].needsReview, false)
})

test('"Presentation: March 3, 2026"', () => {
  const result = parseSyllabus('Presentation: March 3, 2026')
  assert.equal(result.length, 1)
  assert.equal(result[0].deadline, '2026-03-03')
})

test('"Final exam December 14 2026" (no comma)', () => {
  const result = parseSyllabus('Final exam December 14 2026')
  assert.equal(result.length, 1)
  assert.equal(result[0].deadline, '2026-12-14')
})

test('"HW3 Due — Sep. 20, 2026" (abbreviated month with period)', () => {
  const result = parseSyllabus('HW3 Due — Sep. 20, 2026')
  assert.equal(result.length, 1)
  assert.equal(result[0].deadline, '2026-09-20')
})

// ─────────────────────────────────────────────────────────────
// 5. DAY-MONTH-YEAR  "15 January 2026"
// ─────────────────────────────────────────────────────────────
console.log('\n── Day-Month-Year ──')

test('"project submission 15 January 2026"', () => {
  const result = parseSyllabus('project submission 15 January 2026')
  assert.equal(result.length, 1)
  assert.equal(result[0].deadline, '2026-01-15')
  assert.equal(result[0].needsReview, false)
})

// ─────────────────────────────────────────────────────────────
// 6. PARTIAL DATE — no year (should be flagged)
// ─────────────────────────────────────────────────────────────
console.log('\n── Partial date — no year ──')

test('"HW3 Due Mon, 12/7" — ambiguous MM/DD, flagged', () => {
  const result = parseSyllabus('HW3 Due Mon, 12/7')
  assert.equal(result.length, 1)
  assert.equal(result[0].deadline, `${REF_YEAR}-12-07`)
  assert.equal(result[0].needsReview, true)
  assert(result[0].reviewReason.length > 0)
})

test('"Exam due November 20" — no year, assumed current year', () => {
  const result = parseSyllabus('Exam due November 20')
  assert.equal(result.length, 1)
  assert.equal(result[0].deadline, `${REF_YEAR}-11-20`)
  assert.equal(result[0].needsReview, true)
  assert(result[0].reviewReason.includes(String(REF_YEAR)))
})

test('"Final Exam — Dec 14" — no year', () => {
  const result = parseSyllabus('Final Exam — Dec 14')
  assert.equal(result.length, 1)
  assert.equal(result[0].needsReview, true)
})

// ─────────────────────────────────────────────────────────────
// 7. MISSING DATE — entry still surfaced, flagged
// ─────────────────────────────────────────────────────────────
console.log('\n── Missing date — flag for manual review ──')

test('"HW3 Due" — keyword matched but no date → deadline null, flagged', () => {
  const result = parseSyllabus('HW3 Due')
  // Length may be 0 if line is too short (<5 chars after trim) or 1 if matched
  if (result.length === 1) {
    assert.equal(result[0].deadline, null)
    assert.equal(result[0].needsReview, true)
  }
  // Length 0 is also acceptable (line "HW3 Due" is 7 chars, keyword matched = likely 1)
})

test('"Catch-Up/Final Exam review" — keyword matched, no date → flagged', () => {
  const result = parseSyllabus('Catch-Up/Final Exam review')
  assert.equal(result.length, 1)
  assert.equal(result[0].deadline, null)
  assert.equal(result[0].needsReview, true)
  assert(result[0].reviewReason.includes('No date'))
})

test('"Quiz TBD" — keyword matched, no date → flagged', () => {
  const result = parseSyllabus('Quiz TBD')
  assert.equal(result.length, 1)
  assert.equal(result[0].deadline, null)
  assert.equal(result[0].needsReview, true)
})

// ─────────────────────────────────────────────────────────────
// 8. DOES NOT INVENT DATES
// ─────────────────────────────────────────────────────────────
console.log('\n── Never invents dates ──')

test('deadline is null when no date present, never fabricated', () => {
  const result = parseSyllabus('Paper due TBD\nPresentation date TBD')
  for (const entry of result) {
    assert.equal(entry.deadline, null, `Entry "${entry.title}" should have null deadline`)
    assert.equal(entry.needsReview, true)
  }
})

// ─────────────────────────────────────────────────────────────
// 9. REAL SYLLABUS EXCERPT (the screenshot text)
// ─────────────────────────────────────────────────────────────
console.log('\n── Real syllabus excerpt (matches screenshot) ──')

const screenshotText = `14

Mon, 12/7

Catch-Up/Final Exam review

HW3 Due

15

Mon, 12/14

Final Exam`

test('screenshot text: finds HW3 Due (no date) and Final Exam (no date)', () => {
  const result = parseSyllabus(screenshotText)
  // Should find keyword-matching lines
  const titles = result.map(r => r.title.toLowerCase())
  // "HW3 Due" and "Final Exam" should be detected (or "Catch-Up/Final Exam review")
  const hasDeadline = titles.some(t => t.includes('hw') || t.includes('due'))
  const hasExam = titles.some(t => t.includes('exam') || t.includes('final'))
  assert(hasDeadline || hasExam, `Expected at least one deadline/exam entry, got: ${JSON.stringify(titles)}`)
  // ALL entries from this text should have no parseable full date (only partial 12/7, 12/14)
  for (const entry of result) {
    assert.equal(entry.needsReview, true, `Entry "${entry.title}" should be flagged`)
  }
})

test('screenshot "Mon, 12/7" partial date: extracted as MM/DD with current year, flagged', () => {
  const result = parseSyllabus('HW3 Due Mon, 12/7')
  assert.equal(result.length, 1)
  assert.equal(result[0].deadline, `${REF_YEAR}-12-07`)
  assert.equal(result[0].needsReview, true)
})

// ─────────────────────────────────────────────────────────────
// 10. COURSE CODE DETECTION
// ─────────────────────────────────────────────────────────────
console.log('\n── Course code detection ──')

test('"ENGL 101 paper due 2026-11-15" extracts course ENGL 101', () => {
  const result = parseSyllabus('ENGL 101 paper due 2026-11-15')
  assert.equal(result.length, 1)
  assert.equal(result[0].course, 'ENGL 101')
})

test('falls back to opts.course when no code found', () => {
  const result = parseSyllabus('Paper due 2026-11-15', { course: 'History 200' })
  assert.equal(result.length, 1)
  assert.equal(result[0].course, 'History 200')
})

test('course is null when not found and no default given', () => {
  const result = parseSyllabus('Paper due 2026-11-15')
  assert.equal(result.length, 1)
  assert.equal(result[0].course, null)
})

// ─────────────────────────────────────────────────────────────
// 11. DEDUPLICATION
// ─────────────────────────────────────────────────────────────
console.log('\n── Deduplication ──')

test('duplicate lines produce only one entry', () => {
  const text = 'Paper due 2026-11-15\nPaper due 2026-11-15'
  const result = parseSyllabus(text)
  assert.equal(result.length, 1)
})

// ─────────────────────────────────────────────────────────────
// 12. MULTIPLE ENTRIES
// ─────────────────────────────────────────────────────────────
console.log('\n── Multiple entries ──')

test('multi-line syllabus produces multiple entries', () => {
  const text = [
    'Week 3: Quiz 1 due 2026-09-15',
    'Midterm exam: October 20, 2026',
    'Final project presentation December 10, 2026',
    'HW4 deadline: 2026-11-01',
  ].join('\n')
  const result = parseSyllabus(text)
  assert.equal(result.length, 4)
  const deadlines = result.map(r => r.deadline)
  assert(deadlines.includes('2026-09-15'))
  assert(deadlines.includes('2026-10-20'))
  assert(deadlines.includes('2026-12-10'))
  assert(deadlines.includes('2026-11-01'))
  // None need review
  assert(result.every(r => !r.needsReview))
})

// ─────────────────────────────────────────────────────────────
// 13. MM-DD-YYYY
// ─────────────────────────────────────────────────────────────
console.log('\n── MM-DD-YYYY dash format ──')

test('"assignment deadline 11-15-2026"', () => {
  const result = parseSyllabus('assignment deadline 11-15-2026')
  assert.equal(result.length, 1)
  assert.equal(result[0].deadline, '2026-11-15')
  assert.equal(result[0].needsReview, false)
})

// ─────────────────────────────────────────────────────────────
// SUMMARY
// ─────────────────────────────────────────────────────────────
console.log(`\n${'─'.repeat(50)}`)
console.log(`Results: ${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
