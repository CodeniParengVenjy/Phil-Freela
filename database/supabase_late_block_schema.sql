-- Late freelancers can't apply to that client's job posts (the user, 2026-11-10:
-- "to those freelancer's [who] does not accomplish the project in a given time,
-- will be prohibited to apply to that posts/users [of] the past failed project").
-- Run in the Supabase SQL Editor after supabase_projects_schema.sql,
-- supabase_job_post_details_schema.sql and supabase_applications_schema.sql.
--
-- The user's choices (2026-11-10):
--   late     the work was not sent by the end of the due date (Manila time):
--            still not sent after it, or sent after it. The same rule as the
--            profile's "on time" count (profile_stats). Only the FIRST sending
--            counts, so re-sending after the client asked for changes is not
--            "late".
--   blocked  from applying to every job post of THAT client, until the client
--            presses "Allow to apply again" on the late project.
--   shown    the client's posts stay visible; the job page says why the
--            freelancer can't apply.
--
-- Nobody can change projects directly from the website (the only rule on
-- projects is "the client and freelancer can view"; every change goes through
-- the functions in supabase_projects_schema.sql), so a freelancer can't erase
-- their own lateness.

-- ---------------------------------------------------------------------------
-- 1. Two new dates on each project
-- ---------------------------------------------------------------------------

-- When the work was FIRST sent. submitted_at changes every time the work is
-- sent again (after "Ask for changes"); this one never does.
alter table public.projects add column if not exists first_submitted_at timestamptz;
-- When the client allowed this late freelancer to apply to their posts again
-- (empty = not allowed).
alter table public.projects add column if not exists late_allowed_at timestamptz;

-- Projects sent before this file: their last sending time is all there is.
update public.projects
set first_submitted_at = submitted_at
where submitted_at is not null and first_submitted_at is null;

-- Keeps the first sending time: set once, the first time submitted_at is filled.
create or replace function public.keep_first_submitted_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.submitted_at is not null and old.first_submitted_at is null then
    new.first_submitted_at := new.submitted_at;
  end if;
  -- It can't be changed afterwards, whoever updates the row.
  if old.first_submitted_at is not null then
    new.first_submitted_at := old.first_submitted_at;
  end if;
  return new;
end;
$$;

create or replace trigger projects_first_submitted_at
  before update on public.projects
  for each row execute function public.keep_first_submitted_at();

-- ---------------------------------------------------------------------------
-- 2. Was the project late?
-- ---------------------------------------------------------------------------

-- True when the work wasn't sent by the end of the due date (Manila): the day
-- it was first sent, or today if it hasn't been sent yet, is after the due
-- date. Sent ON the due date is on time. It takes the project's row, so the web
-- API shows it as a column of projects ("missed_deadline"), and only on the
-- projects the person may already see (their own).
create or replace function public.missed_deadline(p public.projects)
returns boolean
language sql
stable
set search_path = public
as $$
  select coalesce((p.first_submitted_at at time zone 'Asia/Manila')::date,
                  (now() at time zone 'Asia/Manila')::date) > p.due_date;
$$;

revoke execute on function public.missed_deadline(public.projects) from public, anon;
grant execute on function public.missed_deadline(public.projects) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 3. The apply rule
-- ---------------------------------------------------------------------------

-- True when the SIGNED-IN freelancer missed a due date on a project for this
-- job's client and that client hasn't allowed them again. It only ever answers
-- about the person asking (auth.uid()), so nobody can look up someone else's
-- record with it.
create or replace function public.blocked_for_lateness(target_job uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.projects p
    join public.job_posts j on j.id = target_job and j.client_id = p.client_id
    where p.freelancer_id = auth.uid()
      and p.late_allowed_at is null
      and public.missed_deadline(p)
  );
$$;

revoke execute on function public.blocked_for_lateness(uuid) from public, anon;
grant execute on function public.blocked_for_lateness(uuid) to authenticated, service_role;

-- The live apply rule (read from pg_policy on 2026-11-10) plus the last line.
alter policy "job_applications: verified freelancers can apply" on public.job_applications
with check (
  freelancer_id = auth.uid()
  and exists (select 1 from public.profiles p where p.id = auth.uid() and p.account_type = 'freelancer')
  and public.is_verified(auth.uid())
  and not public.is_posting_blocked(auth.uid())
  and not exists (select 1 from public.job_posts j where j.id = job_applications.job_post_id and j.client_id = auth.uid())
  and public.job_state(job_post_id) = 'open'
  and not public.blocked_for_lateness(job_post_id)
);

-- ---------------------------------------------------------------------------
-- 4. "Allow to apply again" (the client of a late project)
-- ---------------------------------------------------------------------------

create or replace function public.allow_late_freelancer(target_project uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  proj public.projects%rowtype;
begin
  select * into proj from public.projects where id = target_project;
  if not found or proj.client_id is distinct from auth.uid() then
    raise exception 'Only the client of this project can allow this.';
  end if;
  if not public.missed_deadline(proj) then
    raise exception 'This project wasn''t late, so nothing is blocked.';
  end if;
  update public.projects
  set late_allowed_at = now()
  where id = target_project and late_allowed_at is null;
end;
$$;

revoke execute on function public.allow_late_freelancer(uuid) from public, anon;
grant execute on function public.allow_late_freelancer(uuid) to authenticated, service_role;
