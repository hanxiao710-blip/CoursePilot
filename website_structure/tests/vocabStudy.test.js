import test, { before, after } from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { createClient } from '@supabase/supabase-js'
import { createReviewService } from '../src/lib/vocabReviewService.js'
import { buildStudyLists, localDay } from '../src/lib/vocabStudy.js'
import { createDatabase, asUser, USER_A, USER_B } from './helpers/vocabDatabase.js'

let db, day, service
const add = (value, days) => { const date = new Date(value + 'T12:00:00'); date.setDate(date.getDate() + days); return localDay(date) }
before(async () => {
  db = await createDatabase()
  day = (await db.query('select current_date::text as day')).rows[0].day
  const client = createClient('https://review.coursepilot.test', 'test-key', {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: async (input, options) => {
      assert.equal(new URL(input).pathname, '/rest/v1/rpc/record_vocab_review')
      const p = JSON.parse(options.body)
      try {
        const result = await asUser(db, USER_A, tx => tx.query(
          'select to_jsonb(r) as row from record_vocab_review($1,$2,$3,$4,$5) r',
          [p.p_word_id, p.p_rating, p.p_day, p.p_expected_revision, p.p_review_id]))
        // PostgREST uses PostgreSQL JSON encoding for DATE, not a JS Date's
        // timestamp encoding. Keep that transport behavior in this adapter.
        return Response.json(result.rows[0].row)
      } catch (error) { return Response.json({ message: error.message, code: error.code }, { status: 400 }) }
    } },
  })
  service = createReviewService(client)
})
after(async () => { await db?.close() })
async function word(stage = 0, session = null, owner = USER_A) {
  return (await db.query(`insert into vocabulary(user_id,word,definition,review_stage,session_id)
    values($1,'opportunity cost','The value of the next best alternative.',$2,$3) returning *`, [owner, stage, session])).rows[0]
}

test('study lists use local calendar dates and include all courses on the nearest class date', () => {
  assert.equal(localDay(new Date(2026, 10, 18, 23, 59)), '2026-11-18')
  const sessions = [{ id: 'a', class_date: '2026-11-19' }, { id: 'b', class_date: '2026-11-19' }, { id: 'c', class_date: '2026-11-20' }]
  const words = [
    { id: 'preview', session_id: 'a', sessions: sessions[0], word: 'cost', next_review: '2026-11-17' },
    { id: 'overdue', word: 'risk', next_review: '2026-11-16' },
    { id: 'today', word: 'stock', next_review: '2026-11-18' },
    { id: 'done', word: 'bond', next_review: '2026-11-18', last_reviewed_on: '2026-11-18' },
    { id: 'future', word: 'NPV', next_review: '2026-11-20' },
  ]
  const result = buildStudyLists(words, sessions, '2026-11-18')
  assert.deepEqual(result.nextSessions.map(s => s.id), ['a', 'b'])
  assert.deepEqual(result.preview.map(w => w.id), ['preview'])
  assert.deepEqual(result.due.map(w => w.id), ['overdue', 'today'])
})
test('review migration can be applied twice without losing progress', async () => {
  const item = await word()
  const saved = await service(item, 'good', day, randomUUID())
  assert.ifError(saved.error)
  await db.exec(await readFile(new URL('../../supabase/migrations/005_vocab_review.sql', import.meta.url), 'utf8'))
  assert.equal((await db.query('select review_revision from vocabulary where id=$1', [item.id])).rows[0].review_revision, 1)
})
test('pre-class practice schedules the first review for the day after class', async () => {
  const course = (await db.query('insert into courses(user_id,course_code) values($1,$2) returning id', [USER_A, 'MGMT 8710'])).rows[0].id
  const session = (await db.query('insert into sessions(user_id,course_id,class_date) values($1,$2,$3) returning id', [USER_A, course, add(day, 3)])).rows[0].id
  const result = await service(await word(0, session), 'good', day, randomUUID())
  assert.ifError(result.error)
  assert.equal(result.data.next_review, add(day, 4))
  assert.equal(result.data.review_stage, 0)
  assert.equal(result.data.status, 'learning')
})
test('successful recall progresses through the specified spaced review intervals', async () => {
  for (const [stage, interval] of [1, 3, 7, 14, 30].entries()) {
    const result = await service(await word(stage), 'good', day, randomUUID())
    assert.ifError(result.error)
    assert.equal(result.data.review_stage, stage + 1)
    assert.equal(result.data.next_review, add(day, interval))
  }
})
test('again and hard return the item tomorrow without marking it mastered', async () => {
  for (const rating of ['again', 'hard']) {
    const result = await service(await word(4), rating, day, randomUUID())
    assert.equal(result.data.next_review, add(day, 1))
    assert.equal(result.data.status, 'learning')
    assert.equal(result.data.review_stage, rating === 'again' ? 0 : 3)
  }
})
test('lost-response retry is idempotent and a stale tab cannot advance progress', async () => {
  const item = await word(), operation = randomUUID()
  const first = await service(item, 'good', day, operation)
  const retry = await service(item, 'good', day, operation)
  assert.ifError(retry.error)
  assert.equal(retry.data.review_revision, first.data.review_revision)
  assert.ok((await service(item, 'good', day, randomUUID())).error)
  assert.ok((await service(retry.data, 'good', day, randomUUID())).error)
})
test('review RPC rejects another user’s item, invalid dates and invalid ratings', async () => {
  assert.ok((await service(await word(0, null, USER_B), 'good', day, randomUUID())).error)
  const own = await word()
  assert.ok((await service(own, 'good', add(day, 10), randomUUID())).error)
  assert.ok((await service(own, 'invented', day, randomUUID())).error)
  assert.equal((await db.query('select review_revision from vocabulary where id=$1', [own.id])).rows[0].review_revision, 0)
})
