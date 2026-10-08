-- Name and username cooldowns for freelancers and clients. Plan:
-- PLAN-admin-accounts.md, part 2. Run this in the Supabase SQL Editor.
--
-- A person can change their Name once every 7 days and their username once
-- every 30 days, counted from their last change. The first change is always
-- allowed (signing up does not start a cooldown). The rule lives in the
-- database, so changing the website can't skip it.

-- When each was last changed. Empty until the first change.
alter table public.profiles
  add column name_changed_at timestamptz,
  add column username_changed_at timestamptz;

-- Runs before every update of a profile. It also guards the two dates
-- themselves: whatever a person sends for them is ignored, and only a real
-- change of the name or username moves them. When there is no signed-in person
-- (the backend with the service key, or the SQL Editor), nothing is checked.
create or replace function public.enforce_name_cooldowns()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    return new;
  end if;

  new.name_changed_at := old.name_changed_at;
  new.username_changed_at := old.username_changed_at;

  if new.full_name is distinct from old.full_name then
    if old.name_changed_at is not null and old.name_changed_at > now() - interval '7 days' then
      raise exception 'You can change your name again on %.',
        to_char((old.name_changed_at + interval '7 days') at time zone 'Asia/Manila', 'Mon FMDD, YYYY, FMHH12:MI AM');
    end if;
    new.name_changed_at := now();
  end if;

  if new.username is distinct from old.username then
    if old.username_changed_at is not null and old.username_changed_at > now() - interval '30 days' then
      raise exception 'You can change your username again on %.',
        to_char((old.username_changed_at + interval '30 days') at time zone 'Asia/Manila', 'Mon FMDD, YYYY, FMHH12:MI AM');
    end if;
    new.username_changed_at := now();
  end if;

  return new;
end;
$$;

revoke execute on function public.enforce_name_cooldowns() from public, anon, authenticated;

create trigger profiles_name_cooldowns
  before update on public.profiles
  for each row
  execute function public.enforce_name_cooldowns();
