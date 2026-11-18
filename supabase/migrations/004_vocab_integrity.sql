-- CoursePilot Vocabulary: bilingual library, ownership and retry-safe saves.
-- REVIEW COPY: shared Supabase application is for Nancy/database owner.
-- Requires migration 001. PostgreSQL 15+ (column-specific ON DELETE SET NULL).
-- This file includes 003's schema additions. For manual SQL Editor setup,
-- apply THIS file after 001; do not run the superseded 003 first. It also
-- repairs an already-applied or partially-applied 003. Cloud state is unknown.
-- Run the entire file together. On error, ROLLBACK the failed transaction;
-- investigate the reported conflicting data/schema, then retry this file.
-- No data is deleted or automatically deduplicated. Existing vocabulary and
-- learning dates remain unchanged; user_edited is NOT NULL DEFAULT false.

begin;

do $$ begin
  if to_regclass('public.vocabulary') is null then
    raise exception 'Apply migration 001 before Vocabulary setup.';
  end if;
  if current_setting('server_version_num')::integer < 150000 then
    raise exception 'Vocabulary setup requires PostgreSQL 15 or later.';
  end if;
end $$;

create table if not exists public.courses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  course_code text not null,
  course_name text,
  created_at timestamptz default now()
);

create table if not exists public.sessions (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  session_number integer,
  session_title text,
  class_date date,
  class_end_time time,
  timezone text,
  created_at timestamptz default now()
);

alter table public.vocabulary
  add column if not exists item_type text,
  add column if not exists chinese text,
  add column if not exists zh_explanation text,
  add column if not exists course_context text,
  add column if not exists en_example text,
  add column if not exists zh_example text,
  add column if not exists abbreviation text,
  add column if not exists source_note text,
  add column if not exists source_excerpt text,
  add column if not exists source_material_name text,
  add column if not exists user_edited boolean not null default false,
  add column if not exists candidate_id uuid,
  add column if not exists session_id uuid;

-- Pair each parent identifier with its owner. These constraints also protect
-- parent ownership changes, and apply on both INSERT and UPDATE.
create unique index if not exists idx_courses_id_owner on public.courses (id, user_id);
create unique index if not exists idx_sessions_id_owner on public.sessions (id, user_id);

alter table public.sessions drop constraint if exists sessions_course_id_fkey;
alter table public.sessions drop constraint if exists sessions_course_owner_fkey;
alter table public.sessions add constraint sessions_course_owner_fkey
  foreign key (course_id, user_id) references public.courses (id, user_id) on delete cascade;

alter table public.vocabulary drop constraint if exists vocabulary_session_id_fkey;
alter table public.vocabulary drop constraint if exists vocabulary_session_owner_fkey;
alter table public.vocabulary add constraint vocabulary_session_owner_fkey
  foreign key (session_id, user_id) references public.sessions (id, user_id)
  on delete set null (session_id);

-- Deliberately exclude nullable session_id from the retry key. NULL candidate
-- IDs remain valid for legacy/manual words, while UUID candidates are unique
-- per user even without a session. Same spelling can have multiple meanings.
drop index if exists public.idx_vocabulary_candidate_id;
create unique index if not exists idx_vocabulary_user_candidate
  on public.vocabulary (user_id, candidate_id);
create index if not exists idx_vocabulary_session_id on public.vocabulary (session_id);
create index if not exists idx_vocabulary_user_next_review on public.vocabulary (user_id, next_review);
create index if not exists idx_sessions_course_id on public.sessions (course_id);

alter table public.courses enable row level security;
alter table public.sessions enable row level security;
alter table public.vocabulary enable row level security;

-- Replace these module-owned policy names, so retries do not fail on duplicate
-- CREATE POLICY. The restrictive guard also prevents a separate permissive
-- policy from widening ownership access by being OR-ed with these policies.
do $$
declare target text; action text;
begin
  foreach target in array array['courses', 'sessions', 'vocabulary'] loop
    foreach action in array array['select', 'insert', 'update', 'delete'] loop
      execute format('drop policy if exists %I on public.%I',
        'Users can ' || action || ' own ' || target, target);
    end loop;
    execute format('drop policy if exists vocabulary_owner_access on public.%I', target);
    execute format('drop policy if exists vocabulary_owner_guard on public.%I', target);
    execute format('create policy vocabulary_owner_access on public.%I for all
      using (auth.uid() = user_id) with check (auth.uid() = user_id)', target);
    execute format('create policy vocabulary_owner_guard on public.%I as restrictive for all
      using (auth.uid() = user_id) with check (auth.uid() = user_id)', target);
  end loop;
end $$;

notify pgrst, 'reload schema';
commit;

-- Successful completion means these rules applied to the current database.
-- It does not verify browser login, Gemini, deployed API routing or Dashboard.
