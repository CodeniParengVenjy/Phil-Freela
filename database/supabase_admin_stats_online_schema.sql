-- Admin Overview: one "Users" card showing all users and who is online now,
-- and no chat cards. Run this in the Supabase SQL Editor after
-- supabase_admin_schema.sql and supabase_presence_schema.sql.
--
-- Replaces admin_stats(): adds "online_users" (seen in the last 2 minutes, the
-- same rule as the Online dot in Chat) and leaves out the conversation and
-- message counts, which the page no longer shows.
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
    'total_users',   (select count(*) from public.profiles),
    'online_users',  (select count(*) from public.user_presence where last_seen_at > now() - interval '2 minutes'),
    'freelancers',   (select count(*) from public.profiles where account_type = 'freelancer'),
    'clients',       (select count(*) from public.profiles where account_type = 'client'),
    'new_this_week', (select count(*) from public.profiles where created_at >= now() - interval '7 days'),
    'services',      (select count(*) from public.services),
    'job_posts',     (select count(*) from public.job_posts),
    'admins',        (select count(*) from public.admins),
    'open_reports',  (select count(*) from public.reports where status = 'pending')
  );
end;
$$;
