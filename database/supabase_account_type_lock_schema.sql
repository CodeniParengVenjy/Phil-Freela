-- Freelancer and Client accounts are separate (PLAN-separate-accounts.md, Step 4).
-- Run after supabase_profiles_schema.sql.
--
-- One email = one role, forever: the website no longer has a "Switch to
-- Client / Freelancer" button, and this trigger makes sure nobody can change
-- profiles.account_type by calling the database directly either.
-- Only the website's users are stopped (the 'authenticated' and 'anon' roles).
-- The Supabase SQL Editor (postgres) can still fix a mistake.
-- Creating an account is not affected: the profile row is INSERTed with its
-- role once (Login.jsx, CompleteProfile.jsx, resolvePostAuthRoute).

create or replace function public.profiles_lock_account_type()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.account_type is distinct from old.account_type
     and coalesce(auth.role(), '') in ('authenticated', 'anon') then
    raise exception 'Freelancer and Client accounts are separate. To use the other side, make a new account with another email.'
      using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create or replace trigger profiles_lock_account_type
  before update of account_type on public.profiles
  for each row execute function public.profiles_lock_account_type();
