-- Admin "Forgot password": a yes/no answer to "is this email an admin's?".
-- Plan: PLAN-admin-accounts.md, part 4. Run this in the Supabase SQL Editor.
--
-- Used by the normal sign-in page: when someone types a wrong password for an
-- admin's email there, the site sends them to the admin sign-in (where Forgot
-- password lives) instead of just saying "Incorrect email or password". It works
-- like was_deleted_after_ban(): signed-out visitors can ask it, and it only
-- ever answers true or false, never anything else about the account.
create or replace function public.is_admin_email(email text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from auth.users u
    join public.admins a on a.id = u.id
    where lower(u.email) = lower(btrim(coalesce(is_admin_email.email, '')))
  );
$$;

grant execute on function public.is_admin_email(text) to anon, authenticated;
