# Vocabulary Module — Database Migration Instructions

## Problem

Saving vocabulary words fails with:

```
Could not find the 'abbreviation' column of 'vocabulary' in the schema cache
```

**Root cause:** The vocabulary module requires new database columns (added by
migrations 003 and 004) that have not yet been applied to the shared Supabase
project. The front-end code is correct; only the database is missing these columns.

---

## What migrations 003 / 004 / 005 add

### 003 / 004 — `004_vocab_integrity.sql` (apply this one, not 003)

New columns on the `vocabulary` table:

| Column | Type | Purpose |
|---|---|---|
| `item_type` | text | `'term'` or `'phrase'` |
| `chinese` | text | Chinese equivalent |
| `zh_explanation` | text | Chinese explanation |
| `course_context` | text | How the term is used in context |
| `en_example` | text | English example sentence |
| `zh_example` | text | Chinese translation of example |
| `abbreviation` | text | Standard abbreviation (e.g. "DCF") |
| `source_note` | text | `'extracted_from_material'` / `'ai_generated'` / `'user_added'` |
| `source_excerpt` | text | Verbatim fragment from original material |
| `source_material_name` | text | Label for the source material |
| `user_edited` | boolean NOT NULL DEFAULT false | Whether user has edited AI fields |
| `candidate_id` | uuid | Client-side stable ID for idempotent saves |
| `session_id` | uuid FK | Links word to a class session |

New tables:

- `public.courses` — course a user is taking (e.g. "MGMT 8710")
- `public.sessions` — individual class sessions within a course

### 005 — `005_vocab_review.sql`

New columns on `vocabulary` for spaced-repetition review:

| Column | Purpose |
|---|---|
| `review_stage` | 0–5, tracks spaced-repetition progress |
| `review_revision` | Increments on each review (optimistic concurrency) |
| `last_reviewed_on` | Date of most recent review |
| `last_review_id` | UUID to make retries safe |

New database function: `public.record_vocab_review(...)` — called by the Today
review tab.

---

## Steps to apply

**Who:** The designated database owner (Nancy), or anyone with SQL Editor access
to the shared Supabase project.

**When:** Apply both migrations together in one session, in order.

### Step 1 — Open the Supabase SQL Editor

Go to: **https://supabase.com/dashboard** → CoursePilot project →
**SQL Editor** → **New query**

### Step 2 — Run migration 004

> ⚠️  Run **004**, not 003. Migration 004 is a corrected superset of 003 that
> can be safely applied to a database that has only had 001 applied.
> Do **not** run 003 first — it will conflict.

1. Open `supabase/migrations/004_vocab_integrity.sql`
2. Copy the entire file contents
3. Paste into the SQL Editor
4. Click **Run**
5. Verify the final `SELECT` output lists the new columns including `abbreviation`

### Step 3 — Run migration 005

1. Open `supabase/migrations/005_vocab_review.sql`
2. Copy the entire file contents
3. Paste into the SQL Editor
4. Click **Run**

### Step 4 — Verify

After both migrations, run this quick check in the SQL Editor:

```sql
SELECT column_name FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'vocabulary'
ORDER BY ordinal_position;
```

Expected to include: `abbreviation`, `candidate_id`, `session_id`,
`review_stage`, `review_revision`, `last_reviewed_on`, `last_review_id`

```sql
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public' AND table_name IN ('courses', 'sessions');
```

Expected: two rows — `courses` and `sessions`.

---

## After the migration

Retry the vocabulary save. The error will be gone. No code changes are needed —
the front-end code was correct all along.

**Existing vocabulary data is not affected.** All new columns are nullable
(except `user_edited` which defaults to `false`), so existing rows remain
readable and unchanged.

---

## RLS (Row Level Security)

Migration 004 replaces the original individual RLS policies on `vocabulary`,
`courses`, and `sessions` with consolidated `vocabulary_owner_access` and
`vocabulary_owner_guard` policies. These enforce the same rule as before:
users can only read and write their own rows. No cross-user access is possible.
