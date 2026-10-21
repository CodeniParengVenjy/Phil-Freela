-- Admin Archives, the part that needs the SQL Editor (PLAN-admin-archives.md).
-- The Supabase connector refuses SQL that contains a DELETE statement without
-- someone to confirm, so supabase_archives_schema.sql was applied in steps
-- (2026-10-21): everything without a DELETE statement went through the
-- connector, and THIS file holds the rest. Paste the whole file into the
-- Supabase SQL Editor and run it once. It is safe to run on top of the first
-- part.
--
-- What is in here:
--   a. restore_user(), the new delete_user() (only works on an archived account),
--      the daily delete_expired_archives() job, and the Activity Log lines for
--      archiving and restoring.
--   b. The admin_requests and admin_log lists of kinds get 'archive',
--      'user_archive' and 'user_restore'. (Section b already went through the
--      connector, so running it again changes nothing.)

-- ===========================================================================
-- a. Restore, delete for good, the daily job, the log lines
-- ===========================================================================

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

revoke execute on function public.restore_user(uuid) from public, anon;
grant execute on function public.restore_user(uuid) to authenticated;

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

-- Archived accounts are deleted after 100 days. Same idea as the daily job for
-- bans (delete_expired_bans): deleting the login (auth.users) deletes
-- everything linked to it ("on delete cascade"). Restoring an account before
-- then stops the clock, and archiving it again starts a new one. The 100 is
-- also ARCHIVE_DELETE_DAYS in client/src/lib/archives.js.
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

-- ===========================================================================
-- b. The lists of kinds
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
