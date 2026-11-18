-- ============================================================
-- CoursePilot — Migration 003: Vocabulary courses & bilingual fields
-- Historical setup draft, corrected to avoid duplicate policy errors.
-- Full setup also requires 004 (ownership/retries) and 005 (learning progress).
-- For manual setup on an existing team database, use 004 then 005 directly.
-- ============================================================
-- PURPOSE
--   Extends the vocabulary module to support:
--   1. Course and session tracking (new tables: courses, sessions)
--   2. Bilingual content on vocabulary words (new columns on vocabulary)
--   3. Source attribution (which material and excerpt the word came from)
--
-- BACKWARD COMPATIBILITY
--   Almost all new columns on public.vocabulary are nullable. The only
--   exception is user_edited (boolean NOT NULL DEFAULT false), which is
--   safe for existing rows because the DEFAULT fills in automatically.
--   Rows created before this migration will have NULL for every other
--   new column and will continue to be read and displayed normally by
--   getDailyVocab, getVocabulary, and Dashboard queries.
--   No existing data is modified or deleted.
--
-- HOW TO RUN
--   Supabase Dashboard → SQL Editor → New query → paste entire file → Run
--   Read the NOTICE messages. If any step reports an error, stop and
--   report to the team before proceeding.
--
-- WHO SHOULD RUN THIS
--   Nancy (or the designated database owner). Do not run on the shared
--   project without team agreement. Run the reviewed migration set together.
--
-- DEPENDENCIES
--   Requires 001_initial_schema.sql to have been applied already.
-- ============================================================

begin;

-- ── Safety check: confirm vocabulary table exists before proceeding ──
do $$
begin
  if not exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'vocabulary'
  ) then
    raise exception
      'vocabulary table not found — run 001_initial_schema.sql first.';
  end if;
  raise notice 'vocabulary table confirmed. Proceeding with migration 003.';
end;
$$;

-- ============================================================
-- 1. courses
--    One row per course a user is taking (e.g. "MGMT 8710").
--    course_code is what the user types (not enforced globally unique —
--    different users can have the same code).
-- ============================================================
create table if not exists public.courses (
  id           uuid        primary key default gen_random_uuid(),
  user_id      uuid        not null references auth.users(id) on delete cascade,
  course_code  text        not null,   -- e.g. "MGMT 8710"
  course_name  text,                   -- e.g. "Business Valuation & Strategy"
  created_at   timestamptz default now()
);

alter table public.courses enable row level security;

drop policy if exists "Users can select own courses" on public.courses;
create policy "Users can select own courses"
  on public.courses for select
  using (auth.uid() = user_id);

drop policy if exists "Users can insert own courses" on public.courses;
create policy "Users can insert own courses"
  on public.courses for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users can update own courses" on public.courses;
create policy "Users can update own courses"
  on public.courses for update
  using (auth.uid() = user_id);

drop policy if exists "Users can delete own courses" on public.courses;
create policy "Users can delete own courses"
  on public.courses for delete
  using (auth.uid() = user_id);

-- ============================================================
-- 2. sessions
--    One row per class session within a course.
--    class_date is nullable — user may not yet know the date.
--    class_date must be set explicitly by the user; it is never
--    inferred from file names or assignment deadlines.
-- ============================================================
create table if not exists public.sessions (
  id           uuid        primary key default gen_random_uuid(),
  course_id    uuid        not null references public.courses(id) on delete cascade,
  user_id      uuid        not null references auth.users(id) on delete cascade,
  session_number integer,              -- e.g. 3
  session_title  text,                 -- e.g. "Mergers & Acquisitions" (optional)
  class_date     date,                 -- NULL = "unscheduled"; user must confirm
  class_end_time time,                 -- optional; used to compute post-class review window
  timezone       text,                 -- e.g. "America/Toronto"; defaults shown in UI
  created_at     timestamptz default now()
);

alter table public.sessions enable row level security;

drop policy if exists "Users can select own sessions" on public.sessions;
create policy "Users can select own sessions"
  on public.sessions for select
  using (auth.uid() = user_id);

drop policy if exists "Users can insert own sessions" on public.sessions;
create policy "Users can insert own sessions"
  on public.sessions for insert
  with check (
    auth.uid() = user_id
    -- Prevent a user from referencing another user's course.
    and exists (
      select 1 from public.courses c
      where c.id = course_id and c.user_id = auth.uid()
    )
  );

drop policy if exists "Users can update own sessions" on public.sessions;
create policy "Users can update own sessions"
  on public.sessions for update
  using (auth.uid() = user_id);

drop policy if exists "Users can delete own sessions" on public.sessions;
create policy "Users can delete own sessions"
  on public.sessions for delete
  using (auth.uid() = user_id);

-- ============================================================
-- 3. Add bilingual and provenance columns to vocabulary
--    All nullable except user_edited (NOT NULL DEFAULT false,
--    which is safe — the DEFAULT fills in for existing rows).
-- ============================================================

-- item_type: 'term' | 'phrase' | NULL (legacy rows)
alter table public.vocabulary
  add column if not exists item_type text;

-- chinese: Chinese equivalent of the word/phrase
alter table public.vocabulary
  add column if not exists chinese text;

-- zh_explanation: Chinese explanation (not just a translation)
alter table public.vocabulary
  add column if not exists zh_explanation text;

-- course_context: how the term is used in this specific course
alter table public.vocabulary
  add column if not exists course_context text;

-- en_example: English example sentence
alter table public.vocabulary
  add column if not exists en_example text;

-- zh_example: Chinese translation of en_example
alter table public.vocabulary
  add column if not exists zh_example text;

-- abbreviation: standard abbreviation (e.g. "DCF")
alter table public.vocabulary
  add column if not exists abbreviation text;

-- source_note: 'extracted_from_material' | 'ai_generated' | 'user_added'
alter table public.vocabulary
  add column if not exists source_note text;

-- source_excerpt: verbatim fragment from the original material
alter table public.vocabulary
  add column if not exists source_excerpt text;

-- source_material_name: label for the material (e.g. "Session 3 slides")
alter table public.vocabulary
  add column if not exists source_material_name text;

-- user_edited: true if the user has modified any AI-generated fields
alter table public.vocabulary
  add column if not exists user_edited boolean not null default false;

-- candidate_id: stable client-side identifier assigned before saving.
-- Used for idempotent saves (ON CONFLICT DO NOTHING on the unique index below).
-- nullable — legacy rows and words added without a candidate_id are NULL.
alter table public.vocabulary
  add column if not exists candidate_id uuid;

-- session_id: l