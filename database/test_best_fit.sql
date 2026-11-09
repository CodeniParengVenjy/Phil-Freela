-- Tests for database/supabase_best_fit_schema.sql. Paste into the Supabase SQL
-- Editor AFTER that file. Everything rolls back by itself: the block ends with
-- an error whose text holds the PASS/FAIL lines. It borrows existing accounts
-- and posts (it only reads them) and adds nothing.
--
-- Section 1 (applicant counts): run on live as a rolled-back trial together
-- with the schema on 2026-11-10, 5/5 PASS. Uses the live job post that had two
-- applicants that day; pick another with 2+ applicants if it is gone:
--   select job_post_id, count(*) from public.job_applications group by 1 order by 2 desc;

do $$
declare
  open_job uuid := '22fca204-67b9-4c0b-8e1b-57ddfb72a0a1';   -- open, 2 applicants on 2026-11-10
  filled_job uuid := '78471b4b-9a57-4a84-804f-dcea5c30dab2'; -- filled, 1 applicant
  expected integer;
  owner_id uuid;
  fl uuid;
  n integer;
  out text := '';
begin
  select client_id into owner_id from public.job_posts where id = open_job;
  select count(*) into expected from public.job_applications where job_post_id = open_job;
  -- A freelancer who applied to neither post.
  select p.id into fl from public.profiles p
  where p.account_type = 'freelancer' and p.id <> owner_id
    and not exists (select 1 from public.job_applications a where a.freelancer_id = p.id and a.job_post_id in (open_job, filled_job))
  limit 1;

  -- As that freelancer: they can't read other people's applications, but the
  -- count comes through, and a filled post (hidden from them) gives no row.
  perform set_config('request.jwt.claims', json_build_object('sub', fl, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', fl::text, true);
  set local role authenticated;
  select count(*) into n from public.job_applications where job_post_id = open_job;
  out := out || format('1 plain count as freelancer = %s (expect 0) %s; ', n, case when n = 0 then 'PASS' else 'FAIL' end);
  select public.applicant_count(j) into n from public.job_posts j where j.id = open_job;
  out := out || format('2 applicant_count as freelancer = %s (expect %s) %s; ', n, expected, case when n = expected then 'PASS' else 'FAIL' end);
  select count(*) into n from public.job_posts j where j.id = filled_job;
  out := out || format('3 filled post rows for a non-applicant = %s (expect 0) %s; ', n, case when n = 0 then 'PASS' else 'FAIL' end);
  reset role;

  -- As the job's owner.
  perform set_config('request.jwt.claims', json_build_object('sub', owner_id, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', owner_id::text, true);
  set local role authenticated;
  select public.applicant_count(j) into n from public.job_posts j where j.id = open_job;
  out := out || format('4 applicant_count as owner = %s (expect %s) %s; ', n, expected, case when n = expected then 'PASS' else 'FAIL' end);
  reset role;

  -- Signed out: no access at all.
  out := out || format('5 anon may execute = %s (expect false) %s; ',
    has_function_privilege('anon', 'public.applicant_count(public.job_posts)', 'execute'),
    case when not has_function_privilege('anon', 'public.applicant_count(public.job_posts)', 'execute') then 'PASS' else 'FAIL' end);

  raise exception 'RESULTS: %', out;
end;
$$;
