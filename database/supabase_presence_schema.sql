-- Online / offline status ("Online" / "Offline 5m ago") in Chat and Inbox.
-- Run this in the Supabase SQL Editor after supabase_schema.sql.

-- When each user last had a dashboard page open. The app says "I'm here"
-- about once a minute (client/src/lib/presence.js), so anyone seen in the
-- last 2 minutes counts as online.
create table if not exists public.user_presence (
  user_id uuid primary key references auth.users (id) on delete cascade,
  last_seen_at timestamptz not null default now()
);

-- Nobody reads or writes this table directly; only the two functions below
-- use it. That way a user can't fake a time (e.g. one far in the future to
-- look online forever) or change someone else's.
alter table public.user_presence enable row level security;
revoke all on public.user_presence from anon, authenticated;

-- "I'm here": saves the database's own clock time for the signed-in user.
create or replace function public.touch_last_seen()
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.user_presence (user_id, last_seen_at)
  values (auth.uid(), now())
  on conflict (user_id) do update set last_seen_at = excluded.last_seen_at;
$$;

-- How many seconds ago each of these users was last seen. Worked out here
-- with the database's clock, so a phone set to the wrong time still shows
-- the right status. Users never seen are left out.
create or replace function public.last_seen_seconds(ids uuid[])
returns table (user_id uuid, seconds_ago integer)
language sql
stable
security definer
set search_path = public
as $$
  select p.user_id, floor(extract(epoch from now() - p.last_seen_at))::integer
  from public.user_presence p
  where p.user_id = any(ids);
$$;

revoke execute on function public.touch_last_seen() from public, anon;
revoke execute on function public.last_seen_seconds(uuid[]) from public, anon;
grant execute on function public.touch_last_seen() to authenticated;
grant execute on function public.last_seen_seconds(uuid[]) to authenticated;
