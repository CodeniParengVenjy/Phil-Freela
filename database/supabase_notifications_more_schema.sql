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


-- =====================================================================
-- Section 3. Due-date reminders and late notices (Step N4)
-- =====================================================================
-- "Overdue" used to be only red text on the project page; nobody was
-- reminded. Now the same 8:00 AM job also looks at every project that isn't
-- Done and tells both people where it stands:
--
--   days left (due date - today in Manila)   a STARTED project       a SUBMITTED project
--   3 or 2 days left            (due_3)       freelancer + client     nobody
--   1 day left                  (due_1)       freelancer + client     nobody
--   due today                   (due_0)       freelancer + client     client: work waiting for review (review_0)
--   1 to 6 days late            (overdue_1)   freelancer + client     nobody (the work was delivered)
--   7 or more days late         (overdue_7)   freelancer + client     nobody
--
-- The ranges don't overlap, so a project gets at most one notice a day, and
-- a project that is already very late gets one notice, not two. The sent log
-- (scheduled_notices) keeps each kind to once per project and due date, and
-- because it uses ranges, a day the job didn't run still gets caught up.
-- A project's due date can't be changed, so the late notices don't promise a
-- new date: they say to submit, or to message the other person.

-- 3a. The four new kinds.
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
    'application_new', 'job_filled', 'job_expired',
    'project_due_soon', 'project_due_today', 'project_overdue', 'project_review_reminder'
  ]));

-- 3b. The daily job, now with the project reminders. The job post part is
--     the same as in Section 2.
create or replace function public.send_daily_notices()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  today date := (now() at time zone 'Asia/Manila')::date;
  sent integer := 0;
  added integer;
  post record;
  proj record;
  days_left integer;
  kind text;
  title_text text;
  link_text text;
  when_text text;   -- "in 3 days", "tomorrow", "today"
  late_text text;   -- "1 day late", "8 days late"
  date_text text;   -- "November 13"
begin
  -- ===== Job posts that closed because their due date passed =====
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

  -- ===== Projects: due soon, due today, late =====
  for proj in
    select p.id, p.title, p.status, p.due_date, p.client_id, p.freelancer_id,
           coalesce(nullif(fp.full_name, ''), fp.username, 'The freelancer') as freelancer_name,
           coalesce(nullif(cp.full_name, ''), cp.username, 'The client') as client_name
    from public.projects p
    left join public.profiles fp on fp.id = p.freelancer_id
    left join public.profiles cp on cp.id = p.client_id
    where p.status in ('started', 'submitted')
      and p.due_date <= today + 3
  loop
    days_left := proj.due_date - today;

    -- Which notice this project is due for today (null = none).
    if proj.status = 'submitted' then
      kind := case when days_left = 0 then 'review_0' end;
    else
      kind := case
        when days_left between 2 and 3 then 'due_3'
        when days_left = 1 then 'due_1'
        when days_left = 0 then 'due_0'
        when days_left between -6 and -1 then 'overdue_1'
        when days_left <= -7 then 'overdue_7'
      end;
    end if;
    continue when kind is null;

    -- Write it in the sent log first; if it was already there, skip.
    insert into public.scheduled_notices (kind, target_id, due_date)
    values (kind, proj.id, proj.due_date)
    on conflict do nothing;
    get diagnostics added = row_count;
    continue when added = 0;

    link_text := '/dashboard/project-details/' || proj.id;
    when_text := case days_left when 0 then 'today' when 1 then 'tomorrow' else 'in ' || days_left || ' days' end;
    late_text := (-days_left) || case when days_left = -1 then ' day late' else ' days late' end;
    date_text := to_char(proj.due_date, 'FMMonth FMDD');

    if kind = 'review_0' then
      -- The work came in and the due date is today: the client should look.
      insert into public.user_notifications (user_id, type, title, message, link)
      values (proj.client_id, 'project_review_reminder', 'Work waiting for your review',
        proj.freelancer_name || '''s work for "' || proj.title || '" is waiting for your review. The project is due today.',
        link_text);
      sent := sent + 1;

    elsif kind in ('due_3', 'due_1', 'due_0') then
      title_text := case when days_left = 0 then 'Project due today' else 'Project due soon' end;
      insert into public.user_notifications (user_id, type, title, message, link)
      values
        (proj.freelancer_id, case when days_left = 0 then 'project_due_today' else 'project_due_soon' end, title_text,
          '"' || proj.title || '" is due ' || when_text
            || case when days_left > 0 then ' (' || date_text || ')' else '' end
            || '. Submit your work on the project page.',
          link_text),
        (proj.client_id, case when days_left = 0 then 'project_due_today' else 'project_due_soon' end, title_text,
          '"' || proj.title || '" is due ' || when_text
            || case when days_left > 0 then ' (' || date_text || ')' else '' end
            || '. ' || proj.freelancer_name || ' is working on it.',
          link_text);
      sent := sent + 2;

    else
      -- overdue_1 or overdue_7: the due date passed and nothing was submitted.
      insert into public.user_notifications (user_id, type, title, message, link)
      values
        (proj.freelancer_id, 'project_overdue', 'Project is late',
          '"' || proj.title || '" is ' || late_text || '. Submit your work or message the client.',
          link_text),
        (proj.client_id, 'project_overdue', 'Project is late',
          '"' || proj.title || '" is ' || late_text || '. Message ' || proj.freelancer_name || ' to ask about it.',
          link_text);
      sent := sent + 2;
    end if;
  end loop;

  return sent;
end;
$$;

revoke all on function public.send_daily_notices() from public, anon, authenticated;


-- =====================================================================
-- Section 4. Read / unread for each item (Step N5)
-- =====================================================================
-- Before this, opening the bell or the Notifications page marked EVERYTHING
-- as read (profiles.notifications_seen_at moved to the newest item). Now:
--   * opening the list marks nothing;
--   * opening one item (its pop-up) marks only that one as read;
--   * a "Mark all as read" button still moves notifications_seen_at forward.
-- An item is unread when it is newer than notifications_seen_at AND it was
-- not opened one by one: user_notifications.read_at is empty, or, for an
-- admin announcement (one row shared by everyone), there is no
-- announcement_reads row for this person. Everything from before stays read.

-- 4a. When the person opened this notification (empty = not opened yet).
alter table public.user_notifications add column if not exists read_at timestamptz;

comment on column public.user_notifications.read_at is
  'When the person opened this notification on its own. Set only by mark_notification_read().';

-- 4b. Which announcements each person opened. An announcement is one row for
--     everyone, so the "read" mark lives in its own table.
create table if not exists public.announcement_reads (
  user_id uuid not null references public.profiles (id) on delete cascade,
  announcement_id uuid not null references public.announcements (id) on delete cascade,
  read_at timestamptz not null default now(),
  primary key (user_id, announcement_id)
);

alter table public.announcement_reads enable row level security;

-- Each person sees only their own marks. There is no insert or update policy:
-- marks are added only by mark_notification_read() below.
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'announcement_reads' and policyname = 'announcement_reads: read own'
  ) then
    create policy "announcement_reads: read own" on public.announcement_reads
      for select to authenticated
      using (user_id = (select auth.uid()));
  end if;
end;
$$;

revoke all on public.announcement_reads from anon;
revoke insert, update, delete, truncate on public.announcement_reads from authenticated;
grant select on public.announcement_reads to authenticated;

-- 4c. The person opened one item. p_kind: 'notification' (their own row in
--     user_notifications) or 'announcement'. It only ever touches the
--     signed-in person's own item; anything else is ignored.
create or replace function public.mark_notification_read(p_kind text, p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Please sign in first.';
  end if;

  if p_kind = 'notification' then
    update public.user_notifications
       set read_at = now()
     where id = p_id and user_id = auth.uid() and read_at is null;
  elsif p_kind = 'announcement' then
    insert into public.announcement_reads (user_id, announcement_id)
    select auth.uid(), a.id from public.announcements a where a.id = p_id
    on conflict do nothing;
  else
    raise exception 'Unknown kind of notification.';
  end if;
end;
$$;

revoke all on function public.mark_notification_read(text, uuid) from public, anon;
grant execute on function public.mark_notification_read(text, uuid) to authenticated;


-- =====================================================================
-- Section 5. Clearer wording (Step N6, list approved by the user with "ok")
-- =====================================================================
-- The list is in PLAN-notifications-wording.md. Only the words change.
-- To be sure of that, each function is read back from the database as it is
-- live (pg_get_functiondef), one sentence is swapped for the new one, and the
-- result is saved again. If the old sentence isn't found, it stops with an
-- error instead of guessing. Running this file again skips what is done.

-- A helper that lives only while this file runs (pg_temp).
create or replace function pg_temp.swap_text(fn regprocedure, old_text text, new_text text)
returns void
language plpgsql
as $f$
declare
  def text := pg_get_functiondef(fn);
begin
  if position(old_text in def) = 0 then
    if position(new_text in def) > 0 then
      return; -- already changed
    end if;
    raise exception 'The text to change was not found in %: %', fn, old_text;
  end if;
  execute replace(def, old_text, new_text);
end;
$f$;

-- 1. New applicant: say what to do next.
select pg_temp.swap_text('public.notify_new_applicant()',
  $o$' applied to your job "' || job.title || '".'$o$,
  $n$' applied to your job post "' || job.title || '". Open it to see their resume and how well they fit.'$n$);

-- 2. Job post closed: the same words as the post page.
select pg_temp.swap_text('public.send_daily_notices()',
  $o$closed because its due date passed. Edit it to reopen it.'$o$,
  $n$closed because its due date passed, so freelancers can''t see it or apply. Pick new dates to show it again.'$n$);

-- 3. Work submitted: what the client does next.
select pg_temp.swap_text('public.submit_project(uuid, text, text, text)',
  $o$'". Open the project to review it.'$o$,
  $n$'". Open the project to review it, then mark it as done or ask for changes.'$n$);

-- 4. Project marked as done: the freelancer can rate the client now.
select pg_temp.swap_text('public.mark_project_done(uuid)',
  $o$' confirmed "' || proj.title || '" is done. It now shows on both your histories.'$o$,
  $n$' marked "' || proj.title || '" as done. It now shows on both your histories, and you can rate ' || client_name || ' on the project page.'$n$);

-- 5. Identity verified: clients can post now too.
select pg_temp.swap_text('public.notify_verification_reviewed()',
  $o$you can now post services for clients to find.'$o$,
  $n$you can now post services for clients to find. If you''re a client, you can now post job projects.'$n$);

-- 6. Payment short: a plainer title.
select pg_temp.swap_text('public.confirm_short_payment(uuid, numeric)',
  $o$'Less than you recorded arrived'$o$,
  $n$'Only part of your payment arrived'$n$);

-- 7. Price agreed: say what it means.
select pg_temp.swap_text('public.agree_project_price(uuid)',
  $o$' for "' || p.title || '".',$o$,
  $n$' for "' || p.title || '". This is now the project''s price.',$n$);

-- 9. Project is late (freelancer): the late-freelancer rule (database/supabase_late_block_schema.sql)
--    is live, so say what it means for them.
select pg_temp.swap_text('public.send_daily_notices()',
  $o$'. Submit your work or message the client.'$o$,
  $n$'. Submit your work or message the client. Until the client allows it, you can''t apply to their other job posts.'$n$);

-- 8. "A rating is waiting for you": the still-unapplied Section 4 of
--    database/supabase_rating_after_payment_schema.sql, as written there (its
--    date is the moment the rating really shows, and a client who hasn't paid
--    yet is told they can rate back once their payment is confirmed).
create or replace function public.notify_project_rated()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  rater_name text;
  proj record;
  closes_on text;
  other_rated boolean;
  must_pay boolean;
begin
  select coalesce(nullif(full_name, ''), username, 'Someone') into rater_name
    from public.profiles where id = new.rater_id;
  select title, client_id, completed_at, unlocked_at into proj
    from public.projects where id = new.project_id;
  closes_on := to_char(
    (greatest(proj.completed_at,
              case when proj.unlocked_at <= proj.completed_at + public.rating_window() then proj.unlocked_at end)
      + public.rating_window()) at time zone 'Asia/Manila',
    'FMMonth FMDD');
  -- The client is rated by the freelancer before paying: they rate back only once it's paid.
  must_pay := new.ratee_id = proj.client_id and proj.unlocked_at is null;
  select exists (
    select 1 from public.project_ratings r
    where r.project_id = new.project_id and r.rater_id = new.ratee_id
  ) into other_rated;

  if other_rated then
    insert into public.user_notifications (user_id, type, title, message, link)
    values (
      new.ratee_id, 'project_rated', 'You got a new rating',
      rater_name || ' rated you ' || new.stars || E'★ for "' || coalesce(proj.title, 'a project') || '".'
        || case when new.feedback is not null and btrim(new.feedback) <> '' then E'\n\n"' || new.feedback || '"' else '' end,
      '/dashboard/project-details/' || new.project_id
    );
  else
    insert into public.user_notifications (user_id, type, title, message, link)
    values (
      new.ratee_id, 'project_rated', 'A rating is waiting for you',
      rater_name || ' rated you for "' || coalesce(proj.title, 'a project') || '". It stays hidden until you rate them too'
        || coalesce(', or until ' || closes_on, '') || '.'
        || case when must_pay then E'\n\nYou can rate them once your payment for this project is confirmed.' else '' end,
      '/dashboard/project-details/' || new.project_id
    );
  end if;
  return new;
end;
$$;
