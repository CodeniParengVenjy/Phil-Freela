-- Marketplace listings schema, extends database/supabase_schema.sql. Run
-- this in the Supabase SQL Editor after that file (or see supabase_schema.sql's
-- note -- this has already been applied to the live project via Supabase MCP
-- migrations: add_services_and_job_posts, add_marketplace_images_storage,
-- add_service_video_support).

-- Freelancer-posted services, browsable by clients (and other freelancers)
-- on the marketplace home. Mirrors the ownership + RLS pattern already used
-- by conversations/messages.
create table public.services (
  id uuid primary key default gen_random_uuid(),
  freelancer_id uuid not null references public.profiles(id) on delete cascade,
  title varchar(150) not null,
  category text not null,
  description text not null,
  price numeric(10,2),
  skill text,
  created_at timestamptz not null default now(),
  updated_at timestamptz
);

create index services_freelancer_id_idx on public.services (freelancer_id);
create index services_category_idx on public.services (category);

alter table public.services enable row level security;

create policy "services: signed-in users can view"
  on public.services for select
  to authenticated
  using (true);

create policy "services: freelancers can insert own"
  on public.services for insert
  to authenticated
  with check (
    freelancer_id = auth.uid()
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.account_type = 'freelancer'
    )
  );

create policy "services: owner can update"
  on public.services for update
  to authenticated
  using (freelancer_id = auth.uid())
  with check (freelancer_id = auth.uid());

create policy "services: owner can delete"
  on public.services for delete
  to authenticated
  using (freelancer_id = auth.uid());

-- Client-posted "needs" (job listings), browsable by freelancers on Find Jobs.
create table public.job_posts (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.profiles(id) on delete cascade,
  title varchar(150) not null,
  category text not null,
  description text not null,
  budget numeric(10,2),
  created_at timestamptz not null default now(),
  updated_at timestamptz
);

create index job_posts_client_id_idx on public.job_posts (client_id);
create index job_posts_category_idx on public.job_posts (category);

alter table public.job_posts enable row level security;

create policy "job_posts: signed-in users can view"
  on public.job_posts for select
  to authenticated
  using (true);

create policy "job_posts: clients can insert own"
  on public.job_posts for insert
  to authenticated
  with check (
    client_id = auth.uid()
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.account_type = 'client'
    )
  );

create policy "job_posts: owner can update"
  on public.job_posts for update
  to authenticated
  using (client_id = auth.uid())
  with check (client_id = auth.uid());

create policy "job_posts: owner can delete"
  on public.job_posts for delete
  to authenticated
  using (client_id = auth.uid());

-- profiles RLS is otherwise self-only (see supabase_schema.sql) plus an
-- admin-only policy and a conversation-participants policy (see
-- supabase_admin_schema.sql / supabase_chat_schema.sql), so without this, a
-- freelancer's name on a service card (or a client's name on a job post)
-- would silently fail to resolve for anyone browsing who isn't already in a
-- conversation with them. Scoped to signed-in users only, matching the
-- select policies above.
create policy "profiles: signed-in users can view marketplace authors"
  on public.profiles for select
  to authenticated
  using (true);

-- Service photos, uploaded by the freelancer from the "Post a Service" form.
alter table public.services add column image_url text;

-- Public-read bucket: service photos aren't sensitive, and a public bucket
-- lets the client render <img src> directly without signed-URL refresh
-- logic. Writes are still locked down below to each uploader's own folder.
insert into storage.buckets (id, name, public)
values ('marketplace-images', 'marketplace-images', true)
on conflict (id) do nothing;

create policy "marketplace-images: anyone can view"
  on storage.objects for select
  using (bucket_id = 'marketplace-images');

create policy "marketplace-images: owners can upload to their folder"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'marketplace-images'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "marketplace-images: owners can update their files"
  on storage.objects for update
  to authenticated
  using (bucket_id = 'marketplace-images' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'marketplace-images' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "marketplace-images: owners can delete their files"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'marketplace-images' and (storage.foldername(name))[1] = auth.uid()::text);

-- Services can show a photo or a short video. media_type tells the UI whether
-- image_url points at an image or a video file. (Column name kept as image_url
-- so existing rows and queries keep working.)
alter table public.services
  add column media_type text not null default 'image'
  check (media_type in ('image', 'video'));

-- Server-side upload rules for the bucket: photos and short videos only, max
-- 50 MB per file. The browser checks these too, but this is what enforces
-- them even if someone bypasses the form.
update storage.buckets
set file_size_limit = 52428800,
    allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'video/webm']
where id = 'marketplace-images';
