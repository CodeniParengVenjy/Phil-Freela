-- Profile pictures (Settings > Upload Profile Picture). Run this in the
-- Supabase SQL Editor after supabase_schema.sql.

-- Where the user's picture is inside the avatars bucket, e.g.
-- "<user id>/1727430000000.jpg" (empty = no picture; the app shows the first
-- letter of their name instead). The path is stored instead of a full link,
-- and this rule only accepts a .jpg in the user's OWN folder, so nobody can
-- point their picture at an outside website or at someone else's picture.
alter table public.profiles add column if not exists avatar_path text;

alter table public.profiles add constraint profiles_avatar_path_own_folder
  check (avatar_path is null or avatar_path ~ ('^' || id::text || '/[0-9]+\.jpg$'));

-- Public, so any page can show a picture with a plain link. The browser
-- shrinks every picture to a small JPEG before uploading (lib/avatar.js), so
-- only JPEGs up to 2 MB are accepted.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 2097152, array['image/jpeg'])
on conflict (id) do nothing;

-- Users can only add pictures to their own folder: avatars/<user id>/...
create policy "avatars: users can upload to their folder"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

-- Deleting the old picture after a new one is saved needs both of these.
create policy "avatars: users can see their file entries"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "avatars: users can delete their files"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
