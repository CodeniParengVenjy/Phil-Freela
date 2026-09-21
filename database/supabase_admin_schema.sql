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
