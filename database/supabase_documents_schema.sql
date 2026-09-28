-- Documents (writing) in portfolios (watermarking system, step 6). Run this
-- in the Supabase SQL Editor after supabase_copy_check_schema.sql.
--
-- A freelancer can add writing to their portfolio (pasted text, TXT, DOCX or
-- PDF). The Python AI service hides a 48-bit code in it with invisible
-- characters, adds a visible footer, and compares it with other freelancers'
-- documents using a text model (all-MiniLM-L6-v2); a copy is flagged for an
-- admin like a copied photo.

-- ---------------------------------------------------------------------------
-- Documents are portfolio items too
-- ---------------------------------------------------------------------------

-- kind: 'project' (photos/videos as slides) or 'document' (writing in body).
-- status / matched_item_id / match_score: like media_slides, for the copy check.
alter table public.portfolio_items
  add column kind text not null default 'project' check (kind in ('project', 'document')),
  add column body text check (body is null or char_length(body) <= 60000),
  add column status text not null default 'active' check (status in ('active', 'flagged')),
  add column matched_item_id uuid references public.portfolio_items (id) on delete set null,
  add column match_score real,
  add constraint portfolio_items_document_has_body check ((kind = 'document') = (body is not null));

-- Flagged documents are only visible to their owner and the admins.
drop policy "portfolio_items: signed-in users can view" on public.portfolio_items;

create policy "portfolio_items: signed-in users can view"
  on public.portfolio_items for select
  to authenticated
  using (
    (status = 'active' and not public.is_suspended(freelancer_id))
    or freelancer_id = auth.uid()
    or public.is_admin()
  );

-- Browsers may only create photo/video projects. Documents are created by the
-- AI service (which bypasses these rules), so none can skip the watermark.
drop policy "portfolio_items: freelancers can insert own" on public.portfolio_items;

create policy "portfolio_items: freelancers can insert own"
  on public.portfolio_items for insert
  to authenticated
  with check (
    freelancer_id = auth.uid()
    and kind = 'project'
    and body is null
    and status = 'active'
    and exists (select 1 from public.profiles p where p.id = auth.uid() and p.account_type = 'freelancer')
    and not public.is_suspended(auth.uid())
  );

-- Admins mark a flagged document as fine on the Flagged Content page.
create policy "portfolio_items: admins can review"
  on public.portfolio_items for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- Hidden codes can belong to a document
-- ---------------------------------------------------------------------------

alter table public.watermark_codes
  add column portfolio_item_id uuid references public.portfolio_items (id) on delete set null;

-- ---------------------------------------------------------------------------
-- The documents' text-model numbers (private: only the AI service)
-- ---------------------------------------------------------------------------

-- One row per piece of a document (paragraphs, about 40-150 words each).
create table public.document_embeddings (
  portfolio_item_id uuid not null references public.portfolio_items (id) on delete cascade,
  piece int not null,
  freelancer_id uuid not null references public.profiles (id) on delete cascade,
  embedding extensions.vector(384) not null,
  primary key (portfolio_item_id, piece)
);

alter table public.document_embeddings enable row level security;

-- The documents closest to any of the given pieces (sent as text, e.g.
-- '[0.1,0.2,...]'), most similar first: for each document, its best-matching
-- piece. Leaves out the given freelancer's own documents (pass null to search
-- everyone's, for Check Ownership) and documents still waiting for review.
create or replace function public.closest_document_pieces(queries text[], exclude_freelancer uuid, how_many int default 1)
returns table (portfolio_item_id uuid, freelancer_id uuid, similarity real)
language sql
stable
set search_path = public, extensions
as $$
  select e.portfolio_item_id, e.freelancer_id, max(1 - (e.embedding <=> q::extensions.vector(384)))::real as similarity
  from unnest(queries) as q
  cross join public.document_embeddings e
  join public.portfolio_items p on p.id = e.portfolio_item_id
  where (exclude_freelancer is null or e.freelancer_id <> exclude_freelancer) and p.status = 'active'
  group by e.portfolio_item_id, e.freelancer_id
  order by similarity desc
  limit how_many;
$$;

revoke execute on function public.closest_document_pieces(text[], uuid, int) from public, anon, authenticated;
grant execute on function public.closest_document_pieces(text[], uuid, int) to service_role;

-- ---------------------------------------------------------------------------
-- The footer switch in Settings > Watermark Settings
-- ---------------------------------------------------------------------------

alter table public.watermark_settings
  add column document_footer boolean not null default true;
