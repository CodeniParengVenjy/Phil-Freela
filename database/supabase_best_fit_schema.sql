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
