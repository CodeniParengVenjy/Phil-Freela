-- Copy check (watermarking system, step 5). Run this in the Supabase SQL
-- Editor after supabase_ownership_schema.sql.
--
-- When a freelancer uploads a photo, the Python AI service turns it into 384
-- numbers with a Vision Transformer (ViT, Meta's pretrained DINO ViT-S/16);
-- copies of the same picture get almost the same numbers. If a new photo is
-- nearly the same as another freelancer's, it's flagged: hidden from everyone
-- but its uploader and the admins until an admin reviews it on the Flagged
-- Content page.

-- pgvector: stores lists of numbers and finds the closest ones quickly.
create extension if not exists vector with schema extensions;

-- ---------------------------------------------------------------------------
-- Each photo's numbers (private: no rules below = only the AI service can
-- read or write them)
-- ---------------------------------------------------------------------------

-- Two per photo: as it was uploaded, and as it's shown (with the owner's
-- visible watermark), because a copy is usually a screenshot of the shown one.
create table public.slide_embeddings (
  slide_id uuid not null references public.media_slides (id) on delete cascade,
  version text not null check (version in ('uploaded', 'shown')),
  freelancer_id uuid not null references public.profiles (id) on delete cascade,
  embedding extensions.vector(384) not null,
  created_at timestamptz not null default now(),
  primary key (slide_id, version)
);

alter table public.slide_embeddings enable row level security;

-- Makes "find the closest photos" fast even with many photos.
create index slide_embeddings_embedding_idx
  on public.slide_embeddings using hnsw (embedding extensions.vector_cosine_ops);

-- ---------------------------------------------------------------------------
-- Flagged photos
-- ---------------------------------------------------------------------------

-- status: 'active' (shown), or 'flagged' (nearly the same as another
-- freelancer's photo: hidden until an admin reviews it).
-- matched_slide_id / match_score: the photo it matched and how similar they
-- are (1.0 = identical).
alter table public.media_slides
  add column status text not null default 'active' check (status in ('active', 'flagged')),
  add column matched_slide_id uuid references public.media_slides (id) on delete set null,
  add column match_score real;

-- Flagged photos are only visible to their uploader and the admins.
drop policy "media_slides: visible with their service or project" on public.media_slides;

create policy "media_slides: visible with their service or project"
  on public.media_slides for select
  to authenticated
  using (
    (status = 'active' or freelancer_id = auth.uid() or public.is_admin())
    and (
      exists (select 1 from public.services s where s.id = media_slides.service_id)
      or exists (select 1 from public.portfolio_items p where p.id = media_slides.portfolio_item_id)
    )
  );

-- Admins mark a flagged photo as fine ("Looks fine" on the Flagged Content
-- page); removing it uses the existing delete rules.
create policy "media_slides: admins can review"
  on public.media_slides for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- Finding the most similar photos
-- ---------------------------------------------------------------------------

-- The photos (of other freelancers) closest to the given numbers, most
-- similar first. similarity = 1 - cosine distance (1.0 = identical). A photo
-- can appear twice (its uploaded and shown versions). Photos still waiting
-- for review are left out, so a flagged copy can't get the real owner's next
-- upload flagged too.
create or replace function public.closest_slide_embeddings(query extensions.vector(384), exclude_freelancer uuid, how_many int default 3)
returns table (slide_id uuid, freelancer_id uuid, similarity real)
language sql
stable
set search_path = public, extensions
as $$
  select e.slide_id, e.freelancer_id, (1 - (e.embedding <=> query))::real as similarity
  from public.slide_embeddings e
  join public.media_slides s on s.id = e.slide_id
  where e.freelancer_id <> exclude_freelancer and s.status = 'active'
  order by e.embedding <=> query
  limit how_many;
$$;

-- Only the AI service may use it.
revoke execute on function public.closest_slide_embeddings(extensions.vector, uuid, int) from public, anon, authenticated;
grant execute on function public.closest_slide_embeddings(extensions.vector, uuid, int) to service_role;
