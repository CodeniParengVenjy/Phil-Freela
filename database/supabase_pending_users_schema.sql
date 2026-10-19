-- Admin panel: people who signed up with an email but never confirmed it, so
-- the Overview can count them and a "Pending Users" page can list them and
-- resend their confirmation email. Plan: PLAN-pending-users.md. Run this in the
-- Supabase SQL Editor.
--
-- Someone who never confirms never gets a profile (it is made on their first
-- sign-in), so neither the Users page nor the old Overview numbers can see
-- them. Their details sit in Supabase's private auth.users table, which the
-- browser can't read, so these two functions read it for admins only. No new
-- tables.
--
-- "Pending" = the login's email is not confirmed, it has no profile, and it is
-- not an admin (a new admin also waits for a confirmation email, and has its own
-- sign-in page for it).

-- The list for the Pending Users page. The name, username and role are the
-- details typed on the sign-up form, which Supabase keeps with the login
-- (raw_user_meta_data); the role falls back to client, like resolvePostAuthRoute
-- does. confirmation_sent_at is when Supabase last sent the confirmation email:
-- it changes on every resend, so the page can show "last email sent" and start
-- its wait from it.
create or replace function public.admin_pending_users()
returns table (
  id uuid,
  full_name text,
  username text,
  account_type text,
  email text,
  created_at timestamptz,
  confirmation_sent_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Only admins can view pending users.';
  end if;

  return query
    select u.id,
           coalesce(u.raw_user_meta_data->>'full_name', '')::text,
           coalesce(u.raw_user_meta_data->>'username', '')::text,
           (case when u.raw_user_meta_data->>'account_type' = 'freelancer' then 'freelancer' else 'client' end)::text,
           u.email::text,
           u.created_at,
           u.confirmation_sent_at
    from auth.users u
    where u.email_confirmed_at is null
      and u.email is not null
      and not exists (select 1 from public.profiles p where p.id = u.id)
      and not exists (select 1 from public.admins a where a.id = u.id)
    order by u.created_at desc
    limit 500;
end;
$$;

revoke execute on function public.admin_pending_users() from public, anon;
grant execute on function public.admin_pending_users() to authenticated;

-- Replaces admin_stats() (still admin-only, same permissions) with one extra
-- number, pending_users: the same rule as admin_pending_users() above, but
-- counted without the 500 limit.
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
    'open_reports',   (select count(*) from public.reports where status = 'pending'),
    'pending_users',  (select count(*)
                       from auth.users u
                       where u.email_confirmed_at is null
                         and u.email is not null
                         and not exists (select 1 from public.profiles p where p.id = u.id)
                         and not exists (select 1 from public.admins a where a.id = u.id))
  );
end;
$$;
