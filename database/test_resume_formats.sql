-- Test for supabase_resume_formats_schema.sql. Run it AFTER the schema file
-- (the Supabase connector can run it: it has no DROP or DELETE). It BORROWS a
-- real freelancer and a real client (no user numbers used up), adds four
-- made-up job posts and three made-up applications, and ends with an error that
-- carries the PASS/FAIL list; that error rolls everything back, so nothing is
-- left behind.
do $t$
declare
  res text := '';
  fr uuid;
  cl uuid;
  jobs uuid[] := '{}';
  job uuid;
  k int := 0;
  ending text;
  attempt record;
  rule text;
  types text[];
  size_limit bigint;
begin
  select p.id into fr from public.profiles p where p.account_type = 'freelancer' and not exists (select 1 from public.admins a where a.id = p.id) limit 1;
  select p.id into cl from public.profiles p where p.account_type = 'client' and not exists (select 1 from public.admins a where a.id = p.id) limit 1;
  if fr is null or cl is null then
    raise exception 'The test needs a freelancer and a client.';
  end if;

  -- Emails to offline clients are switched off for this test.
  alter table public.job_applications disable trigger email_offline_on_application;

  -- Four made-up jobs: one for each type that is accepted, and one for the
  -- refused names (a refused insert leaves no row, so they can share a job).
  for i in 1..4 loop
    insert into public.job_posts (client_id, title, category, description, start_date, due_date)
      values (cl, 'Resume formats test job ' || i, 'Design', 'Text.', (now() at time zone 'Asia/Manila')::date, (now() at time zone 'Asia/Manila')::date + 7)
      returning id into job;
    jobs := jobs || job;
  end loop;

  -- Accepted: the three endings.
  foreach ending in array array['pdf', 'docx', 'jpg'] loop
    k := k + 1;
    begin
      insert into public.job_applications (job_post_id, freelancer_id, resume_path)
        values (jobs[k], fr, fr::text || '/' || jobs[k]::text || '-1700000000000.' || ending);
      res := res || E'\nPASS  ' || k || '. a resume named ...-1700000000000.' || ending || ' is accepted';
    exception when others then
      res := res || E'\nFAIL  ' || k || '. a resume named ...-1700000000000.' || ending || ' was refused: ' || sqlerrm;
    end;
  end loop;

  -- Refused: any other ending, and every way the name can be wrong.
  for attempt in
    select * from (values
      ('.exe is refused', fr::text || '/' || jobs[4]::text || '-1700000000000.exe'),
      ('.zip is refused', fr::text || '/' || jobs[4]::text || '-1700000000000.zip'),
      ('.png is refused (the website turns pictures into .jpg)', fr::text || '/' || jobs[4]::text || '-1700000000000.png'),
      ('.webp is refused', fr::text || '/' || jobs[4]::text || '-1700000000000.webp'),
      ('an old Word .doc is refused', fr::text || '/' || jobs[4]::text || '-1700000000000.doc'),
      ('a capital .PDF is refused', fr::text || '/' || jobs[4]::text || '-1700000000000.PDF'),
      ('a name with no ending is refused', fr::text || '/' || jobs[4]::text || '-1700000000000'),
      ('"pdf" with no dot is refused', fr::text || '/' || jobs[4]::text || '-1700000000000pdf'),
      ('a second ending (.pdf.exe) is refused', fr::text || '/' || jobs[4]::text || '-1700000000000.pdf.exe'),
      ('a time that is not numbers is refused', fr::text || '/' || jobs[4]::text || '-abc.pdf'),
      ('someone else''s folder is refused', cl::text || '/' || jobs[4]::text || '-1700000000000.pdf'),
      ('another job''s id in the name is refused', fr::text || '/' || jobs[1]::text || '-1700000000000.pdf')
    ) as t(what, path)
  loop
    k := k + 1;
    begin
      insert into public.job_applications (job_post_id, freelancer_id, resume_path) values (jobs[4], fr, attempt.path);
      res := res || E'\nFAIL  ' || k || '. ' || attempt.what || ' (it was accepted)';
    exception
      when check_violation then
        res := res || E'\nPASS  ' || k || '. ' || attempt.what;
      when others then
        res := res || E'\nFAIL  ' || k || '. ' || attempt.what || ' (a different error: ' || sqlerrm || ')';
    end;
  end loop;

  -- The rule itself and the bucket.
  select pg_get_constraintdef(c.oid) into rule from pg_constraint c where c.conrelid = 'public.job_applications'::regclass and c.conname = 'job_applications_resume_path';
  k := k + 1;
  res := res || E'\n' || case when rule like '%(pdf|docx|jpg)%' then 'PASS  ' else 'FAIL  ' end || k || '. the rule lists pdf, docx and jpg';

  select b.allowed_mime_types, b.file_size_limit into types, size_limit from storage.buckets b where b.id = 'resumes';
  k := k + 1;
  res := res || E'\n' || case when types @> array['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'image/jpeg'] and cardinality(types) = 3 then 'PASS  ' else 'FAIL  ' end || k || '. the bucket takes exactly PDF, Word and JPEG';
  k := k + 1;
  res := res || E'\n' || case when size_limit = 5242880 then 'PASS  ' else 'FAIL  ' end || k || '. the bucket size limit is still 5 MB (' || size_limit || ')';

  raise exception E'RESULTS (everything is rolled back):%', res;
end
$t$;
