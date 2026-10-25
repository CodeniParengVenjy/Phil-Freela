-- Admin: hiring from job posts. Plan: PLAN-job-hiring.md.
-- Run this in the Supabase SQL Editor. It adds two functions and nothing else:
-- no table, and nothing existing is changed.
--
-- The trail itself is already in the data: a hire (hire_applicant) starts a
-- project that keeps the job post's id (projects.job_post_id) and the
-- application it came from (projects.application_id). The admin can't read
-- projects or applications directly (only the two people on them can, and a
-- resume is personal data), so like admin_stats() these two functions do the
-- reading and turn away anyone who is not an admin. Resumes are never returned,
-- only names and statuses.

-- ---------------------------------------------------------------------------
-- admin_job_hiring(): where hiring stands, for every job post.
--   posts    one entry per post, newest first:
--              { id, state, applicants, hired }
--              state       'open', 'filled' or 'expired' (job_state(), the same
--                          answer freelancers' lists use)
--              applicants  how many freelancers applied
--              hired       how many were hired (projects started from the post)
--            A post's own numbers are its full record (so "filled" always agrees
--            with "hired"), nobody is left out of them.
--   totals   { open, filled, expired, applications, hired } for the Overview.
--            These follow the other Overview numbers: an archived account is
--            left out (a post of an archived client, an application or a hire
--            with an archived person on it is not counted).
-- ---------------------------------------------------------------------------
create or replace function public.admin_job_hiring()
returns json
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  result json;
begin
  if not public.is_admin() then
    raise exception 'Only admins can view stats.';
  end if;

  with per_post as (
    select j.id, j.client_id, j.created_at,
           public.job_state(j.id) as state,
           (select count(*) from public.job_applications a where a.job_post_id = j.id) as applicants,
           (select count(*) from public.projects p where p.job_post_id = j.id) as hired
    from public.job_posts j
  ),
  live_posts as (
    select * from per_post pp
    where not exists (select 1 from public.archived_users a where a.user_id = pp.client_id)
  )
  select json_build_object(
           'posts', coalesce((select json_agg(json_build_object('id', pp.id, 'state', pp.state,
                                                                'applicants', pp.applicants, 'hired', pp.hired)
                                              order by pp.created_at desc)
                              from per_post pp), '[]'::json),
           'totals', json_build_object(
             'open',    (select count(*) from live_posts where state = 'open'),
             'filled',  (select count(*) from live_posts where state = 'filled'),
             'expired', (select count(*) from live_posts where state = 'expired'),
             'applications', (select count(*)
                              from public.job_applications a
                              join public.job_posts j on j.id = a.job_post_id
                              where not exists (select 1 from public.archived_users x
                                                where x.user_id in (a.freelancer_id, j.client_id))),
             'hired', (select count(*)
                       from public.projects p
                       where p.job_post_id is not null
                         and not exists (select 1 from public.archived_users x
                                         where x.user_id in (p.client_id, p.freelancer_id)))
           )
         )
  into result;

  return result;
end;
$$;

revoke execute on function public.admin_job_hiring() from public, anon;
grant execute on function public.admin_job_hiring() to authenticated;

-- ---------------------------------------------------------------------------
-- admin_job_trail(target_job): who applied to one post and what became of it.
-- A list, the hired ones first (earliest hire first), then the others by the
-- day they applied. Each entry:
--   { application_id, freelancer_id, full_name, username, avatar_path,
--     archived, applied_at, project_id, project_status, hired_at, due_date }
-- project_id, project_status, hired_at and due_date are null for an applicant
-- who was not hired. project_status is started, submitted or done.
-- ---------------------------------------------------------------------------
create or replace function public.admin_job_trail(target_job uuid)
returns json
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Only admins can view stats.';
  end if;

  return coalesce((
    select json_agg(json_build_object(
             'application_id', a.id,
             'freelancer_id', a.freelancer_id,
             'full_name', f.full_name,
             'username', f.username,
             'avatar_path', f.avatar_path,
             'archived', exists (select 1 from public.archived_users x where x.user_id = a.freelancer_id),
             'applied_at', a.created_at,
             'project_id', p.id,
             'project_status', p.status,
             'hired_at', p.started_at,
             'due_date', p.due_date
           ) order by (p.id is null), coalesce(p.started_at, a.created_at))
    from public.job_applications a
    join public.profiles f on f.id = a.freelancer_id
    left join public.projects p on p.application_id = a.id
    where a.job_post_id = target_job
  ), '[]'::json);
end;
$$;

revoke execute on function public.admin_job_trail(uuid) from public, anon;
grant execute on function public.admin_job_trail(uuid) to authenticated;
