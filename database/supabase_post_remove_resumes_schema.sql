-- Edit and remove your own posts (PLAN-edit-posts.md, step 2): resumes of a job
-- that is taken down. Run this in the Supabase SQL Editor after
-- supabase_applications_schema.sql. No new tables.
--
-- When a client takes down a job post, its applications go with it, but each
-- application's resume is a PDF in the private "resumes" bucket, and only the
-- freelancer who sent it could remove it. Once the application is gone nobody
-- can even see the file, so it would stay in storage for good (a resume is
-- personal data, RA 10173). This rule lets the client of a job remove the
-- resumes sent to THAT job. The website removes them first, while the
-- application still proves the job is theirs, and takes the job down after.
create policy "resumes: the job's client can remove resumes sent to it"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'resumes'
    and exists (
      select 1
      from public.job_applications a
      join public.job_posts j on j.id = a.job_post_id
      where a.resume_path = objects.name and j.client_id = auth.uid()
    )
  );
