-- Service slideshows (watermarking system, step 1). Run this in the Supabase
-- SQL Editor after the other schema files.
--
-- A service can show up to 10 photos and videos as a slideshow; each one is a
-- row here. Only the Python AI service adds slides (from step 3 it also
-- watermarks them), so there are no insert or update rules for users: they
-- can only see and delete slides.

create table public.media_slides (
  id uuid primary key default gen_random_uuid(),
  freelancer_id uuid not null references public.profiles (id) on delete cascade,
  -- Deleting a service deletes its slides too.
  service_id uuid not null references public.services (id) on delete cascade,
  position smallint not null check (position between 1 and 10),
  media_type text not null check (media_type in ('image', 'video')),
  -- Where the file is in the "slide-media" bucket: "<user id>/<slide id>.jpg"
  file_path text not null,
  created_at timestamptz not null default now(),
  -- One slide per spot in a service's slideshow.
  unique (service_id, position)
);

-- The AI service counts each freelancer's slides for the upload limits.
create index media_slides_freelancer_id_idx on public.media_slides (freelancer_id);

alter table public.media_slides enable row level security;

-- Slides follow their service: whoever can see the service (verified and not
-- suspended, or their own, or an admin; see the rules on services) can see
-- its slides.
create policy "media_slides: visible with their service"
  on public.media_slides for select
  to authenticated
  using (exists (select 1 from public.services s where s.id = media_slides.service_id));

create policy "media_slides: owner can delete"
  on public.media_slides for delete
  to authenticated
  using (freelancer_id = auth.uid());

create policy "media_slides: admins can delete any"
  on public.media_slides for delete
  to authenticated
  using (public.is_admin());

-- ---------------------------------------------------------------------------
-- Storage
-- ---------------------------------------------------------------------------

-- The saved slides. Public, so pages can show them with a plain link. Nobody
-- can upload here from the browser (there is no insert rule): only the AI
-- service can, so no slide skips its checks (and, from step 3, its watermark).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('slide-media', 'slide-media', true, 52428800, array['image/jpeg', 'video/mp4', 'video/webm'])
on conflict (id) do nothing;

-- Deleting a file needs both of these: the owner (their own folder) or an admin.
create policy "slide-media: owners and admins can see file entries"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'slide-media' and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin()));

create policy "slide-media: owners and admins can delete"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'slide-media' and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin()));

-- Videos are too big to send to the AI service directly (Vercel allows 4.5 MB
-- per request), so the browser first puts them here, in the freelancer's own
-- folder. The AI service checks the video, moves it to slide-media, and
-- deletes it from here. Private: nobody else can see these files.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('slide-uploads', 'slide-uploads', false, 52428800, array['video/mp4', 'video/webm'])
on conflict (id) do nothing;

create policy "slide-uploads: owners can upload to their folder"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'slide-uploads' and (storage.foldername(name))[1] = auth.uid()::text);

-- So the browser can clean up its own upload if the AI service couldn't be reached.
create policy "slide-uploads: owners can see their files"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'slide-uploads' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "slide-uploads: owners can delete their files"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'slide-uploads' and (storage.foldername(name))[1] = auth.uid()::text);
