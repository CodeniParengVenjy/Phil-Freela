-- AI Moodboard Matching (PLAN-moodboard-matching.md): feature 2 in
-- PhilFreela-System-Functions.md. A client uploads a reference image; the
-- Python AI service turns it into CLIP numbers and asks this database for
-- the freelancers whose portfolio work looks closest to it.
--
-- Run this in the Supabase SQL Editor after supabase_slides_schema.sql,
-- supabase_portfolio_schema.sql and supabase_admin_schema.sql (uses
-- is_verified()). pgvector is already on.

-- ---------------------------------------------------------------------------
-- The visual style numbers of each image slide
-- ---------------------------------------------------------------------------

create table public.style_embeddings (
  slide_id uuid primary key references public.media_slides (id) on delete cascade,
  freelancer_id uuid not null references public.profiles (id) on delete cascade,
  -- CLIP's image embedding (openai/clip-vit-base-patch32's vision half):
  -- 512 numbers describing a picture's visual style, not its subject.
  embedding extensions.vector(512) not null,
  created_at timestamptz not null default now()
);

create index style_embeddings_freelancer_id_idx on public.style_embeddings (freelancer_id);

-- Finds the closest numbers quickly, even with many slides (same kind of
-- index as the copy check's and the search box's).
create index style_embeddings_embedding_idx
  on public.style_embeddings using hnsw (embedding extensions.vector_cosine_ops);

-- Only the AI service (service role) reads and writes it: no rules for
-- signed-in users. The website loads slides and profiles itself, under
-- their own rules.
alter table public.style_embeddings enable row level security;

-- ---------------------------------------------------------------------------
-- What the AI service uses
-- ---------------------------------------------------------------------------

-- Active image slides from verified freelancers with no numbers yet. Videos,
-- flagged slides and unverified freelancers' work never get numbers, so they
-- can never be recommended.
create or replace function public.slides_to_embed(max_rows int default 100)
returns table (slide_id uuid, freelancer_id uuid, file_path text)
language sql
stable
set search_path = public
as $$
  select s.id, s.freelancer_id, s.file_path
  from public.media_slides s
  left join public.style_embeddings e on e.slide_id = s.id
  where e.slide_id is null
    and s.media_type = 'image'
    and s.status = 'active'
    and public.is_verified(s.freelancer_id)
  limit max_rows;
$$;

-- The closest slides to the reference image's numbers, one row per
-- freelancer (their single best-matching image), best freelancer first:
-- freelancers are ranked by their strongest match, not an average of their
-- whole portfolio.
create or replace function public.closest_styles(query extensions.vector, how_many int default 12)
returns table (freelancer_id uuid, slide_id uuid, similarity real)
language sql
stable
set search_path = public, extensions
as $$
  select freelancer_id, slide_id, similarity
  from (
    select distinct on (e.freelancer_id)
           e.freelancer_id, e.slide_id, (1 - (e.embedding <=> query))::real as similarity
    from public.style_embeddings e
    order by e.freelancer_id, e.embedding <=> query
  ) best_per_freelancer
  order by similarity desc
  limit how_many;
$$;

-- Only the AI service may use them.
revoke execute on function public.slides_to_embed(int) from public, anon, authenticated;
revoke execute on function public.closest_styles(extensions.vector, int) from public, anon, authenticated;
grant execute on function public.slides_to_embed(int) to service_role;
grant execute on function public.closest_styles(extensions.vector, int) to service_role;

-- Portfolio project images (unlike services) stay visible even from an
-- unverified freelancer, so moodboard matching's own "verified only" rule
-- (slides_to_embed) is the real gate, not the database's row visibility
-- rules. A slide's numbers are useless once the freelancer stops being
-- verified (a lapsed or revoked review), so they're cleared on any change to
-- that freelancer's verification, checking the current truth rather than
-- guessing from old/new values (works the same for an insert, update, or a
-- rejected review being deleted). The next search's catch-up re-adds them if
-- they're verified again.
create or replace function public.clear_style_embeddings_if_unverified()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target uuid := coalesce(new.user_id, old.user_id);
begin
  if not public.is_verified(target) then
    delete from public.style_embeddings where freelancer_id = target;
  end if;
  return coalesce(new, old);
end;
$$;

revoke execute on function public.clear_style_embeddings_if_unverified() from public, anon, authenticated;

create trigger identity_verifications_clear_style
  after insert or update or delete on public.identity_verifications
  for each row execute function public.clear_style_embeddings_if_unverified();
