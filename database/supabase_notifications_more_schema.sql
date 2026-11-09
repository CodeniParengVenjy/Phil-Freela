-- More notifications (PLAN-notifications.md, approved by the user on
-- 2026-11-10 with "ok"). Each step of the plan is one section here, applied as
-- its own migration after the user's go.
--
-- Run it in the Supabase SQL Editor (or as a migration). Safe to run again.
-- Test: database/test_notifications_more.sql.


-- =====================================================================
-- Section 1. New applicant: a notification and a "new" count (Step N1)
-- =====================================================================
-- Before this, a client was told about a new applicant only by email, and
-- only when they were offline. Now:
--   * the client gets a notification (the bell) the moment someone applies:
--     "New applicant: Juan Dela Cruz applied to your job "Logo for my shop"."
--   * every application remembers when the client first saw it (seen_at).
--     Empty = new. The website counts the new ones (the number on the
--     "Projects & Resumes" menu link and "3 new" on each job post), and the
--     number goes down once the client opens that job's applicants.

-- 1a. The new kind of notification. The list of kinds is a CHECK rule, so it
--     is replaced in one statement: the live list (read 2026-11-10) plus
--     application_new.
alter table public.user_notifications
  drop constraint if exists user_notifications_type_check,
  add constraint user_notifications_type_check check (type = any (array[
    'verification_approved', 'verification_rejected', 'suspension', 'suspension_lifted',
    'appeal_accepted', 'appeal_rejected', 'report_resolved', 'report_dismissed',
    'project_hired', 'project_submitted', 'project_done', 'project_changes', 'project_rated',
    'booking_requested', 'booking_accepted', 'booking_declined', 'booking_cancelled',
    'school_id_pass', 'payment_sent', 'payment_confirmed', 'payment_not_received',
    'payment_requested', 'promotion_approved', 'promotion_rejected',
    'price_proposed', 'price_agreed', 'payment_short', 'payment_unpaid',
    'application_new'
  ]));

-- 1b. When the client first saw each application. Added only once: the
--     applications that already exist count as seen (their own date), so no
--     client starts with a big "new" number. Running this file again doesn't
--     touch the column, so it never hides applicants that are really new.
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'job_applications' and column_name = 'seen_at'
  ) then
    alter table public.job_applications add column seen_at timestamptz;
    update public.job_applications set seen_at = created_at where seen_at is null;
  end if;
end;
$$;

comment on column public.job_applications.seen_at is
  'When the job''s owner first opened this application. Empty = a new applicant (the "new" count). Set only by mark_applicants_seen().';

-- Nobody can change seen_at directly: job_applications has no UPDATE policy,
-- so the only way is the function below, which checks the job's owner.

-- 1c. The client opened a job's applicants: they are no longer new.
--     p_job_id = that job, or null = all of the client's job posts.
--     It only touches applications to posts the signed-in person owns, and
--     gives back how many it marked.
create or replace function public.mark_applicants_seen(p_job_id uuid default null)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  marked integer;
begin
  update public.job_applications a
     set seen_at = now()
   where a.seen_at is null
     and (p_job_id is null or a.job_post_id = p_job_id)
     and exists (
       select 1 from public.job_posts j
       where j.id = a.job_post_id and j.client_id = auth.uid()
     );
  get diagnostics marked = row_count;
  return marked;
end;
$$;

revoke all on function public.mark_applicants_seen(uuid) from public, anon;
grant execute on function public.mark_applicants_seen(uuid) to authenticated;

-- 1d. Someone applied: tell the job's owner. Like the other notifications,
--     the row is written here by the database (users can't write their own).
create or replace function public.notify_new_applicant()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  job public.job_posts%rowtype;
  freelancer_name text;
begin
  select * into job from public.job_posts j where j.id = new.job_post_id;
  select coalesce(nullif(p.full_name, ''), p.username) into freelancer_name
  from public.profiles p where p.id = new.freelancer_id;

  insert into public.user_notifications (user_id, type, title, message, link)
  values (
    job.client_id,
    'application_new',
    'New applicant',
    coalesce(freelancer_name, 'A freelancer') || ' applied to your job "' || job.title || '".',
    -- Opens the Projects page on this job's applicants.
    '/dashboard/projects?job=' || new.job_post_id
  );
  return new;
end;
$$;

revoke all on function public.notify_new_applicant() from public, anon, authenticated;

create or replace trigger notify_new_applicant
  after insert on public.job_applications
  for each row execute function public.notify_new_applicant();

-- 1e. No extra email for each applicant. Every notification is also emailed
--     to an offline user, but a client already gets the application email
--     (email_offline_on_application, at most one per job every 30 minutes),
--     so a busy job post would otherwise send one email per applicant.
--     The rest of this function is the live one, unchanged (read 2026-11-10).
create or replace function public.email_offline_on_notification()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.type = 'application_new' then
    return new;
  end if;

  perform public.queue_offline_email(new.user_id, null, jsonb_build_object(
    'kind', 'notification', 'title', new.title, 'message', new.message,
    'link', coalesce(new.link, '/dashboard/notifications')));
  return new;
end;
$$;


-- =====================================================================
-- Section 2. Job post filled / job post closed (Steps N2 and N3)
-- =====================================================================
-- A job post is open, filled or expired (job_state(), never stored): filled =
-- it has as many hired projects as freelancers_needed; expired = its due date
-- passed (Manila) without being filled. Nobody was told when either happened.
-- Now the client gets:
--   * "Job post filled" the moment the last needed freelancer is hired;
--   * "Job post closed" the morning after its due date passes (a daily job at
--     8:00 AM Manila), once per post and due date, so editing the dates and
--     letting it expire again sends a new one.

-- 2a. The two new kinds (the Section 1 list plus job_filled and job_expired).
alter table public.user_notifications
  drop constraint if exists user_notifications_type_check,
  add constraint user_notifications_type_check check (type = any (array[
    'verification_approved', 'verification_rejected', 'suspension', 'suspension_lifted',
    'appeal_accepted', 'appeal_rejected', 'report_resolved', 'report_dismissed',
    'project_hired', 'project_submitted', 'project_done', 'project_changes', 'project_rated',
    'booking_requested', 'booking_accepted', 'booking_declined', 'booking_cancelled',
    'school_id_pass', 'payment_sent', 'payment_confirmed', 'payment_not_received',
    'payment_requested', 'promotion_approved', 'promotion_rejected',
    'price_proposed', 'price_agreed', 'payment_short', 'payment_unpaid',
    'application_new', 'job_filled', 'job_expired'
  ]));

-- 2b. A hire filled the post. It fires when the number of hired projects
--     becomes EQUAL to freelancers_needed, so it happens once; if the client
--     raises the number and fills it again, it happens again.
create or replace function public.notify_job_filled()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  job public.job_posts%rowtype;
  hired integer;
begin
  if new.job_post_id is null then
    return new; -- a project from a booking, not from a job post
  end if;
  select * into job from public.job_posts j where j.id = new.job_post_id;
  if not found then
    return new;
  end if;

  select count(*) into hired from public.projects p where p.job_post_id = job.id;
  if hired = job.freelancers_needed then
    insert into public.user_notifications (user_id, type, title, message, link)
    values (
      job.client_id,
      'job_filled',
      'Job post filled',
      'Your job post "' || job.title || '" is filled: you hired '
        || case when hired = 1 then 'the freelancer it needed' else 'the ' || hired || ' freelancers it needed' end
        || '. It no longer shows on Find Jobs.',
      '/dashboard/job-details/' || job.id
    );
  end if;
  return new;
end;
$$;

revoke all on function public.notify_job_filled() from public, anon, authenticated;

create or replace trigger notify_job_filled
  after insert on public.projects
  for each row execute function public.notify_job_filled();

-- 2c. A small log of the notices the daily job already sent, so nothing is
--     sent twice. due_date is part of the key: a post (or, in Step N4, a
--     project) with a new date gets fresh notices. Only the database
--     functions use it: row level security is on and there are no policies.
--     When the table is first made, the posts that are ALREADY expired are
--     written in as told, so the first run doesn't send old news.
do $$
begin
  if to_regclass('public.scheduled_notices') is null then
    create table public.scheduled_notices (
      kind text not null,        -- job_expired (Step N4 adds the project ones)
      target_id uuid not null,   -- the job post (or project)
      due_date date not null,    -- its due date when the notice went out
      sent_at timestamptz not null default now(),
      primary key (kind, target_id, due_date)
    );
    alter table public.scheduled_notices enable row level security;
    revoke all on public.scheduled_notices from anon, authenticated;

    insert into public.scheduled_notices (kind, target_id, due_date)
    select 'job_expired', j.id, j.due_date
    from public.job_posts j
    where public.job_state(j.id) = 'expired';
  end if;
end;
$$;

comment on table public.scheduled_notices is
  'Notices the daily job (send_daily_notices) already sent, one per kind, item and due date. Only database functions use it.';

-- 2d. The daily job. Today it sends "Job post closed"; Step N4 adds the
--     due-date reminders and late notices to this same function.
--     Gives back how many notices it sent.
create or replace function public.send_daily_notices()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  sent integer := 0;
  post record;
begin
  -- Job posts that closed because their due date passed (filled ones don't count).
  for post in
    select j.id, j.client_id, j.title, j.due_date
    from public.job_posts j
    where public.job_state(j.id) = 'expired'
      and not exists (
        select 1 from public.scheduled_notices s
        where s.kind = 'job_expired' and s.target_id = j.id and s.due_date = j.due_date
      )
  loop
    insert into public.scheduled_notices (kind, target_id, due_date)
    values ('job_expired', post.id, post.due_date);

    insert into public.user_notifications (user_id, type, title, message, link)
    values (
      post.client_id,
      'job_expired',
      'Job post closed',
      'Your job post "' || post.title || '" closed because its due date passed. Edit it to reopen it.',
      '/dashboard/job-details/' || post.id
    );
    sent := sent + 1;
  end loop;

  return sent;
end;
$$;

revoke all on function public.send_daily_notices() from public, anon, authenticated;

-- 2e. Every day at 8:00 AM Manila (pg_cron uses UTC: 00:00 UTC = 8:00 AM).
--     Scheduling the same name again only updates it.
select cron.schedule('daily-notices', '0 0 * * *', 'select public.send_daily_notices()');
