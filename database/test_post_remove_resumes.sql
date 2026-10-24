-- Test for supabase_post_remove_resumes_schema.sql. NOT run by Claude: it
-- contains delete statements, so the Supabase connector asks for a confirm that
-- the VS Code session can't show (it answered "declined"). Paste this whole
-- file into the Supabase SQL Editor and run it AFTER the schema file. It
-- BORROWS a real freelancer, a real client and one more real user (no user
-- numbers used up), adds two made-up jobs, applications and storage rows, and
-- ends with an error that carries the PASS/FAIL list; that error rolls
-- everything back, so nothing is left behind.
do $t$
declare
  res text := '';
  fr uuid;
  cl uuid;
  other uuid;
  job uuid;
  job2 uuid;
  p1 text;
  p2 text;
  n int;
begin
  select p.id into fr from public.profiles p where p.account_type = 'freelancer' and not exists (select 1 from public.admins a where a.id = p.id) limit 1;
  select p.id into cl from public.profiles p where p.account_type = 'client' and not exists (select 1 from public.admins a where a.id = p.id) limit 1;
  select p.id into other from public.profiles p where p.id not in (fr, cl) and not exists (select 1 from public.admins a where a.id = p.id) limit 1;
  if fr is null or cl is null or other is null then
    raise exception 'The test needs a freelancer, a client and a third user.';
  end if;

  -- Emails to offline clients are switched off for this test.
  alter table public.job_applications disable trigger email_offline_on_application;

  insert into public.job_posts (client_id, title, category, description, start_date, due_date) values (cl, 'Resume test job', 'Design', 'Text.', (now() at time zone 'Asia/Manila')::date, (now() at time zone 'Asia/Manila')::date + 7) returning id into job;
  insert into public.job_posts (client_id, title, category, description, start_date, due_date) values (other, 'Resume test job of someone else', 'Design', 'Text.', (now() at time zone 'Asia/Manila')::date, (now() at time zone 'Asia/Manila')::date + 7) returning id into job2;
  p1 := fr::text || '/' || job::text || '-1.pdf';
  p2 := fr::text || '/' || job2::text || '-1.pdf';
  insert into public.job_applications (job_post_id, freelancer_id, resume_path) values (job, fr, p1), (job2, fr, p2);
  insert into storage.objects (bucket_id, name) values ('resumes', p1), ('resumes', p2);
  -- Supabase blocks direct removal from the storage tables unless this is on.
  perform set_config('storage.allow_delete_query', 'true', true);

  set local role authenticated;
  perform set_config('request.jwt.claim.sub', cl::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', cl, 'role', 'authenticated')::text, true);

  delete from storage.objects where bucket_id = 'resumes' and name = p2;
  get diagnostics n = row_count;
  res := res || E'\n' || case when n = 0 then 'PASS  ' else 'FAIL  ' end || '1. a client cannot remove a resume sent to someone else''s job (' || n || ' removed)';

  delete from storage.objects where bucket_id = 'resumes' and name = p1;
  get diagnostics n = row_count;
  res := res || E'\n' || case when n = 1 then 'PASS  ' else 'FAIL  ' end || '2. a client removes a resume sent to their own job (' || n || ' removed)';

  perform set_config('request.jwt.claim.sub', other::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', other, 'role', 'authenticated')::text, true);
  delete from storage.objects where bucket_id = 'resumes' and name = p1 || 'x';
  get diagnostics n = row_count;
  res := res || E'\n' || case when n = 0 then 'PASS  ' else 'FAIL  ' end || '3. a name that is no application removes nothing (' || n || ' removed)';

  perform set_config('request.jwt.claim.sub', fr::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', fr, 'role', 'authenticated')::text, true);
  delete from storage.objects where bucket_id = 'resumes' and name = p2;
  get diagnostics n = row_count;
  res := res || E'\n' || case when n = 1 then 'PASS  ' else 'FAIL  ' end || '4. the freelancer still removes their own resume (' || n || ' removed)';

  reset role;
  raise exception E'RESULTS (everything rolled back):%', res;
end
$t$;
