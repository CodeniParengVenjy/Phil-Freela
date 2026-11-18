-- One email for both sides (PLAN-separate-accounts.md, Step 7).
-- Run after supabase_account_splits_schema.sql.
--
-- A separated pair (account_splits, done) is the same person with two logins:
-- the old one (their plain email) and the new one (the same Gmail plus
-- "+client" / "+freelancer"). The user wants to sign in to EITHER with the
-- same email and password by picking the side on the Sign In page:
--   1. my_linked_account(side): the signed-in account's partner on that side
--      (its login email), so Login.jsx can open it instead of saying
--      "wrong side".
--   2. The pair shares one password: when it changes on one login (a new
--      password, "Forgot password"), the other gets the same one.
--   3. One time: the 4 new accounts made on 2026-11-18 had random passwords
--      nobody knows; they now get their old account's password.
-- Rolled-back trial on the live database (2026-11-18): 8/8 PASS (partner found
-- both ways, none for a plain account, all 4 pairs share a password, a change
-- on either login reaches the other, no other login touched). Applied the same
-- day as migration linked_signin.

-- ---------------------------------------------------------------------------
-- 1. The partner on the other side
-- ---------------------------------------------------------------------------

create or replace function public.my_linked_account(p_side text)
returns text
language sql
stable
security definer
set search_path = public, auth
as $$
  select u.email
  from public.account_splits s
  join public.profiles other
    on other.id = case when s.from_user = auth.uid() then s.to_user else s.from_user end
  join auth.users u on u.id = other.id
  where s.done_at is not null
    and s.to_user is not null
    and (s.from_user = auth.uid() or s.to_user = auth.uid())
    and other.account_type::text = p_side
  order by s.done_at desc
  limit 1;
$$;

revoke execute on function public.my_linked_account(text) from public, anon;
grant execute on function public.my_linked_account(text) to authenticated;

-- ---------------------------------------------------------------------------
-- 2. One password per pair
-- ---------------------------------------------------------------------------

-- Copies a new password (already hashed by Supabase) to the partner login.
-- The partner's own update fires this again, but then nothing differs, so it
-- stops there.
create or replace function public.sync_linked_password()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  update auth.users u
    set encrypted_password = new.encrypted_password, updated_at = now()
    where u.id in (
        select case when s.from_user = new.id then s.to_user else s.from_user end
        from public.account_splits s
        where s.done_at is not null and s.to_user is not null
          and (s.from_user = new.id or s.to_user = new.id))
      and u.encrypted_password is distinct from new.encrypted_password;
  return new;
end;
$$;

revoke execute on function public.sync_linked_password() from public, anon, authenticated;

create or replace trigger sync_linked_password
  after update of encrypted_password on auth.users
  for each row
  when (new.encrypted_password is distinct from old.encrypted_password)
  execute function public.sync_linked_password();

-- ---------------------------------------------------------------------------
-- 3. One time: the new logins get their old account's password
-- ---------------------------------------------------------------------------

update auth.users t
  set encrypted_password = b.encrypted_password, updated_at = now()
  from public.account_splits s
  join auth.users b on b.id = s.from_user
  where s.done_at is not null
    and t.id = s.to_user
    and b.encrypted_password is not null
    and t.encrypted_password is distinct from b.encrypted_password;
