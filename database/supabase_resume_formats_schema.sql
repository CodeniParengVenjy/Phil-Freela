-- Resume file types (PLAN-resume-check.md, step 1): a freelancer can send a
-- resume as a PDF, a Word file (.docx) or a picture (the website saves every
-- picture as a .jpg), where it used to be a PDF only. Run this in the Supabase
-- SQL Editor after supabase_applications_schema.sql. No new table.
--
-- Safe to run while the old website is live: it only allows MORE file types,
-- and every application that exists (all of them .pdf) still passes. Run it
-- BEFORE the website that uses it goes live.

-- 1. The file name rule. The name is still "<freelancer id>/<job id>-<time>.",
--    now ending in pdf, docx or jpg. A rule can't be edited, so it is dropped
--    and added again in the same step (if the new one failed, the old one would
--    stay).
alter table public.job_applications drop constraint job_applications_resume_path;
alter table public.job_applications
  add constraint job_applications_resume_path
    check (resume_path ~ ('^' || freelancer_id::text || '/' || job_post_id::text || '-[0-9]+\.(pdf|docx|jpg)$'));

-- 2. The private "resumes" bucket takes the same three types. The size limit
--    stays 5 MB, and the policies never look at the ending, so they stay as
--    they are.
update storage.buckets
set allowed_mime_types = array[
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'image/jpeg'
]
where id = 'resumes';
