-- Admin Archives (PLAN-admin-archives.md). Run this in the Supabase SQL Editor
-- after supabase_admin_roles_schema.sql and supabase_admin_log_schema.sql.
--
-- "Delete" on the Users page becomes "Archive". An archived account keeps all
-- its data but can't be used: no login, no listings, no posting, no chat. It
-- sits on the Archives page until an admin restores it, or until it is deleted
-- for good (by a super admin, or automatically after 100 days).
--
-- 1. archived_users: one row per archived account.
-- 2. The "is this person blocked" functions also say yes for archived accounts,
--    so every rule that already uses them (listings, posting, chat, search)
--    covers archives with no change to those rules.
-- 3. archive_user / restore_user, and delete_user now only works on an
--    archived account.
-- 4. The Users list and the Overview numbers leave archived accounts out.
-- 5. A daily job deletes accounts archived 100 days ago.
-- 6. Archive requests from regular admins, and the Activity Log lines.
--
-- Run it all in the SQL Editor. (The connector refuses SQL with a DELETE
-- statement in it, so the pieces that have one were also saved on their own in
-- supabase_archives_finish.sql: restore_user, delete_user, the daily job and the
-- log trigger, plus the three "list of kinds" changes. Everything else here
-- went through the connector.)

-- ===========================================================================
-- 1. The list of archived accounts
-- ===========================================================================

create table public.archived_users (
  -- Deleting the account (profile) deletes this row with it.
  user_id uuid primary key references public.profiles (id) on delete cascade,
  archived_by uuid references public.admins (id) on delete set null,
  archived_at timestamptz not null default now()
);

alter table public.archived_users enable row level security;

-- The browser can only read. Rows are added and removed by archive_user() and
-- restore_user() below, which check who is asking.
revoke all on public.archived_users from public, anon, authenticated;
grant select on public.archived_users to authenticated;

create policy "admins can read archives"
  on public.archived_users for select
  to authenticated
  using (public.is_admin());

-- Lets an archived person's own login see why they are shut out.
create policy "users can read own archive row"
  on public.archived_users for select
  to authenticated
  using (user_id = auth.uid());

-- ===========================================================================
-- 2. Archived accounts count as blocked
-- ===========================================================================
-- Same functions as before, with one more "or": the user is archived. They are
-- already used by the rules for services, job posts, applications, portfolio,
-- reviews, reports, chat, calls, bookings and by people search.

create or replace function public.is_suspended(target uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.user_suspensions
    where user_id = target
      and (ends_at is null or ends_at > now())
  ) or exists (select 1 from public.archived_users where user_id = target);
$$;

create or replace function public.is_posting_blocked(target uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.user_suspensions
    where user_id = target
      and blocks_posting
      and (ends_at is null or ends_at > now())
  ) or exists (select 1 from public.archived_users where user_id = target);
$$;

create or replace function public.is_messaging_blocked(target uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.user_suspensions
    where user_id = target
      and blocks_messaging
      and (ends_at is null or ends_at > now())
  ) or exists (select 1 from public.archived_users where user_id = target);
$$;

-- ===========================================================================
-- 3. Archive, restore, and delete for good
-- ===========================================================================

-- Archives an account. Super admins only: a regular admin sends a request
-- (kind 'archive'), and approving it on the Approvals page calls this. Asking
-- for an account that is already archived does nothing, so approving a request
-- twice is harmless.
create or replace function public.archive_user(target_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_super_admin() then
    raise exception 'Only a super admin can archive users.';
  end if;

  if exists (select 1 from public.admins where id = target_id) then
    raise exception 'Admins are removed from the Admins page, not here.';
  end if;

  if not exists (select 1 from public.profiles where id = target_id) then
    raise exception 'That user no longer exists.';
  end if;

  insert into public.archived_users (user_id, archived_by)
  values (target_id, auth.uid())
  on conflict (user_id) do nothing;
end;
$$;

-- Brings an account back. Any admin can, like lifting a ban.
create or replace function public.restore_user(target_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Only admins can restore users.';
  end if;

  delete from public.archived_users where user_id = target_id;

  if not found then
    raise exception 'That account is not archived.';
  end if;
end;
$$;

-- Deleting for good now works only on an archived account, so deleting always
-- takes two steps (archive, then delete). Otherwise the same as before.
create or replace function public.delete_user(target_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_super_admin() then
    raise exception 'Only a super admin can delete users.';
  end if;

  if exists (select 1 from public.admins where id = target_id) then
    raise exception 'Admins are removed from the Admins page, not here.';
  end if;

  if not exists (select 1 from public.profiles where id = target_id) then
    raise exception 'That user no longer exists.';
  end if;

  if not exists (select 1 from public.archived_users where user_id = target_id) then
    raise exception 'Archive the account first.';
  end if;

  delete from auth.users where id = target_id;
end;
$$;

revoke execute on function public.archive_user(uuid) from public, anon;
revoke execute on function public.restore_user(uuid) from public, anon;
grant execute on function public.archive_user(uuid) to authenticated;
grant execute on function public.restore_user(uuid) to authenticated;

-- ===========================================================================
-- 4. The Users list and the Overview leave archived accounts out
-- ===========================================================================

create or replace function public.admin_list_users()
returns table (
  id uuid,
  full_name text,
  username text,
  account_type text,
  created_at timestamptz,
  email text,
  email_confirmed_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Only admins can view users.';
  end if;

  return query
    select p.id, p.full_name::text, p.username::text, p.account_type::text,
           p.created_at, u.email::text, u.email_confirmed_at
    from public.profiles p
    join auth.users u on u.id = p.id
    where not exists (select 1 from public.archived_users a where a.user_id = p.id)
    order by p.created_at desc;
end;
$$;

-- The Archives page: who is archived, by whom, and when. The email lives in
-- auth.users, which the browser can't read, so this is a function (like
-- admin_list_users).
create or replace function public.admin_list_archived()
returns table (
  id uuid,
  full_name text,
  username text,
  account_type text,
  email text,
  user_number integer,
  archived_at timestamptz,
  archived_by_name text
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Only admins can view archives.';
  end if;

  return query
    select p.id, p.full_name::text, p.username::text, p.account_type::text,
           u.email::text, p.user_number, a.archived_at, ad.full_name::text
    from public.archived_users a
    join public.profiles p on p.id = a.user_id
    join auth.users u on u.id = p.id
    left join public.admins ad on ad.id = a.archived_by
    order by a.archived_at desc;
end;
$$;

revoke execute on function public.admin_list_archived() from public, anon;
grant execute on function public.admin_list_archived() to authenticated;

-- Same numbers as before, counting only accounts that aren't archived.
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
    'total_users',    (select count(*) from public.profiles p
                       where not exists (select 1 from public.archived_users a where a.user_id = p.id)),
    'online_users',   (select count(*) from public.user_presence up
                       where up.last_seen_at > now() - interval '2 minutes'
                         and not exists (select 1 from public.archived_users a where a.user_id = up.user_id)),
    'verified_users', (select count(distinct iv.user_id) from public.identity_verifications iv
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
                         and not exists (select 1 from public.archived_users a where a.user_id = p.id)),
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

-- ===========================================================================
-- 5. Archived accounts are deleted after 100 days
-- ===========================================================================
-- Same idea as the daily job for bans (delete_expired_bans): deleting the login
-- (auth.users) deletes everything linked to it ("on delete cascade"). Restoring
-- an account before then stops the clock, and archiving it again starts a new
-- one. The 100 is also ARCHIVE_DELETE_DAYS in client/src/lib/archives.js.

create or replace function public.delete_expired_archives()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  expired record;
  deleted_count integer := 0;
begin
  for expired in
    select user_id from public.archived_users
    where archived_at <= now() - interval '100 days'
  loop
    delete from auth.users where id = expired.user_id;
    deleted_count := deleted_count + 1;
  end loop;
  return deleted_count;
end;
$$;

revoke execute on function public.delete_expired_archives() from public, anon, authenticated;

-- Every day at 16:05 UTC = 12:05 AM Philippine time (five minutes after the ban job).
select cron.schedule('delete-expired-archives', '5 16 * * *', 'select public.delete_expired_archives()');

-- ===========================================================================
-- 6. Requests from regular admins, and the Activity Log
-- ===========================================================================

-- A regular admin's Archive is a request ('archive') for a super admin to approve.
alter table public.admin_requests drop constraint admin_requests_kind_check;
alter table public.admin_requests add constraint admin_requests_kind_check
  check (kind in ('suspend', 'ban', 'archive', 'resolve', 'dismiss', 'remove_listing', 'remove_picture'));

alter table public.admin_requests drop constraint admin_requests_check;
alter table public.admin_requests add constraint admin_requests_check
  check (
    (kind in ('resolve', 'dismiss') and report_id is not null)
    or (kind in ('suspend', 'ban', 'archive') and target_user_id is not null)
    or (kind = 'remove_listing' and report_id is not null and listing_table is not null and listing_id is not null)
    or (kind = 'remove_picture' and report_id is not null and target_user_id is not null)
  );

-- The Activity Log's list of kinds gets two more.
alter table public.admin_log drop constraint admin_log_action_check;
alter table public.admin_log add constraint admin_log_action_check
  check (action in ('suspend', 'ban', 'lift', 'report', 'verification', 'appeal', 'announcement', 'flagged', 'listing', 'admin', 'user_delete', 'user_archive', 'user_restore'));

-- "archive Keanne Reyes": the same words are used when the request is made and
-- when it is decided.
create or replace function public.log_request_phrase(r public.admin_requests)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  rep public.reports%rowtype;
begin
  if r.report_id is not null then
    select * into rep from public.reports where id = r.report_id;
  end if;

  if r.kind in ('suspend', 'ban', 'archive') then
    return r.kind || ' ' || public.log_name(r.target_user_id);
  elsif r.kind in ('remove_listing', 'remove_picture') then
    return 'remove ' || public.log_report_target(rep.target_type, rep.target_id);
  else
    return r.kind || ' a report about ' || public.log_report_target(rep.target_type, rep.target_id);
  end if;
end;
$$;

-- A request to archive is logged under "user_archive", next to the archive itself.
create or replace function public.log_request_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  action text := case
    when new.kind in ('suspend', 'ban') then new.kind
    when new.kind = 'archive' then 'user_archive'
    else 'report'
  end;
  target uuid := coalesce(new.target_user_id, new.listing_id);
begin
  if tg_op = 'INSERT' then
    perform public.write_admin_log(action, 'asked to ' || public.log_request_phrase(new) || ' (waiting for a super admin).', target);
  elsif old.status = 'pending' and new.status in ('approved', 'declined') then
    perform public.write_admin_log(
      action,
      new.status || ' ' || coalesce(nullif(new.requested_by_name, ''), 'an admin') || '''s request to ' || public.log_request_phrase(new) || '.',
      target
    );
  end if;
  return new;
end;
$$;

-- One line when an account is archived, one when it is restored. Like the ban
-- lines, nothing is logged when the whole account is deleted (the row goes with
-- it; the "permanently deleted" line is written by the profile's own trigger).
create or replace function public.log_archive_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    perform public.write_admin_log('user_archive', 'archived ' || public.log_name(new.user_id) || '''s account.', new.user_id);
    return new;
  end if;

  if exists (select 1 from public.profiles where id = old.user_id) then
    perform public.write_admin_log('user_restore', 'restored ' || public.log_name(old.user_id) || '''s account.', old.user_id);
  end if;
  return old;
end;
$$;

create trigger archived_users_log
  after insert or delete on public.archived_users
  for each row execute function public.log_archive_change();

revoke execute on function public.log_archive_change() from public, anon, authenticated;
