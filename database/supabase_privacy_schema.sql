-- Data Privacy Compliance (PLAN-privacy-compliance.md): feature 6 in
-- PhilFreela-System-Functions.md, the "User rights: review, update, or
-- request removal" principle's removal half. Run this in the Supabase SQL
-- Editor after supabase_admin_schema.sql (reuses is_admin()).
--
-- Viewing and downloading your own data needs no new function: every table
-- a user's data lives in already lets them select their own rows (the same
-- rules that power their own dashboard pages), so the website just asks for
-- all of it at once. Only deleting needs a new function, since a plain user
-- login has no permission to delete from auth.users directly.

-- A signed-in user deletes their own account (and, through it, everything
-- that references it: profile, services, job posts, portfolio, messages,
-- and so on, via the "on delete cascade" rules already on those tables).
-- Same mechanism as public.delete_user() (admin-only) and the ban clean-up
-- job: a function that runs with extra privilege is allowed to delete from
-- auth.users, even though a normal login isn't.
create or replace function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
begin
  if me is null then
    raise exception 'Please log in first.';
  end if;

  if exists (select 1 from public.admins where id = me) then
    raise exception 'Admin accounts are removed from the Admins page, not here.';
  end if;

  delete from auth.users where id = me;
end;
$$;

revoke execute on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;
