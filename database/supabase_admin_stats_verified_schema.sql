-- Admin Overview: how many users are verified, so the Overview can show
-- "Verified users" and "Not verified users" and link to those groups.
-- Plan: PLAN-overview-users.md. Run this in the Supabase SQL Editor.
--
-- Replaces admin_stats() (still admin-only, same permissions) with one extra
-- number, verified_users: people with an approved identity verification, the same
-- rule as the Verified badge (is_verified).
create or replace function public.admin_stats()
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

  return json_build_object(
    'total_users',    (select count(*) from public.profiles),
    'online_users',   (select count(*) from public.user_presence where last_seen_at > now() - interval '2 minutes'),
    'verified_users', (select count(distinct user_id) from public.identity_verifications where status = 'approved'),
    'freelancers',    (select count(*) from public.profiles where account_type = 'freelancer'),
    'clients',        (select count(*) from public.profiles where account_type = 'client'),
    'new_this_week',  (select count(*) from public.profiles where created_at >= now() - interval '7 days'),
    'services',       (select count(*) from public.services),
    'job_posts',      (select count(*) from public.job_posts),
    'admins',         (select count(*) from public.admins),
    'open_reports',   (select count(*) from public.reports where status = 'pending')
  );
end;
$$;
