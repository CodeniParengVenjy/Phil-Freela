-- Admin Overview: what PhilFreela has earned from fees (earning plan, step 3, see
-- PLAN-monetization.md). Run this in the Supabase SQL Editor after
-- supabase_promotions_schema.sql. It adds one function and nothing else: no
-- table, and nothing existing is changed.
--
-- Like admin_stats() it does the reading and turns away anyone who is not an
-- admin. Money earned is earned, so (unlike the user counts on the Overview) an
-- archived account is NOT left out here.
--
-- admin_promo_earnings() returns:
--   total        pesos from every approved request plus every amount recorded on a
--                sponsored billboard
--   this_month   the same, for the current month in Manila time (a request counts
--                from the day it was approved, a billboard from the day it was posted)
--   waiting      { count, amount }: requests nobody has answered yet
--   by_kind      { feature_service, feature_job, pro, billboard }, each
--                { count, amount }: what the total is made of
--   running      { featured_offers, featured_jobs, pro_members }: how many are
--                Featured or Pro right now
create or replace function public.admin_promo_earnings()
returns json
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  month_start timestamptz := date_trunc('month', now() at time zone 'Asia/Manila') at time zone 'Asia/Manila';
begin
  if not public.is_admin() then
    raise exception 'Only admins can view stats.';
  end if;

  return (
    select json_build_object(
      'total',      coalesce(sum(f.amount), 0),
      'this_month', coalesce(sum(f.amount) filter (where f.at >= month_start), 0),
      'waiting', (
        select json_build_object('count', count(*), 'amount', coalesce(sum(p.amount), 0))
          from public.promotions p where p.status = 'pending'
      ),
      'by_kind', json_build_object(
        'feature_service', json_build_object('count', count(*) filter (where f.kind = 'feature_service'), 'amount', coalesce(sum(f.amount) filter (where f.kind = 'feature_service'), 0)),
        'feature_job',     json_build_object('count', count(*) filter (where f.kind = 'feature_job'),     'amount', coalesce(sum(f.amount) filter (where f.kind = 'feature_job'), 0)),
        'pro',             json_build_object('count', count(*) filter (where f.kind = 'pro'),             'amount', coalesce(sum(f.amount) filter (where f.kind = 'pro'), 0)),
        'billboard',       json_build_object('count', count(*) filter (where f.kind = 'billboard'),       'amount', coalesce(sum(f.amount) filter (where f.kind = 'billboard'), 0))
      ),
      'running', json_build_object(
        'featured_offers', (select count(*) from public.featured_posts x where x.service_id is not null and x.featured_until > now()),
        'featured_jobs',   (select count(*) from public.featured_posts x where x.job_id is not null and x.featured_until > now()),
        'pro_members',     (select count(*) from public.pro_members m where m.pro_until > now())
      )
    )
    from (
      select p.kind, p.amount, p.decided_at as at
        from public.promotions p
       where p.status = 'approved'
      union all
      select 'billboard', b.amount, b.created_at
        from public.dashboard_billboards b
       where b.amount is not null
    ) f
  );
end;
$$;

revoke execute on function public.admin_promo_earnings() from public, anon;
grant execute on function public.admin_promo_earnings() to authenticated;
