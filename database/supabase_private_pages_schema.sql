-- Whole PDF pages in a private bucket. Plan: PLAN-document-previews.md (step B5).
-- Run this in the Supabase SQL Editor (or apply it as a migration) BEFORE the AI
-- service that uses it goes live: it saves a copy of every page here.
--
-- Visitors get a PDF's page pictures blurred below the top of the document (the
-- AI service blurs them in the pixels, see ai-service/page_blur.py), so nobody
-- can read the rest of the document from the pictures. The WHOLE pages are
-- kept here, in a private bucket, so the writer and the admins can still see
-- them: Admin > Flagged Content compares real pages. They are saved with the
-- same names as the public ones, in the writer's own folder:
--   slide-media/<user id>/<slide id>-p1.jpg    the blurred page (public)
--   slide-private/<user id>/<slide id>-p1.jpg  the whole page (private)

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('slide-private', 'slide-private', false, 5242880, array['image/jpeg'])
on conflict (id) do nothing;

-- The writer and the admins can open a page. Nobody else, and not signed-out
-- visitors.
create policy "slide-private: the writer and admins can open"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'slide-private'
    and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin())
  );

-- When a service or a project is removed, its pages are removed too (by the
-- writer, or by an admin who removes it). There is no rule to add or change
-- files: only the AI service puts them here, with its own key (which skips
-- these rules).
create policy "slide-private: the writer and admins can remove"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'slide-private'
    and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin())
  );
