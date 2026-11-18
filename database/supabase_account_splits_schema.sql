-- Split an account that has work on both sides (PLAN-separate-accounts.md, Step 5).
-- Run after supabase_account_type_lock_schema.sql.
--
-- Freelancer and Client accounts are separate now, but accounts made before
-- that could switch, so a few have work on BOTH sides (e.g. a client who used
-- to be a freelancer still owns offers and projects as a freelancer). Nothing
-- is deleted: the account keeps the role it has now, and the other side's work
-- moves to a NEW account of the other role, made by the same person with
-- another email. How:
--   1. Old account: "Get my move code" -> start_account_split() makes a code
--      (8 letters, 7 days, one use).
--   2. New account: Settings > Account > "Move work from an old account"
--      -> finish_account_split(code) moves the rows in one transaction.
-- The code proves the person owns the old account; being signed in proves
-- they own the new one. Chats, notifications, the profile picture, Premium,
-- ads, reports and the ID check stay with the old account.
-- Rows tied to a FILE in the old account's private folder stay too, because
-- the database checks that such a file is in its owner's folder and SQL
-- can't move files: a job application with a resume, a payment or receipt
-- check with a receipt picture, a watermark with its own picture.

-- ---------------------------------------------------------------------------
-- 1. The move codes
-- ---------------------------------------------------------------------------

create table if not exists public.account_splits (
  id uuid primary key default gen_random_uuid(),
  -- The account the work moves out of (it keeps its own role).
  from_user uuid not null references public.profiles(id) on delete cascade,
  -- Which side's work moves out: the side the old account is NOT.
  move_side text not null check (move_side in ('freelancer', 'client')),
  -- 8 letters without 0/O and 1/I, so it is easy to type.
  code text not null unique check (code ~ '^[A-HJ-NP-Z2-9]{8}$'),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '7 days',
  -- Filled in when the new account used the code.
  to_user uuid references public.profiles(id) on delete set null,
  done_at timestamptz,
  -- How many rows of each kind moved, e.g. {"offers": 4, "projects": 3}.
  moved jsonb
);

-- Each account sees only its own codes; only the functions below write.
alter table public.account_splits enable row level security;

create policy "account_splits: own rows" on public.account_splits
  for select to authenticated
  using (from_user = auth.uid() or to_user = auth.uid());

-- ---------------------------------------------------------------------------
-- 2. Helpers (not callable from the website)
-- ---------------------------------------------------------------------------

-- A random code. Bytes 0-5 and 10-11 of a random UUID are fully random (the
-- others hold its version bits); 32 letters = 5 bits each, so no letter is
-- likelier than another. 40 bits: far too many to guess.
create or replace function public.new_split_code()
returns text
language plpgsql
set search_path = public
as $$
declare
  letters constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  raw bytea := uuid_send(gen_random_uuid());
  result text := '';
  i int;
begin
  foreach i in array array[0, 1, 2, 3, 4, 5, 10, 11] loop
    result := result || substr(letters, (get_byte(raw, i) % 32) + 1, 1);
  end loop;
  return result;
end;
$$;

-- How much work an account has on one side.
create or replace function public.split_side_counts(p_user uuid, p_side text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select case when p_side = 'freelancer' then jsonb_build_object(
      'offers', (select count(*) from public.services where freelancer_id = p_user),
      'portfolio', (select count(*) from public.portfolio_items where freelancer_id = p_user),
      -- (an application with a resume file stays, see the top)
      'applications', (select count(*) from public.job_applications where freelancer_id = p_user and resume_path is null),
      'bookings', (select count(*) from public.bookings where freelancer_id = p_user),
      'projects', (select count(*) from public.projects where freelancer_id = p_user),
      'payments', (select count(*) from public.payments where freelancer_id = p_user))
  else jsonb_build_object(
      'job_posts', (select count(*) from public.job_posts where client_id = p_user),
      'bookings', (select count(*) from public.bookings where client_id = p_user),
      'projects', (select count(*) from public.projects where client_id = p_user),
      -- (a payment with a receipt picture stays, see the top)
      'payments', (select count(*) from public.payments where client_id = p_user and receipt_path is null),
      'reviews', (select count(*) from public.service_reviews where author_id = p_user))
  end;
$$;

-- A suspended, banned or archived account can't be split (a suspension
-- can't be escaped by moving the work to a fresh account).
create or replace function public.split_blocked(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.user_suspensions
                  where user_id = p_user and (ends_at is null or ends_at > now()))
      or exists (select 1 from public.archived_users where user_id = p_user);
$$;

revoke execute on function public.new_split_code() from public, anon, authenticated;
revoke execute on function public.split_side_counts(uuid, text) from public, anon, authenticated;
revoke execute on function public.split_blocked(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. What the website calls
-- ---------------------------------------------------------------------------

-- For the "Split your account" card: the other side's work on MY account,
-- my open code (if any), and where the work went last time.
create or replace function public.my_split_summary()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  my_role text;
  other_side text;
  counts jsonb;
  total int;
  open_split public.account_splits;
  last_done public.account_splits;
  moved_to text;
begin
  select account_type into my_role from public.profiles where id = me;
  if my_role is null then
    return null;
  end if;
  other_side := case when my_role = 'freelancer' then 'client' else 'freelancer' end;
  counts := public.split_side_counts(me, other_side);
  select coalesce(sum(value::int), 0) into total from jsonb_each_text(counts);

  select * into open_split from public.account_splits
    where from_user = me and done_at is null and expires_at > now()
    order by created_at desc limit 1;
  select * into last_done from public.account_splits
    where from_user = me and done_at is not null
    order by done_at desc limit 1;
  if last_done.to_user is not null then
    select username into moved_to from public.profiles where id = last_done.to_user;
  end if;

  return jsonb_build_object(
    'keep_side', my_role,
    'move_side', other_side,
    'counts', counts,
    'total', total,
    'code', open_split.code,
    'expires_at', open_split.expires_at,
    'moved_to', moved_to,
    'moved_at', last_done.done_at
  );
end;
$$;

-- Old account: makes (or shows again) the move code.
create or replace function public.start_account_split()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  summary jsonb := public.my_split_summary();
  new_code text;
  row_made public.account_splits;
begin
  if summary is null then
    raise exception 'Please sign in first.';
  end if;
  if (summary->>'total')::int = 0 then
    raise exception 'Your account has no % work to move.', summary->>'move_side';
  end if;
  if public.split_blocked(me) then
    raise exception 'A suspended, banned or archived account cannot be split.';
  end if;
  -- One open code at a time: show the same one again.
  if summary->>'code' is not null then
    return jsonb_build_object('code', summary->>'code', 'expires_at', summary->'expires_at');
  end if;

  loop
    new_code := public.new_split_code();
    exit when not exists (select 1 from public.account_splits where code = new_code);
  end loop;
  insert into public.account_splits (from_user, move_side, code)
    values (me, summary->>'move_side', new_code)
    returning * into row_made;
  return jsonb_build_object('code', row_made.code, 'expires_at', row_made.expires_at);
end;
$$;

-- New account: uses the code and moves the work (all or nothing).
create or replace function public.finish_account_split(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  my_role text;
  s public.account_splits;
  old_id uuid;
  moved_rows jsonb := '{}'::jsonb;
  n int;
begin
  if me is null then
    raise exception 'Please sign in first.';
  end if;
  -- Spaces, dashes and small letters typed by the person are ignored.
  select * into s from public.account_splits
    where code = upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g'))
    for update;
  if not found or s.done_at is not null or s.expires_at <= now() then
    raise exception 'That move code is wrong, already used or expired. Get a new code on your old account.';
  end if;
  if s.from_user = me then
    raise exception 'Enter this code on your NEW account, not on the account that made it.';
  end if;
  select account_type into my_role from public.profiles where id = me;
  if my_role is distinct from s.move_side then
    raise exception 'This code moves % work, so enter it on a % account.', s.move_side, initcap(s.move_side);
  end if;
  if public.split_blocked(me) or public.split_blocked(s.from_user) then
    raise exception 'A suspended, banned or archived account cannot be split.';
  end if;
  old_id := s.from_user;

  if s.move_side = 'freelancer' then
    -- Ratings on the projects that move (given by and to the freelancer),
    -- first, while the projects still point at the old account.
    update public.project_ratings set rater_id = me
      where rater_id = old_id and project_id in (select id from public.projects where freelancer_id = old_id and client_id <> me);
    get diagnostics n = row_count; moved_rows := moved_rows || jsonb_build_object('ratings_given', n);
    update public.project_ratings set ratee_id = me
      where ratee_id = old_id and project_id in (select id from public.projects where freelancer_id = old_id and client_id <> me);
    get diagnostics n = row_count; moved_rows := moved_rows || jsonb_build_object('ratings_received', n);

    update public.services set freelancer_id = me where freelancer_id = old_id;
    get diagnostics n = row_count; moved_rows := moved_rows || jsonb_build_object('offers', n);
    update public.portfolio_items set freelancer_id = me where freelancer_id = old_id;
    get diagnostics n = row_count; moved_rows := moved_rows || jsonb_build_object('portfolio', n);
    -- Applications: not for a job the new account already applied to.
    update public.job_applications ja set freelancer_id = me
      where ja.freelancer_id = old_id
        and ja.resume_path is null
        and not exists (select 1 from public.job_applications x where x.freelancer_id = me and x.job_post_id = ja.job_post_id);
    get diagnostics n = row_count; moved_rows := moved_rows || jsonb_build_object('applications', n);
    -- (never one where the new account is the other person: a project needs two people)
    update public.bookings set freelancer_id = me where freelancer_id = old_id and client_id <> me;
    get diagnostics n = row_count; moved_rows := moved_rows || jsonb_build_object('bookings', n);
    update public.projects set freelancer_id = me where freelancer_id = old_id and client_id <> me;
    get diagnostics n = row_count; moved_rows := moved_rows || jsonb_build_object('projects', n);
    update public.payments set freelancer_id = me where freelancer_id = old_id and client_id <> me;
    get diagnostics n = row_count; moved_rows := moved_rows || jsonb_build_object('payments', n);

    -- The pieces behind the portfolio and offers (slides, AI search data,
    -- watermark codes). Their files stay in the old account's folder; the
    -- public previews still show.
    update public.media_slides set freelancer_id = me where freelancer_id = old_id;
    update public.document_embeddings set freelancer_id = me where freelancer_id = old_id;
    update public.slide_embeddings set freelancer_id = me where freelancer_id = old_id;
    update public.style_embeddings set freelancer_id = me where freelancer_id = old_id;
    update public.watermark_codes set freelancer_id = me where freelancer_id = old_id;
    -- Site checks: not for a link the new account already checked.
    update public.site_verifications sv set freelancer_id = me
      where sv.freelancer_id = old_id
        and not exists (select 1 from public.site_verifications x where x.freelancer_id = me and x.link = sv.link);

    -- One-row settings: only when the new account has none yet.
    if not exists (select 1 from public.gcash_accounts where freelancer_id = me) then
      update public.gcash_accounts set freelancer_id = me where freelancer_id = old_id;
    end if;
    if not exists (select 1 from public.payment_details where freelancer_id = me) then
      update public.payment_details set freelancer_id = me where freelancer_id = old_id;
    end if;
    if not exists (select 1 from public.watermark_settings where freelancer_id = me) then
      update public.watermark_settings set freelancer_id = me where freelancer_id = old_id and picture_path is null;
    end if;
    -- Skills and portfolio links, when the new profile has none yet.
    update public.profiles np set
        skills = case when coalesce(cardinality(np.skills), 0) = 0 then op.skills else np.skills end,
        portfolio_links = case when coalesce(cardinality(np.portfolio_links), 0) = 0 then op.portfolio_links else np.portfolio_links end
      from public.profiles op
      where np.id = me and op.id = old_id;
  else
    update public.project_ratings set rater_id = me
      where rater_id = old_id and project_id in (select id from public.projects where client_id = old_id and freelancer_id <> me);
    get diagnostics n = row_count; moved_rows := moved_rows || jsonb_build_object('ratings_given', n);
    update public.project_ratings set ratee_id = me
      where ratee_id = old_id and project_id in (select id from public.projects where client_id = old_id and freelancer_id <> me);
    get diagnostics n = row_count; moved_rows := moved_rows || jsonb_build_object('ratings_received', n);

    update public.job_posts set client_id = me where client_id = old_id;
    get diagnostics n = row_count; moved_rows := moved_rows || jsonb_build_object('job_posts', n);
    update public.bookings set client_id = me where client_id = old_id and freelancer_id <> me;
    get diagnostics n = row_count; moved_rows := moved_rows || jsonb_build_object('bookings', n);
    update public.projects set client_id = me where client_id = old_id and freelancer_id <> me;
    get diagnostics n = row_count; moved_rows := moved_rows || jsonb_build_object('projects', n);
    update public.payments set client_id = me where client_id = old_id and freelancer_id <> me and receipt_path is null;
    get diagnostics n = row_count; moved_rows := moved_rows || jsonb_build_object('payments', n);
    update public.receipt_checks set client_id = me where client_id = old_id and receipt_path is null;
    -- Offer reviews: not for an offer the new account already reviewed.
    update public.service_reviews sr set author_id = me
      where sr.author_id = old_id
        and not exists (select 1 from public.service_reviews x where x.author_id = me and x.service_id = sr.service_id);
    get diagnostics n = row_count; moved_rows := moved_rows || jsonb_build_object('reviews', n);
  end if;

  update public.account_splits set to_user = me, done_at = now(), moved = moved_rows
    where id = s.id;
  return moved_rows;
end;
$$;

revoke execute on function public.my_split_summary() from public, anon;
revoke execute on function public.start_account_split() from public, anon;
revoke execute on function public.finish_account_split(text) from public, anon;
grant execute on function public.my_split_summary() to authenticated;
grant execute on function public.start_account_split() to authenticated;
grant execute on function public.finish_account_split(text) to authenticated;
