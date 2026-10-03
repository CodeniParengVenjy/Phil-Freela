-- Real Profiles (see PLAN-real-profiles.md). Run this in the Supabase SQL
-- Editor after supabase_projects_schema.sql (projects and ratings) and
-- supabase_chat_schema.sql (the chats the response time is read from).
--
-- Feature 5, Profile transparency and transaction history: the numbers a
-- profile shows (completed projects, on-time delivery, average rating,
-- response time, member since) and the list of completed projects, worked out
-- from the real records. "Completed" means the client marked the project
-- Done; no money is involved anywhere.
--
-- The three functions below run with extra privilege, because other people's
-- projects and chats are private: the browser can't read them. They only give
-- back numbers and details that are safe to show every signed-in user (never a
-- project's note, files, links or due date, and never a message's text).

-- ---------------------------------------------------------------------------
-- Step 1: the numbers and the completed-projects list.
-- ---------------------------------------------------------------------------

-- How long the person usually waits before replying in a chat: the median, in
-- minutes, over the last 30 days. Each time someone starts writing to them
-- (the first message after their own last one), it counts how long until
-- their next message in that chat. A message still unanswered after a day
-- counts as a very long wait (100000 minutes); a newer one isn't counted yet.
-- Call lines ("Video call, 3:12") aren't messages from a person, so they are
-- left out. Empty when there is nothing to measure.
-- This is the same measure "Recommended for you" uses (ranking_signals in
-- supabase_recommendations_schema.sql), for one person, so the profile and
-- the ranking agree.
create or replace function public.typical_reply_minutes(target uuid)
returns real
language sql
stable
security definer
set search_path = public
as $$
  with msgs as (
    select m.conversation_id, m.sender_id, m.created_at,
           lag(m.sender_id) over (partition by m.conversation_id order by m.created_at) as previous_sender
    from public.conversations c
    join public.messages m on m.conversation_id = c.id
    where target in (c.user_a, c.user_b)
      and m.created_at > now() - interval '30 days'
      and m.call_id is null
  ),
  waits as (
    select coalesce(
             extract(epoch from (
               (select min(r.created_at) from msgs r
                 where r.conversation_id = q.conversation_id
                   and r.sender_id = target
                   and r.created_at > q.created_at)
               - q.created_at)) / 60,
             case when q.created_at < now() - interval '1 day' then 100000 end
           ) as minutes
    from msgs q
    where q.sender_id <> target and q.previous_sender is distinct from q.sender_id
  )
  select (percentile_cont(0.5) within group (order by w.minutes))::real
  from waits w
  where w.minutes is not null;
$$;

-- Only the other functions here (and later the AI service's ranking) use it.
revoke execute on function public.typical_reply_minutes(uuid) from public, anon, authenticated;
grant execute on function public.typical_reply_minutes(uuid) to service_role;

-- The Performance box for one person in one role. as_role is 'freelancer'
-- (projects where they were the freelancer) or 'client' (where they were the
-- client); only projects marked Done count. Returns one row:
--   completed_count  how many were marked Done
--   on_time_count    of those, how many had their final submission on or
--                    before the due date (Philippine date). Freelancers only;
--                    empty for clients, who don't deliver anything.
--   avg_stars        the average stars they received on those projects (one
--                    decimal), and rating_count how many ratings
--   reply_minutes    the typical wait before replying (see above)
--   listing_count    services posted (freelancer) or job posts (client)
--   member_since     when the account was made. This reads the login system's
--                    own date, not profiles.created_at: users are allowed to
--                    update their own profile row, including that date.
create or replace function public.profile_stats(target uuid, as_role text)
returns table (
  completed_count integer,
  on_time_count integer,
  avg_stars numeric,
  rating_count integer,
  reply_minutes real,
  listing_count integer,
  member_since timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if as_role is null or as_role not in ('freelancer', 'client') then
    raise exception 'The role must be freelancer or client.';
  end if;

  return query
  with done as (
    select p.id, p.due_date, p.submitted_at
    from public.projects p
    where p.status = 'done'
      and ((as_role = 'freelancer' and p.freelancer_id = target)
        or (as_role = 'client' and p.client_id = target))
  ),
  received as (
    select r.stars
    from public.project_ratings r
    join done d on d.id = r.project_id
    where r.ratee_id = target
  )
  select
    (select count(*) from done)::integer,
    case when as_role = 'freelancer' then
      (select count(*) from done d
        where d.submitted_at is not null
          and (d.submitted_at at time zone 'Asia/Manila')::date <= d.due_date)::integer
    end,
    (select round(avg(x.stars)::numeric, 1) from received x),
    (select count(*) from received)::integer,
    public.typical_reply_minutes(target),
    (case when as_role = 'freelancer'
       then (select count(*) from public.services s where s.freelancer_id = target)
       else (select count(*) from public.job_posts j where j.client_id = target)
     end)::integer,
    (select u.created_at from auth.users u where u.id = target);
end;
$$;

revoke execute on function public.profile_stats(uuid, text) from public, anon;
grant execute on function public.profile_stats(uuid, text) to authenticated;

-- The Completed projects list for one person in one role, newest first (up to
-- max_rows, never more than 50). Each row: the project's title, when it was
-- finished, the other person (so the page can show and link them), and the
-- stars and feedback this person received for it (empty if not rated yet).
-- project_id is only filled in when the caller is one of the two people on
-- that project, so on your own page a row can open its project, and for
-- everyone else it stays empty. The project's note, due date, files and
-- links are never returned.
create or replace function public.profile_history(target uuid, as_role text, max_rows integer default 20)
returns table (
  project_id uuid,
  title text,
  completed_at timestamptz,
  other_id uuid,
  other_name text,
  other_username text,
  other_avatar_path text,
  other_account_type text,
  stars smallint,
  feedback text
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if as_role is null or as_role not in ('freelancer', 'client') then
    raise exception 'The role must be freelancer or client.';
  end if;

  return query
  select
    case when auth.uid() in (p.client_id, p.freelancer_id) then p.id end,
    p.title::text,
    p.completed_at,
    o.id,
    o.full_name::text,
    o.username::text,
    o.avatar_path,
    o.account_type::text,
    r.stars,
    r.feedback
  from public.projects p
  join public.profiles o
    on o.id = case when as_role = 'freelancer' then p.client_id else p.freelancer_id end
  left join public.project_ratings r
    on r.project_id = p.id and r.ratee_id = target
  where p.status = 'done'
    and ((as_role = 'freelancer' and p.freelancer_id = target)
      or (as_role = 'client' and p.client_id = target))
  order by p.completed_at desc
  limit least(greatest(coalesce(max_rows, 20), 1), 50);
end;
$$;

revoke execute on function public.profile_history(uuid, text, integer) from public, anon;
grant execute on function public.profile_history(uuid, text, integer) to authenticated;

-- ---------------------------------------------------------------------------
-- Step 4: Skills on a profile.
-- ---------------------------------------------------------------------------

-- A freelancer's skills, shown as chips on their Profile and on their public
-- page. The same rule as a job post's required skills (is_valid_skill_list in
-- supabase_projects_schema.sql): up to 10 skills, each 1 to 40 characters
-- with no spaces around it. Users can already update their own profile row,
-- and every signed-in user can already read profiles, so no new rules are
-- needed. Empty = no skills yet.
alter table public.profiles
  add column skills text[] not null default '{}'
  constraint profiles_skills_check check (public.is_valid_skill_list(skills));
