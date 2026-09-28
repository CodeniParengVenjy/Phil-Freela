-- Video watermarking (watermarking system, step 7). Run this in the Supabase
-- SQL Editor after supabase_documents_schema.sql.
--
-- Videos are now turned into watermarked 720p MP4s by the Python AI service,
-- so iPhone MOV videos can be uploaded too, and the copy check stores the
-- ViT numbers of 5 frames of each video.

-- The private upload folder also takes MOV (QuickTime) videos. The saved,
-- public copies are always MP4.
update storage.buckets
set allowed_mime_types = array['video/mp4', 'video/webm', 'video/quicktime']
where id = 'slide-uploads';

-- A photo has 'uploaded' and 'shown' numbers; a video has them for 5 of its
-- frames ('uploaded_frame1' ... 'shown_frame5').
alter table public.slide_embeddings drop constraint slide_embeddings_version_check;
alter table public.slide_embeddings
  add constraint slide_embeddings_version_check check (version ~ '^(uploaded|shown)(_frame[1-5])?$');
