-- AI search box (PLAN-hard-features.md, Step 1). Run this in the Supabase SQL
-- Editor after supabase_marketplace_schema.sql. It is the content-based
-- filtering part of PhilFreela's Hybrid recommendation system (feature 1 in
-- PhilFreela-System-Functions.md).
--
-- The Python AI service turns each service's and job post's text into 384
-- numbers that capture its meaning (all-MiniLM-L6-v2, see
-- ai-service/listing_search.py) and saves them here. A search turns the typed
-- words into numbers the same way and asks for the closest posts. pgvector is
-- already turned on (the watermarking copy check uses it too).

-- ---------------------------------------------------------------------------
-- The meaning numbers of each post
-- ---------------------------------------------------------------------------

create table public.listing_embeddings (
  id uuid primary key default gen_random_uuid(),
  -- Exactly one of the two: the service or the job post. The row is deleted
  -- together with its post.
  service_id uuid unique references public.services (id) on delete cascade,
  job_post_id uuid unique references public.job_posts (id) on delete cascade,
  embedding extensions.vector(384) not null,
  -- A fingerprint of the text the numbers were made from, so a post whose
  -- text changes gets new numbers.
  text_hash text not null,
  updated_at timestamptz not null default now(),
  constraint listing_embeddings_one_post check ((service_id is null) <> (job_post_id is null))
);

-- Finds the closest numbers quickly, even with many posts (same kind of index
-- as the copy check's).
create index listing_embeddings_embedding_idx
  on public.listing_embeddings using hnsw (embedding extensions.vector_cosine_ops);

-- Only the AI service (service role) reads and writes it: no rules for
-- signed-in users. The website loads the posts themselves from services and
-- job_posts, under their own rules.
alter table public.listing_embeddings enable row level security;

-- ---------------------------------------------------------------------------
-- What the AI service uses
-- ---------------------------------------------------------------------------

-- Posts that need (new) numbers: never done yet, or their text changed. The
-- AI service calls this before each search, so nothing has to happen when a
-- post is saved.
create or replace function public.listings_to_embed(max_rows int default 200)
returns table (kind text, post_id uuid, title text, category text, skill text, description text, text_hash text)
language sql
stable
set search_path = public
as $$
  select * from (
    select 'service'::text as kind, s.id as post_id, s.title::text, s.category, s.skill, s.description,
           md5(concat_ws('|', s.title, s.category, s.skill, s.description)) as text_hash
    from public.services s
    left join public.listing_embeddings e on e.service_id = s.id
    where e.id is null
       or e.text_hash <> md5(concat_ws('|', s.title, s.category, s.skill, s.description))
    union all
    select 'job'::text, j.id, j.title::text, j.category, null::text, j.description,
           md5(concat_ws('|', j.title, j.category, j.description))
    from public.job_posts j
    left join public.listing_embeddings e on e.job_post_id = j.id
    where e.id is null
       or e.text_hash <> md5(concat_ws('|', j.title, j.category, j.description))
  ) todo
  limit max_rows;
$$;

-- The posts whose numbers are closest to the search's, best first.
-- similarity: 1 = same meaning, 0 = unrelated (1 minus the cosine distance).
create or replace function public.closest_listings(query extensions.vector, how_many int default 30)
returns table (kind text, post_id uuid, similarity real)
language sql
stable
set search_path = public, extensions
as $$
  select case when e.service_id is not null then 'service' else 'job' end,
         coalesce(e.service_id, e.job_post_id),
         (1 - (e.embedding <=> query))::real
  from public.listing_embeddings e
  order by e.embedding <=> query
  limit how_many;
$$;

-- Only the AI service may use them.
revoke execute on function public.listings_to_embed(int) from public, anon, authenticated;
revoke execute on function public.closest_listings(extensions.vector, int) from public, anon, authenticated;
grant execute on function public.listings_to_embed(int) to service_role;
grant execute on function public.closest_listings(extensions.vector, int) to service_role;
