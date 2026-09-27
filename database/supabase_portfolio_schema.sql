-- Portfolio projects (watermarking system, step 2). Run this in the Supabase
-- SQL Editor after supabase_slides_schema.sql.
--
-- A freelancer's portfolio is a list of projects. Each project has a title,
-- a short description, and up to 10 photos and videos, stored as slides in
-- media_slides, the same table service slideshows use.

create table public.portfolio_items (
  id uuid primary key default gen_random_uuid(),
  freelancer_id uuid not null references public.profiles (id) on delete cascade,
  title varchar(100) not null check (char_length(trim(title)) > 0),
  description text check (description is null or char_length(description) <= 1000),
  created_at timestamptz not null default now()
);

create index portfolio_items_freelancer_id_idx on public.portfolio_items (freelancer_id);

alter table public.portfolio_items enable row level security;

-- Anyone signed in can look at portfolios, except those of banned or
-- suspended freelancers. Owners and admins always see them. A verified
-- identity isn't needed (the Verified badge shows who is verified).
create policy "portfolio_items: signed-in users can view"
  on public.portfolio_items for select
  to authenticated
  using (not public.is_suspended(freelancer_id) or freelancer_id = auth.uid() or public.is_admin());

-- Only freelancers add projects, as themselves, and not while suspended.
create policy "portfolio_items: freelancers can insert own"
  on public.portfolio_items for insert
  to authenticated
  with check (
    freelancer_id = auth.uid()
    and exists (select 1 from public.profiles p where p.id = auth.uid() and p.account_type = 'freelancer')
    and not public.is_suspended(auth.uid())
  );

create policy "portfolio_items: owner can delete"
  on public.portfolio_items for delete
  to authenticated
  using (freelancer_id = auth.uid());

create policy "portfolio_items: admins can delete any"
  on public.portfolio_items for delete
  to authenticated
  using (public.is_admin());

-- ---------------------------------------------------------------------------
-- Slides now belong to a service or a portfolio project
-- ---------------------------------------------------------------------------

alter table public.media_slides alter column service_id drop not null;

-- Deleting a project deletes its slides too.
alter table public.media_slides
  add column portfolio_item_id uuid references public.portfolio_items (id) on delete cascade;

-- Exactly one of the two is filled in: a slide is never in both, or in neither.
alter table public.media_slides
  add constraint media_slides_one_owner check (num_nonnulls(service_id, portfolio_item_id) = 1);

-- One slide per spot in a project's slideshow (services already have this).
alter table public.media_slides
  add constraint media_slides_portfolio_position unique (portfolio_item_id, position);

-- Whoever can see the service or the project can see its slides.
drop policy "media_slides: visible with their service" on public.media_slides;

create policy "media_slides: visible with their service or project"
  on public.media_slides for select
  to authenticated
  using (
    exists (select 1 from public.services s where s.id = media_slides.service_id)
    or exists (select 1 from public.portfolio_items p where p.id = media_slides.portfolio_item_id)
  );
