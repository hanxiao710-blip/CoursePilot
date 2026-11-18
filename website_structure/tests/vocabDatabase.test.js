import test, { before, after } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createDatabase, asUser, USER_A, USER_B, migrationUrl } from './helpers/vocabDatabase.js'

let db, courseA, courseB, sessionA, sessionB
before(async () => {
  db = await createDatabase({ includeLegacyMigration: true })
  for (const user of [USER_A, USER_B]) {
    const c = await asUser(db, user, tx => tx.query('insert into courses (user_id, course_code) values ($1, $2) returning id', [user, 'MGMT 8710']))
    const course = c.rows[0].id
    const s = await asUser(db, user, tx => tx.query('insert into sessions (user_id, course_id) values ($1, $2) returning id', [user, course]))
    if (user === USER_A) { courseA = course; sessionA = s.rows[0].id }
    else { courseB = course; sessionB = s.rows[0].id }
  }
})
after(async () => { await db?.close() })
test('migration can repeat without duplicating policies or losing data', async () => {
  await db.exec(await readFile(migrationUrl, 'utf8'))
  assert.equal((await db.query('select count(*)::int as n from courses')).rows[0].n, 2)
})
test('RLS hides another user’s courses and sessions', async () => {
  assert.deepEqual((await asUser(db, USER_A, tx => tx.query('select id from courses'))).rows.map(row => row.id), [courseA])
  assert.deepEqual((await asUser(db, USER_A, tx => tx.query('select id from sessions'))).rows.map(row => row.id), [sessionA])
})
test('cross-user session INSERT is rejected', async () => {
  await assert.rejects(asUser(db, USER_A, tx => tx.query('insert into sessions (user_id, course_id) values ($1, $2)', [USER_A, courseB])), { code: '23503' })
})
test('cross-user session UPDATE is rejected', async () => {
  await assert.rejects(asUser(db, USER_A, tx => tx.query('update sessions set course_id=$1 where id=$2', [courseB, sessionA])), { code: '23503' })
})
test('cross-user vocabulary INSERT and UPDATE are rejected', async () => {
  await assert.rejects(asUser(db, USER_A, tx => tx.query("insert into vocabulary (user_id, word, definition, session_id) values ($1, 'test', 'test', $2)", [USER_A, sessionB])), { code: '23503' })
  const word = await asUser(db, USER_A, tx => tx.query("insert into vocabulary (user_id, word, definition) values ($1, 'legacy', 'legacy') returning id", [USER_A]))
  await assert.rejects(asUser(db, USER_A, tx => tx.query('update vocabulary set session_id=$1 where id=$2', [sessionB, word.rows[0].id])), { code: '23503' })
})
test('RLS prevents updating, deleting or claiming another user’s word', async () => {
  const word = await asUser(db, USER_B, tx => tx.query("insert into vocabulary (user_id, word, definition) values ($1, 'private', 'private') returning id", [USER_B]))
  for (const sql of ['select * from vocabulary where id=$1', "update vocabulary set word='changed' where id=$1 returning id", 'delete from vocabulary where id=$1 returning id']) {
    assert.equal((await asUser(db, USER_A, tx => tx.query(sql, [word.rows[0].id]))).rows.length, 0)
  }
  await assert.rejects(asUser(db, USER_A, tx => tx.query("insert into vocabulary (user_id, word, definition) values ($1, 'claim', 'claim')", [USER_B])), { code: '42501' })
})
test('UUID uniqueness works without a session; legacy NULL IDs stay valid', async () => {
  const id = crypto.randomUUID()
  const sql = "insert into vocabulary (user_id, word, definition, candidate_id) values ($1, 'same', 'meaning', $2)"
  await asUser(db, USER_A, tx => tx.query(sql, [USER_A, id]))
  await assert.rejects(asUser(db, USER_A, tx => tx.query(sql, [USER_A, id])), { code: '23505' })
  await asUser(db, USER_A, tx => tx.query(sql, [USER_A, null]))
  await asUser(db, USER_A, tx => tx.query(sql, [USER_A, null]))
})
test('course deletion preserves words and ownership while clearing the session', async () => {
  const course = (await asUser(db, USER_A, tx => tx.query("insert into courses (user_id, course_code) values ($1, 'DELETE-TEST') returning id", [USER_A]))).rows[0].id
  const session = (await asUser(db, USER_A, tx => tx.query('insert into sessions (user_id, course_id) values ($1,$2) returning id', [USER_A, course]))).rows[0].id
  const word = (await asUser(db, USER_A, tx => tx.query("insert into vocabulary (user_id, session_id, word, definition) values ($1,$2,'keep','keep') returning id", [USER_A, session]))).rows[0].id
  await asUser(db, USER_A, tx => tx.query('delete from courses where id=$1', [course]))
  const result = await asUser(db, USER_A, tx => tx.query('select session_id, user_id, word from vocabulary where id=$1', [word]))
  assert.deepEqual(result.rows[0], { session_id: null, user_id: USER_A, word: 'keep' })
})
test('a permissive policy cannot widen access past the restrictive guard', async () => {
  await db.exec('create policy test_overly_permissive on courses for select using (true)')
  assert.deepEqual((await asUser(db, USER_A, tx => tx.query('select id from courses'))).rows.map(row => row.id), [courseA])
  await db.exec('drop policy test_overly_permissive on courses')
})
