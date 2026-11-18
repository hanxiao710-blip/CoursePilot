import test, { before, after } from 'node:test'
import assert from 'node:assert/strict'
import { createClient } from '@supabase/supabase-js'
import { createVocabPersistence } from '../src/lib/vocabPersistence.js'
import { attachIds } from '../src/lib/vocabCandidates.js'
import { createDatabase, asUser, USER_A, USER_B } from './helpers/vocabDatabase.js'

let db, service
const faults = { insertWord: null, read: false, lostResponse: false }
const candidate = (overrides = {}) => attachIds([{
  english: 'stock', chinese: '股票', en_definition: 'An ownership interest.',
  en_example: 'The fund holds stock.', source_excerpt: 'The fund holds stock.',
  source_note: 'extracted_from_material', item_type: 'term', ...overrides,
}])[0]
const quote = name => {
  assert.match(name, /^[a-z_]+$/)
  return `"${name}"`
}
before(async () => {
  db = await createDatabase()
  // Exercise the real Supabase query builder. Only its external PostgREST HTTP
  // boundary is adapted to isolated PostgreSQL; no save/dedup logic is copied.
  const client = createClient('https://coursepilot.test', 'test-key', {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: async (input, options) => {
      const url = new URL(input)
      assert.equal(url.hostname, 'coursepilot.test')
      assert.equal(url.pathname, '/rest/v1/vocabulary')
      const method = options.method
      const body = options.body ? JSON.parse(options.body) : null
      if (method === 'POST' && faults.insertWord === body.word) {
        return Response.json({ message: 'Temporary save failure', code: 'TEST' }, { status: 503 })
      }
      if (method === 'GET' && faults.read) {
        return Response.json({ message: 'Lookup unavailable', code: 'TEST' }, { status: 503 })
      }
      try {
        const result = await asUser(db, USER_A, tx => {
          const values = [], conditions = []
          for (const [key, value] of url.searchParams) {
            if (key === 'select') continue
            assert.ok(value.startsWith('eq.'))
            values.push(value.slice(3)); conditions.push(`${quote(key)} = $${values.length}`)
          }
          if (method === 'POST') {
            const keys = Object.keys(body)
            return tx.query(`insert into vocabulary (${keys.map(quote).join(',')}) values (${keys.map((_, i) => `$${i + 1}`).join(',')}) returning *`, keys.map(key => body[key]))
          }
          if (method === 'GET') return tx.query(`select * from vocabulary where ${conditions.join(' and ')}`, values)
          assert.equal(method, 'PATCH')
          const updates = Object.keys(body).map(key => { values.push(body[key]); return `${quote(key)} = $${values.length}` })
          return tx.query(`update vocabulary set ${updates.join(',')} where ${conditions.join(' and ')} returning *`, values)
        })
        if (method === 'POST' && faults.lostResponse) {
          faults.lostResponse = false
          throw new Error('Connection lost after database commit')
        }
        const single = new Headers(options.headers).get('accept')?.includes('vnd.pgrst.object')
        return Response.json(single ? result.rows[0] : result.rows, { status: method === 'POST' ? 201 : 200 })
      } catch (error) {
        return Response.json({ message: error.message, code: error.code || 'NETWORK' }, { status: error.code === '23505' ? 409 : 400 })
      }
    } },
  })
  service = createVocabPersistence(client)
})
after(async () => { await db?.close() })

test('save and retry without a session results in one database record', async () => {
  const item = candidate()
  assert.equal((await service.saveVocabItems(USER_A, null, null, [item])).saved, 1)
  const again = await service.saveVocabItems(USER_A, null, null, [item])
  assert.equal(again.skipped, 1); assert.equal(again.errors.length, 0)
  assert.equal((await db.query('select count(*)::int as n from vocabulary where candidate_id=$1', [item._id])).rows[0].n, 1)
})
test('two concurrent save calls use the database unique key', async () => {
  const item = candidate()
  const results = await Promise.all([service.saveVocabItems(USER_A, null, null, [item]), service.saveVocabItems(USER_A, null, null, [item])])
  assert.equal(results.reduce((n, r) => n + r.saved, 0), 1)
  assert.equal(results.reduce((n, r) => n + r.skipped, 0), 1)
})
test('same spelling with different meanings saves both candidate IDs', async () => {
  const result = await service.saveVocabItems(USER_A, null, null, [candidate(), candidate({ chinese: '库存', en_definition: 'Goods held for sale.' })])
  assert.equal(result.saved, 2); assert.equal(result.skipped, 0)
})
test('lost response followed by retry preserves the committed record', async () => {
  const item = candidate()
  faults.lostResponse = true
  assert.equal((await service.saveVocabItems(USER_A, null, null, [item])).errors.length, 1)
  assert.equal((await service.saveVocabItems(USER_A, null, null, [item])).skipped, 1)
})
test('failed duplicate lookup is reported as failure', async () => {
  const item = candidate()
  await service.saveVocabItems(USER_A, null, null, [item])
  faults.read = true
  try {
    const result = await service.saveVocabItems(USER_A, null, null, [item])
    assert.equal(result.skipped, 0); assert.equal(result.errors[0].id, item._id)
  } finally { faults.read = false }
})
test('partial failure retries only failed candidates without losing edits', async () => {
  const first = candidate(), second = { ...candidate({ english: 'FAIL-ONCE' }), user_edited: true }
  faults.insertWord = second.english
  const partial = await service.saveVocabItems(USER_A, null, null, [first, second])
  faults.insertWord = null
  assert.equal(partial.saved, 1); assert.equal(partial.errors[0].id, second._id)
  const retry = await service.saveVocabItems(USER_A, null, null, [second])
  assert.equal(retry.saved, 1)
  assert.equal((await db.query('select user_edited from vocabulary where candidate_id=$1', [second._id])).rows[0].user_edited, true)
})
test('saved candidate with different edits is not silently skipped or overwritten', async () => {
  const item = candidate()
  await service.saveVocabItems(USER_A, null, null, [item])
  const result = await service.saveVocabItems(USER_A, null, null, [{ ...item, chinese: '新含义' }])
  assert.equal(result.errors.length, 1); assert.equal(result.skipped, 0)
})
test('library editing preserves provenance and owner and synchronizes legacy example', async () => {
  const item = candidate()
  const saved = await service.saveVocabItems(USER_A, null, 'Session 1', [item])
  const id = saved.results[0].wordId
  assert.equal((await service.editVocabWord(id, { word: 'stock', user_id: USER_B, source_excerpt: 'fabricated', en_example: 'A corrected example.' })).error, null)
  const row = (await db.query('select * from vocabulary where id=$1', [id])).rows[0]
  assert.equal(row.user_id, USER_A); assert.equal(row.source_excerpt, item.source_excerpt)
  assert.equal(row.example, 'A corrected example.'); assert.equal(row.user_edited, true)
})
test('invalid candidate IDs and empty terms are rejected before insert', async () => {
  const result = await service.saveVocabItems(USER_A, null, null, [{ ...candidate(), _id: 0 }, candidate({ english: ' ' })])
  assert.equal(result.errors.length, 2); assert.equal(result.saved, 0)
})
