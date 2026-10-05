-- Admin default password + Activity Log. Plan: PLAN-admin-log.md.
-- Run this in the Supabase SQL Editor after supabase_super_admin_schema.sql.

-- ===========================================================================
-- A. New admins must choose their own password
-- ===========================================================================

-- On while an admin still has the default password. The super admin's Add
-- Admin form turns it on; changing the password turns it off (the trigger
-- below). There is no update policy on admins, so nobody can switch it off
-- from the browser.
alter table public.admins
  add column must_change_password boolean not null default false;

-- While the flag is on the admin has no admin rights at all, so skipping the
-- "Create your password" screen gains them nothing. The admins table's own
-- "read own row" rule still lets them load their row, so the screen can show.
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.admins where id = auth.uid() and not must_change_password);
$$;

create or replace function public.is_super_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.admins
    where id = auth.uid() and role = 'super_admin' and not must_change_password
  );
$$;

-- A super admin may only add an admin who still has to choose a password.
drop policy "super admins can add admins" on public.admins;
create policy "super admins can add admins"
  on public.admins for insert
  with check (public.is_super_admin() and role = 'admin' and must_change_password);

-- The flag goes off only when the password really changes, and only if the
-- new password is not the default again. Runs on the login account, so it
-- cannot be skipped by calling something from the browser.
create or replace function public.clear_must_change_password()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if new.encrypted_password is distinct from old.encrypted_password
     and new.encrypted_password <> crypt('Admin123', new.encrypted_password) then
    update public.admins set must_change_password = false where id = new.id and must_change_password;
  end if;
  return new;
end;
$$;

create trigger admin_password_changed
  after update of encrypted_password on auth.users
  for each row execute function public.clear_must_change_password();

-- ===========================================================================
-- B. The Activity Log
-- ===========================================================================

create table public.admin_log (
  id uuid primary key default gen_random_uuid(),
  -- Set to null if the admin is removed later; admin_name keeps who it was.
  admin_id uuid references public.admins (id) on delete set null,
  admin_name text not null,
  action text not null check (action in (
    'suspend', 'ban', 'lift', 'report', 'verification', 'appeal',
    'announcement', 'flagged', 'listing', 'admin', 'user_delete'
  )),
  -- The whole sentence, saved as text when it happened, so it still reads
  -- correctly after anyone is renamed, removed or deleted.
  message text not null,
  target_id uuid,
  created_at timestamptz not null default now()
);

create index admin_log_created_at_idx on public.admin_log (created_at desc);
create index admin_log_admin_id_idx on public.admin_log (admin_id);

alter table public.admin_log enable row level security;

-- Admins can read the log. There is deliberately no insert, update or delete
-- policy: rows are written only by the database functions below.
create policy "admins can read the log"
  on public.admin_log for select
  using (public.is_admin());

revoke insert, update, delete on public.admin_log from anon, authenticated;

-- Writes one line, as the signed-in admin. Does nothing when the signed-in
-- person is not an admin (a user's own actions, or the daily job), so only
-- admin actions are ever logged. Only the triggers below can call it.
create or replace function public.write_admin_log(p_action text, p_what text, p_target uuid default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  who public.admins%rowtype;
begin
  select * into who from public.admins where id = auth.uid();
  if not found then
    return;
  end if;

  insert into public.admin_log (admin_id, admin_name, action, message, target_id)
  values (who.id, who.full_name, p_action, who.full_name || ' ' || p_what, p_target);
end;
$$;

revoke execute on function public.write_admin_log(text, text, uuid) from public, anon, authenticated;

-- A user's name for a sentence, even if the account is already gone.
create or replace function public.log_name(uid uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select full_name from public.profiles where id = uid), 'a deleted user');
$$;

revoke execute on function public.log_name(uuid) from public, anon, authenticated;

-- What a report points at, as words.
create or replace function public.log_report_target(t text, tid uuid)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  title text;
  owner uuid;
begin
  if t = 'user' then
    return public.log_name(tid);
  elsif t = 'service' then
    select s.title, s.freelancer_id into title, owner from public.services s where s.id = tid;
    if title is null then return 'a deleted service'; end if;
    return 'the service "' || title || '" by ' || public.log_name(owner);
  else
    select j.title, j.client_id into title, owner from public.job_posts j where j.id = tid;
    if title is null then return 'a deleted job post'; end if;
    return 'the job post "' || title || '" by ' || public.log_name(owner);
  end if;
end;
$$;

revoke execute on function public.log_report_target(text, uuid) from public, anon, authenticated;

-- ---- Suspend, ban, lift -------------------------------------------------

create or replace function public.log_suspension_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  label text;
  days int;
begin
  if tg_op = 'DELETE' then
    -- Skip when the whole account is being deleted (the row goes with it).
    if exists (select 1 from public.profiles where id = old.user_id) then
      if old.ends_at is null then
        perform public.write_admin_log('lift', 'lifted the ban on ' || public.log_name(old.user_id) || '.', old.user_id);
      else
        perform public.write_admin_log('lift', 'ended ' || public.log_name(old.user_id) || '''s suspension.', old.user_id);
      end if;
    end if;
    return old;
  end if;

  label := case new.violation
    when 'spam' then 'Spam'
    when 'scam' then 'Scam / Fraud'
    when 'inappropriate' then 'Inappropriate content'
    when 'harassment' then 'Harassment'
    when 'fake_profile' then 'Fake profile'
    else 'Other'
  end;

  if new.ends_at is null then
    perform public.write_admin_log('ban', 'banned ' || public.log_name(new.user_id) || ' permanently (' || label || ').', new.user_id);
  else
    days := greatest(1, round(extract(epoch from (new.ends_at - new.created_at)) / 86400));
    perform public.write_admin_log(
      'suspend',
      'suspended ' || public.log_name(new.user_id) || ' for ' || days || case when days = 1 then ' day' else ' days' end || ' (' || label || ').',
      new.user_id
    );
  end if;
  return new;
end;
$$;

create trigger user_suspensions_log
  after insert or update or delete on public.user_suspensions
  for each row execute function public.log_suspension_change();

-- ---- Reports, ID verifications, appeals ---------------------------------

create or replace function public.log_report_review()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.status = 'pending' and new.status in ('resolved', 'dismissed') then
    perform public.write_admin_log(
      'report',
      new.status || ' a report about ' || public.log_report_target(new.target_type, new.target_id) || '.',
      new.target_id
    );
  end if;
  return new;
end;
$$;

create trigger reports_log
  after update on public.reports
  for each row execute function public.log_report_review();

create or replace function public.log_verification_review()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.status = 'pending' and new.status in ('approved', 'rejected') then
    perform public.write_admin_log('verification', new.status || ' ' || public.log_name(new.user_id) || '''s ID verification.', new.user_id);
  end if;
  return new;
end;
$$;

create trigger identity_verifications_log
  after update on public.identity_verifications
  for each row execute function public.log_verification_review();

create or replace function public.log_appeal_review()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.status = 'pending' and new.status in ('accepted', 'rejected') then
    perform public.write_admin_log('appeal', new.status || ' ' || public.log_name(new.user_id) || '''s appeal.', new.user_id);
  end if;
  return new;
end;
$$;

create trigger appeals_log
  after update on public.appeals
  for each row execute function public.log_appeal_review();

-- ---- Announcements ------------------------------------------------------

create or replace function public.log_announcement_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    perform public.write_admin_log(
      'announcement',
      'posted the announcement "' || new.title || '" to ' ||
        case new.audience when 'freelancer' then 'freelancers' when 'client' then 'clients' else 'everyone' end || '.',
      new.id
    );
    return new;
  end if;

  perform public.write_admin_log('announcement', 'deleted the announcement "' || old.title || '".', old.id);
  return old;
end;
$$;

create trigger announcements_log
  after insert or delete on public.announcements
  for each row execute function public.log_announcement_change();

-- ---- Flagged content (copy check) ---------------------------------------

create or replace function public.log_flagged_slide()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  what text := case when coalesce(old.media_type, 'image') = 'video' then 'video' else 'photo' end;
begin
  if tg_op = 'UPDATE' then
    if old.status = 'flagged' and new.status = 'active' then
      perform public.write_admin_log('flagged', 'approved a flagged ' || what || ' by ' || public.log_name(old.freelancer_id) || '.', old.id);
    end if;
    return new;
  end if;

  -- Skip when it is deleted along with its service or its owner's account.
  if old.status = 'flagged'
     and exists (select 1 from public.profiles where id = old.freelancer_id)
     and (old.service_id is null or exists (select 1 from public.services where id = old.service_id)) then
    perform public.write_admin_log('flagged', 'removed a flagged ' || what || ' by ' || public.log_name(old.freelancer_id) || '.', old.id);
  end if;
  return old;
end;
$$;

create trigger media_slides_log
  after update or delete on public.media_slides
  for each row execute function public.log_flagged_slide();

create or replace function public.log_flagged_document()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' then
    if old.status = 'flagged' and new.status = 'active' then
      perform public.write_admin_log('flagged', 'approved a flagged document by ' || public.log_name(old.freelancer_id) || '.', old.id);
    end if;
    return new;
  end if;

  if old.status = 'flagged' and exists (select 1 from public.profiles where id = old.freelancer_id) then
    perform public.write_admin_log('flagged', 'removed a flagged document by ' || public.log_name(old.freelancer_id) || '.', old.id);
  end if;
  return old;
end;
$$;

create trigger portfolio_items_log
  after update or delete on public.portfolio_items
  for each row execute function public.log_flagged_document();

-- ---- Listings an admin deletes ------------------------------------------

create or replace function public.log_service_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Skip when it goes along with the owner's whole account.
  if exists (select 1 from public.profiles where id = old.freelancer_id) then
    perform public.write_admin_log('listing', 'deleted the service "' || old.title || '" by ' || public.log_name(old.freelancer_id) || '.', old.id);
  end if;
  return old;
end;
$$;

create trigger services_log
  after delete on public.services
  for each row execute function public.log_service_delete();

create or replace function public.log_job_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (select 1 from public.profiles where id = old.client_id) then
    perform public.write_admin_log('listing', 'deleted the job post "' || old.title || '" by ' || public.log_name(old.client_id) || '.', old.id);
  end if;
  return old;
end;
$$;

create trigger job_posts_log
  after delete on public.job_posts
  for each row execute function public.log_job_delete();

-- ---- Admins added, removed, promoted, demoted ---------------------------

create or replace function public.log_admin_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    -- The very first admin creates themselves on the setup page: not logged.
    if new.id <> auth.uid() then
      perform public.write_admin_log('admin', 'added ' || new.full_name || ' as an admin.', new.id);
    end if;
    return new;
  elsif tg_op = 'DELETE' then
    perform public.write_admin_log('admin', 'removed ' || old.full_name || ' as an admin.', old.id);
    return old;
  end if;

  if new.role is distinct from old.role then
    perform public.write_admin_log(
      'admin',
      case when new.role = 'super_admin' then 'promoted ' || new.full_name || ' to super admin.' else 'demoted ' || new.full_name || ' to a regular admin.' end,
      new.id
    );
  end if;
  return new;
end;
$$;

create trigger admins_log
  after insert or update or delete on public.admins
  for each row execute function public.log_admin_change();

-- ---- A user's account deleted (delete_user) -----------------------------

create or replace function public.log_user_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.write_admin_log('user_delete', 'permanently deleted ' || old.full_name || '''s account.', old.id);
  return old;
end;
$$;

create trigger profiles_log
  after delete on public.profiles
  for each row execute function public.log_user_delete();
