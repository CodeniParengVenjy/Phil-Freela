-- Documents in service slideshows (watermarking system, step 8). Run this in
-- the Supabase SQL Editor after supabase_video_schema.sql.
--
-- A service's slideshow can now include writing (a PDF, DOCX or TXT file),
-- treated like portfolio writing: the Python AI service keeps only the text,
-- hides the invisible code in it, adds the footer, runs the text copy check,
-- and saves it as a small .txt file in slide-media.

-- A slide can be a document.
alter table public.media_slides drop constraint media_slides_media_type_check;
alter table public.media_slides
  add constraint media_slides_media_type_check check (media_type in ('image', 'video', 'document'));

-- The saved documents are plain text files.
update storage.buckets
set allowed_mime_types = array['image/jpeg', 'video/mp4', 'video/webm', 'text/plain']
where id = 'slide-media';

-- The copy check can match a service document with a portfolio document, and
-- the other way round. These have no foreign key on purpose: a second link
-- between media_slides and portfolio_items would make the website's existing
-- slides-of-a-project lookups ambiguous. The admin page looks them up by id
-- (and shows "deleted" if the other item is gone).
alter table public.media_slides add column matched_item_id uuid;
alter table public.portfolio_items add column matched_slide_id uuid;

-- The text model's numbers now belong to a portfolio document or to a
-- document slide.
alter table public.document_embeddings drop constraint document_embeddings_pkey;
alter table public.document_embeddings
  alter column portfolio_item_id drop not null,
  add column slide_id uuid references public.media_slides (id) on delete cascade,
  add column id bigint generated always as identity primary key,
  add constraint document_embeddings_one_owner check (num_nonnulls(portfolio_item_id, slide_id) = 1),
  add constraint document_embeddings_item_piece unique (portfolio_item_id, piece),
  add constraint document_embeddings_slide_piece unique (slide_id, piece);

-- The documents closest to any of the given pieces, most similar first: for
-- each document, its best-matching piece, and which kind it is (a portfolio
-- document, or a document slide in a service). Leaves out the given
-- freelancer's own documents (pass null to search everyone's, for Check
-- Ownership) and documents still waiting for review.
drop function public.closest_document_pieces(text[], uuid, int);

create function public.closest_document_pieces(queries text[], exclude_freelancer uuid, how_many int default 1)
returns table (portfolio_item_id uuid, slide_id uuid, freelancer_id uuid, similarity real)
language sql
stable
set search_path = public, extensions
as $$
  select e.portfolio_item_id, e.slide_id, e.freelancer_id, max(1 - (e.embedding <=> q::extensions.vector(384)))::real as similarity
  from unnest(queries) as q
  cross join public.document_embeddings e
  left join public.portfolio_items p on p.id = e.portfolio_item_id
  left join public.media_slides s on s.id = e.slide_id
  where (exclude_freelancer is null or e.freelancer_id <> exclude_freelancer)
    and coalesce(p.status, s.status) = 'active'
  group by e.portfolio_item_id, e.slide_id, e.freelancer_id
  order by similarity desc
  limit how_many;
$$;

revoke execute on function public.closest_document_pieces(text[], uuid, int) from public, anon, authenticated;
grant execute on function public.closest_document_pieces(text[], uuid, int) to service_role;
