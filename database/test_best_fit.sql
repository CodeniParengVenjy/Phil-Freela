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

-- Section 2 (Best fit applicants: application_fit + applicant_records): run on
-- live as a rolled-back trial together with the schema on 2026-11-10, all 9
-- checks PASS (check 2 only prints the first applicant's record).
do $$
declare
  job uuid := '22fca204-67b9-4c0b-8e1b-57ddfb72a0a1';
  expected integer;
  n integer;
  ok boolean;
  first_app uuid;
  rec record;
  out text := '';
begin
  select count(*) into expected from public.job_applications where job_post_id = job;
  select count(*) into n from public.applicant_records(job);
  out := out || format('1 applicant_records rows = %s (expect %s) %s; ', n, expected, case when n = expected then 'PASS' else 'FAIL' end);
  select * into rec from public.applicant_records(job) limit 1;
  first_app := rec.application_id;
  out := out || format('2 first row: path set %s, completed %s, ratings %s, stars %s, reply %s; ',
    rec.resume_path is not null, rec.completed_count, rec.rating_count, coalesce(rec.avg_stars::text, 'none'), coalesce(rec.reply_minutes::text, 'none'));
  select bool_and(t.later) into ok from (
    select applied_at >= coalesce(lag(applied_at) over (), applied_at) as later from public.applicant_records(job)) t;
  out := out || format('3 first applied first = %s %s; ', ok, case when ok then 'PASS' else 'FAIL' end);
  out := out || format('4 authenticated may call applicant_records = %s (expect false) %s; ',
    has_function_privilege('authenticated', 'public.applicant_records(uuid)', 'execute'),
    case when not has_function_privilege('authenticated', 'public.applicant_records(uuid)', 'execute') then 'PASS' else 'FAIL' end);
  out := out || format('5 authenticated/anon may read application_fit = %s/%s (expect false) %s; ',
    has_table_privilege('authenticated', 'public.application_fit', 'select'), has_table_privilege('anon', 'public.application_fit', 'select'),
    case when not has_table_privilege('authenticated', 'public.application_fit', 'select') and not has_table_privilege('anon', 'public.application_fit', 'select') then 'PASS' else 'FAIL' end);
  out := out || format('6 service_role may read/write = %s/%s (expect true) %s; ',
    has_table_privilege('service_role', 'public.application_fit', 'select'), has_table_privilege('service_role', 'public.application_fit', 'insert'),
    case when has_table_privilege('service_role', 'public.application_fit', 'select') and has_table_privilege('service_role', 'public.application_fit', 'insert') then 'PASS' else 'FAIL' end);
  -- The AI service's upsert, sent twice: one row, the second one wins.
  insert into public.application_fit (application_id, embedding, skills, read_ok)
  values (first_app, ('[' || array_to_string(array_fill(0.05::real, array[384]), ',') || ']')::extensions.vector, array['Logo Design'], true)
  on conflict (application_id) do update set embedding = excluded.embedding, skills = excluded.skills, read_ok = excluded.read_ok;
  insert into public.application_fit (application_id, embedding, skills, read_ok)
  values (first_app, null, '{}', false)
  on conflict (application_id) do update set embedding = excluded.embedding, skills = excluded.skills, read_ok = excluded.read_ok;
  select count(*), bool_and(not read_ok and embedding is null) into n, ok from public.application_fit where application_id = first_app;
  out := out || format('7 upsert twice keeps one row (%s), second wins (%s) %s; ', n, ok, case when n = 1 and ok then 'PASS' else 'FAIL' end);
  begin
    insert into public.application_fit (application_id, read_ok) values (gen_random_uuid(), true);
    out := out || '8 row for a made-up application refused FAIL; ';
  exception when foreign_key_violation then
    out := out || '8 row for a made-up application refused PASS; ';
  end;
  -- As a signed-in user: both are closed.
  perform set_config('request.jwt.claims', json_build_object('sub', gen_random_uuid(), 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    perform 1 from public.application_fit limit 1;
    out := out || '9 signed-in user reading application_fit refused FAIL; ';
  exception when insufficient_privilege then
    out := out || '9 signed-in user reading application_fit refused PASS; ';
  end;
  begin
    perform 1 from public.applicant_records(job);
    out := out || '10 signed-in user calling applicant_records refused FAIL; ';
  exception when insufficient_privilege then
    out := out || '10 signed-in user calling applicant_records refused PASS; ';
  end;
  reset role;
  raise exception 'RESULTS: %', out;
end;
$$;
