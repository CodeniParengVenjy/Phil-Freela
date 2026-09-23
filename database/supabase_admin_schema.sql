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

-- ---------------------------------------------------------------------------
-- Admin panel step 2: suspending users and fully deleting accounts.
-- ---------------------------------------------------------------------------

-- One row per suspended user. Kept in its own table (not a column on
-- profiles) because users are allowed to edit their own profile row, so a
-- column there could be switched off by the suspended user themselves.
create table public.user_suspensions (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  reason text not null check (char_length(reason) between 1 and 500),
  suspended_by uuid references public.admins (id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.user_suspensions enable row level security;

create policy "admins can read suspensions"
  on public.user_suspensions for select
  using (public.is_admin());

-- Lets a suspended user read their own row, so the login page can show why.
create policy "users can read own suspension"
  on public.user_suspensions for select
  using (auth.uid() = user_id);

create policy "admins can suspend users"
  on public.user_suspensions for insert
  with check (public.is_admin() and suspended_by = auth.uid());

-- Unsuspending = deleting the row.
create policy "admins can unsuspend users"
  on public.user_suspensions for delete
  using (public.is_admin());

-- True when the given user is suspended. "security definer" so the rules
-- below can check any user, even though normal users can't read other
-- people's suspension rows.
create or replace function public.is_suspended(target uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.user_suspensions where user_id = target);
$$;

-- Suspended users can't post services, post jobs, or send messages. These
-- keep each rule's original check and add "and not suspended".
alter policy "services: freelancers can insert own" on public.services
  with check (
    freelancer_id = auth.uid()
    and exists (select 1 from public.profiles p where p.id = auth.uid() and p.account_type = 'freelancer')
    and not public.is_suspended(auth.uid())
  );

alter policy "job_posts: clients can insert own" on public.job_posts
  with check (
    client_id = auth.uid()
    and exists (select 1 from public.profiles p where p.id = auth.uid() and p.account_type = 'client')
    and not public.is_suspended(auth.uid())
  );

alter policy "messages: participants can insert own" on public.messages
  with check (
    sender_id = auth.uid()
    and exists (
      select 1 from public.conversations c
      where c.id = messages.conversation_id
        and (c.user_a = auth.uid() or c.user_b = auth.uid())
    )
    and not public.is_suspended(auth.uid())
  );

-- Suspended users' services and job posts are hidden from everyone except
-- the owner and admins.
alter policy "services: signed-in users can view" on public.services
  using (not public.is_suspended(freelancer_id) or freelancer_id = auth.uid() or public.is_admin());

alter policy "job_posts: signed-in users can view" on public.job_posts
  using (not public.is_suspended(client_id) or client_id = auth.uid() or public.is_admin());

-- Fully deletes a user: their login account, and through "on delete cascade"
-- their profile, services, job posts, conversations, and messages.
create or replace function public.delete_user(target_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Only admins can delete users.';
  end if;

  if exists (select 1 from public.admins where id = target_id) then
    raise exception 'Admins are removed from the Admins page, not here.';
  end if;

  if not exists (select 1 from public.profiles where id = target_id) then
    raise exception 'That user no longer exists.';
  end if;

  delete from auth.users where id = target_id;
end;
$$;

revoke execute on function public.delete_user(uuid) from public, anon;
grant execute on function public.delete_user(uuid) to authenticated;

-- Only the signed-in rules above use is_suspended(), so logged-out visitors
-- don't need it.
revoke execute on function public.is_suspended(uuid) from public, anon;
grant execute on function public.is_suspended(uuid) to authenticated;

-- The old "Remove" only deleted the profile row, which was recreated on the
-- user's next login. delete_user() above replaces it.
drop policy "admins can delete profiles" on public.profiles;

-- ---------------------------------------------------------------------------
-- Admin panel step 3: moderating listings.
-- (Admins can already see every listing, including suspended users', through
-- the "signed-in users can view" rules updated in step 2.)
-- ---------------------------------------------------------------------------

create policy "services: admins can delete any"
  on public.services for delete
  to authenticated
  using (public.is_admin());

create policy "job_posts: admins can delete any"
  on public.job_posts for delete
  to authenticated
  using (public.is_admin());

-- Lets an admin also delete a removed service's photo/video, so no unused
-- file is left behind in storage.
create policy "marketplace-images: admins can delete any file"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'marketplace-images' and public.is_admin());

-- ---------------------------------------------------------------------------
-- Admin panel step 5: user reports.
-- (Step 4, ID verification, is on hold.)
-- ---------------------------------------------------------------------------

-- One row per report. target_id points at a profile, service, or job post
-- depending on target_type, so it can't be a normal foreign key; if the
-- target is deleted later the report stays, and the admin page shows it as
-- "(deleted)".
create table public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references public.profiles (id) on delete cascade,
  target_type text not null check (target_type in ('user', 'service', 'job_post')),
  target_id uuid not null,
  reason text not null check (reason in ('spam', 'scam', 'inappropriate', 'harassment', 'fake_profile', 'other')),
  details text check (details is null or char_length(details) <= 1000),
  status text not null default 'pending' check (status in ('pending', 'resolved', 'dismissed')),
  admin_note text check (admin_note is null or char_length(admin_note) <= 500),
  reviewed_by uuid references public.admins (id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.reports enable row level security;

-- The same person can't pile up reports on the same thing: only one of their
-- reports per target can be pending at a time.
create unique index reports_one_pending_per_target
  on public.reports (reporter_id, target_type, target_id)
  where status = 'pending';

-- Users send reports as themselves, always as "pending" with no admin fields
-- filled in, can't report themselves, and can't report while suspended.
create policy "users can send reports"
  on public.reports for insert
  to authenticated
  with check (
    reporter_id = auth.uid()
    and status = 'pending'
    and admin_note is null
    and reviewed_by is null
    and reviewed_at is null
    and not (target_type = 'user' and target_id = auth.uid())
    and not public.is_suspended(auth.uid())
  );

create policy "users can read own reports"
  on public.reports for select
  to authenticated
  using (reporter_id = auth.uid());

create policy "admins can read all reports"
  on public.reports for select
  to authenticated
  using (public.is_admin());

-- Reviewing = changing status / note. Only admins, and only as themselves.
create policy "admins can review reports"
  on public.reports for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin() and reviewed_by = auth.uid());

-- Same overview numbers as step 1, plus how many reports are still pending.
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
    'admins',        (select count(*) from public.admins),
    'open_reports',  (select count(*) from public.reports where status = 'pending')
  );
end;
$$;
