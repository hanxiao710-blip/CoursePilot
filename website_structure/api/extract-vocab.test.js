import test, { before, after } from 'node:test'
import assert from 'node:assert/strict'
import { createExtractVocabHandler, sanitizeItem, verifyExcerptAuthenticity } from './extract-vocab.js'
import { attachIds, editCandidate, remainingSelection } from '../src/lib/vocabCandidates.js'

const config = { VITE_SUPABASE_URL: 'https://coursepilot.test', VITE_SUPABASE_ANON_KEY: 'local-test-key', GEMINI_API_KEY: 'local-test-key' }
const original = Object.fromEntries(Object.keys(config).map(key => [key, process.env[key]]))
before(() => Object.assign(process.env, config))
after(() => {
  for (const [key, value] of Object.entries(original)) {
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
})
const material = 'Selection bias limits causal inference.'
const item = { english: 'Selection bias', chinese: '选择偏差', item_type: 'term', source_excerpt: material, source_note: 'extracted_from_material' }
const response = (data, status = 200) => ({ ok: status < 400, status, json: async () => data })
async function invoke(fetchImpl, overrides = {}) {
  let result
  const res = { setHeader() {}, status(value) { this.statusCode = value; return this }, json(body) { result = { status: this.statusCode, body } }, end() {} }
  const handler = createExtractVocabHandler({ fetchImpl, authTimeoutMs: 20, geminiTimeoutMs: 20 })
  await handler({ method: 'POST', headers: { authorization: 'Bearer test.jwt.token' }, body: { text: material }, ...overrides }, res)
  return result
}

test('missing configuration rejects the actual handler without external calls', async () => {
  delete process.env.VITE_SUPABASE_URL
  try { assert.equal((await invoke(() => assert.fail('unexpected network'))).status, 500) }
  finally { process.env.VITE_SUPABASE_URL = config.VITE_SUPABASE_URL }
})
test('missing bearer token rejects before the network', async () => {
  assert.equal((await invoke(() => assert.fail('unexpected network'), { headers: {} })).status, 401)
})
test('invalid Supabase token never reaches Gemini', async () => {
  let calls = 0
  const result = await invoke(async url => {
    calls++; assert.match(url, /auth\/v1\/user$/)
    return response({ error: 'invalid token' }, 401)
  })
  assert.equal(result.status, 401); assert.equal(calls, 1)
})
test('authentication body is covered by the deadline', async () => {
  let signal
  const result = await invoke(async (_url, options) => {
    signal = options.signal
    return { ok: true, status: 200, json: () => new Promise(() => {}) }
  })
  assert.equal(result.status, 504); assert.equal(signal.aborted, true)
})
for (const status of [200, 429]) {
  test(`Gemini ${status} response body is covered by the deadline`, async () => {
    let calls = 0, signal
    const result = await invoke(async (_url, options) => {
      if (++calls === 1) return response({ id: 'test-user' })
      signal = options.signal
      return { ok: status === 200, status, json: () => new Promise(() => {}) }
    })
    assert.equal(result.status, 504); assert.equal(signal.aborted, true)
  })
}
test('network failure is an availability error, not invalid identity', async () => {
  assert.equal((await invoke(async () => { throw new Error('offline') })).status, 503)
})
test('handler validates AI output and removes unsupported provenance', async () => {
  let calls = 0
  const result = await invoke(async () => {
    if (++calls === 1) return response({ id: 'test-user' })
    return response({ candidates: [{ content: { parts: [{ text: JSON.stringify({ items: [item, { ...item, source_excerpt: null }, { ...item, source_excerpt: 'Invented lecture quotation' }] }) }] } }] })
  })
  assert.equal(result.status, 200)
  assert.deepEqual(result.body.items.map(row => row.source_note), ['extracted_from_material', 'ai_generated', 'ai_generated'])
})
test('real excerpt with unrelated expression cannot establish provenance', () => {
  assert.equal(verifyExcerptAuthenticity([{ ...item, english: 'Portfolio duration' }], material)[0].source_note, 'ai_generated')
})
test('normalizes whitespace without accepting a substring inside another word', () => {
  assert.equal(verifyExcerptAuthenticity([{ ...item, source_excerpt: 'Selection\n bias limits causal inference.' }], material)[0].source_note, 'extracted_from_material')
  assert.equal(verifyExcerptAuthenticity([{ ...item, english: 'car', source_excerpt: 'scar tissue' }], 'scar tissue')[0].source_note, 'ai_generated')
})
test('invalid candidates are rejected by production sanitizer', () => {
  for (const raw of [null, [], {}, { english: 'Test' }, { english: ' ', chinese: '测试' }]) assert.equal(sanitizeItem(raw), null)
})
test('candidate UUIDs stay stable during edits and are unique across batches', () => {
  const first = attachIds([item, item]), second = attachIds([item])
  assert.equal(new Set([...first, ...second].map(row => row._id)).size, 3)
  assert.match(first[0]._id, /^[a-f0-9-]{36}$/)
  const edited = editCandidate(first, first[0]._id, 'english', 'Different expression')
  assert.equal(edited[0]._id, first[0]._id); assert.equal(edited[0].user_edited, true)
  assert.equal(edited[0].source_excerpt, item.source_excerpt); assert.equal(edited[1].user_edited, false)
})
test('partial save retains selection by candidate ID rather than spelling', () => {
  const rows = attachIds([item, item])
  const remaining = remainingSelection(new Set(rows.map(row => row._id)), { errors: [{ id: rows[1]._id, word: item.english }] })
  assert.deepEqual([...remaining], [rows[1]._id])
})
