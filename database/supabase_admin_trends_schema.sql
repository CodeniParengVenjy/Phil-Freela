-- Admin Overview graphs: how much new activity there was on each day.
-- Plan: PLAN-overview-graphs.md. Run this in the Supabase SQL Editor.
--
-- admin_trends(p_days) returns one entry per day (oldest first, today last), and
-- every day is there even when nothing happened (all zeros), so the graphs have
-- no gaps. Each entry has:
--   day            the date, as 'YYYY-MM-DD'
--   freelancers    new freelancer accounts that day
--   clients        new client accounts that day
--   services       new services posted
--   job_posts      new job posts
--   reports        new reports
--   verifications  new identity verification requests (any status)
--
-- Like admin_stats() it is admin-only: anyone else gets an error. Days are
-- counted in Philippine time, so "today" is the day an admin sees on a clock.
-- Archived accounts are left out of the user and verification numbers, the same
-- as admin_stats(). p_days is kept between 1 and 365 (the page asks for 7, 30
-- or 90).
create or replace function public.admin_trends(p_days integer default 30)
returns json
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  n         integer := least(greatest(coalesce(p_days, 30), 1), 365);
  first_day date    := (now() at time zone 'Asia/Manila')::date - (n - 1);
  -- The moment the first day starts (midnight in Manila), to cut the tables down.
  start_ts  timestamptz := first_day::timestamp at time zone 'Asia/Manila';
  result    json;
begin
  if not public.is_admin() then
    raise exception 'Only admins can view stats.';
  end if;

  with days as (
    select first_day + i as day from generate_series(0, n - 1) as i
  ),
  new_users as (
    select (p.created_at at time zone 'Asia/Manila')::date as day,
           count(*) filter (where p.account_type = 'freelancer') as freelancers,
           count(*) filter (where p.account_type = 'client') as clients
    from public.profiles p
    where p.created_at >= start_ts
      and not exists (select 1 from public.archived_users a where a.user_id = p.id)
    group by 1
  ),
  new_services as (
    select (created_at at time zone 'Asia/Manila')::date as day, count(*) as total
    from public.services where created_at >= start_ts group by 1
  ),
  new_jobs as (
    select (created_at at time zone 'Asia/Manila')::date as day, count(*) as total
    from public.job_posts where created_at >= start_ts group by 1
  ),
  new_reports as (
    select (created_at at time zone 'Asia/Manila')::date as day, count(*) as total
    from public.reports where created_at >= start_ts group by 1
  ),
  new_verifications as (
    select (iv.created_at at time zone 'Asia/Manila')::date as day, count(*) as total
    from public.identity_verifications iv
    where iv.created_at >= start_ts
      and not exists (select 1 from public.archived_users a where a.user_id = iv.user_id)
    group by 1
  )
  select coalesce(json_agg(json_build_object(
           'day',           d.day,
           'freelancers',   coalesce(u.freelancers, 0),
           'clients',       coalesce(u.clients, 0),
           'services',      coalesce(s.total, 0),
           'job_posts',     coalesce(j.total, 0),
           'reports',       coalesce(r.total, 0),
           'verifications', coalesce(v.total, 0)
         ) order by d.day), '[]'::json)
  into result
  from days d
  left join new_users u on u.day = d.day
  left join new_services s on s.day = d.day
  left join new_jobs j on j.day = d.day
  left join new_reports r on r.day = d.day
  left join new_verifications v on v.day = d.day;

  return result;
end;
$$;

revoke execute on function public.admin_trends(integer) from public, anon;
grant execute on function public.admin_trends(integer) to authenticated;
