-- Applicant counts and Best fit applicants (the user's revision list, 2026-11-09/10).
-- Run in the Supabase SQL Editor after supabase_applications_schema.sql,
-- supabase_job_post_details_schema.sql and supabase_ranking_records_schema.sql.
--
-- The user: when many freelancers apply, the list was newest first ("last in,
-- first out"), which is unfair to the ones who applied early. So:
--   Section 1: how many freelancers applied to each job post ("12 applied").
--   Section 2: what the AI service needs to rank a job's applicants by how well
--              they fit (ai-service/best_fit.py): the Hybrid recommendation
--              system, feature 1 in PhilFreela-System-Functions.md.

-- ---------------------------------------------------------------------------
-- Section 1: applicant counts
-- ---------------------------------------------------------------------------

-- How many freelancers applied to a job post. A freelancer may only read their
-- own applications (the job_applications rules), so counting from the website
-- would say 0 or 1. This function counts them all and gives back ONLY the
-- number, never who applied. It takes the job post's row, so the web API shows
-- it as a column of job_posts ("applicant_count", like job_state), and only for
-- the posts the person may already see: the job_posts rules pick the rows.
-- A withdrawn application is removed, so it no longer counts; a hired one does.
create or replace function public.applicant_count(job public.job_posts)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::integer
  from public.job_applications a
  where a.job_post_id = job.id;
$$;

revoke execute on function public.applicant_count(public.job_posts) from public, anon;
grant execute on function public.applicant_count(public.job_posts) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Section 2: Best fit applicants (used only by the AI service)
-- ---------------------------------------------------------------------------

-- What the AI took from each resume, so every resume is read only once (the
-- first time the client opens the list), not on every visit:
--   embedding  the resume's meaning as 384 numbers (the pretrained
--              all-MiniLM-L6-v2 model), empty when the file couldn't be read
--   skills     the skills written in it, by their standard names
--   read_ok    false when the AI couldn't read the file (the client then
--              opens it themselves; it gets a middle score, not zero)
-- The resume's text itself is NEVER saved (Data Privacy Act, RA 10173). The
-- row goes away with its application (a withdrawn application takes it along).
-- Row level security is on with no rules, so the website can't read or change
-- it; only the AI service (service role) can.
create table if not exists public.application_fit (
  application_id uuid primary key references public.job_applications (id) on delete cascade,
  embedding extensions.vector(384),
  skills text[] not null default '{}',
  read_ok boolean not null,
  read_at timestamptz not null default now()
);

alter table public.application_fit enable row level security;
revoke all on public.application_fit from anon, authenticated;

-- Everyone who applied to one job post, first applied first, with what the
-- ranking needs about each freelancer (ai-service/best_fit.py):
--   profile_skills   the skills on their profile
--   completed_count  their Done projects as a freelancer
--   rating_count, avg_stars  the ratings they received on those projects
--                    (only ratings already shown, like ranking_records)
--   reply_minutes    how long they usually take to answer a new message in a
--                    chat (last 30 days, the middle value; same rule as
--                    ranking_signals)
-- Only the AI service may call it; the service checks first that the person
-- asking owns the job post.
create or replace function public.applicant_records(target_job uuid)
returns table (
  application_id uuid,
  freelancer_id uuid,
  resume_path text,
  applied_at timestamptz,
  profile_skills text[],
  completed_count integer,
  rating_count integer,
  avg_stars numeric,
  reply_minutes real
)
language sql
stable
set search_path = public
as $$
  with apps as (
    select a.id, a.freelancer_id, a.resume_path, a.created_at
    from public.job_applications a
    where a.job_post_id = target_job
  ),
  people as (
    select distinct freelancer_id from apps
  ),
  done as (
    select pe.freelancer_id, pr.id as project_id
    from people pe
    join public.projects pr on pr.status = 'done' and pr.freelancer_id = pe.freelancer_id
  ),
  received as (
    select d.freelancer_id, r.stars
    from done d
    join public.project_ratings r
      on r.project_id = d.project_id and r.ratee_id = d.freelancer_id
     and public.rating_is_visible(r.project_id)
  ),
  their_messages as (
    -- Each message in the freelancer's chats, with who sent the one before it.
    select pe.freelancer_id, m.conversation_id, m.sender_id, m.created_at,
           lag(m.sender_id) over (partition by pe.freelancer_id, m.conversation_id order by m.created_at) as previous_sender
    from people pe
    join public.conversations c on pe.freelancer_id in (c.user_a, c.user_b)
    join public.messages m on m.conversation_id = c.id
    where m.created_at > now() - interval '30 days' and m.call_id is null
  ),
  waits as (
    -- Minutes from someone else's new message to the freelancer's next one
    -- (no answer after a day counts as a very long wait).
    select q.freelancer_id,
           coalesce(
             extract(epoch from (
               (select min(r.created_at) from their_messages r
                where r.freelancer_id = q.freelancer_id and r.conversation_id = q.conversation_id
                  and r.sender_id = q.freelancer_id and r.created_at > q.created_at)
               - q.created_at)) / 60,
             case when q.created_at < now() - interval '1 day' then 100000 end
           ) as minutes
    from their_messages q
    where q.sender_id <> q.freelancer_id and q.previous_sender is distinct from q.sender_id
  )
  select a.id, a.freelancer_id, a.resume_path, a.created_at, p.skills,
         (select count(*) from done d where d.freelancer_id = a.freelancer_id)::integer,
         (select count(*) from received x where x.freelancer_id = a.freelancer_id)::integer,
         (select avg(x.stars) from received x where x.freelancer_id = a.freelancer_id)::numeric,
         (select percentile_cont(0.5) within group (order by w.minutes)
          from waits w where w.freelancer_id = a.freelancer_id and w.minutes is not null)::real
  from apps a
  join public.profiles p on p.id = a.freelancer_id
  order by a.created_at;
$$;

revoke execute on function public.applicant_records(uuid) from public, anon, authenticated;
grant execute on function public.applicant_records(uuid) to service_role;
