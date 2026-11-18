-- Admin Overview counts PEOPLE, not logins (PLAN-separate-accounts.md, Step 8).
-- Run after supabase_account_splits_schema.sql (replaces admin_stats()).
--
-- A separated pair (account_splits, done) is one person with a Freelancer and
-- a Client account. The user (2026-11-18): the 4 accounts made by separating
-- are not new users, so:
--   total_users     people: the new half of a pair is not counted again
--                   (unless its old account is archived)
--   total_accounts  every account (the old "All Users" number)
--   verified_users  people with an approved ID check
--   new_this_week   people who joined in 7 days (a separated half isn't new)
--   freelancers / clients stay per account: a person with both counts in each.
-- Everything else is unchanged.
-- Rolled-back trial (2026-11-18): total_users 43, total_accounts 47, verified 4,
-- freelancers 25, clients 22, new_this_week 0. Applied as migration admin_stats_people.

-- The person an account belongs to: the old account of a separated pair (while
-- it isn't archived), otherwise the account itself.
create or replace function public.account_person(p_user uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select s.from_user from public.account_splits s
      where s.to_user = p_user and s.done_at is not null
        and not exists (select 1 from public.archived_users a where a.user_id = s.from_user)
      order by s.done_at desc limit 1),
    p_user);
$$;

revoke execute on function public.account_person(uuid) from public, anon, authenticated;

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
    'total_users',    (select count(distinct public.account_person(p.id)) from public.profiles p
                       where not exists (select 1 from public.archived_users a where a.user_id = p.id)),
    'total_accounts', (select count(*) from public.profiles p
                       where not exists (select 1 from public.archived_users a where a.user_id = p.id)),
    'online_users',   (select count(*) from public.user_presence up
                       where up.last_seen_at > now() - interval '2 minutes'
                         and not exists (select 1 from public.archived_users a where a.user_id = up.user_id)),
    'verified_users', (select count(distinct public.account_person(iv.user_id)) from public.identity_verifications iv
                       where iv.status = 'approved'
                         and not exists (select 1 from public.archived_users a where a.user_id = iv.user_id)),
    'freelancers',    (select count(*) from public.profiles p
                       where p.account_type = 'freelancer'
                         and not exists (select 1 from public.archived_users a where a.user_id = p.id)),
    'clients',        (select count(*) from public.profiles p
                       where p.account_type = 'client'
                         and not exists (select 1 from public.archived_users a where a.user_id = p.id)),
    'new_this_week',  (select count(*) from public.profiles p
                       where p.created_at >= now() - interval '7 days'
                         and not exists (select 1 from public.archived_users a where a.user_id = p.id)
                         and not exists (select 1 from public.account_splits s
                                          where s.to_user = p.id and s.done_at is not null)),
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
