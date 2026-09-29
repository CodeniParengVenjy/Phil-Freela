-- Job applications: a freelancer opens a job from Find Jobs, attaches a PDF
-- resume and an optional note, and sends it; the client sees the applicants
-- in Projects & Resumes. Run this in the Supabase SQL Editor after
-- supabase_marketplace_schema.sql and supabase_admin_schema.sql (it uses
-- is_verified() and is_posting_blocked() from there).
--
-- Data Privacy (RA 10173): a resume is personal data, so the files are in a
-- PRIVATE bucket that only the freelancer and that job's client can open.

create table public.job_applications (
  id uuid primary key default gen_random_uuid(),
  job_post_id uuid not null references public.job_posts(id) on delete cascade,
  freelancer_id uuid not null references public.profiles(id) on delete cascade,
  -- Where the PDF is in the resumes bucket: "<freelancer id>/<job id>-<time>.pdf".
  resume_path text not null,
  cover_note text check (cover_note is null or char_length(cover_note) <= 1000),
  created_at timestamptz not null default now(),
  -- One application per freelancer per job.
  constraint job_applications_one_per_job unique (job_post_id, freelancer_id),
  -- The file must be this freelancer's own resume for this job, nothing else.
  constraint job_applications_resume_path
    check (resume_path ~ ('^' || freelancer_id::text || '/' || job_post_id::text || '-[0-9]+\.pdf$'))
);

-- For "My Applications" (job_post_id is already indexed by the unique rule).
create index job_applications_freelancer_idx on public.job_applications (freelancer_id);

alter table public.job_applications enable row level security;

-- Apply: only as yourself, only as a verified freelancer who isn't blocked
-- from posting (the same rule as posting a service), never to your own job.
create policy "job_applications: verified freelancers can apply"
  on public.job_applications for insert
  to authenticated
  with check (
    freelancer_id = auth.uid()
    and exists (select 1 from public.profiles p where p.id = auth.uid() and p.account_type = 'freelancer')
    and public.is_verified(auth.uid())
    and not public.is_posting_blocked(auth.uid())
    and not exists (select 1 from public.job_posts j where j.id = job_applications.job_post_id and j.client_id = auth.uid())
  );

-- See: freelancers see their own applications; clients see the ones sent to
-- their own job posts.
create policy "job_applications: applicants and job owners can view"
  on public.job_applications for select
  to authenticated
  using (
    freelancer_id = auth.uid()
    or exists (select 1 from public.job_posts j where j.id = job_applications.job_post_id and j.client_id = auth.uid())
  );

-- Withdraw: freelancers can delete their own application.
create policy "job_applications: freelancers can withdraw their own"
  on public.job_applications for delete
  to authenticated
  using (freelancer_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Storage: the resumes themselves (PDF only, up to 5 MB, private).
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('resumes', 'resumes', false, 5242880, array['application/pdf'])
on conflict (id) do nothing;

-- Freelancers can only upload into their own folder: resumes/<user id>/...
create policy "resumes: freelancers can upload to their folder"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'resumes' and (storage.foldername(name))[1] = auth.uid()::text);

-- Opening a resume: its owner, or the client of the job it was sent to.
create policy "resumes: owners and the job's client can open"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'resumes'
    and (
      (storage.foldername(objects.name))[1] = auth.uid()::text
      or exists (
        select 1
        from public.job_applications a
        join public.job_posts j on j.id = a.job_post_id
        where a.resume_path = objects.name and j.client_id = auth.uid()
      )
    )
  );

-- Withdrawing deletes the file too (only the owner can).
create policy "resumes: owners can delete"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'resumes' and (storage.foldername(name))[1] = auth.uid()::text);
