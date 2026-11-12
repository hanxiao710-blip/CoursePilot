-- ============================================================
-- CoursePilot — Supabase migration
-- Run this in the Supabase Dashboard → SQL Editor
-- ============================================================

-- ── Enable UUID extension (already on by default in Supabase) ──
create extension if not exists "pgcrypto";

-- ============================================================
-- 1. profiles
-- ============================================================
create table if not exists public.profiles (
  id            uuid primary key references auth.users(id) on delete cascade,
  display_name  text,
  theme         text    default 'default',
  bg_image_path text,
  updated_at    timestamptz default now()
);

-- Automatically create a profile row when a new user signs up
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id)
  values (new.id)
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ============================================================
-- 2. assignments
-- ============================================================
create table if not exists public.assignments (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  course      text not null,
  title       text not null,
  deadline    date not null,
  completed   boolean not null default false,
  created_at  timestamptz default now()
);

-- ============================================================
-- 3. vocabulary
-- ============================================================
create table if not exists public.vocabulary (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  word            text not null,
  definition      text not null,
  example         text,
  status          text not null default 'new',   -- new | learning | mastered
  next_review     date not null default current_date,
  created_at      timestamptz default now()
);

-- ============================================================
-- 4. study_suggestions
-- ============================================================
create table if not exists public.study_suggestions (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  content         text not null,
  assignment_id   uuid references public.assignments(id) on delete set null,
  created_at      timestamptz default now()
);

-- ============================================================
-- 5. Row Level Security — profiles
-- ============================================================
alter table public.profiles enable row level security;

create policy "Users can view own profile"
  on public.profiles for select
  using (auth.uid() = id);

create policy "Users can update own profile"
  on public.profiles for update
  using (auth.uid() = id);

-- ============================================================
-- 6. Row Level Security — assignments
-- ============================================================
alter table public.assignments enable row level security;

create policy "Users can select own assignments"
  on public.assignments for select
  using (auth.uid() = user_id);

create policy "Users can insert own assignments"
  on public.assignments for insert
  with check (auth.uid() = user_id);

create policy "Users can update own assignments"
  on public.assignments for update
  using (auth.uid() = user_id);

create policy "Users can delete own assignments"
  on public.assignments for delete
  using (auth.uid() = user_id);

-- ============================================================
-- 7. Row Level Security — vocabulary
-- ============================================================
alter table public.vocabulary enable row level security;

create policy "Users can select own vocabulary"
  on public.vocabulary for select
  using (auth.uid() = user_id);

create policy "Users can insert own vocabulary"
  on public.vocabulary for insert
  with check (auth.uid() = user_id);

create policy "Users can update own vocabulary"
  on public.vocabulary for update
  using (auth.uid() = user_id);

create policy "Users can delete own vocabulary"
  on public.vocabulary for delete
  using (auth.uid() = user_id);

-- ============================================================
-- 8. Row Level Security — study_suggestions
-- ============================================================
alter table public.study_suggestions enable row level security;

create policy "Users can select own suggestions"
  on public.study_suggestions for select
  using (auth.uid() = user_id);

create policy "Users can insert own suggestions"
  on public.study_suggestions for insert
  with check (auth.uid() = user_id);

create policy "Users can update own suggestions"
  on public.study_suggestions for update
  using (auth.uid() = user_id);

create policy "Users can delete own suggestions"
  on public.study_suggestions for delete
  using (auth.uid() = user_id);

-- ============================================================
-- 9. Storage bucket: avatars (profile background images)
-- ============================================================
-- Run separately in Supabase Dashboard → Storage → Create bucket
-- Bucket name: "avatars", Public: false
-- Then add these storage policies in Dashboard → Storage → Policies:

-- INSERT policy (authenticated users can upload their own files):
-- (storage.foldername(name))[1] = auth.uid()::text

-- SELECT policy (users can read their own files):
-- (storage.foldername(name))[1] = auth.uid()::text

-- DELETE policy (users can delete their own files):
-- (storage.foldername(name))[1] = auth.uid()::text
