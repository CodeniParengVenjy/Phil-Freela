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
-- (Step 4, ID verification, was built later and is at the end of this file.)
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

-- ---------------------------------------------------------------------------
-- Admin panel step 4: ID verification (eKYC).
-- The user sends a photo of their government ID and a selfie. The Python AI
-- service (ai-service folder) compares the two faces with OpenCV's YuNet + SFace,
-- saves the photos and the result here, and an admin approves or rejects it.
-- The AI service uses the service role key, which skips these rules, so it is
-- the only thing that can add rows or upload photos. Browsers can't.
-- ---------------------------------------------------------------------------

-- One row per verification attempt.
create table public.identity_verifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  id_type text not null check (id_type in ('philsys', 'drivers_license', 'passport', 'umid', 'prc')),
  -- Where the two photos are saved in the private "verification-docs" bucket.
  id_photo_path text not null,
  selfie_path text not null,
  -- The AI result. face_distance is how different the two faces are: the
  -- lower the number, the more alike they are.
  face_match boolean not null,
  face_distance real not null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  admin_note text check (admin_note is null or char_length(admin_note) <= 500),
  reviewed_by uuid references public.admins (id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.identity_verifications enable row level security;

-- Only one pending or approved verification per user. After a rejection,
-- they can send a new one.
create unique index identity_verifications_one_active_per_user
  on public.identity_verifications (user_id)
  where status in ('pending', 'approved');

create index identity_verifications_reviewed_by_idx
  on public.identity_verifications (reviewed_by);

-- Users see only their own verifications; admins see all of them.
-- "(select ...)" makes Postgres run the check once per query, not per row.
create policy "owners and admins can read verifications"
  on public.identity_verifications for select
  to authenticated
  using (user_id = (select auth.uid()) or (select public.is_admin()));

-- Reviewing = approving or rejecting. Only admins, and only as themselves.
create policy "admins can review verifications"
  on public.identity_verifications for update
  to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()) and reviewed_by = (select auth.uid()));

-- Admins can only change the review fields, never the AI result or photos.
revoke update on public.identity_verifications from authenticated;
grant update (status, admin_note, reviewed_by, reviewed_at)
  on public.identity_verifications to authenticated;

-- One-time links inside the QR code, for users without a webcam. The token
-- is a random UUID, so it can't be guessed. It expires after 10 minutes and
-- is marked used after one successful upload.
create table public.verification_links (
  token uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  expires_at timestamptz not null default now() + interval '10 minutes',
  used_at timestamptz,
  created_at timestamptz not null default now()
);

create index verification_links_user_id_idx
  on public.verification_links (user_id);

-- Rules on, but no policies = no browser can read or write this table.
-- Only the AI service uses it, so tokens can't be looked up from the website.
alter table public.verification_links enable row level security;
revoke all on public.verification_links from anon, authenticated;

-- Private bucket for ID photos and selfies (unlike marketplace-images, which
-- is public). Saved as <user id>/<verification id>/id.jpg and selfie.jpg.
-- JPG, PNG, or WEBP only, 5 MB max per file.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('verification-docs', 'verification-docs', false, 5242880,
        array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

-- Admins need to see the photos to review them. There are no upload or
-- delete rules, so users can't touch these files; only the AI service can.
create policy "verification-docs: admins can view files"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'verification-docs' and public.is_admin());

-- True when the user has an approved verification; used for the "Verified"
-- badge. "security definer" lets it check any user, even though users can
-- only read their own rows. It only returns true/false, never the photos.
create or replace function public.is_verified(target uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.identity_verifications
    where user_id = target and status = 'approved'
  );
$$;

revoke execute on function public.is_verified(uuid) from public, anon;
grant execute on function public.is_verified(uuid) to authenticated;

-- Step 4 update: both sides of the ID. The back gives the admin more to
-- check (QR code, barcode, details) when judging if an ID is real. Passports
-- have no card back, so they're the only ID type allowed without one.
alter table public.identity_verifications add column id_back_path text;

alter table public.identity_verifications
  add constraint identity_verifications_back_required
  check (id_type = 'passport' or id_back_path is not null);

-- ---------------------------------------------------------------------------
-- Admin panel step 6: announcements.
-- An admin posts a message to all users, only freelancers, or only clients.
-- It shows on the users' Notifications page, with an unread count on the bell.
-- ---------------------------------------------------------------------------

create table public.announcements (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 1 and 120),
  message text not null check (char_length(message) between 1 and 1000),
  -- Who receives it: everyone, or only one account type.
  audience text not null default 'all' check (audience in ('all', 'freelancer', 'client')),
  created_by uuid references public.admins (id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.announcements enable row level security;

create index announcements_created_at_idx on public.announcements (created_at desc);
create index announcements_created_by_idx on public.announcements (created_by);

-- Users only see announcements meant for them: the ones for everyone, plus
-- the ones for their account type. Admins see all of them.
create policy "users can read their announcements"
  on public.announcements for select
  to authenticated
  using (
    audience = 'all'
    or audience = (select account_type::text from public.profiles where id = (select auth.uid()))
    or (select public.is_admin())
  );

-- Only admins can post, and only as themselves.
create policy "admins can post announcements"
  on public.announcements for insert
  to authenticated
  with check ((select public.is_admin()) and created_by = (select auth.uid()));

-- There is no update rule, so announcements can't be edited. To fix a
-- mistake, the admin deletes it and posts it again.
create policy "admins can delete announcements"
  on public.announcements for delete
  to authenticated
  using ((select public.is_admin()));

-- When the user last opened their Notifications page. Announcements posted
-- after this time count as unread. Users can already update their own
-- profile row, so opening the page just sets this to now(). New users start
-- at their sign-up time, so old announcements don't show up as unread.
alter table public.profiles
  add column notifications_seen_at timestamptz not null default now();

-- Live updates, so a new announcement shows up without refreshing the page.
alter publication supabase_realtime add table public.announcements;

-- Step 4 update: live face scan. Instead of one selfie, the browser records
-- three frames: looking straight (selfie_path), then turned one way and the
-- other. A printed photo or a phone screen can't turn its head, so this is a
-- basic "liveness" check. The AI service re-checks the head angles and that
-- all three frames are the same person, and saves the result here.
alter table public.identity_verifications
  add column selfie_left_path text not null,
  add column selfie_right_path text not null,
  add column liveness_passed boolean not null;

-- ---------------------------------------------------------------------------
-- Admin panel: show each user's email on the Users page.
-- Emails live in Supabase's private auth.users table, which the browser can't
-- read. This function joins it with profiles, but only for admins.
-- ---------------------------------------------------------------------------

create or replace function public.admin_list_users()
returns table (
  id uuid,
  full_name text,
  username text,
  account_type text,
  created_at timestamptz,
  email text,
  email_confirmed_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Only admins can view users.';
  end if;

  return query
    select p.id, p.full_name::text, p.username::text, p.account_type::text,
           p.created_at, u.email::text, u.email_confirmed_at
    from public.profiles p
    join auth.users u on u.id = p.id
    order by p.created_at desc;
end;
$$;

revoke execute on function public.admin_list_users() from public, anon;
grant execute on function public.admin_list_users() to authenticated;

-- ---------------------------------------------------------------------------
-- Identity verification, part 2: the Verified check next to names, and only
-- verified freelancers can offer services.
-- ---------------------------------------------------------------------------

-- Which of the given users are verified (an approved verification). Pages
-- showing many names (services, job posts, inbox, chat) ask once for all of
-- them. Like is_verified, it only answers yes/no per user, never the photos.
create or replace function public.verified_user_ids(ids uuid[])
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select distinct user_id from public.identity_verifications
  where user_id = any(ids) and status = 'approved';
$$;

revoke execute on function public.verified_user_ids(uuid[]) from public, anon;
grant execute on function public.verified_user_ids(uuid[]) to authenticated;

-- Freelancers must be verified before they can post a service...
alter policy "services: freelancers can insert own" on public.services
  with check (
    freelancer_id = auth.uid()
    and exists (select 1 from public.profiles p where p.id = auth.uid() and p.account_type = 'freelancer')
    and not public.is_suspended(auth.uid())
    and public.is_verified(auth.uid())
  );

-- ...and only verified freelancers' services show on Browse Services. A
-- freelancer still sees their own, and admins see all.
alter policy "services: signed-in users can view" on public.services
  using (
    (not public.is_suspended(freelancer_id) and public.is_verified(freelancer_id))
    or freelancer_id = auth.uid()
    or public.is_admin()
  );
-- ---------------------------------------------------------------------------
-- Admin panel: bans, and suspensions that end on a set date.
-- A row with an end date is a suspension that lifts by itself on that date.
-- A row with no end date (ends_at is null) is a ban: it stays until an admin
-- unbans the user. Ban replaces the old Delete button, so no account or data
-- is ever lost because of a mistake.
-- ---------------------------------------------------------------------------

alter table public.user_suspensions add column ends_at timestamptz;

-- A suspension can't end before it starts.
alter table public.user_suspensions
  add constraint user_suspensions_ends_after_start
  check (ends_at is null or ends_at > created_at);

-- Only bans and suspensions that haven't ended count. Every rule that already
-- uses is_suspended() (no posting, no messages, hidden listings) now covers
-- bans too, and switches off by itself on the end date. No scheduled job.
create or replace function public.is_suspended(target uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.user_suspensions
    where user_id = target
      and (ends_at is null or ends_at > now())
  );
$$;

-- There is one row per user, so suspending or banning someone again (after an
-- old suspension ended, or to turn a suspension into a ban) replaces the row.
-- Only admins, and only as themselves.
create policy "admins can update suspensions"
  on public.user_suspensions for update
  using (public.is_admin())
  with check (public.is_admin() and suspended_by = auth.uid());

-- ---------------------------------------------------------------------------
-- Admin panel: the violation decides the penalty.
-- The admin only picks which rule was broken; the penalty chart in
-- client/src/lib/violations.js decides how long it lasts and what it blocks
-- (posting, messaging, or both). A suspended user can still log in; only a
-- ban (no end date) keeps them out.
-- ---------------------------------------------------------------------------

alter table public.user_suspensions
  add column violation text not null default 'other'
    check (violation in ('spam', 'scam', 'inappropriate', 'harassment', 'fake_profile', 'other')),
  add column blocks_posting boolean not null default true,
  add column blocks_messaging boolean not null default true;

-- The default only filled in old rows; new ones must say which violation.
alter table public.user_suspensions alter column violation drop default;

-- A ban blocks everything, and a suspension must block at least one thing.
alter table public.user_suspensions
  add constraint user_suspensions_ban_blocks_all
  check (ends_at is not null or (blocks_posting and blocks_messaging)),
  add constraint user_suspensions_blocks_something
  check (blocks_posting or blocks_messaging);

-- True when the user can't post right now (a ban, or a suspension that
-- blocks posting and hasn't ended). "security definer" so the rules below
-- can check any user.
create or replace function public.is_posting_blocked(target uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.user_suspensions
    where user_id = target
      and blocks_posting
      and (ends_at is null or ends_at > now())
  );
$$;

-- Same, for sending messages.
create or replace function public.is_messaging_blocked(target uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.user_suspensions
    where user_id = target
      and blocks_messaging
      and (ends_at is null or ends_at > now())
  );
$$;

-- Signed-in users (for the rules) and the AI service (for slide uploads).
revoke execute on function public.is_posting_blocked(uuid) from public, anon;
revoke execute on function public.is_messaging_blocked(uuid) from public, anon;
grant execute on function public.is_posting_blocked(uuid) to authenticated, service_role;
grant execute on function public.is_messaging_blocked(uuid) to authenticated, service_role;

-- Posting services and job posts now checks only the posting block...
alter policy "services: freelancers can insert own" on public.services
  with check (
    freelancer_id = auth.uid()
    and exists (select 1 from public.profiles p where p.id = auth.uid() and p.account_type = 'freelancer')
    and not public.is_posting_blocked(auth.uid())
    and public.is_verified(auth.uid())
  );

alter policy "job_posts: clients can insert own" on public.job_posts
  with check (
    client_id = auth.uid()
    and exists (select 1 from public.profiles p where p.id = auth.uid() and p.account_type = 'client')
    and not public.is_posting_blocked(auth.uid())
  );

-- ...and so does hiding listings: someone suspended only from chatting
-- (harassment) keeps their services and job posts visible.
alter policy "services: signed-in users can view" on public.services
  using (
    (not public.is_posting_blocked(freelancer_id) and public.is_verified(freelancer_id))
    or freelancer_id = auth.uid()
    or public.is_admin()
  );

alter policy "job_posts: signed-in users can view" on public.job_posts
  using (not public.is_posting_blocked(client_id) or client_id = auth.uid() or public.is_admin());

-- Sending messages checks only the messaging block.
alter policy "messages: participants can insert own" on public.messages
  with check (
    sender_id = auth.uid()
    and exists (
      select 1 from public.conversations c
      where c.id = messages.conversation_id
        and (c.user_a = auth.uid() or c.user_b = auth.uid())
    )
    and not public.is_messaging_blocked(auth.uid())
  );

-- Editing an old message is also blocked, or someone suspended from chatting
-- (e.g. for harassment) could rewrite their old messages instead.
alter policy "messages: sender can update own" on public.messages
  with check (sender_id = auth.uid() and not public.is_messaging_blocked(auth.uid()));

-- ---------------------------------------------------------------------------
-- Notifications for one user (announcements go to everyone).
-- The database makes these itself with triggers, so no page has to remember
-- to send them: when a verification is reviewed, and when a user is
-- suspended. They show on the Notifications page next to announcements, and
-- count toward the same unread number (profiles.notifications_seen_at).
-- ---------------------------------------------------------------------------

create table public.user_notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  -- What it's about; the Notifications page picks the icon from this.
  type text not null check (type in ('verification_approved', 'verification_rejected', 'suspension')),
  title text not null check (char_length(title) between 1 and 120),
  message text not null check (char_length(message) between 1 and 1000),
  -- The page the popup's button goes to (null = no button).
  link text,
  created_at timestamptz not null default now()
);

create index user_notifications_user_id_created_at_idx
  on public.user_notifications (user_id, created_at desc);

-- Users can only read their own. There are no insert/update/delete rules, so
-- nobody can make or change one from the browser: only the triggers below.
alter table public.user_notifications enable row level security;

create policy "users can read own notifications"
  on public.user_notifications for select
  to authenticated
  using (user_id = (select auth.uid()));

-- Runs when an admin approves or rejects a verification (see the trigger's
-- "when" below). "security definer" lets it add the row despite the rules.
create or replace function public.notify_verification_reviewed()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'approved' then
    insert into public.user_notifications (user_id, type, title, message, link)
    values (
      new.user_id, 'verification_approved', 'Identity verified',
      'Your ID and face scan were approved. A Verified check now shows next to your name.',
      '/dashboard/verify-identity'
    );
  else
    insert into public.user_notifications (user_id, type, title, message, link)
    values (
      new.user_id, 'verification_rejected', 'Verification not approved',
      'Your identity verification was not approved. You can send a new one from the Verify Identity page.'
        || E'\n\nReason: ' || coalesce(new.admin_note, 'No reason given.'),
      '/dashboard/verify-identity'
    );
  end if;
  return new;
end;
$$;

create trigger identity_verifications_notify
  after update of status on public.identity_verifications
  for each row
  when (old.status = 'pending' and new.status in ('approved', 'rejected'))
  execute function public.notify_verification_reviewed();

-- Runs on every new suspension, including one that replaces an old row (the
-- admin pages always save a new created_at then). Bans are skipped: a banned
-- user can't log in to read it. Times are shown in Philippine time.
create or replace function public.notify_suspension()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  blocked text;
begin
  if new.ends_at is null then
    return new;
  end if;
  if tg_op = 'UPDATE' and new.created_at = old.created_at then
    return new;
  end if;

  blocked := case
    when new.blocks_posting and new.blocks_messaging then 'can''t post or send messages'
    when new.blocks_posting then 'can''t post services or job posts'
    else 'can''t send messages'
  end;

  insert into public.user_notifications (user_id, type, title, message)
  values (
    new.user_id, 'suspension', 'Account suspended',
    'Your account is suspended until '
      || to_char(new.ends_at at time zone 'Asia/Manila', 'Mon FMDD, YYYY, FMHH12:MI AM')
      || ' (Philippine time). Until then you ' || blocked || '.'
      || E'\n\nReason: ' || new.reason
  );
  return new;
end;
$$;

create trigger user_suspensions_notify
  after insert or update on public.user_suspensions
  for each row
  execute function public.notify_suspension();

-- Only the triggers use these functions.
revoke execute on function public.notify_verification_reviewed() from public, anon, authenticated;
revoke execute on function public.notify_suspension() from public, anon, authenticated;

-- Live updates, so a new notification shows up without refreshing the page.
alter publication supabase_realtime add table public.user_notifications;

-- ---------------------------------------------------------------------------
-- Appeals: a suspended or banned user asks an admin to lift their penalty.
-- Suspended users appeal from the dashboard banner; banned users are sent to
-- the /appeal page after logging in (they can't reach the dashboard). Each
-- penalty can be appealed once. Accepting lifts the penalty; both results
-- send the user a notification.
-- ---------------------------------------------------------------------------

create table public.appeals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  -- Which penalty: the created_at of the user's user_suspensions row (one
  -- row per user, and every new penalty gets a new time).
  suspension_started_at timestamptz not null,
  -- Copied from the penalty when the appeal is sent, so the admin still sees
  -- it after the penalty is lifted or replaced. ends_at null = ban.
  violation text not null,
  penalty_reason text not null,
  penalty_ends_at timestamptz,
  message text not null check (char_length(message) between 10 and 1000),
  status text not null default 'pending' check (status in ('pending', 'accepted', 'rejected')),
  admin_note text check (admin_note is null or char_length(admin_note) <= 500),
  reviewed_by uuid references public.admins (id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  -- One appeal per penalty.
  unique (user_id, suspension_started_at),
  -- The user must be told why an appeal was rejected.
  constraint appeals_reject_needs_note check (status <> 'rejected' or admin_note is not null)
);

create index appeals_status_created_at_idx on public.appeals (status, created_at);
create index appeals_reviewed_by_idx on public.appeals (reviewed_by);

alter table public.appeals enable row level security;

-- The browser only sends the message; this fills in which penalty it's
-- about from the user's current one, so nobody can appeal a penalty they
-- don't have (or change what it says).
create or replace function public.fill_appeal_penalty()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  penalty public.user_suspensions;
begin
  select * into penalty from public.user_suspensions
  where user_id = new.user_id and (ends_at is null or ends_at > now());
  if not found then
    raise exception 'There is no suspension or ban to appeal.';
  end if;

  new.suspension_started_at := penalty.created_at;
  new.violation := penalty.violation;
  new.penalty_reason := penalty.reason;
  new.penalty_ends_at := penalty.ends_at;
  return new;
end;
$$;

create trigger appeals_fill_penalty
  before insert on public.appeals
  for each row
  execute function public.fill_appeal_penalty();

-- Users see their own appeals; admins see all of them.
create policy "users and admins can read appeals"
  on public.appeals for select
  to authenticated
  using (user_id = (select auth.uid()) or (select public.is_admin()));

-- Users can only appeal for themselves, as a new, unreviewed appeal.
create policy "users can appeal their own penalty"
  on public.appeals for insert
  to authenticated
  with check (
    user_id = (select auth.uid())
    and status = 'pending'
    and admin_note is null
    and reviewed_by is null
    and reviewed_at is null
  );

-- Admins review each appeal once (pending -> accepted/rejected), as themselves.
create policy "admins can review pending appeals"
  on public.appeals for update
  to authenticated
  using ((select public.is_admin()) and status = 'pending')
  with check ((select public.is_admin()) and reviewed_by = (select auth.uid()) and status in ('accepted', 'rejected'));

-- Only the review fields can change, never the message or the penalty.
revoke update on public.appeals from authenticated;
grant update (status, admin_note, reviewed_by, reviewed_at) on public.appeals to authenticated;

-- New kinds of notifications for this step.
alter table public.user_notifications drop constraint user_notifications_type_check;
alter table public.user_notifications add constraint user_notifications_type_check
  check (type in ('verification_approved', 'verification_rejected', 'suspension',
                  'suspension_lifted', 'appeal_accepted', 'appeal_rejected'));

-- Runs when an admin reviews an appeal. Accepted: lifts the penalty (only if
-- it's still the same one and hasn't ended) and tells the user. Rejected:
-- tells the user, with the admin's note.
create or replace function public.handle_appeal_reviewed()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  what text := case when new.penalty_ends_at is null then 'ban' else 'suspension' end;
begin
  if new.status = 'accepted' then
    delete from public.user_suspensions
    where user_id = new.user_id
      and created_at = new.suspension_started_at
      and (ends_at is null or ends_at > now());
    if not found then
      raise exception 'This % has already ended or been replaced, so there is nothing to lift. Reject the appeal instead.', what;
    end if;

    insert into public.user_notifications (user_id, type, title, message)
    values (
      new.user_id, 'appeal_accepted', 'Appeal accepted',
      'Your appeal was accepted and your ' || what || ' has been lifted. You can use PhilFreela normally again.'
        || coalesce(E'\n\nAdmin''s note: ' || new.admin_note, '')
    );
  else
    insert into public.user_notifications (user_id, type, title, message, link)
    values (
      new.user_id, 'appeal_rejected', 'Appeal not accepted',
      'Your appeal was reviewed, but your ' || what || ' stays'
        || case
             when new.penalty_ends_at is null then '.'
             else ' until ' || to_char(new.penalty_ends_at at time zone 'Asia/Manila', 'Mon FMDD, YYYY, FMHH12:MI AM') || ' (Philippine time).'
           end
        || E'\n\nAdmin''s note: ' || new.admin_note,
      '/appeal'
    );
  end if;
  return new;
end;
$$;

create trigger appeals_reviewed
  after update of status on public.appeals
  for each row
  when (old.status = 'pending' and new.status in ('accepted', 'rejected'))
  execute function public.handle_appeal_reviewed();

-- Runs when a penalty row is deleted, i.e. an admin clicked Unsuspend /
-- Unban. Skipped when the penalty had already ended, when the whole account
-- is being deleted, or when an accepted appeal lifted it (that already sent
-- "Appeal accepted").
create or replace function public.notify_suspension_lifted()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.ends_at is not null and old.ends_at <= now() then
    return old;
  end if;
  if not exists (select 1 from public.profiles where id = old.user_id) then
    return old;
  end if;
  if exists (
    select 1 from public.appeals
    where user_id = old.user_id and suspension_started_at = old.created_at and status = 'accepted'
  ) then
    return old;
  end if;

  insert into public.user_notifications (user_id, type, title, message)
  values (
    old.user_id, 'suspension_lifted',
    case when old.ends_at is null then 'Ban lifted' else 'Suspension lifted' end,
    case when old.ends_at is null
      then 'An admin lifted your ban. You can use PhilFreela normally again.'
      else 'An admin lifted your suspension early. You can post and send messages again.'
    end
  );
  return old;
end;
$$;

create trigger user_suspensions_notify_lifted
  after delete on public.user_suspensions
  for each row
  execute function public.notify_suspension_lifted();

-- Suspension notifications now link to the appeal page (same function as
-- before, plus the link).
create or replace function public.notify_suspension()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  blocked text;
begin
  if new.ends_at is null then
    return new;
  end if;
  if tg_op = 'UPDATE' and new.created_at = old.created_at then
    return new;
  end if;

  blocked := case
    when new.blocks_posting and new.blocks_messaging then 'can''t post or send messages'
    when new.blocks_posting then 'can''t post services or job posts'
    else 'can''t send messages'
  end;

  insert into public.user_notifications (user_id, type, title, message, link)
  values (
    new.user_id, 'suspension', 'Account suspended',
    'Your account is suspended until '
      || to_char(new.ends_at at time zone 'Asia/Manila', 'Mon FMDD, YYYY, FMHH12:MI AM')
      || ' (Philippine time). Until then you ' || blocked || '.'
      || E'\n\nReason: ' || new.reason,
    '/appeal'
  );
  return new;
end;
$$;

-- Older suspension notifications get the link too.
update public.user_notifications set link = '/appeal' where type = 'suspension' and link is null;

-- Only the triggers use these functions.
revoke execute on function public.fill_appeal_penalty() from public, anon, authenticated;
revoke execute on function public.handle_appeal_reviewed() from public, anon, authenticated;
revoke execute on function public.notify_suspension_lifted() from public, anon, authenticated;
revoke execute on function public.notify_suspension() from public, anon, authenticated;
