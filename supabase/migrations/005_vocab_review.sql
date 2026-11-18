-- Vocabulary review progress. Apply AFTER 004_vocab_integrity.sql.
-- Review copy for the shared database owner; no existing dates are rewritten.
begin;

alter table public.vocabulary
  add column if not exists review_stage integer not null default 0,
  add column if not exists review_revision integer not null default 0,
  add column if not exists last_reviewed_on date,
  add column if not exists last_review_id uuid;

-- SECURITY INVOKER keeps RLS active. Row locking + a unique operation ID make
-- retries and stale browser tabs safe. The client cannot advance a word twice
-- in one calendar day. Dates are supplied using the device's local calendar;
-- tolerate timezone differences, but not arbitrary past/future clock dates.
create or replace function public.record_vocab_review(
  p_word_id uuid, p_rating text, p_day date,
  p_expected_revision integer, p_review_id uuid
) returns setof public.vocabulary
language plpgsql security invoker set search_path = public, pg_temp as $$
declare
  item public.vocabulary%rowtype;
  lesson_day date;
  stage integer;
  due_day date;
begin
  if auth.uid() is null then raise exception 'Please sign in again.'; end if;
  if p_rating is null or p_rating not in ('again', 'hard', 'good') then
    raise exception 'Choose a valid review rating.';
  end if;
  if p_day is null or abs(p_day - current_date) > 2 or p_review_id is null then
    raise exception 'Check the date on your device and try again.';
  end if;

  select * into item from public.vocabulary
    where id = p_word_id and user_id = auth.uid() for update;
  if not found then raise exception 'This vocabulary item is no longer available.'; end if;
  if item.last_review_id = p_review_id then return next item; return; end if;
  if p_expected_revision is null or item.review_revision <> p_expected_revision then
    raise exception 'This item changed in another tab. Reload today’s learning list.';
  end if;
  if item.last_reviewed_on >= p_day then
    raise exception 'Already reviewed today. You can practice again tomorrow.';
  end if;

  select class_date into lesson_day from public.sessions
    where id = item.session_id and user_id = auth.uid();
  if lesson_day >= p_day then
    -- Previewing does not imply mastery; first post-class review is next day.
    stage := 0;
    due_day := lesson_day + 1;
  elsif p_rating = 'again' then
    stage := 0; due_day := p_day + 1;
  elsif p_rating = 'hard' then
    stage := greatest(item.review_stage - 1, 0); due_day := p_day + 1;
  else
    stage := least(item.review_stage + 1, 5);
    due_day := p_day + (array[1,3,7,14,30])[stage];
  end if;

  update public.vocabulary set
    review_stage = stage,
    review_revision = review_revision + 1,
    next_review = due_day,
    last_reviewed_on = p_day,
    last_review_id = p_review_id,
    status = case when stage >= 5 then 'mastered' else 'learning' end
    where id = item.id returning * into item;
  return next item;
end;
$$;

revoke all on function public.record_vocab_review(uuid,text,date,integer,uuid) from public;
grant execute on function public.record_vocab_review(uuid,text,date,integer,uuid) to authenticated;
notify pgrst, 'reload schema';
commit;
