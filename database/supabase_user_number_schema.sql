-- User numbers (PF-0001). Plan: PLAN-user-numbers.md. Run this in the Supabase
-- SQL Editor (or apply it as a migration).
--
-- Every freelancer and client gets a friendly number, in order of sign-up, so an
-- admin can say "PF-0007" instead of reading out a 36-character ID. The website
-- writes it as PF- plus at least 4 digits (client/src/lib/userNumber.js). The
-- number is stored as a plain whole number.
--
-- Only the database hands numbers out: whatever the website sends for the
-- number is ignored, and editing a profile can never change it. A number is
-- never used again, even after the account is deleted (it comes from a counter
-- that only goes up).

-- 1. The counter and the column. The column is empty for a moment, so the
--    people who already exist can be numbered before it is made required.
create sequence if not exists public.user_number_seq;

alter table public.profiles add column if not exists user_number integer;

-- 2. Number the existing people in the order they signed up (the first account
--    is 1). created_at is the tie-breaker's first choice; id only settles an
--    exact tie.
update public.profiles p
set user_number = n.position
from (
  select id, row_number() over (order by created_at, id) as position
  from public.profiles
) n
where n.id = p.id and p.user_number is null;

-- 3. The next new person gets the number after the highest one in use.
select setval('public.user_number_seq', greatest((select coalesce(max(user_number), 0) from public.profiles), 1), (select count(*) > 0 from public.profiles));

-- 4. Required, and no two people can share one.
alter table public.profiles alter column user_number set not null;
alter table public.profiles add constraint profiles_user_number_key unique (user_number);

-- 5. Runs before every insert or update of a profile. On insert it ignores
--    whatever number was sent and takes the next one. On update it puts the old
--    number back. It runs with the database's own rights (security definer), so
--    people don't need any access to the counter.
create or replace function public.assign_user_number()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    new.user_number := nextval('public.user_number_seq');
  else
    new.user_number := old.user_number;
  end if;
  return new;
end;
$$;

revoke execute on function public.assign_user_number() from public, anon, authenticated;

create trigger profiles_user_number
before insert or update on public.profiles
for each row execute function public.assign_user_number();
