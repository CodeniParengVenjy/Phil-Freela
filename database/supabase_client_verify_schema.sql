-- Clients must be verified to post (2026-10-26, see PLAN-full-tour.md).
-- Run this in the Supabase SQL Editor (after supabase_admin_schema.sql).
--
-- The same rule freelancers already have: a freelancer needs an approved
-- identity check to post a service ("services: freelancers can insert own"),
-- and now a client needs one to post a project or job. The website shows a
-- "Verify your identity" notice instead of the form; this is the real guard,
-- so a request sent another way is refused too.
--
-- Only NEW posts are checked, the same as for services:
--   - posts already up stay as they are, and freelancers still see them;
--   - the owner can still edit or delete their own post ("job_posts: owner
--     can update" is not changed), like a freelancer and their services.
--
-- is_verified() is true when the person has an approved identity check
-- (supabase_admin_schema.sql); it answers only yes or no.

alter policy "job_posts: clients can insert own" on public.job_posts
  with check (
    client_id = auth.uid()
    and exists (select 1 from public.profiles p where p.id = auth.uid() and p.account_type = 'client')
    and not public.is_posting_blocked(auth.uid())
    and public.is_verified(auth.uid())
  );

-- Shows the rule as it is now, to check that it took (the last line should
-- end with "is_verified(auth.uid())").
select policyname, with_check
from pg_policies
where schemaname = 'public' and tablename = 'job_posts' and policyname = 'job_posts: clients can insert own';
