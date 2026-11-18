import { PGlite } from '@electric-sql/pglite'
import { readFile } from 'node:fs/promises'

export const USER_A = '11111111-1111-4111-8111-111111111111'
export const USER_B = '22222222-2222-4222-8222-222222222222'
export const migrationUrl = new URL('../../../supabase/migrations/004_vocab_integrity.sql', import.meta.url)

// Supabase's auth schema and auth.uid() are the only platform fixtures. RLS,
// constraints, transactions and the module migration run in real PostgreSQL
// (PGlite, not a JavaScript emulation). No remote database is contacted.
export async function createDatabase({ includeLegacyMigration = false } = {}) {
  const db = await PGlite.create()
  await db.exec(`
    create schema auth;
    create table auth.users (id uuid primary key);
    create role authenticated nologin;
    create function auth.uid() returns uuid language sql stable as
      $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  `)
  const initial = await readFile(new URL('../../../supabase/migrations/001_initial_schema.sql', import.meta.url), 'utf8')
  // PGlite has gen_random_uuid() in core, but not the pgcrypto extension. Only
  // that infrastructure installation line is omitted; schema/RLS run unchanged.
  await db.exec(initial.replace('create extension if not exists "pgcrypto";', ''))
  await db.query('insert into auth.users (id) values ($1), ($2)', [USER_A, USER_B])
  if (includeLegacyMigration) {
    await db.exec(await readFile(new URL('../../../supabase/migrations/003_vocab_courses.sql', import.meta.url), 'utf8'))
  }
  await db.exec(await readFile(migrationUrl, 'utf8'))
  await db.exec(await readFile(new URL('../../../supabase/migrations/005_vocab_review.sql', import.meta.url), 'utf8'))
  await db.exec(`
    grant usage on schema public, auth to authenticated;
    grant select, insert, update, delete on all tables in schema public to authenticated;
  `)
  return db
}

export function asUser(db, userId, fn) {
  return db.transaction(async tx => {
    await tx.exec('set local role authenticated')
    await tx.query("select set_config('request.jwt.claim.sub', $1, true)", [userId])
    return fn(tx)
  })
}
