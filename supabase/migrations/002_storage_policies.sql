-- ============================================================
-- CoursePilot — Storage policies for the "avatars" bucket
-- Safely repeatable: checks pg_policies before each CREATE.
-- Reports definition mismatches; never silently skips them.
-- ============================================================
-- HOW TO RUN:
--   Supabase Dashboard → SQL Editor → New query → paste → Run
--   Read the NOTICE messages in the output before proceeding.
-- ============================================================

do $$
declare
  v_name       text;
  v_cmd        text;
  v_using      text;
  v_check      text;
  v_ex_using   text;
  v_ex_check   text;
  v_ex_roles   text;
  v_found      boolean;

  -- Shared expression used by all four policies
  folder_expr  text := $e$bucket_id = 'avatars' AND (storage.foldername(name))[1] = (auth.uid())::text$e$;

begin

  -- ── 1. SELECT ────────────────────────────────────────────
  v_name  := 'avatars: users read own files';
  v_cmd   := 'SELECT';
  v_using := folder_expr;
  v_check := null;

  select qual, with_check, roles::text
    into v_ex_using, v_ex_check, v_ex_roles
    from pg_policies
   where schemaname = 'storage'
     and tablename  = 'objects'
     and policyname = v_name;

  v_found := found;

  if v_found then
    if v_ex_roles <> '{authenticated}' then
      raise notice 'MISMATCH [%]: roles = % (expected {authenticated})', v_name, v_ex_roles;
    elsif v_ex_using is distinct from v_using then
      raise notice 'MISMATCH [%]: USING = [%] (expected [%])', v_name, v_ex_using, v_using;
    else
      raise notice 'EXISTS OK [%]', v_name;
    end if;
  else
    execute format(
      'create policy %I on storage.objects for select to authenticated using (%s)',
      v_name, v_using
    );
    raise notice 'CREATED [%]', v_name;
  end if;

  -- ── 2. INSERT ────────────────────────────────────────────
  v_name  := 'avatars: users upload own files';
  v_cmd   := 'INSERT';
  v_using := null;
  v_check := folder_expr;

  select qual, with_check, roles::text
    into v_ex_using, v_ex_check, v_ex_roles
    from pg_policies
   where schemaname = 'storage'
     and tablename  = 'objects'
     and policyname = v_name;

  v_found := found;

  if v_found then
    if v_ex_roles <> '{authenticated}' then
      raise notice 'MISMATCH [%]: roles = % (expected {authenticated})', v_name, v_ex_roles;
    elsif v_ex_check is distinct from v_check then
      raise notice 'MISMATCH [%]: WITH CHECK = [%] (expected [%])', v_name, v_ex_check, v_check;
    else
      raise notice 'EXISTS OK [%]', v_name;
    end if;
  else
    execute format(
      'create policy %I on storage.objects for insert to authenticated with check (%s)',
      v_name, v_check
    );
    raise notice 'CREATED [%]', v_name;
  end if;

  -- ── 3. UPDATE (needs both USING and WITH CHECK for upsert) ──
  v_name  := 'avatars: users update own files';
  v_cmd   := 'UPDATE';
  v_using := folder_expr;
  v_check := folder_expr;

  select qual, with_check, roles::text
    into v_ex_using, v_ex_check, v_ex_roles
    from pg_policies
   where schemaname = 'storage'
     and tablename  = 'objects'
     and policyname = v_name;

  v_found := found;

  if v_found then
    if v_ex_roles <> '{authenticated}' then
      raise notice 'MISMATCH [%]: roles = % (expected {authenticated})', v_name, v_ex_roles;
    elsif v_ex_using is distinct from v_using then
      raise notice 'MISMATCH [%]: USING = [%] (expected [%])', v_name, v_ex_using, v_using;
    elsif v_ex_check is distinct from v_check then
      raise notice 'MISMATCH [%]: WITH CHECK = [%] (expected [%])', v_name, v_ex_check, v_check;
    else
      raise notice 'EXISTS OK [%]', v_name;
    end if;
  else
    execute format(
      'create policy %I on storage.objects for update to authenticated using (%s) with check (%s)',
      v_name, v_using, v_check
    );
    raise notice 'CREATED [%]', v_name;
  end if;

  -- ── 4. DELETE ────────────────────────────────────────────
  v_name  := 'avatars: users delete own files';
  v_cmd   := 'DELETE';
  v_using := folder_expr;
  v_check := null;

  select qual, with_check, roles::text
    into v_ex_using, v_ex_check, v_ex_roles
    from pg_policies
   where schemaname = 'storage'
     and tablename  = 'objects'
     and policyname = v_name;

  v_found := found;

  if v_found then
    if v_ex_roles <> '{authenticated}' then
      raise notice 'MISMATCH [%]: roles = % (expected {authenticated})', v_name, v_ex_roles;
    elsif v_ex_using is distinct from v_using then
      raise notice 'MISMATCH [%]: USING = [%] (expected [%])', v_name, v_ex_using, v_using;
    else
      raise notice 'EXISTS OK [%]', v_name;
    end if;
  else
    execute format(
      'create policy %I on storage.objects for delete to authenticated using (%s)',
      v_name, v_using
    );
    raise notice 'CREATED [%]', v_name;
  end if;

end;
$$;

-- ============================================================
-- VERIFICATION — run this immediately after the DO block
-- ============================================================

-- Part 1: all policies on storage.objects (spot anything unexpected)
select
  policyname,
  cmd,
  roles,
  qual        as using_expr,
  with_check  as check_expr
from pg_policies
where schemaname = 'storage'
  and tablename  = 'objects'
order by policyname;

-- Part 2: flag any policy that lacks a bucket_id or foldername guard
-- (these would be overly broad and could expose other users' files)
select
  policyname,
  cmd,
  roles,
  qual        as using_expr,
  with_check  as check_expr
from pg_policies
where schemaname = 'storage'
  and tablename  = 'objects'
  and (
       coalesce(qual, '')       not like '%bucket_id%'
    or coalesce(with_check, '') not like '%bucket_id%'
    or coalesce(qual, '')       not like '%foldername%'
    or coalesce(with_check, '') not like '%foldername%'
  )
order by policyname;
