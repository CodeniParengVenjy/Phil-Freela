-- Projects and Ratings (see PLAN-projects-and-ratings.md). Run this in the
-- Supabase SQL Editor after supabase_applications_schema.sql and
-- supabase_admin_schema.sql (it uses is_posting_blocked() from there).
--
-- Feature 5, Profile transparency and transaction history: a project is made
-- when a client hires someone who applied to their job. A project that both
-- sides confirm as Done is the "completed transaction" record. No money is
-- involved anywhere.

-- ---------------------------------------------------------------------------
-- Step 1: Required Skills on job posts (shown on the Job Details page).
-- ---------------------------------------------------------------------------

-- True when a skills list is up to 10 skills, each 1 to 40 characters with
-- no spaces around it. It's a function because a table rule can't loop over
-- the items of a list by itself.
create or replace function public.is_valid_skill_list(list text[])
returns boolean
language sql
immutable
set search_path = ''
as $$
  select cardinality(list) <= 10
     and coalesce(
       (select bool_and(s is not null and s = btrim(s) and char_length(s) between 1 and 40) from unnest(list) as s),
       true
     );
$$;

alter table public.job_posts
  add column skills text[] not null default '{}'
  constraint job_posts_skills_check check (public.is_valid_skill_list(skills));

-- ---------------------------------------------------------------------------
-- Step 2: Hire an applicant, which starts a project.
-- ---------------------------------------------------------------------------

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  -- The application the client hired from (one project per application).
  -- Deleting the job post deletes its applications, so this becomes empty
  -- but the project stays as history.
  application_id uuid unique references public.job_applications(id) on delete set null,
  job_post_id uuid references public.job_posts(id) on delete set null,
  client_id uuid not null references public.profiles(id) on delete cascade,
  freelancer_id uuid not null references public.profiles(id) on delete cascade,
  -- Copied from the job post, so the history keeps its name if the post is deleted.
  title varchar(150) not null,
  -- The client's instructions, e.g. "The video must be 1 minute long".
  note text check (note is null or char_length(note) <= 1000),
  -- started -> submitted (the freelancer sent the work) -> done (the client
  -- confirmed it). The client can send it back to started to ask for changes.
  status text not null default 'started' check (status in ('started', 'submitted', 'done')),
  started_at timestamptz not null default now(),
  due_date date not null,
  -- The freelancer's work (used from Step 3): a file in the private
  -- "deliverables" bucket, a link, or both, plus an optional message.
  submission_path text,
  submission_link text check (submission_link is null or submission_link ~ '^https://'),
  submission_message text check (submission_message is null or char_length(submission_message) <= 1000),
  submitted_at timestamptz,
  completed_at timestamptz,
  constraint projects_two_people check (client_id <> freelancer_id)
);

-- For each person's "My Projects" list (application_id is already indexed by unique).
create index projects_client_id_idx on public.projects (client_id);
create index projects_freelancer_id_idx on public.projects (freelancer_id);
create index projects_job_post_id_idx on public.projects (job_post_id);

alter table public.projects enable row level security;

-- Only the two people on a project can see it.
create policy "projects: the client and freelancer can view"
  on public.projects for select
  to authenticated
  using (client_id = (select auth.uid()) or freelancer_id = (select auth.uid()));

-- There are no insert, update or delete rules: the browser can only READ
-- projects. Every change goes through a function below, which checks who is
-- asking and what status the project is in.
revoke all on public.projects from anon;
revoke insert, update, delete on public.projects from authenticated;

-- Once hired, the freelancer can't withdraw that application (its resume
-- stays with the project).
drop policy "job_applications: freelancers can withdraw their own" on public.job_applications;
create policy "job_applications: freelancers can withdraw their own"
  on public.job_applications for delete
  to authenticated
  using (
    freelancer_id = auth.uid()
    and not exists (select 1 from public.projects p where p.application_id = job_applications.id)
  );

-- New kinds of notifications for projects (keeps the report ones already live).
alter table public.user_notifications drop constraint user_notifications_type_check;
alter table public.user_notifications add constraint user_notifications_type_check
  check (type in ('verification_approved', 'verification_rejected', 'suspension',
                  'suspension_lifted', 'appeal_accepted', 'appeal_rejected',
                  'report_resolved', 'report_dismissed',
                  'project_hired', 'project_submitted', 'project_done', 'project_changes'));

-- The Hire button. Only the client who posted the job can hire, only once
-- per application, and the due date can't be in the past (Philippine date).
-- Makes the project and tells the freelancer. Returns the new project's id.
-- Problems are raised with a plain message the page shows as is.
create or replace function public.hire_applicant(target_application uuid, project_note text, project_due_date date)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  app record;
  client_name text;
  new_project uuid;
begin
  select a.id, a.freelancer_id, j.id as job_id, j.title, j.client_id
    into app
    from public.job_applications a
    join public.job_posts j on j.id = a.job_post_id
   where a.id = target_application;

  if not found or app.client_id <> auth.uid() then
    raise exception 'Only the client who posted this job can hire for it.';
  end if;
  if public.is_posting_blocked(auth.uid()) then
    raise exception 'Your account can''t hire right now because of a suspension.';
  end if;
  if exists (select 1 from public.projects where application_id = target_application) then
    raise exception 'You already hired this freelancer for this job.';
  end if;
  if project_due_date is null or project_due_date < (now() at time zone 'Asia/Manila')::date then
    raise exception 'The due date can''t be in the past.';
  end if;
  if char_length(coalesce(project_note, '')) > 1000 then
    raise exception 'The note can be up to 1000 characters.';
  end if;

  insert into public.projects (application_id, job_post_id, client_id, freelancer_id, title, note, due_date)
  values (app.id, app.job_id, app.client_id, app.freelancer_id, app.title, nullif(btrim(project_note), ''), project_due_date)
  returning id into new_project;

  select coalesce(nullif(full_name, ''), username, 'A client') into client_name
    from public.profiles where id = auth.uid();

  insert into public.user_notifications (user_id, type, title, message, link)
  values (
    app.freelancer_id, 'project_hired', 'You were hired!',
    client_name || ' hired you for "' || app.title || '". The project has started, and it''s due on '
      || to_char(project_due_date, 'FMMonth FMDD, YYYY') || '.'
      || E'\n\n' || 'Open the project to read the client''s note. You can message the client from there too.',
    '/dashboard/project-details/' || new_project
  );

  return new_project;
end;
$$;

revoke execute on function public.hire_applicant(uuid, text, date) from public, anon;
grant execute on function public.hire_applicant(uuid, text, date) to authenticated;

-- ---------------------------------------------------------------------------
-- Step 3: the freelancer submits the work, the client marks it Done.
-- ---------------------------------------------------------------------------

-- Storage: the freelancer's deliverable (video, photo, PDF or ZIP, up to
-- 50 MB, the same per-file limit as the marketplace media bucket). Private:
-- only the project's client and freelancer can open one.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('deliverables', 'deliverables', false, 52428800, array[
  'video/mp4', 'video/webm', 'video/quicktime',
  'image/jpeg', 'image/png', 'image/webp',
  'application/pdf', 'application/zip'
])
on conflict (id) do nothing;

-- Freelancers can only upload into their own folder: deliverables/<user id>/...
create policy "deliverables: freelancers can upload to their folder"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'deliverables' and (storage.foldername(name))[1] = auth.uid()::text);

-- Opening a deliverable: the client or freelancer of the project it belongs to.
create policy "deliverables: the project's client and freelancer can open"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'deliverables'
    and exists (
      select 1 from public.projects p
      where p.submission_path = objects.name
        and (p.client_id = auth.uid() or p.freelancer_id = auth.uid())
    )
  );

-- Re-submitting replaces the old file: the freelancer can delete their own.
create policy "deliverables: freelancers can delete their own"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'deliverables' and (storage.foldername(name))[1] = auth.uid()::text);

-- The freelancer's "Attach your files". Needs a file, a link, or both. The
-- file must be this freelancer's own, for this project. Sets Submitted and
-- tells the client. Only while the project is Started (first time, or after
-- the client asked for changes).
create or replace function public.submit_project(target_project uuid, file_path text, deliverable_link text, deliverable_message text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  proj record;
  freelancer_name text;
begin
  select * into proj from public.projects where id = target_project;

  if not found or proj.freelancer_id <> auth.uid() then
    raise exception 'Only the freelancer on this project can submit work for it.';
  end if;
  if proj.status <> 'started' then
    raise exception 'This project already has submitted work waiting for the client.';
  end if;
  if file_path is null and (deliverable_link is null or btrim(deliverable_link) = '') then
    raise exception 'Attach a file or paste a link.';
  end if;
  if file_path is not null and file_path !~ ('^' || auth.uid()::text || '/' || target_project::text || '-[0-9]+\.[a-z0-9]+$') then
    raise exception 'That file was not uploaded for this project.';
  end if;
  if deliverable_link is not null and btrim(deliverable_link) <> '' and deliverable_link !~ '^https://' then
    raise exception 'The link must start with https://.';
  end if;
  if char_length(coalesce(deliverable_message, '')) > 1000 then
    raise exception 'The message can be up to 1000 characters.';
  end if;

  update public.projects set
    submission_path = file_path,
    submission_link = nullif(btrim(deliverable_link), ''),
    submission_message = nullif(btrim(deliverable_message), ''),
    submitted_at = now(),
    status = 'submitted'
  where id = target_project;

  select coalesce(nullif(full_name, ''), username, 'A freelancer') into freelancer_name
    from public.profiles where id = auth.uid();

  insert into public.user_notifications (user_id, type, title, message, link)
  values (
    proj.client_id, 'project_submitted', 'Work submitted',
    freelancer_name || ' sent the work for "' || proj.title || '". Open the project to review it.',
    '/dashboard/project-details/' || target_project
  );
end;
$$;

revoke execute on function public.submit_project(uuid, text, text, text) from public, anon;
grant execute on function public.submit_project(uuid, text, text, text) to authenticated;

-- The client confirms the work. Only while Submitted.
create or replace function public.mark_project_done(target_project uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  proj record;
  client_name text;
begin
  select * into proj from public.projects where id = target_project;

  if not found or proj.client_id <> auth.uid() then
    raise exception 'Only the client on this project can mark it done.';
  end if;
  if proj.status <> 'submitted' then
    raise exception 'There''s no submitted work waiting for your review.';
  end if;

  update public.projects set status = 'done', completed_at = now() where id = target_project;

  select coalesce(nullif(full_name, ''), username, 'The client') into client_name
    from public.profiles where id = auth.uid();

  insert into public.user_notifications (user_id, type, title, message, link)
  values (
    proj.freelancer_id, 'project_done', 'Project marked as done',
    client_name || ' confirmed "' || proj.title || '" is done. It now shows on both your histories.',
    '/dashboard/project-details/' || target_project
  );
end;
$$;

revoke execute on function public.mark_project_done(uuid) from public, anon;
grant execute on function public.mark_project_done(uuid) to authenticated;

-- The client sends it back for changes. Only while Submitted.
create or replace function public.request_project_changes(target_project uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  proj record;
  client_name text;
begin
  select * into proj from public.projects where id = target_project;

  if not found or proj.client_id <> auth.uid() then
    raise exception 'Only the client on this project can request changes.';
  end if;
  if proj.status <> 'submitted' then
    raise exception 'There''s no submitted work waiting for your review.';
  end if;

  update public.projects set status = 'started' where id = target_project;

  select coalesce(nullif(full_name, ''), username, 'The client') into client_name
    from public.profiles where id = auth.uid();

  insert into public.user_notifications (user_id, type, title, message, link)
  values (
    proj.freelancer_id, 'project_changes', 'Changes requested',
    client_name || ' asked for changes on "' || proj.title || '". Check your chat for details, then attach your updated work.',
    '/dashboard/project-details/' || target_project
  );
end;
$$;

revoke execute on function public.request_project_changes(uuid) from public, anon;
grant execute on function public.request_project_changes(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Step 4: ratings and feedback, once a project is Done.
-- ---------------------------------------------------------------------------

create table public.project_ratings (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  rater_id uuid not null references public.profiles(id) on delete cascade,
  ratee_id uuid not null references public.profiles(id) on delete cascade,
  stars smallint not null check (stars between 1 and 5),
  -- Only the client's rating shows a feedback box (screen 4); the
  -- freelancer's is trust stars only (screen 5), so this is always null for them.
  feedback text check (feedback is null or char_length(feedback) <= 1000),
  created_at timestamptz not null default now(),
  constraint project_ratings_not_self check (rater_id <> ratee_id),
  -- Each side rates the other once per project.
  constraint project_ratings_one_per_person unique (project_id, rater_id)
);

create index project_ratings_ratee_id_idx on public.project_ratings (ratee_id);

alter table public.project_ratings enable row level security;

-- Feature 5, Profile transparency: every signed-in user can read ratings
-- (they're part of a user's public track record), not just the two people
-- on that project.
create policy "project_ratings: signed-in users can view"
  on public.project_ratings for select
  to authenticated
  using (true);

-- Rate only as yourself, only the other person on that project, and only
-- once it's Done. No update or delete rule: a sent rating can't be edited.
create policy "project_ratings: rate the other person once a project is done"
  on public.project_ratings for insert
  to authenticated
  with check (
    rater_id = (select auth.uid())
    and exists (
      select 1 from public.projects p
      where p.id = project_ratings.project_id
        and p.status = 'done'
        and (
          (p.client_id = auth.uid() and p.freelancer_id = project_ratings.ratee_id)
          or (p.freelancer_id = auth.uid() and p.client_id = project_ratings.ratee_id)
        )
    )
  );

-- New kind of notification: someone left you a rating.
alter table public.user_notifications drop constraint user_notifications_type_check;
alter table public.user_notifications add constraint user_notifications_type_check
  check (type in ('verification_approved', 'verification_rejected', 'suspension',
                  'suspension_lifted', 'appeal_accepted', 'appeal_rejected',
                  'report_resolved', 'report_dismissed',
                  'project_hired', 'project_submitted', 'project_done', 'project_changes',
                  'project_rated'));

-- Tells the other person about a new rating. A trigger (not the function
-- Step 2-3 use) because the insert itself is a plain table insert governed
-- by the policy above, with nothing else for the browser to ask for.
create or replace function public.notify_project_rated()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  rater_name text;
  proj_title text;
begin
  select coalesce(nullif(full_name, ''), username, 'Someone') into rater_name
    from public.profiles where id = new.rater_id;
  select title into proj_title from public.projects where id = new.project_id;

  insert into public.user_notifications (user_id, type, title, message, link)
  values (
    new.ratee_id, 'project_rated', 'You got a new rating',
    rater_name || ' rated you ' || new.stars || E'★ for "' || coalesce(proj_title, 'a project') || '".'
      || case when new.feedback is not null and btrim(new.feedback) <> '' then E'\n\n"' || new.feedback || '"' else '' end,
    '/dashboard/project-details/' || new.project_id
  );
  return new;
end;
$$;

revoke execute on function public.notify_project_rated() from public, anon, authenticated;

create trigger project_ratings_notify
  after insert on public.project_ratings
  for each row execute function public.notify_project_rated();

-- Each user's average stars and how many ratings they have, for showing
-- "★ 4.8 (5)" next to a name. Reads are already open to everyone (the
-- select policy above), so this can safely run as the caller.
create or replace function public.rating_summaries(ids uuid[])
returns table (user_id uuid, avg_stars numeric, rating_count integer)
language sql
stable
security invoker
set search_path = public
as $$
  select ratee_id, round(avg(stars)::numeric, 1), count(*)::integer
  from public.project_ratings
  where ratee_id = any(ids)
  group by ratee_id;
$$;

revoke execute on function public.rating_summaries(uuid[]) from public, anon;
grant execute on function public.rating_summaries(uuid[]) to authenticated;

-- ---------------------------------------------------------------------------
-- Job post due date (migration "job_post_due_date", 2026-10-06).
-- ---------------------------------------------------------------------------

-- The day the client needs the work by, picked on Post a Project (optional:
-- older job posts don't have one). It shows on the Job Details page and
-- fills in the Hire popup's due date, which the client can still change.
-- Rule: it can't be earlier than the day the job was posted (Philippine
-- date, the same day hire_applicant() checks against). It's compared with
-- the posting day, not with today, so a job post can still be edited after
-- its due date has passed.
alter table public.job_posts
  add column due_date date
  constraint job_posts_due_date_check
    check (due_date is null or due_date >= (created_at at time zone 'Asia/Manila')::date);
