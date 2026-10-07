-- Blind ratings (see PLAN-blind-ratings.md). Run this in the Supabase SQL
-- Editor after supabase_projects_schema.sql (projects and ratings),
-- supabase_profiles_schema.sql (profile_stats, profile_history) and
-- supabase_ranking_records_schema.sql (ranking_records).
--
-- Feature 5, Profile transparency: a rating is more honest when it can't be
-- copied from, or answer back to, the other person's rating. So a rating
-- stays HIDDEN until both people on the project have rated, or until the
-- time for rating is over (14 days after the client marked it Done).
--
-- No new tables or columns. This file changes the two rules on
-- project_ratings, the notification a rating sends, and the four functions
-- that count ratings. Nothing here removes anything.

-- How long each side has to rate after the project is marked Done. This is
-- the one place to change the number (the website has the same number in
-- lib/projects.js, RATING_WINDOW_DAYS).
create or replace function public.rating_window()
returns interval
language sql
immutable
set search_path = public
as $$
  select interval '14 days';
$$;

revoke execute on function public.rating_window() from public, anon;
grant execute on function public.rating_window() to authenticated, service_role;

-- May the ratings on this project be shown yet? Yes when both sides have
-- rated, or when the time for rating is over.
-- It runs with the owner's rights (security definer) because the read rule
-- below calls it: a rule can't read its own table through itself, and the
-- count has to include the rating the caller isn't allowed to see yet. It
-- only ever answers yes or no.
create or replace function public.rating_is_visible(target_project uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    (select count(*) from public.project_ratings r where r.project_id = target_project) >= 2
    or exists (
      select 1 from public.projects p
      where p.id = target_project
        and p.completed_at <= now() - public.rating_window()
    );
$$;

revoke execute on function public.rating_is_visible(uuid) from public, anon;
grant execute on function public.rating_is_visible(uuid) to authenticated, service_role;

-- Read rule. Before: every signed-in user could read every rating. Now: you
-- can always read a rating you gave, and anyone's once it is visible.
alter policy "project_ratings: signed-in users can view"
  on public.project_ratings
  using (
    rater_id = (select auth.uid())
    or public.rating_is_visible(project_id)
  );

-- Insert rule. The same checks as before, plus one: the time for rating
-- must not be over. Without it someone could wait until the other rating
-- shows, read it, and then answer back.
alter policy "project_ratings: rate the other person once a project is done"
  on public.project_ratings
  with check (
    rater_id = (select auth.uid())
    and exists (
      select 1 from public.projects p
      where p.id = project_ratings.project_id
        and p.status = 'done'
        and p.completed_at > now() - public.rating_window()
        and (
          (p.client_id = auth.uid() and p.freelancer_id = project_ratings.ratee_id)
          or (p.freelancer_id = auth.uid() and p.client_id = project_ratings.ratee_id)
        )
    )
  );

-- The notification a rating sends to the person who was rated (it is also
-- what the offline email says). Before: always the stars and the feedback.
-- Now it depends on whether that person has rated too:
--   not yet -> only that a rating is waiting, and until when it stays hidden
--   yes     -> both have rated, so the ratings are visible: stars + feedback
create or replace function public.notify_project_rated()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  rater_name text;
  proj_title text;
  closes_on text;
  other_rated boolean;
begin
  select coalesce(nullif(full_name, ''), username, 'Someone') into rater_name
    from public.profiles where id = new.rater_id;
  -- The day rating closes, as a Philippine date like "October 21".
  select title, to_char((completed_at + public.rating_window()) at time zone 'Asia/Manila', 'FMMonth FMDD')
    into proj_title, closes_on
    from public.projects where id = new.project_id;
  -- Has the person being rated already rated this project themselves?
  select exists (
    select 1 from public.project_ratings r
    where r.project_id = new.project_id and r.rater_id = new.ratee_id
  ) into other_rated;

  if other_rated then
    insert into public.user_notifications (user_id, type, title, message, link)
    values (
      new.ratee_id, 'project_rated', 'You got a new rating',
      rater_name || ' rated you ' || new.stars || E'★ for "' || coalesce(proj_title, 'a project') || '".'
        || case when new.feedback is not null and btrim(new.feedback) <> '' then E'\n\n"' || new.feedback || '"' else '' end,
      '/dashboard/project-details/' || new.project_id
    );
  else
    insert into public.user_notifications (user_id, type, title, message, link)
    values (
      new.ratee_id, 'project_rated', 'A rating is waiting for you',
      rater_name || ' rated you for "' || coalesce(proj_title, 'a project') || '". It stays hidden until you rate them too'
        || coalesce(', or until ' || closes_on, '') || '.',
      '/dashboard/project-details/' || new.project_id
    );
  end if;
  return new;
end;
$$;

-- The four functions that count ratings. Each is the same as before with one
-- added line, "rating_is_visible", so a hidden rating counts nowhere.

-- The "★ 4.8 (5)" badge (first written in supabase_projects_schema.sql).
-- The added line is needed even though the read rule already hides other
-- people's ratings: the caller can read their own hidden rating, and without
-- it they would see an average nobody else sees.
create or replace function public.rating_summaries(ids uuid[])
returns table (user_id uuid, avg_stars numeric, rating_count integer)
language sql
stable
security invoker
set search_path = public
as $$
  select ratee_id, round(avg(stars)::numeric, 1), count(*)::integer
  from public.project_ratings
  where ratee_id = any(ids)
    and public.rating_is_visible(project_id)
  group by ratee_id;
$$;

-- The Performance box (first written in supabase_profiles_schema.sql).
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
      and public.rating_is_visible(r.project_id)
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

-- The Completed Projects list (first written in supabase_profiles_schema.sql).
-- A project whose rating is still hidden comes back with empty stars and
-- feedback, the same as one that was never rated, so nobody can tell them
-- apart.
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
   and public.rating_is_visible(r.project_id)
  where p.status = 'done'
    and ((as_role = 'freelancer' and p.freelancer_id = target)
      or (as_role = 'client' and p.client_id = target))
  order by p.completed_at desc
  limit least(greatest(coalesce(max_rows, 20), 1), 50);
end;
$$;

-- The AI ranking's numbers (first written in
-- supabase_ranking_records_schema.sql). The AI service itself doesn't change.
create or replace function public.ranking_records(post_ids uuid[])
returns table (post_id uuid, completed_count integer, rating_count integer, avg_stars numeric)
language sql
stable
security definer
set search_path = public
as $$
  with posts as (
    select s.id as pid, s.freelancer_id as owner_id, 'freelancer'::text as owner_role
    from public.services s
    where s.id = any(post_ids)
    union all
    select j.id, j.client_id, 'client'::text
    from public.job_posts j
    where j.id = any(post_ids)
  ),
  done as (
    -- Each post with the Done projects its owner did in the post's role.
    select p.pid, p.owner_id, pr.id as project_id
    from posts p
    join public.projects pr
      on pr.status = 'done'
     and ((p.owner_role = 'freelancer' and pr.freelancer_id = p.owner_id)
       or (p.owner_role = 'client' and pr.client_id = p.owner_id))
  ),
  received as (
    -- The visible ratings the owner received on those projects.
    select d.pid, r.stars
    from done d
    join public.project_ratings r
      on r.project_id = d.project_id and r.ratee_id = d.owner_id
     and public.rating_is_visible(r.project_id)
  )
  select p.pid,
         (select count(*) from done d where d.pid = p.pid)::integer,
         (select count(*) from received x where x.pid = p.pid)::integer,
         (select avg(x.stars)::numeric from received x where x.pid = p.pid)
  from posts p;
$$;
