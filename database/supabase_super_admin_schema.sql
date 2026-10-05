-- Super admin role, extends database/supabase_admin_schema.sql. Plan: PLAN-super-admin.md.
-- Run this in the Supabase SQL Editor after the admin schema.
--
-- Every admin keeps the day-to-day moderation powers. Only a super admin can
-- add, remove, promote or demote admins, and permanently delete a user.

-- 1. Each admin now has a role.
alter table public.admins
  add column role text not null default 'admin'
  check (role in ('admin', 'super_admin'));

-- 2. The oldest admin (the one made on the setup page) becomes the super
--    admin, so nobody is locked out. Skipped if a super admin already exists.
update public.admins
set role = 'super_admin'
where id = (select id from public.admins order by created_at asc limit 1)
  and not exists (select 1 from public.admins where role = 'super_admin');

-- 3. Same idea as is_admin(): "security definer" lets it see the whole table
--    even though RLS only shows each admin their own row.
create or replace function public.is_super_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.admins where id = auth.uid() and role = 'super_admin');
$$;

revoke execute on function public.is_super_admin() from public, anon;
grant execute on function public.is_super_admin() to authenticated;

-- 4. Who may insert into admins.
--    - The very first account (table empty) must be a super admin.
--    - After that only a super admin adds admins, and always as plain 'admin'.
--      A super admin is made by promoting, never by inserting.
drop policy "bootstrap first admin only" on public.admins;
drop policy "admins can add admins" on public.admins;

create policy "bootstrap first admin only"
  on public.admins for insert
  with check (auth.uid() = id and public.admin_count() = 0 and role = 'super_admin');

create policy "super admins can add admins"
  on public.admins for insert
  with check (public.is_super_admin() and role = 'admin');

-- There is deliberately no update policy on admins: the only way to change a
-- role is set_admin_role() below.

-- 5. Removing an admin is now super-admin only. Because you cannot remove
--    yourself, a super admin who calls this is never the target, so at least
--    one super admin always remains.
create or replace function public.remove_admin(target_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_super_admin() then
    raise exception 'Only a super admin can remove admins.';
  end if;

  if target_id = auth.uid() then
    raise exception 'You cannot remove your own admin account.';
  end if;

  if not exists (select 1 from public.admins where id = target_id) then
    raise exception 'That account is not an admin.';
  end if;

  delete from auth.users where id = target_id;
end;
$$;

-- 6. Promote or demote. Changing your own role is blocked, which is also what
--    keeps the last super admin from demoting themselves.
create or replace function public.set_admin_role(target_id uuid, new_role text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_super_admin() then
    raise exception 'Only a super admin can change admin roles.';
  end if;

  if new_role not in ('admin', 'super_admin') then
    raise exception 'Role must be admin or super_admin.';
  end if;

  if target_id = auth.uid() then
    raise exception 'You cannot change your own role.';
  end if;

  update public.admins set role = new_role where id = target_id;

  if not found then
    raise exception 'That account is not an admin.';
  end if;
end;
$$;

revoke execute on function public.set_admin_role(uuid, text) from public, anon;
grant execute on function public.set_admin_role(uuid, text) to authenticated;

-- 7. Permanently deleting a user is now super-admin only. Regular admins can
--    still suspend and ban. Same body as before except for the first check.
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

  delete from auth.users where id = target_id;
end;
$$;
