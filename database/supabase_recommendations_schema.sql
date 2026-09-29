-- "Recommended for you" (PLAN-hybrid-recommendation.md, Part 2): the
-- collaborative filtering and ranking parts of PhilFreela's Hybrid
-- recommendation system (feature 1 in PhilFreela-System-Functions.md).
-- Run this in the Supabase SQL Editor after supabase_search_schema.sql and
-- supabase_applications_schema.sql.
--
-- The Python AI service (ai-service/recommendations.py) calls these
-- functions, scores the candidates they return, and sends the website only
-- post ids. Everything here is for the service role only.

-- ---------------------------------------------------------------------------
-- Profile descriptions' meaning numbers (content-based filtering)
-- ---------------------------------------------------------------------------

-- Same model and numbers as the posts' (listing_embeddings), so a profile
-- description can be compared with job posts and services directly.
create table public.profile_embeddings (
  profile_id uuid primary key references public.profiles (id) on delete cascade,
  embedding extensions.vector(384) not null,
  -- Fingerprint of the description the numbers were made from; numbers of an
  -- old description are simply not used (see content_candidates).
  text_hash text not null,
  updated_at timestamptz not null default now()
);

alter table public.profile_embeddings enable row level security;

-- Profile descriptions without numbers yet, or changed since.
create or replace function public.profiles_to_embed(max_rows int default 200)
returns table (profile_id uuid, description text, text_hash text)
language sql
stable
set search_path = public
as $$
  select p.id, p.description, md5(p.description)
  from public.profiles p
  left join public.profile_embeddings e on e.profile_id = p.id
  where coalesce(btrim(p.description), '') <> ''
    and (e.profile_id is null or e.text_hash <> md5(p.description))
  limit max_rows;
$$;

-- ---------------------------------------------------------------------------
-- Who showed interest in what (collaborative filtering)
-- ---------------------------------------------------------------------------

-- (user, post) pairs for one kind of post (want = 'services' or 'jobs'):
--   services: the user messaged the service's freelancer;
--   jobs: the user applied to the job, or messaged the job's client.
-- Only these deliberate actions count; page views aren't tracked.
create or replace function public.recommendation_interactions(want text)
returns table (user_id uuid, post_id uuid)
language sql
stable
set search_path = public
as $$
  with contacted as (
    select distinct m.sender_id as user_id,
           case when c.user_a = m.sender_id then c.user_b else c.user_a end as other_id
    from public.messages m
    join public.conversations c on c.id = m.conversation_id
    where m.call_id is null
  )
  select ct.user_id, s.id from contacted ct join public.services s on s.freelancer_id = ct.other_id where want = 'services'
  union
  select ct.user_id, j.id from contacted ct join public.job_posts j on j.client_id = ct.other_id where want = 'jobs'
  union
  select a.freelancer_id, a.job_post_id from public.job_applications a where want = 'jobs';
$$;

-- ---------------------------------------------------------------------------
-- Candidates
-- ---------------------------------------------------------------------------

-- Content-based filtering: the user's "taste" is the average of the meaning
-- numbers of their profile description, their own posts (a freelancer's
-- services, a client's job posts) and the jobs a freelancer applied to. The
-- posts of the wanted kind closest to it come back with their similarity
-- (1 = same meaning). Their own posts and posts they already acted on are
-- left out.
create or replace function public.content_candidates(target_user uuid, want text, how_many int default 100)
returns table (post_id uuid, similarity real)
language sql
stable
set search_path = public, extensions
as $$
  with taste_parts as (
    select e.embedding
    from public.profile_embeddings e
    join public.profiles p on p.id = e.profile_id
    where e.profile_id = target_user and e.text_hash = md5(coalesce(p.description, ''))
    union all
    select e.embedding
    from public.listing_embeddings e
    where (want = 'jobs' and e.service_id in (select id from public.services where freelancer_id = target_user))
       or (want = 'services' and e.job_post_id in (select id from public.job_posts where client_id = target_user))
    union all
    select e.embedding
    from public.listing_embeddings e
    where want = 'jobs' and e.job_post_id in (select a.job_post_id from public.job_applications a where a.freelancer_id = target_user)
  ),
  taste as (select avg(embedding) as v from taste_parts),
  acted_on as (select r.post_id from public.recommendation_interactions(want) r where r.user_id = target_user),
  -- "materialized": every post is compared (exact), instead of the index's
  -- shortcut, which could skip posts of the wanted kind.
  scored as materialized (
    select coalesce(e.service_id, e.job_post_id) as post_id, e.embedding <=> t.v as distance
    from public.listing_embeddings e
    cross join taste t
    where t.v is not null
      and case when want = 'jobs'
            then e.job_post_id is not null
                 and e.job_post_id not in (select id from public.job_posts where client_id = target_user)
            else e.service_id is not null
                 and e.service_id not in (select id from public.services where freelancer_id = target_user)
          end
  )
  select s.post_id, (1 - s.distance)::real
  from scored s
  where s.post_id not in (select post_id from acted_on)
  order by s.distance
  limit how_many;
$$;

-- Collaborative filtering (user-based): other users whose choices overlap
-- with this user's, by Jaccard similarity (posts both chose, divided by all
-- posts either chose). Their other choices come back, scored by the sum of
-- those similarities ("people like you chose this").
create or replace function public.collaborative_candidates(target_user uuid, want text, how_many int default 100)
returns table (post_id uuid, score real)
language sql
stable
set search_path = public
as $$
  with interactions as (select * from public.recommendation_interactions(want)),
  mine as (select i.post_id from interactions i where i.user_id = target_user),
  neighbours as (
    select i.user_id,
           count(*) filter (where i.post_id in (select post_id from mine))::real
             / (count(*) + (select count(*) from mine) - count(*) filter (where i.post_id in (select post_id from mine))) as similarity
    from interactions i
    where i.user_id <> target_user
    group by i.user_id
  ),
  own_posts as (
    select id from public.services where freelancer_id = target_user and want = 'services'
    union all
    select id from public.job_posts where client_id = target_user and want = 'jobs'
  )
  select i.post_id, sum(n.similarity)::real
  from interactions i
  join neighbours n on n.user_id = i.user_id and n.similarity > 0
  where i.post_id not in (select post_id from mine)
    and i.post_id not in (select id from own_posts)
  group by i.post_id
  order by 2 desc
  limit how_many;
$$;

-- ---------------------------------------------------------------------------
-- Ranking signals
-- ---------------------------------------------------------------------------

-- What the ranking needs for each candidate post: its owner, whether the
-- owner's identity is verified, the owner's typical (median) wait in minutes
-- before replying over the last 30 days, and when the post was made. A reply
-- still missing after a day counts as a very long wait.
create or replace function public.ranking_signals(post_ids uuid[])
returns table (post_id uuid, kind text, owner_id uuid, owner_verified boolean, reply_minutes real, created_at timestamptz)
language sql
stable
set search_path = public
as $$
  with posts as (
    select s.id, 'service'::text as kind, s.freelancer_id as owner_id, s.created_at
    from public.services s where s.id = any(post_ids)
    union all
    select j.id, 'job'::text, j.client_id, j.created_at
    from public.job_posts j where j.id = any(post_ids)
  ),
  owner_messages as (
    select o.owner_id, m.conversation_id, m.sender_id, m.created_at,
           lag(m.sender_id) over (partition by o.owner_id, m.conversation_id order by m.created_at) as previous_sender
    from (select distinct owner_id from posts) o
    join public.conversations c on o.owner_id in (c.user_a, c.user_b)
    join public.messages m on m.conversation_id = c.id
    where m.created_at > now() - interval '30 days' and m.call_id is null
  ),
  waits as (
    -- Each time someone starts writing to the owner, how long until the
    -- owner's next message in that chat.
    select q.owner_id,
           coalesce(
             extract(epoch from (
               (select min(r.created_at) from owner_messages r
                where r.owner_id = q.owner_id and r.conversation_id = q.conversation_id
                  and r.sender_id = q.owner_id and r.created_at > q.created_at)
               - q.created_at)) / 60,
             case when q.created_at < now() - interval '1 day' then 100000 end
           ) as minutes
    from owner_messages q
    where q.sender_id <> q.owner_id and q.previous_sender is distinct from q.sender_id
  )
  select p.id, p.kind, p.owner_id, public.is_verified(p.owner_id),
         (select percentile_cont(0.5) within group (order by w.minutes)
          from waits w where w.owner_id = p.owner_id and w.minutes is not null)::real,
         p.created_at
  from posts p;
$$;

-- Only the AI service may use them.
revoke execute on function public.profiles_to_embed(int) from public, anon, authenticated;
revoke execute on function public.recommendation_interactions(text) from public, anon, authenticated;
revoke execute on function public.content_candidates(uuid, text, int) from public, anon, authenticated;
revoke execute on function public.collaborative_candidates(uuid, text, int) from public, anon, authenticated;
revoke execute on function public.ranking_signals(uuid[]) from public, anon, authenticated;
grant execute on function public.profiles_to_embed(int) to service_role;
grant execute on function public.recommendation_interactions(text) to service_role;
grant execute on function public.content_candidates(uuid, text, int) to service_role;
grant execute on function public.collaborative_candidates(uuid, text, int) to service_role;
grant execute on function public.ranking_signals(uuid[]) to service_role;
