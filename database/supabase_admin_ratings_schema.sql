-- Admin Overview: ratings and transactions. Plan: PLAN-overview-ratings.md.
-- Run this in the Supabase SQL Editor. It adds two functions and nothing else:
-- no table, and nothing existing is changed.
--
-- Like admin_stats() both are admin-only: anyone else gets an error.
-- Accounts that are archived are left out, the same as admin_stats(): a rating
-- or a booking or a project is not counted when either person on it is archived.

-- ---------------------------------------------------------------------------
-- admin_ratings(): the stars people were given, for freelancers and for clients.
-- A rating counts for the role the person had on that project (as the freelancer
-- or as the client), the same as the Performance box on a profile.
--   freelancers / clients   { count, average, stars }
--       count    how many ratings that kind of account received
--       average  the mean stars (2 decimals), or null when there are none
--       stars    five counts, for 1 star up to 5 stars
--   offers                  { count, average } for the stars clients gave an
--                           offer (service_reviews)
-- Project ratings are blind, so only ones that are already revealed count (both
-- sides rated, or the 14 days are over). That is the same rule the people on the
-- site follow, so the admin numbers never show something nobody could see yet.
-- ---------------------------------------------------------------------------
create or replace function public.admin_ratings()
returns json
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  result json;
begin
  if not public.is_admin() then
    raise exception 'Only admins can view stats.';
  end if;

  with shown as (
    -- Which list a rating goes in is the role the person had ON THAT PROJECT
    -- (the same as the Performance box on a profile), not their account type
    -- today, so a person who later switched account type keeps their ratings
    -- where they were earned.
    select r.stars,
           case when r.ratee_id = pr.freelancer_id then 'freelancer' else 'client' end as role
    from public.project_ratings r
    join public.projects pr on pr.id = r.project_id
    where public.rating_is_visible(r.project_id)
      and not exists (select 1 from public.archived_users a where a.user_id in (r.rater_id, r.ratee_id))
  ),
  by_kind as (
    select kind.role,
           count(s.stars) as total,
           round(avg(s.stars), 2) as average,
           json_build_array(
             count(*) filter (where s.stars = 1),
             count(*) filter (where s.stars = 2),
             count(*) filter (where s.stars = 3),
             count(*) filter (where s.stars = 4),
             count(*) filter (where s.stars = 5)
           ) as stars
    from (values ('freelancer'), ('client')) as kind(role)
    left join shown s on s.role = kind.role
    group by kind.role
  ),
  offer_reviews as (
    select count(*) as total, round(avg(v.stars), 2) as average
    from public.service_reviews v
    join public.services sv on sv.id = v.service_id
    where not exists (select 1 from public.archived_users a where a.user_id in (v.author_id, sv.freelancer_id))
  )
  select json_build_object(
           'freelancers', (select json_build_object('count', total, 'average', average, 'stars', stars)
                           from by_kind where role = 'freelancer'),
           'clients',     (select json_build_object('count', total, 'average', average, 'stars', stars)
                           from by_kind where role = 'client'),
           'offers',      (select json_build_object('count', total, 'average', average) from offer_reviews)
         )
  into result;

  return result;
end;
$$;

revoke execute on function public.admin_ratings() from public, anon;
grant execute on function public.admin_ratings() to authenticated;

-- ---------------------------------------------------------------------------
-- admin_transactions(): where the work stands today. Payments are not built, so
-- these are the two records that exist: bookings (a client asks for an offer)
-- and projects (the work itself). Each is a count per status.
--   bookings   { pending, accepted, declined, cancelled }
--   projects   { started, submitted, done }
-- ---------------------------------------------------------------------------
create or replace function public.admin_transactions()
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
    'bookings', (
      select json_build_object(
               'pending',   count(*) filter (where b.status = 'pending'),
               'accepted',  count(*) filter (where b.status = 'accepted'),
               'declined',  count(*) filter (where b.status = 'declined'),
               'cancelled', count(*) filter (where b.status = 'cancelled'))
      from public.bookings b
      where not exists (select 1 from public.archived_users a where a.user_id in (b.client_id, b.freelancer_id))
    ),
    'projects', (
      select json_build_object(
               'started',   count(*) filter (where p.status = 'started'),
               'submitted', count(*) filter (where p.status = 'submitted'),
               'done',      count(*) filter (where p.status = 'done'))
      from public.projects p
      where not exists (select 1 from public.archived_users a where a.user_id in (p.client_id, p.freelancer_id))
    )
  );
end;
$$;

revoke execute on function public.admin_transactions() from public, anon;
grant execute on function public.admin_transactions() to authenticated;

-- ---------------------------------------------------------------------------
-- admin_top_rated(p_limit): who is outstanding. The best rated freelancers and
-- the best rated clients, each a list (best first) of
--   { id, full_name, username, avatar_path, average, count }
-- Ranked by average stars, then by how many ratings it comes from, then by name.
-- The same rules as admin_ratings(): only revealed ratings count, a rating goes
-- to the role the person had on that project, and ratings by or about an
-- archived person are left out. p_limit is kept between 1 and 20 (the page asks
-- for 5). A person can be on both lists (a rating as a freelancer and another as
-- a client), each with only the ratings of that role.
-- ---------------------------------------------------------------------------
create or replace function public.admin_top_rated(p_limit integer default 5)
returns json
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  n      integer := least(greatest(coalesce(p_limit, 5), 1), 20);
  result json;
begin
  if not public.is_admin() then
    raise exception 'Only admins can view stats.';
  end if;

  with shown as (
    select r.ratee_id, r.stars,
           case when r.ratee_id = pr.freelancer_id then 'freelancer' else 'client' end as role
    from public.project_ratings r
    join public.projects pr on pr.id = r.project_id
    where public.rating_is_visible(r.project_id)
      and not exists (select 1 from public.archived_users a where a.user_id in (r.rater_id, r.ratee_id))
  ),
  per_person as (
    select s.ratee_id, s.role, round(avg(s.stars), 2) as average, count(*) as total
    from shown s
    group by s.ratee_id, s.role
  ),
  ranked as (
    select pp.role, pp.average, pp.total, p.id, p.full_name, p.username, p.avatar_path,
           row_number() over (partition by pp.role order by pp.average desc, pp.total desc, p.full_name) as place
    from per_person pp
    join public.profiles p on p.id = pp.ratee_id
  )
  select json_build_object(
           'freelancers', coalesce((select json_agg(json_build_object(
                                'id', id, 'full_name', full_name, 'username', username,
                                'avatar_path', avatar_path, 'average', average, 'count', total) order by place)
                              from ranked where role = 'freelancer' and place <= n), '[]'::json),
           'clients',     coalesce((select json_agg(json_build_object(
                                'id', id, 'full_name', full_name, 'username', username,
                                'avatar_path', avatar_path, 'average', average, 'count', total) order by place)
                              from ranked where role = 'client' and place <= n), '[]'::json)
         )
  into result;

  return result;
end;
$$;

revoke execute on function public.admin_top_rated(integer) from public, anon;
grant execute on function public.admin_top_rated(integer) to authenticated;
