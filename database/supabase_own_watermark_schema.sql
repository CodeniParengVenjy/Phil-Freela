-- The freelancer's own watermark picture (PLAN-own-watermark.md, Step 2).
-- Run after supabase_watermark_schema.sql and supabase_premium_schema.sql.
--
-- Settings > Watermark Settings can now show the freelancer's own picture
-- (a logo or a signature) instead of, or next to, the text. The website
-- makes the picture (and, if asked, removes its plain background), then saves
-- two PNG files in a private bucket:
--   <freelancer id>/<number>/original.png   the picture as picked (shrunk)
--   <freelancer id>/<number>/mark.png       the finished watermark picture
-- The AI service reads mark.png with its service key when a photo or video
-- is uploaded and draws it in (ai-service/visible_watermark.py).
-- Free for every freelancer (the user's choice B1): the Premium trigger
-- premium_watermark_only does not look at these columns.

-- ---------------------------------------------------------------------------
-- 1. New settings
-- ---------------------------------------------------------------------------

alter table public.watermark_settings
  -- What the watermark shows: the text (as before), their picture, or both.
  add column mark_kind text not null default 'text',
  -- Their mark.png in the watermark-pictures bucket (null = no picture).
  add column picture_path text,
  -- Whether "Remove background" was on when mark.png was made (the switch
  -- shows it again; original.png next to it is kept so it can be flipped).
  add column picture_bg_removed boolean not null default false,
  add constraint watermark_settings_mark_kind_check
    check (mark_kind in ('text', 'picture', 'picture_text')),
  -- The picture must be a mark.png in the freelancer's OWN folder, so nobody
  -- can point their watermark at another freelancer's picture.
  add constraint watermark_settings_picture_path_check
    check (
      picture_path is null
      or (char_length(picture_path) <= 120 and picture_path like freelancer_id::text || '/%/mark.png')
    ),
  -- "My picture" and "My picture + text" need a picture.
  add constraint watermark_settings_picture_needed_check
    check (mark_kind = 'text' or picture_path is not null);

-- ---------------------------------------------------------------------------
-- 2. The private bucket for the pictures
-- ---------------------------------------------------------------------------

-- PNG only (the website always saves PNG, which keeps a see-through
-- background), 2 MB at most. Private: only the owner and the AI service.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('watermark-pictures', 'watermark-pictures', false, 2097152, array['image/png']);

-- Each freelancer adds, opens, replaces and removes files in their own folder
-- only. The AI service uses the service key, which skips these rules.
create policy "watermark-pictures: owners can upload"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'watermark-pictures' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "watermark-pictures: owners can open"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'watermark-pictures' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "watermark-pictures: owners can replace"
  on storage.objects for update
  to authenticated
  using (bucket_id = 'watermark-pictures' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'watermark-pictures' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "watermark-pictures: owners can remove"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'watermark-pictures' and (storage.foldername(name))[1] = (select auth.uid())::text);
