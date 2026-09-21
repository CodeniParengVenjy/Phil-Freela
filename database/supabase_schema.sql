-- Postgres/Supabase schema for the Capstone System.
-- This mirrors what has already been applied to the live Supabase project
-- (via the Supabase MCP `apply_migration` tool) -- run it only if you need to
-- recreate the schema from scratch on a fresh project.

create type public.gender_type as enum ('male', 'female');
create type public.account_type as enum ('freelancer', 'client');

-- Extends auth.users (Supabase Auth). Created by supabase.auth.signUp() on
-- the client, then this row is inserted right after with the extra profile
-- fields Supabase Auth doesn't store natively.
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name varchar(120) not null,
  username varchar(60) not null unique,
  gender public.gender_type not null,
  account_type public.account_type not null default 'freelancer',
  created_at timestamptz not null default now(),
  updated_at timestamptz
);

alter table public.profiles enable row level security;

create policy "profiles: individuals can view own"
  on public.profiles for select
  using (auth.uid() = id);

create policy "profiles: individuals can insert own"
  on public.profiles for insert
  with check (auth.uid() = id);

create policy "profiles: individuals can update own"
  on public.profiles for update
  using (auth.uid() = id);
