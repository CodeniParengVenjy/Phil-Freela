-- Late payments, Step 4 of PLAN-delays.md: work the client does not review is accepted
-- automatically after 7 days (the user, 2026-11-11: "7 days lets go"). Run in the
-- Supabase SQL Editor (or as a migration) after supabase_payment_due_schema.sql (Step 1).
--
-- The problem: when a freelancer sends the work, the project waits in "Submitted" until
-- the client marks it done or asks for changes. If the client never answers, it waits
-- forever: the freelancer's finished-project count and rating never start, and Step 1's
-- payment days (7 days after Done) never start, so that client could never be "late".
--
-- The rule, counted in Manila days from the LATEST sending of the work (sending it again
-- after "Ask for changes" starts the 7 days over):
--   day 6   the client is warned once: "Last day to review ... accepted automatically
--           tomorrow" (the existing project_review_reminder kind, so it is emailed to
--           an offline client too);
--   day 7   the work is accepted: the project becomes Done, both people are told, and
--           the payment days of Step 1 start. The acceptance only happens AFTER the
--           warning, at least one run later (if the daily job missed day 6, the warning
--           goes out first and the acceptance waits for the next day).
-- Nothing moves money (PhilFreela never holds it): the original file stays locked until
-- the client pays. Work that was already waiting when this rule began is counted from
-- that day (review_counted_from), so it gets its full 7 days and its warning.
--
-- The 8:00 AM daily job (send_daily_notices) and the Done reminder (remind_unpaid_on_done)
-- are changed by reading the LIVE function and adding only the lines below (so nothing
-- else in them can be lost). Each change stops with an error if its place is not found
-- exactly once, and does nothing when it was already made. The website counts the same 7
-- days (REVIEW_DAYS in client/src/lib/reviewClock.js), so change both together.

-- ---------------------------------------------------------------------------
-- 1. Two marks on a project
-- ---------------------------------------------------------------------------

-- True when the work was accepted by this rule and not by the client's own tap.
alter table public.projects add column if not exists auto_accepted boolean not null default false;

-- For work that was already waiting when this rule began: the day its 7 days are counted
-- from (empty = counted from the day it was sent).
alter table public.projects add column if not exists review_counted_from date;

comment on column public.projects.auto_accepted is
  'True when the work was accepted automatically after 7 days without an answer (send_daily_notices / auto_accept_project).';
comment on column public.projects.review_counted_from is
  'Work already waiting for review when the auto-accept rule began: the day its 7 days are counted from. Empty = counted from the sending day.';

-- The work that is already waiting for the client (6 days or more) starts its 7 days
-- today, so it is warned first instead of being accepted at the next run.
update public.projects
   set review_counted_from = (now() at time zone 'Asia/Manila')::date
 where status = 'submitted'
   and submitted_at is not null
   and (now() at time zone 'Asia/Manila')::date - (submitted_at at time zone 'Asia/Manila')::date >= 6;

-- ---------------------------------------------------------------------------
-- 2. Accepting the work (what the client's "Mark as done" does, without the client)
-- ---------------------------------------------------------------------------

-- Only work that is still waiting for the client. The status and the flag change in
-- one step, so the "payment still unpaid" reminder (a trigger on Done) can tell it was
-- automatic. Users can't call it; only the daily job does.
create or replace function public.auto_accept_project(target_project uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  proj record;
  client_name text;
begin
  update public.projects
     set status = 'done', completed_at = now(), auto_accepted = true
   where id = target_project and status = 'submitted'
  returning id, title, client_id, freelancer_id into proj;
  if not found then
    return;
  end if;

  select coalesce(nullif(full_name, ''), username, 'The client') into client_name
    from public.profiles where id = proj.client_id;

  insert into public.user_notifications (user_id, type, title, message, link)
  values
    (proj.freelancer_id, 'project_done', 'Work accepted automatically',
      client_name || ' did not answer in 7 days, so "' || proj.title || '" was accepted automatically. It now shows on both your histories, and you can rate ' || client_name || ' on the project page.',
      '/dashboard/project-details/' || proj.id),
    (proj.client_id, 'project_done', 'Work accepted automatically',
      'You did not answer in 7 days, so the work for "' || proj.title || '" was accepted automatically. It now shows on both your histories.',
      '/dashboard/project-details/' || proj.id);
end;
$$;

revoke execute on function public.auto_accept_project(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. The lines added to the live functions
-- ---------------------------------------------------------------------------

do $$
declare
  def text;
  anchor text;
  extra text;
begin
  -- ===== remind_unpaid_on_done: the first sentence says "You marked ... as done", which
  --       is wrong when the work was accepted automatically =====
  def := pg_get_functiondef('public.remind_unpaid_on_done()'::regprocedure);
  if position('auto_accepted' in def) = 0 then
    anchor := replace($a$      'You marked "' || new.title || '" as done, but ₱' || to_char(left_amount, 'FM999,999,990.00')
$a$, E'\r', '');
    extra := replace($a$      case when new.auto_accepted
        then '"' || new.title || '" was accepted automatically, and ₱'
        else 'You marked "' || new.title || '" as done, but ₱' end || to_char(left_amount, 'FM999,999,990.00')
$a$, E'\r', '');
    if (length(def) - length(replace(def, anchor, ''))) <> length(anchor) then
      raise exception 'remind_unpaid_on_done is not the version this change was written from (the sentence was not found exactly once).';
    end if;
    execute replace(def, anchor, extra);
  end if;

  -- ===== send_daily_notices: the review warning and the acceptance, right before the
  --       payments part of Step 1 =====
  def := pg_get_functiondef('public.send_daily_notices()'::regprocedure);
  if position('Work the client has not reviewed' in def) = 0 then
    anchor := replace($a$  -- ===== Payments: due soon, due today, late (PLAN-delays.md, Step 1) =====
$a$, E'\r', '');
    extra := replace($a$  -- ===== Work the client has not reviewed (PLAN-delays.md, Step 4) =====
  -- Submitted work waits for the client to mark it done or ask for changes. Counted in
  -- Manila days from the LATEST sending (sending again after "Ask for changes" starts
  -- over), or from review_counted_from for work that was already waiting when this rule
  -- began. From day 6 the client is warned once ("accepted tomorrow"); from day 7, and
  -- only after that warning, the work is accepted automatically. days_left is the number
  -- of days it has been waiting here.
  for proj in
    select p.id, p.title, p.client_id, p.freelancer_id,
           greatest((p.submitted_at at time zone 'Asia/Manila')::date,
                    coalesce(p.review_counted_from, (p.submitted_at at time zone 'Asia/Manila')::date)) as counted_from,
           coalesce(nullif(fp.full_name, ''), fp.username, 'The freelancer') as freelancer_name
    from public.projects p
    left join public.profiles fp on fp.id = p.freelancer_id
    where p.status = 'submitted' and p.submitted_at is not null
  loop
    days_left := today - proj.counted_from;
    continue when days_left < 6;

    -- The warning, once for each sending. If it is only written now (the job missed day
    -- 6), the acceptance waits for the next run, so the warning always comes first.
    insert into public.scheduled_notices (kind, target_id, due_date)
    values ('review_6', proj.id, proj.counted_from)
    on conflict do nothing;
    get diagnostics added = row_count;

    if added = 1 then
      insert into public.user_notifications (user_id, type, title, message, link)
      values (
        proj.client_id, 'project_review_reminder', 'Last day to review',
        proj.freelancer_name || '''s work for "' || proj.title || '" has been waiting for you for ' || days_left
          || ' days. If you don''t mark it done or ask for changes, it is accepted automatically tomorrow.',
        '/dashboard/project-details/' || proj.id);
      sent := sent + 1;
    elsif days_left >= 7 then
      perform public.auto_accept_project(proj.id);
      sent := sent + 2;
    end if;
  end loop;

$a$, E'\r', '');
    if (length(def) - length(replace(def, anchor, ''))) <> length(anchor) then
      raise exception 'send_daily_notices is not the version this change was written from (the place for the review part was not found exactly once).';
    end if;
    execute replace(def, anchor, extra || anchor);
  end if;
end;
$$;
