-- End project (PLAN-end-project.md, Step 1). Run it in the Supabase SQL Editor (or as a
-- migration) after supabase_delay_requests_schema.sql. Safe to run twice.
--
-- The client of a project that is Started, was never sent, and is MORE than 7 days late can
-- end it. The project becomes Ended, both people are told (bell, number and, when they are
-- offline, Gmail, like every other notice), and the job post's place opens again.
--
-- Checked on live on 2026-11-11:
--   * projects.status is limited to started / submitted / done (projects_status_check).
--   * job_state(), notify_job_filled(), admin_job_hires() and admin_job_hiring() count EVERY
--     project of a job post, so they are changed below to leave out ended ones. Everything
--     else that reads the status only tests done, started or started+submitted, so a new
--     value is ignored by it (the daily reminders, the automatic acceptance, ratings, the
--     profile numbers, the best-fit ranking).
--   * missed_deadline() reads first_submitted_at and the due date, not the status, so the
--     late-freelancer block stays after the project is ended.
--
-- The live functions are changed by reading their LIVE text, replacing one piece that must
-- occur exactly once (the script stops with an error otherwise), and skipping the change when
-- it is already there. Taking my inserted text out of the stored source gives back the old
-- md5, which is how the change is proved after applying.

-- ---------------------------------------------------------------------------
-- 1. The new status and the time it ended
-- ---------------------------------------------------------------------------

alter table public.projects add column if not exists ended_at timestamptz;
comment on column public.projects.ended_at is
  'When the client ended the project (status ended). Set only by end_project().';

alter table public.projects
  drop constraint if exists projects_status_check,
  add constraint projects_status_check check (status in ('started', 'submitted', 'done', 'ended'));

-- ---------------------------------------------------------------------------
-- 2. One new kind of notification (the LIVE list plus project_ended)
-- ---------------------------------------------------------------------------

do $$
declare
  def text;
begin
  select pg_get_constraintdef(c.oid) into def
    from pg_constraint c
   where c.conrelid = 'public.user_notifications'::regclass and c.conname = 'user_notifications_type_check';
  if def is null then
    raise exception 'user_notifications_type_check was not found.';
  end if;
  if position('''project_ended''' in def) > 0 then
    return; -- already there
  end if;
  if (length(def) - length(replace(def, '''delay_declined''::text', ''))) <> length('''delay_declined''::text') then
    raise exception 'user_notifications_type_check: the piece delay_declined must occur exactly once.';
  end if;
  def := replace(def, '''delay_declined''::text', '''delay_declined''::text, ''project_ended''::text');
  execute 'alter table public.user_notifications drop constraint user_notifications_type_check, '
       || 'add constraint user_notifications_type_check ' || def;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. end_project(project): the client ends a project that was never sent
-- ---------------------------------------------------------------------------
-- The rules are the plan's. The limit of 7 days is only here (lib/projects.js repeats it to
-- explain the page). The 7 days late notice must already be in the sent log, so the freelancer
-- was warned before the project is ended (same idea as the automatic acceptance).

create or replace function public.end_project(target_project uuid)
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
  place_text text;
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

  update public.projects set status = 'ended', ended_at = now() where id = proj.id;

  select coalesce(nullif(full_name, ''), username, 'The client') into client_name
    from public.profiles where id = proj.client_id;

  -- What happens to the place on the job post (a booked project has none).
  place_text := case
    when proj.job_post_id is null then ''
    when public.job_state(proj.job_post_id) = 'open'
      then ' Its place on your job post is open again, so you can hire someone else.'
    when public.job_state(proj.job_post_id) = 'expired'
      then ' Your job post has passed its due date, so edit its dates if you want to hire someone else.'
    else ''
  end;

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
end;
$$;

revoke all on function public.end_project(uuid) from public, anon;
grant execute on function public.end_project(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. The places that count a job post's projects leave out ended ones
-- ---------------------------------------------------------------------------
-- job_state: otherwise the post stays Filled after the freelancer is gone.
-- notify_job_filled: otherwise the "Job post filled" notice of the replacement never comes
--   (it tests hired = freelancers_needed).
-- admin_job_hires, admin_job_hiring: the "N of M hired" numbers on the admin pages.

do $$
declare
  spec record;
  def text;
  hits integer;
begin
  for spec in
    select * from (values
      ('public.job_state(uuid)'::regprocedure,
       'where p.job_post_id = j.id) >= j.freelancers_needed',
       'where p.job_post_id = j.id and p.status <> ''ended'') >= j.freelancers_needed'),
      ('public.notify_job_filled()'::regprocedure,
       'where p.job_post_id = job.id;',
       'where p.job_post_id = job.id and p.status <> ''ended'';'),
      ('public.admin_job_hires()'::regprocedure,
       'where x.job_post_id = j.id)',
       'where x.job_post_id = j.id and x.status <> ''ended'')'),
      ('public.admin_job_hiring()'::regprocedure,
       'where p.job_post_id = j.id) as hired',
       'where p.job_post_id = j.id and p.status <> ''ended'') as hired')
    ) as t(fn, anchor, replacement)
  loop
    def := pg_get_functiondef(spec.fn);
    if position(spec.replacement in def) > 0 then
      continue; -- already changed
    end if;
    hits := (length(def) - length(replace(def, spec.anchor, ''))) / length(spec.anchor);
    if hits <> 1 then
      raise exception '%: the piece "%" was found % times (it must be exactly 1).', spec.fn, spec.anchor, hits;
    end if;
    execute replace(def, spec.anchor, spec.replacement);
  end loop;
end;
$$;
