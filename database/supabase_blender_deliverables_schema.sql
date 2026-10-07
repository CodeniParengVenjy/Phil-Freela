-- Blender files as project deliverables. Run this in the Supabase SQL Editor
-- after supabase_projects_schema.sql.
--
-- A freelancer in Animation & 3D Modeling can now submit the model itself
-- (a .blend file), not only a link to it. The size limit stays 50 MB, and the
-- other rules of the "deliverables" bucket stay as they are: private, only
-- the project's client and freelancer can open a file.

-- The same list as before, plus the Blender type. Browsers don't give a
-- .blend file a type of their own, so the website sends this one (see
-- submitProject in client/src/lib/projects.js).
update storage.buckets
set allowed_mime_types = array[
  'video/mp4', 'video/webm', 'video/quicktime',
  'image/jpeg', 'image/png', 'image/webp',
  'application/pdf', 'application/zip',
  'application/x-blender'
]
where id = 'deliverables';
