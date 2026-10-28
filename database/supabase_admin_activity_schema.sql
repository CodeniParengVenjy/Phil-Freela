-- Admin Overview graphs: bookings, projects, payments, job hiring and earnings over time.
-- Plan: PLAN-overview-sections.md (Step 2). Run this in the Supabase SQL Editor.
-- It adds one function and nothing else: no table, and nothing existing is changed.
--
-- admin_activity_trends(p_days) is the sibling of admin_trends(): the same idea (one
-- entry per day, oldest first and today last, every day there even when nothing
-- happened, days counted in Philippine time, admin-only), for what happens between
-- people. It returns
--   { days:   [ { day, <one number per kind below> }, ... ],   how many NEW that day
--     totals: { <the same kinds> } }                           the totals right now
-- so the page draws running totals the way the Growth graph does: the total at the end
-- of an earlier day is today's total minus everything added after that day. Nothing is
-- stored, and a day with no date saved (it never happens today) is counted in the
-- totals and in no day.
--
-- The kinds. Each total equals a number the Overview already shows (the test checks it):
--   bookings            bookings made                     bookings.created_at
--   bookings_accepted   bookings now accepted             bookings.responded_at
--   projects_started    projects started (from a booking or a job post)   projects.started_at
--   projects_done       projects now done                 projects.completed_at
--   payments            payment records at any step       payments.created_at
--   payments_confirmed  payments now confirmed            payments.answered_at
--   applications        applications to job posts         job_applications.created_at
--   hires               freelancers hired from job posts  projects with a job_post_id, started_at
--   earned              pesos earned from fees            the same rows admin_promo_earnings() adds up
--
-- Anything with an archived person on it is left out, the same rule as the other
-- Overview numbers. p_days is kept between 1 and 365 (the page asks for 7, 30 or 90).
-- If the rows that count as earnings in admin_promo_earnings() ever change, change the
-- "earned" part below in the same way.
create or replace function public.admin_activity_trends(p_days integer default 30)
returns json
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  n         integer := least(greatest(coalesce(p_days, 30), 1), 365);
  first_day date    := (now() at time zone 'Asia/Manila')::date - (n - 1);
  -- The moment the first day starts (midnight in Manila), to cut the rows down.
  start_ts  timestamptz := first_day::timestamp at time zone 'Asia/Manila';
  result    json;
begin
  if not public.is_admin() then
    raise exception 'Only admins can view stats.';
  end if;

  with days as (
    select first_day + i as day from generate_series(0, n - 1) as i
  ),
  -- Everything that happened, one row each: what it was, when, and how much.
  events as (
    select 'bookings' as kind, b.created_at as at, 1::numeric as amount
    from public.bookings b
    where not exists (select 1 from public.archived_users a where a.user_id in (b.client_id, b.freelancer_id))
    union all
    select 'bookings_accepted', b.responded_at, 1
    from public.bookings b
    where b.status = 'accepted'
      and not exists (select 1 from public.archived_users a where a.user_id in (b.client_id, b.freelancer_id))
    union all
    select 'projects_started', p.started_at, 1
    from public.projects p
    where not exists (select 1 from public.archived_users a where a.user_id in (p.client_id, p.freelancer_id))
    union all
    select 'projects_done', p.completed_at, 1
    from public.projects p
    where p.status = 'done'
      and not exists (select 1 from public.archived_users a where a.user_id in (p.client_id, p.freelancer_id))
    union all
    select 'payments', y.created_at, 1
    from public.payments y
    where not exists (select 1 from public.archived_users a where a.user_id in (y.client_id, y.freelancer_id))
    union all
    select 'payments_confirmed', y.answered_at, 1
    from public.payments y
    where y.status = 'confirmed'
      and not exists (select 1 from public.archived_users a where a.user_id in (y.client_id, y.freelancer_id))
    union all
    select 'applications', ap.created_at, 1
    from public.job_applications ap
    join public.job_posts j on j.id = ap.job_post_id
    where not exists (select 1 from public.archived_users a where a.user_id in (ap.freelancer_id, j.client_id))
    union all
    select 'hires', p.started_at, 1
    from public.projects p
    where p.job_post_id is not null
      and not exists (select 1 from public.archived_users a where a.user_id in (p.client_id, p.freelancer_id))
    union all
    -- The fees PhilFreela earned (test-mode and free ones are not money): the same rows
    -- admin_promo_earnings() adds up.
    select 'earned', f.at, f.amount
    from (
      select p.amount, p.decided_at as at
      from public.promotions p
      where p.status = 'approved' and not p.test_mode and p.method <> 'free'
      union all
      select b.amount, b.created_at
      from public.dashboard_billboards b
      where b.amount is not null and not b.awaiting_payment
        and not exists (select 1 from public.billboard_checkouts c where c.billboard_id = b.id and c.status = 'paid' and c.test_mode)
    ) f
  ),
  daily as (
    select (e.at at time zone 'Asia/Manila')::date as day,
           count(*) filter (where e.kind = 'bookings') as bookings,
           count(*) filter (where e.kind = 'bookings_accepted') as bookings_accepted,
           count(*) filter (where e.kind = 'projects_started') as projects_started,
           count(*) filter (where e.kind = 'projects_done') as projects_done,
           count(*) filter (where e.kind = 'payments') as payments,
           count(*) filter (where e.kind = 'payments_confirmed') as payments_confirmed,
           count(*) filter (where e.kind = 'applications') as applications,
           count(*) filter (where e.kind = 'hires') as hires,
           coalesce(sum(e.amount) filter (where e.kind = 'earned'), 0) as earned
    from events e
    where e.at >= start_ts
    group by 1
  )
  select json_build_object(
           'days', coalesce((
             select json_agg(json_build_object(
                      'day',                d.day,
                      'bookings',           coalesce(c.bookings, 0),
                      'bookings_accepted',  coalesce(c.bookings_accepted, 0),
                      'projects_started',   coalesce(c.projects_started, 0),
                      'projects_done',      coalesce(c.projects_done, 0),
                      'payments',           coalesce(c.payments, 0),
                      'payments_confirmed', coalesce(c.payments_confirmed, 0),
                      'applications',       coalesce(c.applications, 0),
                      'hires',              coalesce(c.hires, 0),
                      'earned',             coalesce(c.earned, 0)
                    ) order by d.day)
             from days d
             left join daily c on c.day = d.day
           ), '[]'::json),
           'totals', (
             select json_build_object(
                      'bookings',           count(*) filter (where e.kind = 'bookings'),
                      'bookings_accepted',  count(*) filter (where e.kind = 'bookings_accepted'),
                      'projects_started',   count(*) filter (where e.kind = 'projects_started'),
                      'projects_done',      count(*) filter (where e.kind = 'projects_done'),
                      'payments',           count(*) filter (where e.kind = 'payments'),
                      'payments_confirmed', count(*) filter (where e.kind = 'payments_confirmed'),
                      'applications',       count(*) filter (where e.kind = 'applications'),
                      'hires',              count(*) filter (where e.kind = 'hires'),
                      'earned',             coalesce(sum(e.amount) filter (where e.kind = 'earned'), 0)
                    )
             from events e
           )
         )
  into result;

  return result;
end;
$$;

revoke execute on function public.admin_activity_trends(integer) from public, anon;
grant execute on function public.admin_activity_trends(integer) to authenticated;
