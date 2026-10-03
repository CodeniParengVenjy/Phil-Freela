-- Ranking with real records (see PLAN-ranking-real-records.md). Run this in
-- the Supabase SQL Editor after supabase_marketplace_schema.sql (services and
-- job posts) and supabase_projects_schema.sql (projects and ratings).
--
-- Feature 1, the ranking / scoring algorithm of the Hybrid recommendation
-- system: besides how well a post matches and how fast its owner replies
-- (ranking_signals, in supabase_recommendations_schema.sql), the paper ranks
-- by credibility and performance: ratings and completed projects. This gives
-- the AI service those two numbers for each candidate post's owner.
--
-- It is the same record a person's profile shows (profile_stats in
-- supabase_profiles_schema.sql): only projects the client marked Done count,
-- and only the ratings on them, in the role the post is for. A service's
-- owner is judged as a freelancer; a job post's owner is judged as a client,
-- even for someone who has been both.

-- For each post (a service or a job post) among post_ids: the owner's number
-- of completed projects, how many ratings they received on them, and the
-- average stars (not rounded; the AI service smooths it). An owner with no
-- record gets 0, 0 and no average. Ids that aren't posts give no row.
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
    -- The ratings the owner received on those projects.
    select d.pid, r.stars
    from done d
    join public.project_ratings r
      on r.project_id = d.project_id and r.ratee_id = d.owner_id
  )
  select p.pid,
         (select count(*) from done d where d.pid = p.pid)::integer,
         (select count(*) from received x where x.pid = p.pid)::integer,
         (select avg(x.stars)::numeric from received x where x.pid = p.pid)
  from posts p;
$$;

-- Only the AI service may use it (like the other ranking functions).
revoke execute on function public.ranking_records(uuid[]) from public, anon, authenticated;
grant execute on function public.ranking_records(uuid[]) to service_role;
