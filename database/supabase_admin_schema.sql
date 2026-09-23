-- Admin panel schema, extends database/supabase_schema.sql. Run this in the
-- Supabase SQL Editor after that file (or see supabase_schema.sql's note --
-- both are already applied to the live project via Supabase MCP migrations).

create table public.admins (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name varchar(120) not null,
  username varchar(60) not null unique,
  created_at timestamptz not null default now()
);

alter table public.admins enable row level security;

-- RLS policies can't see rows they'd filter out, so a plain
-- "select count(*) from admins" inside another policy only ever counts the
-- caller's own (nonexistent) row. This function runs with the table owner's
-- privileges instead, so it always sees the true count.
create or replace function public.admin_count()
returns bigint
language sql
security definer
set search_path = public
as $$
  select count(*) from public.admins;
$$;

-- An insert into admins is only allowed while the table is empty, so this
-- only ever admits the very first admin account.
create policy "bootstrap first admin only"
  on public.admins for insert
  with check (auth.uid() = id and public.admin_count() = 0);

create policy "admins can read own row"
  on public.admins for select
  using (auth.uid() = id);

-- Lets the admin dashboard list and manage every user, not just their own row.
create policy "admins can read all profiles"
  on public.profiles for select
  using (exists (select 1 from public.admins where id = auth.uid()));

create policy "admins can delete profiles"
  on public.profiles for delete
  using (exists (select 1 from public.admins where id = auth.uid()));

-- ---------------------------------------------------------------------------
-- Admin panel step 1: overview stats and managing other admins.
-- ---------------------------------------------------------------------------

-- True when the signed-in user is an admin. "security definer" lets it see
-- the whole admins table, since RLS would otherwise only show the caller's
-- own row. Every admin-only rule below reuses this one check.
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.admins where id = auth.uid());
$$;

create policy "admins can read all admins"
  on public.admins for select
  using (public.is_admin());

-- Only an existing admin can add another admin row. (The very first admin
-- still comes from the "bootstrap first admin only" policy above.)
create policy "admins can add admins"
  on public.admins for insert
  with check (public.is_admin());

-- Removes another admin by deleting their whole login account; the admins
-- row goes with it through "on delete cascade". Deleting only the admins row
-- would leave a login that could still sign in on the normal user page.
create or replace function public.remove_admin(target_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Only admins can remove admins.';
  end if;

  -- Blocking self-removal means there is always at least one admin left.
  if target_id = auth.uid() then
    raise exception 'You cannot remove your own admin account.';
  end if;

  if not exists (select 1 from public.admins where id = target_id) then
    raise exception 'That account is not an admin.';
  end if;

  delete from auth.users where id = target_id;
end;
$$;

-- Numbers for the admin overview page. It only returns counts, so admins can
-- see how many messages exist without being able to read any of them.
create or replace function public.admin_stats()
returns json
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Only admins can view stats.';
  end if;

  return json_build_object(
    'total_users',   (select count(*) from public.profiles),
    'freelancers',   (select count(*) from public.profiles where account_type = 'freelancer'),
    'clients',       (select count(*) from public.profiles where account_type = 'client'),
    'new_this_week', (select count(*) from public.profiles where created_at >= now() - interval '7 days'),
    'services',      (select count(*) from public.services),
    'job_posts',     (select count(*) from public.job_posts),
    'conversations', (select count(*) from public.conversations),
    'messages',      (select count(*) from public.messages),
    'admins',        (select count(*) from public.admins)
  );
end;
$$;

-- Logged-out visitors never need these two; signed-in users can call them,
-- but the is_admin() check inside turns everyone else away.
revoke execute on function public.remove_admin(uuid) from public, anon;
revoke execute on function public.admin_stats() from public, anon;
grant execute on function public.remove_admin(uuid) to authenticated;
grant execute on function public.admin_stats() to authenticated;
