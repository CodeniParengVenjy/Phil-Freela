-- End project, round 2 (PLAN-end-project.md, "Round 2"). Run it in the Supabase SQL Editor (or as
-- a migration) AFTER supabase_end_project_schema.sql. Safe to run twice.
--
-- The four things the first round left out:
--   1. A reason box: the person who ends a project can write why (optional, 3 to 300 characters,
--      through the word filter). It shows on the project page, not in the notices (the notice
--      text is repeated in the email, so it stays text written by the database).
--   2. A freelancer can WITHDRAW from a project that is still waiting for their work.
--   3. A project that is 30 days late and was never sent is ended AUTOMATICALLY by the daily job,
--      the morning after both people got a warning (same idea as the automatic acceptance).
--   4. The admin Transactions card counts Ended projects (admin_transactions()).
--
-- ended_by says who ended it: client, freelancer or system. The three ways share one internal
-- function (end_project_row), so the effects are the same: status ended, a request for more time
-- that was waiting is cancelled, the job post's place opens again (job_state() leaves ended
-- projects out), both people get a notice, nothing moves money, nobody is rated.
--
-- The live functions send_daily_notices() and admin_transactions() are changed by reading their
-- LIVE text, replacing one piece that must occur exactly once (the script stops with an error
-- otherwise) and skipping the change when it is already there. Taking my inserted text out of the
-- stored source gives back the old md5, which is how the change is proved after applying.

-- ---------------------------------------------------------------------------
-- 1. Who ended it, and why
-- ---------------------------------------------------------------------------

alter table public.projects add column if not exists ended_by text;
alter table public.projects add column if not exists end_reason text;
comment on column public.projects.ended_by is 'Who ended the project (status ended): client, freelancer or system (the daily job). Set only by end_project_row().';
comment on column public.projects.end_reason is 'The reason the person who ended it wrote (optional, up to 300 characters, word filter).';

do $$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.projects'::regclass and conname = 'projects_ended_by_check') then
    alter table public.projects add constraint projects_ended_by_check
      check (ended_by is null or ended_by in ('client', 'freelancer', 'system'));
  end if;
  if not exists (select 1 from pg_constraint where conrelid = 'public.projects'::regclass and conname = 'projects_end_reason_check') then
    alter table public.projects add constraint projects_end_reason_check
      check (end_reason is null or char_length(end_reason) <= 300);
  end if;
end;
$$;

-- Projects ended in round 1 were all ended by the client.
update public.projects set ended_by = 'client' where status = 'ended' and ended_by is null;

-- The word filter for the reason (same function as the other columns).
create or replace trigger projects_mask_end_reason
  before update of end_reason on public.projects
  for each row execute function public.mask_columns('end_reason');

-- ---------------------------------------------------------------------------
-- 2. The reason, checked: empty = none, otherwise 3 to 300 characters
-- ---------------------------------------------------------------------------

create or replace function public.clean_end_note(note text)
returns text
language plpgsql
immutable
set search_path = public
as $$
declare
  cleaned text := nullif(btrim(coalesce(note, '')), '');
begin
  if cleaned is not null and char_length(cleaned) < 3 then
    raise exception 'Write a few words for the reason, or leave it empty.';
  end if;
  if cleaned is not null and char_length(cleaned) > 300 then
    raise exception 'The reason can be up to 300 characters.';
  end if;
  return cleaned;
end;
$$;

revoke execute on function public.clean_end_note(text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. end_project_row(project, who, note): what ending does, for all three ways
-- ---------------------------------------------------------------------------
-- who = 'client' (end_project), 'freelancer' (withdraw_from_project) or 'system' (the daily job).
-- The callers have checked the rules. This only ends a project that is still Started.

create or replace function public.end_project_row(target_project uuid, who text, note text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  proj public.projects%rowtype;
  today date := (now() at time zone 'Asia/Manila')::date;
  days_late integer;
  client_name text;
  freelancer_name text;
  place_text text := '';
  paid boolean;
begin
  select * into proj from public.projects where id = target_project for update;
  if not found or proj.status <> 'started' then
    return;
  end if;
  days_late := today - proj.due_date;

  -- A request for more time that was still waiting means nothing now.
  update public.delay_requests set status = 'cancelled', answered_at = now()
   where project_id = proj.id and status = 'pending';

  update public.projects
     set status = 'ended', ended_at = now(), ended_by = who, end_reason = note
   where id = proj.id;

  select coalesce(nullif(full_name, ''), username, 'The client') into client_name
    from public.profiles where id = proj.client_id;
  select coalesce(nullif(full_name, ''), username, 'The freelancer') into freelancer_name
    from public.profiles where id = proj.freelancer_id;

  -- What happens to the place on the job post (a booked project has none).
  if proj.job_post_id is not null then
    place_text := case public.job_state(proj.job_post_id)
      when 'open' then ' Its place on your job post is open again, so you can hire someone else.'
      when 'expired' then ' Your job post has passed its due date, so edit its dates if you want to hire someone else.'
      else ''
    end;
  end if;

  -- Money was recorded on the project (confirmed, or waiting for the freelancer's answer).
  paid := exists (
    select 1 from public.payments pay where pay.project_id = proj.id and pay.status in ('confirmed', 'sent')
  );

  if who = 'client' then
    insert into public.user_notifications (user_id, type, title, message, link)
    values
      (proj.freelancer_id, 'project_ended', 'Project ended',
        client_name || ' ended "' || proj.title || '" because it was ' || days_late
          || ' days late and no work was sent. It shows as Ended on both your histories.'
          || E'\n\n' || 'You can message ' || client_name || '.',
        '/dashboard/project-details/' || proj.id),
      (proj.client_id, 'project_ended', 'Project ended',
        'You ended "' || proj.title || '".' || place_text || ' It shows as Ended on both your histories.',
        '/dashboard/project-details/' || proj.id);

  elsif who = 'freelancer' then
    insert into public.user_notifications (user_id, type, title, message, link)
    values
      (proj.client_id, 'project_ended', 'Project ended',
        freelancer_name || ' withdrew from "' || proj.title || '".' || place_text
          || ' It shows as Ended on both your histories.'
          || case when paid
               then ' A payment was recorded on this project. PhilFreela doesn''t hold money, so ask ' || freelancer_name
                    || ' to return it. If they don''t, you can report it as Scam / Fraud.'
               else '' end
          || E'\n\n' || 'You can message ' || freelancer_name || '.',
        '/dashboard/project-details/' || proj.id),
      (proj.freelancer_id, 'project_ended', 'Project ended',
        'You withdrew from "' || proj.title || '". It shows as Ended on both your histories.'
          || case when paid
               then ' A payment was recorded on this project. PhilFreela doesn''t hold money, so give it back to ' || client_name
                    || ' directly. Keeping money for work you didn''t deliver can be reported as Scam / Fraud.'
               else '' end,
        '/dashboard/project-details/' || proj.id);

  else
    insert into public.user_notifications (user_id, type, title, message, link)
    values
      (proj.freelancer_id, 'project_ended', 'Project ended',
        '"' || proj.title || '" was ended automatically because it was ' || days_late
          || ' days late and no work was sent. It shows as Ended on both your histories.'
          || E'\n\n' || 'You can message ' || client_name || '.',
        '/dashboard/project-details/' || proj.id),
      (proj.client_id, 'project_ended', 'Project ended',
        '"' || proj.title || '" was ended automatically because it was ' || days_late
          || ' days late and no work was sent.' || place_text || ' It shows as Ended on both your histories.'
          || case when paid
               then ' A payment was recorded on this project. If the work never came, you can report it.'
               else '' end,
        '/dashboard/project-details/' || proj.id);
  end if;
end;
$$;

revoke execute on function public.end_project_row(uuid, text, text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4. end_project(project, reason): the client ends it (round 1's rules, plus the reason)
-- ---------------------------------------------------------------------------
-- The old one-argument function is replaced by this one (the reason is optional, so a call with
-- only the project still works).

drop function if exists public.end_project(uuid);

create or replace function public.end_project(target_project uuid, end_note text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  proj public.projects%rowtype;
  today date := (now() at time zone 'Asia/Manila')::date;
  days_late integer;
  note_text text;
begin
  select * into proj from public.projects where id = target_project for update;
  if not found or proj.client_id is distinct from auth.uid() then
    raise exception 'Only the client of this project can end it.';
  end if;

  if proj.status = 'ended' then
    raise exception 'This project was already ended.';
  end if;
  if proj.status <> 'started' then
    raise exception 'Only a project that is still waiting for the freelancer''s work can be ended.';
  end if;
  if proj.first_submitted_at is not null then
    raise exception 'The freelancer already sent work on this project, so it can''t be ended. Message them, or report it if you think something is wrong.';
  end if;

  days_late := today - proj.due_date;
  if days_late <= 7 then
    raise exception 'A project can be ended once it is more than 7 days late. This one is %.',
      case when days_late <= 0 then 'not late yet'
           else days_late || case when days_late = 1 then ' day late' else ' days late' end end;
  end if;

  if exists (
    select 1 from public.delay_requests r
     where r.project_id = proj.id and r.kind = 'work' and r.status = 'pending'
  ) then
    raise exception 'A request for more time is waiting for your answer. Answer it first.';
  end if;

  if not exists (
    select 1 from public.scheduled_notices s
     where s.kind = 'overdue_7' and s.target_id = proj.id and s.due_date = proj.due_date
  ) then
    raise exception 'The freelancer has not been sent the "7 days late" notice yet. It goes out at 8:00 AM Philippine time, so try again after that.';
  end if;

  note_text := public.clean_end_note(end_note);
  perform public.end_project_row(proj.id, 'client', note_text);
end;
$$;

revoke all on function public.end_project(uuid, text) from public, anon;
grant execute on function public.end_project(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 5. withdraw_from_project(project, reason): the freelancer steps out
-- ---------------------------------------------------------------------------
-- Any time while the project is still waiting for their work (Started). Work that was sent
-- (Submitted) waits for the client's review instead. No money moves; if the client paid something
-- the notices say it has to be given back directly, and that keeping it can be reported.

create or replace function public.withdraw_from_project(target_project uuid, withdraw_note text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  proj public.projects%rowtype;
  note_text text;
begin
  select * into proj from public.projects where id = target_project for update;
  if not found or proj.freelancer_id is distinct from auth.uid() then
    raise exception 'Only the freelancer of this project can withdraw from it.';
  end if;

  if proj.status = 'ended' then
    raise exception 'This project was already ended.';
  end if;
  if proj.status = 'done' then
    raise exception 'This project is already done.';
  end if;
  if proj.status <> 'started' then
    raise exception 'You can only withdraw from a project that is still waiting for your work. You sent work, so wait for the client''s review.';
  end if;

  note_text := public.clean_end_note(withdraw_note);
  perform public.end_project_row(proj.id, 'freelancer', note_text);
end;
$$;

revoke all on function public.withdraw_from_project(uuid, text) from public, anon;
grant execute on function public.withdraw_from_project(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 6. auto_end_projects(): the daily job ends a project that is 30 days late and was never sent
-- ---------------------------------------------------------------------------
-- The morning a never-sent Started project is 29 days late (or the first morning this job sees it
-- later than that), both people get a warning and it is written in the sent log (kind end_warn).
-- The project is ended only AFTER that warning, on a later morning when it is at least 30 days late,
-- so nobody is ended without notice. Returns how many notices it made. A request for more time
-- that is still waiting is cancelled with it. The 30 is only here (lib/projects.js repeats it).

create or replace function public.auto_end_projects()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  auto_end_days constant integer := 30;
  today date := (now() at time zone 'Asia/Manila')::date;
  proj record;
  days_late integer;
  added integer;
  made integer := 0;
begin
  for proj in
    select p.id, p.title, p.due_date,
           coalesce(nullif(fp.full_name, ''), fp.username, 'The freelancer') as freelancer_name,
           coalesce(nullif(cp.full_name, ''), cp.username, 'The client') as client_name,
           p.client_id, p.freelancer_id
      from public.projects p
      left join public.profiles fp on fp.id = p.freelancer_id
      left join public.profiles cp on cp.id = p.client_id
     where p.status = 'started'
       and p.first_submitted_at is null
       and p.due_date <= today - (auto_end_days - 1)
  loop
    days_late := today - proj.due_date;

    if not exists (
      select 1 from public.scheduled_notices s
       where s.kind = 'end_warn' and s.target_id = proj.id and s.due_date = proj.due_date
    ) then
      -- The warning first.
      insert into public.scheduled_notices (kind, target_id, due_date)
      values ('end_warn', proj.id, proj.due_date)
      on conflict do nothing;
      get diagnostics added = row_count;
      continue when added = 0;

      insert into public.user_notifications (user_id, type, title, message, link)
      values
        (proj.freelancer_id, 'project_overdue', 'Project will be ended tomorrow',
          '"' || proj.title || '" is ' || days_late || ' days late and no work was sent. If nothing is sent, it is ended automatically tomorrow morning.'
            || E'\n\n' || 'Send your work on the project page, or message ' || proj.client_name || '.',
          '/dashboard/project-details/' || proj.id),
        (proj.client_id, 'project_overdue', 'Project will be ended tomorrow',
          '"' || proj.title || '" is ' || days_late || ' days late and ' || proj.freelancer_name
            || ' never sent any work. If nothing is sent, it is ended automatically tomorrow morning. You can also end it yourself now.',
          '/dashboard/project-details/' || proj.id);
      made := made + 2;
    elsif days_late >= auto_end_days then
      perform public.end_project_row(proj.id, 'system', null);
      made := made + 2;
    end if;
  end loop;

  return made;
end;
$$;

revoke execute on function public.auto_end_projects() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 7. The lines added to the live functions
-- ---------------------------------------------------------------------------

do $$
declare
  def text;
  anchor text;
  extra text;
begin
  -- 7a. The daily job calls auto_end_projects(), right before "return sent;".
  def := pg_get_functiondef('public.send_daily_notices()'::regprocedure);
  if position('auto_end_projects' in def) = 0 then
    anchor := replace($a$
  return sent;
end;
$a$, E'\r', '');
    extra := replace($a$
  -- ===== Projects never sent: ended automatically after 30 days (PLAN-end-project.md) =====
  sent := sent + public.auto_end_projects();

  return sent;
end;
$a$, E'\r', '');
    if (length(def) - length(replace(def, anchor, ''))) <> length(anchor) then
      raise exception 'send_daily_notices is not the version this change was written from (the place before return sent was not found exactly once).';
    end if;
    execute replace(def, anchor, extra);
  end if;

  -- 7b. The admin Transactions card counts Ended projects.
  def := pg_get_functiondef('public.admin_transactions()'::regprocedure);
  if position('''ended''' in def) = 0 then
    anchor := 'count(*) filter (where p.status = ''done''))';
    if (length(def) - length(replace(def, anchor, ''))) <> length(anchor) then
      raise exception 'admin_transactions is not the version this change was written from (the done count was not found exactly once).';
    end if;
    execute replace(def, anchor,
      'count(*) filter (where p.status = ''done''),' || E'\n'
      || '               ''ended'',     count(*) filter (where p.status = ''ended''))');
  end if;
end;
$$;
