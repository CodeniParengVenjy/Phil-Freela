-- Posting a job: the type of work, what the budget counts, start and due dates,
-- and how many freelancers are needed (PLAN-posting-job.md, step 1: database).
-- Run this in the Supabase SQL Editor after supabase_projects_schema.sql
-- (hire_applicant and the first due date), supabase_post_edit_schema.sql,
-- supabase_search_schema.sql and supabase_recommendations_schema.sql.
-- No new table. Test: database/test_job_post_details.sql.
--
-- A job post is always in one of three states. The state is worked out from
-- the post's own columns each time it is asked for (nothing is stored), so it
-- can never be out of date and no daily job is needed:
--   open     other people can see it and apply to it
--   filled   as many freelancers were hired as it needed (freelancers_needed)
--   expired  its due date has passed (a day ends at midnight, Philippine time)
-- A filled or expired post is hidden from everyone except its owner, admins and
-- the freelancers who applied to it. So it leaves Find Jobs, the AI search and
-- Recommended for you by itself, and nobody can apply to it or hire for it.
-- Nothing is removed: the owner changes the dates or the number needed, and the
-- post is open again.

-- ---------------------------------------------------------------------------
-- 1. New columns
-- ---------------------------------------------------------------------------

alter table public.job_posts
  -- What is being posted: a one-time project, or an ongoing job.
  add column job_type text not null default 'project'
    constraint job_posts_job_type_check check (job_type in ('project', 'job')),
  -- What the budget amount counts: the whole project, one day, or one month.
  -- Which of them is allowed depends on the type (section 3b).
  add column budget_type text not null default 'project'
    constraint job_posts_budget_type_check check (budget_type in ('project', 'day', 'month')),
  -- How many freelancers the client wants to hire. When that many are hired,
  -- the post is filled and leaves Find Jobs.
  add column freelancers_needed smallint not null default 1
    constraint job_posts_freelancers_needed_check check (freelancers_needed between 1 and 10),
  -- The day the work starts. (due_date, added earlier, is the day it is due.)
  add column start_date date;

-- ---------------------------------------------------------------------------
-- 2. Posts made before this
-- ---------------------------------------------------------------------------

-- They start on the day they were posted. The few without a due date get 30
-- days from the day this ran. The Edited-date trigger is switched off for this
-- one change, or every older post would say it was edited today.
alter table public.job_posts disable trigger job_posts_touch_updated_at;

update public.job_posts
set start_date = (created_at at time zone 'Asia/Manila')::date
where start_date is null;

update public.job_posts
set due_date = (now() at time zone 'Asia/Manila')::date + 30
where due_date is null;

alter table public.job_posts enable trigger job_posts_touch_updated_at;

-- ---------------------------------------------------------------------------
-- 3. Date rules
-- ---------------------------------------------------------------------------

-- The first rule (job_posts_due_date_check: the due date can't be before the
-- day the post was made) stays. These two are new. Like that one, they compare
-- with the day the post was MADE, not with today, so a post can still be
-- edited after its start date has passed. The website asks for today or later
-- when the person picks a new date.
alter table public.job_posts
  add constraint job_posts_start_date_check
    check (start_date is null or start_date >= (created_at at time zone 'Asia/Manila')::date),
  add constraint job_posts_dates_order_check
    check (start_date is null or due_date is null or due_date >= start_date);

-- ---------------------------------------------------------------------------
-- 3b. The budget basis follows the type
-- ---------------------------------------------------------------------------

-- A one-time project is counted per project only; an ongoing job is counted per
-- day or per month. (Added after the first version, which allowed every pair;
-- every post that existed then was a project counted per project, so nothing
-- had to change.) The website only offers the pairs that fit.
alter table public.job_posts
  add constraint job_posts_type_budget_check
    check (
      (job_type = 'project' and budget_type = 'project')
      or (job_type = 'job' and budget_type in ('day', 'month'))
    );

-- ---------------------------------------------------------------------------
-- 4. The state of a post
-- ---------------------------------------------------------------------------

-- 'open', 'filled' or 'expired' (nothing for a post that doesn't exist).
-- "Hired" means a project was started from the post. Filled wins over expired.
-- A function that runs with the owner's rights, because a freelancer can't
-- read other people's projects and the rules below need the count.
create or replace function public.job_state(target_job uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select case
    when (select count(*) from public.projects p where p.job_post_id = j.id) >= j.freelancers_needed then 'filled'
    when j.due_date < (now() at time zone 'Asia/Manila')::date then 'expired'
    else 'open'
  end
  from public.job_posts j
  where j.id = target_job;
$$;

-- True when the signed-in person applied to this job. A function (not a plain
-- query in the rule below) because the rules of job_applications already look
-- at job_posts, and two tables looking at each other loops forever.
create or replace function public.applied_to_job(target_job uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.job_applications a
    where a.job_post_id = target_job and a.freelancer_id = auth.uid()
  );
$$;

-- The same answer as a column of job_posts, for the website's lists. The
-- database's web API (PostgREST) shows a function that takes a whole job_posts
-- row as a column of that table, one that can be asked for and filtered on:
--   .from("job_posts").select("...").eq("job_state", "open")
-- It is needed because a freelancer who applied still SEES a post that filled or
-- expired (section 5, so their My Applications keeps working), and without the
-- filter Find Jobs would list it among the openings.
create or replace function public.job_state(job public.job_posts)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select public.job_state(job.id);
$$;

revoke execute on function public.job_state(uuid) from public, anon;
revoke execute on function public.job_state(public.job_posts) from public, anon;
revoke execute on function public.applied_to_job(uuid) from public, anon;
grant execute on function public.job_state(uuid) to authenticated, service_role;
grant execute on function public.job_state(public.job_posts) to authenticated, service_role;
grant execute on function public.applied_to_job(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 5. Who can see a post, and who can apply
-- ---------------------------------------------------------------------------

-- Before: everyone signed in saw every post, except those of someone blocked
-- from posting. Now a filled or expired post is only seen by its owner, admins
-- and the freelancers who applied to it (so their My Applications and project
-- pages keep working).
alter policy "job_posts: signed-in users can view" on public.job_posts
  using (
    client_id = auth.uid()
    or public.is_admin()
    or (
      not public.is_posting_blocked(client_id)
      and (public.job_state(id) = 'open' or public.applied_to_job(id))
    )
  );

-- Applying: the same rules as before, and the job has to be open.
alter policy "job_applications: verified freelancers can apply" on public.job_applications
  with check (
    freelancer_id = auth.uid()
    and exists (select 1 from public.profiles p where p.id = auth.uid() and p.account_type = 'freelancer')
    and public.is_verified(auth.uid())
    and not public.is_posting_blocked(auth.uid())
    and not exists (select 1 from public.job_posts j where j.id = job_applications.job_post_id and j.client_id = auth.uid())
    and public.job_state(job_post_id) = 'open'
  );

-- ---------------------------------------------------------------------------
-- 6. Hiring
-- ---------------------------------------------------------------------------

-- Same as before (supabase_projects_schema.sql), plus: no hiring for a job that
-- is already filled or has expired. To hire again the client edits the job post
-- (more freelancers needed, or new dates). The job row is locked while the
-- count is read, so two Hire clicks at the same moment can't go past the number
-- needed.
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
  job_status text;
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

  perform 1 from public.job_posts where id = app.job_id for update;
  job_status := public.job_state(app.job_id);
  if job_status = 'filled' then
    raise exception 'This job already has all the freelancers it needed. Edit the job post and raise "Freelancers needed" to hire one more.';
  elsif job_status = 'expired' then
    raise exception 'This job''s due date has passed. Edit the job post and pick new dates to hire for it.';
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

-- ---------------------------------------------------------------------------
-- 7. AI search and Recommended for you
-- ---------------------------------------------------------------------------

-- Only the AI service (service role) uses these. The website already hides
-- posts that aren't open (section 5), because it loads them under the normal
-- rules; this keeps closed posts from using up places in the AI's answers.

-- A job post's required skills are now part of the text the AI turns into
-- meaning numbers (the "skill" column, the way a service's skill is). The
-- fingerprint changes with them, so every job gets new numbers once.
create or replace function public.listings_to_embed(max_rows int default 200)
returns table (kind text, post_id uuid, title text, category text, skill text, description text, text_hash text)
language sql
stable
set search_path = public
as $$
  select * from (
    select 'service'::text as kind, s.id as post_id, s.title::text, s.category, s.skill, s.description,
           md5(concat_ws('|', s.title, s.category, s.skill, s.description)) as text_hash
    from public.services s
    left join public.listing_embeddings e on e.service_id = s.id
    where e.id is null
       or e.text_hash <> md5(concat_ws('|', s.title, s.category, s.skill, s.description))
    union all
    select 'job'::text, j.id, j.title::text, j.category, array_to_string(j.skills, ', '), j.description,
           md5(concat_ws('|', j.title, j.category, array_to_string(j.skills, ', '), j.description))
    from public.job_posts j
    left join public.listing_embeddings e on e.job_post_id = j.id
    where e.id is null
       or e.text_hash <> md5(concat_ws('|', j.title, j.category, array_to_string(j.skills, ', '), j.description))
  ) todo
  limit max_rows;
$$;

-- The AI search: a job post that isn't open is left out.
create or replace function public.closest_listings(query extensions.vector, how_many int default 30)
returns table (kind text, post_id uuid, similarity real)
language sql
stable
set search_path = public, extensions
as $$
  select case when e.service_id is not null then 'service' else 'job' end,
         coalesce(e.service_id, e.job_post_id),
         (1 - (e.embedding <=> query))::real
  from public.listing_embeddings e
  where e.service_id is not null or public.job_state(e.job_post_id) = 'open'
  order by e.embedding <=> query
  limit how_many;
$$;

-- Recommended for you, content-based part: a job post that isn't open is not
-- suggested. (Only the marked line is new.)
create or replace function public.content_candidates(target_user uuid, want text, how_many int default 100)
returns table (post_id uuid, similarity real)
language sql
stable
set search_path = public, extensions
as $$
  with taste_parts as (
    select e.embedding
    from public.profile_embeddings e
    join public.profiles p on p.id = e.profile_id
    where e.profile_id = target_user and e.text_hash = md5(coalesce(p.description, ''))
    union all
    select e.embedding
    from public.listing_embeddings e
    where (want = 'jobs' and e.service_id in (select id from public.services where freelancer_id = target_user))
       or (want = 'services' and e.job_post_id in (select id from public.job_posts where client_id = target_user))
    union all
    select e.embedding
    from public.listing_embeddings e
    where want = 'jobs' and e.job_post_id in (select a.job_post_id from public.job_applications a where a.freelancer_id = target_user)
  ),
  taste as (select avg(embedding) as v from taste_parts),
  acted_on as (select r.post_id from public.recommendation_interactions(want) r where r.user_id = target_user),
  scored as materialized (
    select coalesce(e.service_id, e.job_post_id) as post_id, e.embedding <=> t.v as distance
    from public.listing_embeddings e
    cross join taste t
    where t.v is not null
      and case when want = 'jobs'
            then e.job_post_id is not null
                 and e.job_post_id not in (select id from public.job_posts where client_id = target_user)
                 and public.job_state(e.job_post_id) = 'open'  -- new
            else e.service_id is not null
                 and e.service_id not in (select id from public.services where freelancer_id = target_user)
          end
  )
  select s.post_id, (1 - s.distance)::real
  from scored s
  where s.post_id not in (select post_id from acted_on)
  order by s.distance
  limit how_many;
$$;

-- Recommended for you, "people like you" part: same. (Only the marked line is new.)
create or replace function public.collaborative_candidates(target_user uuid, want text, how_many int default 100)
returns table (post_id uuid, score real)
language sql
stable
set search_path = public
as $$
  with interactions as (select * from public.recommendation_interactions(want)),
  mine as (select i.post_id from interactions i where i.user_id = target_user),
  neighbours as (
    select i.user_id,
           count(*) filter (where i.post_id in (select post_id from mine))::real
             / (count(*) + (select count(*) from mine) - count(*) filter (where i.post_id in (select post_id from mine))) as similarity
    from interactions i
    where i.user_id <> target_user
    group by i.user_id
  ),
  own_posts as (
    select id from public.services where freelancer_id = target_user and want = 'services'
    union all
    select id from public.job_posts where client_id = target_user and want = 'jobs'
  )
  select i.post_id, sum(n.similarity)::real
  from interactions i
  join neighbours n on n.user_id = i.user_id and n.similarity > 0
  where i.post_id not in (select post_id from mine)
    and i.post_id not in (select id from own_posts)
    and (want <> 'jobs' or public.job_state(i.post_id) = 'open')  -- new
  group by i.post_id
  order by 2 desc
  limit how_many;
$$;

-- The newest open job posts that aren't the person's own: what Recommended for
-- you falls back on when a new person has too few personal suggestions.
create or replace function public.recent_open_jobs(except_user uuid, how_many int default 30)
returns table (job_id uuid)
language sql
stable
set search_path = public
as $$
  select j.id
  from public.job_posts j
  where j.client_id <> except_user and public.job_state(j.id) = 'open'
  order by j.created_at desc
  limit how_many;
$$;

revoke execute on function public.recent_open_jobs(uuid, int) from public, anon, authenticated;
grant execute on function public.recent_open_jobs(uuid, int) to service_role;

-- ---------------------------------------------------------------------------
-- 8. Both dates are required
-- ---------------------------------------------------------------------------

-- Run after the website sends them (it does since PLAN-posting-job.md step 2).
-- Any post that slipped in without dates in between gets the same dates as in
-- section 2 first.
alter table public.job_posts disable trigger job_posts_touch_updated_at;

update public.job_posts
set start_date = (created_at at time zone 'Asia/Manila')::date
where start_date is null;

update public.job_posts
set due_date = greatest((now() at time zone 'Asia/Manila')::date + 30, start_date)
where due_date is null;

alter table public.job_posts enable trigger job_posts_touch_updated_at;

alter table public.job_posts
  alter column start_date set not null,
  alter column due_date set not null;
