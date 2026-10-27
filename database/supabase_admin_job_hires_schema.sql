-- Admin: the list of everyone hired from a job post. Plan: PLAN-job-hiring.md (Step 6).
-- Run this in the Supabase SQL Editor. It adds one function and nothing else:
-- no table, and nothing existing is changed.
--
-- admin_job_hiring() already gives the NUMBERS (how many hires), and
-- admin_job_trail() gives the applicants of ONE post. This one is the list for the
-- admin Overview: who was hired, for which post, and how the project stands.
-- Like those two it is admin-only, because the admin can't read projects directly
-- (only the two people on a project can). A resume or cover note is never returned.

-- ---------------------------------------------------------------------------
-- admin_job_hires(): every hire made from a job post, newest first (the newest
-- 200 at most). Each entry:
--   { project_id, job_post_id, job_title, job_state, hired, needed,
--     freelancer_id, full_name, username, avatar_path,
--     client_name, project_status, hired_at, due_date }
--   job_state   'open', 'filled' or 'expired' (job_state(), the same answer the
--               freelancers' lists use), so a hidden (filled) post is still found
--   hired       how many freelancers were hired from that post so far
--   needed      how many the post asked for ("2 of 3 hired")
--   project_status  started, submitted or done
-- Like the totals of admin_job_hiring(), an archived account is left out (a hire
-- with an archived freelancer or client on it is not listed), so the list agrees
-- with the "Freelancers hired" number on the Overview. A project that came from a
-- booking (an offer), not a job post, is not a hire here.
-- ---------------------------------------------------------------------------
create or replace function public.admin_job_hires()
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
    select json_agg(h.item order by h.hired_at desc, h.project_id)
    from (
      select p.id as project_id,
             p.started_at as hired_at,
             json_build_object(
               'project_id', p.id,
               'job_post_id', j.id,
               'job_title', j.title,
               'job_state', public.job_state(j.id),
               'hired', (select count(*) from public.projects x where x.job_post_id = j.id),
               'needed', j.freelancers_needed,
               'freelancer_id', f.id,
               'full_name', f.full_name,
               'username', f.username,
               'avatar_path', f.avatar_path,
               'client_name', c.full_name,
               'project_status', p.status,
               'hired_at', p.started_at,
               'due_date', p.due_date
             ) as item
      from public.projects p
      join public.job_posts j on j.id = p.job_post_id
      join public.profiles f on f.id = p.freelancer_id
      join public.profiles c on c.id = p.client_id
      where not exists (select 1 from public.archived_users a where a.user_id in (p.client_id, p.freelancer_id))
      order by p.started_at desc, p.id
      limit 200
    ) h
  ), '[]'::json);
end;
$$;

revoke execute on function public.admin_job_hires() from public, anon;
grant execute on function public.admin_job_hires() to authenticated;
