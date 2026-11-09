-- Test for supabase_notifications_more_schema.sql, Section 1 (new applicant:
-- a notification and a "new" count).
-- Paste this whole file into the Supabase SQL Editor and run it AFTER the schema
-- file (or send the schema file and this block together in one call to try it
-- before applying: the error at the end rolls the schema back too).
-- It BORROWS a real client and a real freelancer (only to act as them; their
-- own rows are never changed) and makes up two job posts and two applications.
-- It ends with an error that carries the PASS/FAIL list; that error rolls
-- everything back, so nothing is left behind and no email is sent.
do $t$
declare
  res text := '';
  c uuid;       -- borrowed client
  f uuid;       -- borrowed freelancer
  f_name text;
  j1 uuid; j2 uuid;   -- made-up job posts of c
  a1 uuid; a2 uuid;   -- made-up applications of f
  today date := (now() at time zone 'Asia/Manila')::date;
  q0 int; q1 int; q2 int;
  n int;
  t timestamptz;
begin
  -- The application email has its own 30-minute rule; it is not what is
  -- tested here, so it is off for this block (undone with the rest).
  alter table public.job_applications disable trigger email_offline_on_application;

  -- ===== Borrowed people =====
  select p.id into c from public.profiles p
  where p.account_type = 'client'
  order by p.created_at limit 1;
  select p.id, coalesce(nullif(p.full_name, ''), p.username) into f, f_name
  from public.profiles p where p.account_type = 'freelancer' and p.id <> c
  order by p.created_at limit 1;
  if c is null or f is null then
    raise exception 'needs a client and a freelancer';
  end if;

  -- ===== Made-up rows, added with nobody signed in =====
  insert into public.job_posts (client_id, title, category, description, start_date, due_date)
    values (c, 'Notiftest logo', 'Graphic Design', 'A test post.', today, today + 10)
    returning id into j1;
  insert into public.job_posts (client_id, title, category, description, start_date, due_date)
    values (c, 'Notiftest poster', 'Graphic Design', 'A test post.', today, today + 10)
    returning id into j2;

  -- A stand-in for the email sender that only COUNTS how often it is asked to
  -- send (in the setting test.email_calls). It is undone with everything else,
  -- so the real one comes back and no email can go out.
  create or replace function public.queue_offline_email(recipient uuid, email_topic text, details jsonb)
  returns void language plpgsql as $f$
  begin
    perform set_config('test.email_calls',
      (coalesce(nullif(current_setting('test.email_calls', true), ''), '0')::int + 1)::text, true);
  end;
  $f$;
  perform set_config('test.email_calls', '0', true);

  -- Control: an ordinary notification IS emailed (the sender is asked once).
  q0 := current_setting('test.email_calls')::int;
  insert into public.user_notifications (user_id, type, title, message)
    values (c, 'project_done', 'Notiftest control', 'Notiftest control');
  q1 := current_setting('test.email_calls')::int;

  -- f applies to j1.
  insert into public.job_applications (job_post_id, freelancer_id, resume_path)
    values (j1, f, f || '/' || j1 || '-1.pdf')
    returning id into a1;
  q2 := current_setting('test.email_calls')::int;

  -- ===== The notification =====
  select count(*) into n from public.user_notifications
  where user_id = c and type = 'application_new'
    and title = 'New applicant'
    and message = coalesce(f_name, 'A freelancer') || ' applied to your job "Notiftest logo".'
    and link = '/dashboard/projects?job=' || j1;
  res := res || case when n = 1 then E'\nPASS  1. the client got one "New applicant" notification with the name, job title and link'
                     else E'\nFAIL  1. expected 1 "New applicant" notification, found ' || n end;

  select count(*) into n from public.user_notifications where user_id = f and type = 'application_new';
  res := res || case when n = 0 then E'\nPASS  2. the freelancer who applied got no such notification'
                     else E'\nFAIL  2. the freelancer got ' || n || ' application_new notification(s)' end;

  -- ===== Emails =====
  res := res || case when q1 = q0 + 1 then E'\nPASS  3. control: an ordinary notification asks for an email'
                     else E'\nFAIL  3. control: the ordinary notification asked for ' || (q1 - q0) || ' email(s), expected 1' end;
  res := res || case when q2 = q1 then E'\nPASS  4. the "New applicant" notification asks for no extra email'
                     else E'\nFAIL  4. the "New applicant" notification asked for ' || (q2 - q1) || ' email(s)' end;

  -- ===== New / seen =====
  select seen_at into t from public.job_applications where id = a1;
  res := res || case when t is null then E'\nPASS  5. a new application starts as new (seen_at empty)'
                     else E'\nFAIL  5. a new application already has seen_at' end;

  select count(*) into n from public.job_applications where seen_at is null and id <> a1;
  res := res || case when n = 0 then E'\nPASS  6. the applications from before count as seen'
                     else E'\nFAIL  6. ' || n || ' older application(s) still count as new' end;

  -- f applies to j2 as well.
  insert into public.job_applications (job_post_id, freelancer_id, resume_path)
    values (j2, f, f || '/' || j2 || '-1.pdf')
    returning id into a2;

  set local role authenticated;

  -- The client counts their new applicants the way the website does.
  perform set_config('request.jwt.claims', json_build_object('sub', c, 'role', 'authenticated')::text, true);
  select count(*) into n from public.job_applications a
  where a.seen_at is null
    and exists (select 1 from public.job_posts j where j.id = a.job_post_id and j.client_id = c);
  res := res || case when n = 2 then E'\nPASS  7. the client sees 2 new applicants'
                     else E'\nFAIL  7. the client sees ' || n || ' new applicants, expected 2' end;

  -- Someone else can't mark them seen.
  perform set_config('request.jwt.claims', json_build_object('sub', f, 'role', 'authenticated')::text, true);
  select public.mark_applicants_seen(j1) into n;
  res := res || case when n = 0 then E'\nPASS  8. the freelancer cannot mark the client''s applicants as seen'
                     else E'\nFAIL  8. the freelancer marked ' || n || ' application(s) as seen' end;

  -- The client can't set seen_at directly (no UPDATE rule on the table).
  perform set_config('request.jwt.claims', json_build_object('sub', c, 'role', 'authenticated')::text, true);
  update public.job_applications set seen_at = now() where id = a1;
  get diagnostics n = row_count;
  res := res || case when n = 0 then E'\nPASS  9. the client cannot change seen_at directly'
                     else E'\nFAIL  9. the client changed seen_at directly' end;

  -- The client opens j1's applicants.
  select public.mark_applicants_seen(j1) into n;
  res := res || case when n = 1 then E'\nPASS 10. opening one job marks its 1 applicant as seen'
                     else E'\nFAIL 10. opening one job marked ' || n || ', expected 1' end;

  select public.mark_applicants_seen(j1) into n;
  res := res || case when n = 0 then E'\nPASS 11. opening it again marks nothing more'
                     else E'\nFAIL 11. opening it again marked ' || n end;

  select count(*) into n from public.job_applications a
  where a.seen_at is null
    and exists (select 1 from public.job_posts j where j.id = a.job_post_id and j.client_id = c);
  res := res || case when n = 1 then E'\nPASS 12. the other job''s applicant is still new (count 1)'
                     else E'\nFAIL 12. the client now sees ' || n || ' new, expected 1' end;

  -- No job given = all of the client's posts.
  select public.mark_applicants_seen() into n;
  res := res || case when n = 1 then E'\nPASS 13. with no job given, the rest are marked seen'
                     else E'\nFAIL 13. with no job given it marked ' || n || ', expected 1' end;

  -- Signed out: not allowed to call it at all.
  perform set_config('request.jwt.claims', '', true);
  set local role anon;
  begin
    perform public.mark_applicants_seen();
    res := res || E'\nFAIL 14. a signed-out visitor could call mark_applicants_seen';
  exception when insufficient_privilege then
    res := res || E'\nPASS 14. a signed-out visitor cannot call mark_applicants_seen';
  end;

  reset role;
  select count(*) into n from public.job_applications where id in (a1, a2) and seen_at is not null;
  res := res || case when n = 2 then E'\nPASS 15. both test applications are now seen'
                     else E'\nFAIL 15. only ' || n || ' of 2 test applications are seen' end;

  raise exception 'Notifications test results (all undone):%', res;
end;
$t$;


-- =====================================================================
-- Section 2 test: job post filled / job post closed (run AFTER Section 2).
-- Same way: borrows a real client and freelancer, makes up posts and
-- projects, ends with an error that undoes everything.
-- =====================================================================
do $t$
declare
  res text := '';
  c uuid; f uuid;
  today date := (now() at time zone 'Asia/Manila')::date;
  ja uuid;   -- needs 2 freelancers
  jb uuid;   -- needs 1 freelancer
  jx uuid;   -- its due date passed yesterday, nobody hired: expired
  jy uuid;   -- due in 10 days: open
  jz uuid;   -- due date passed, but filled
  n int;
begin
  -- A stand-in email sender (undone at the end), so no email can go out.
  create or replace function public.queue_offline_email(recipient uuid, email_topic text, details jsonb)
  returns void language plpgsql as $f$ begin null; end; $f$;

  select p.id into c from public.profiles p where p.account_type = 'client' order by p.created_at limit 1;
  select p.id into f from public.profiles p where p.account_type = 'freelancer' and p.id <> c order by p.created_at limit 1;
  if c is null or f is null then
    raise exception 'needs a client and a freelancer';
  end if;

  -- ===== Filled =====
  insert into public.job_posts (client_id, title, category, description, start_date, due_date, freelancers_needed)
    values (c, 'Notiftest team', 'Graphic Design', 'A test post.', today, today + 10, 2) returning id into ja;
  insert into public.job_posts (client_id, title, category, description, start_date, due_date, freelancers_needed)
    values (c, 'Notiftest solo', 'Graphic Design', 'A test post.', today, today + 10, 1) returning id into jb;

  insert into public.projects (client_id, freelancer_id, title, due_date, job_post_id) values (c, f, 'Notiftest team 1', today + 10, ja);
  select count(*) into n from public.user_notifications where type = 'job_filled' and link = '/dashboard/job-details/' || ja;
  res := res || case when n = 0 then E'\nPASS  1. 1 of 2 hired: no "filled" notice yet'
                     else E'\nFAIL  1. 1 of 2 hired already sent ' || n || ' "filled" notice(s)' end;

  insert into public.projects (client_id, freelancer_id, title, due_date, job_post_id) values (c, f, 'Notiftest team 2', today + 10, ja);
  select count(*) into n from public.user_notifications
  where user_id = c and type = 'job_filled' and title = 'Job post filled'
    and message = 'Your job post "Notiftest team" is filled: you hired the 2 freelancers it needed. It no longer shows on Find Jobs.'
    and link = '/dashboard/job-details/' || ja;
  res := res || case when n = 1 then E'\nPASS  2. 2 of 2 hired: the client got one "Job post filled" notice'
                     else E'\nFAIL  2. 2 of 2 hired: expected 1 "filled" notice, found ' || n end;

  insert into public.projects (client_id, freelancer_id, title, due_date, job_post_id) values (c, f, 'Notiftest team 3', today + 10, ja);
  select count(*) into n from public.user_notifications where type = 'job_filled' and link = '/dashboard/job-details/' || ja;
  res := res || case when n = 1 then E'\nPASS  3. a hire past the number sends no second notice'
                     else E'\nFAIL  3. found ' || n || ' "filled" notices after a third hire' end;

  insert into public.projects (client_id, freelancer_id, title, due_date, job_post_id) values (c, f, 'Notiftest solo 1', today + 10, jb);
  select count(*) into n from public.user_notifications
  where type = 'job_filled' and link = '/dashboard/job-details/' || jb
    and message like '%you hired the freelancer it needed.%';
  res := res || case when n = 1 then E'\nPASS  4. a post that needed 1: "you hired the freelancer it needed"'
                     else E'\nFAIL  4. the 1-freelancer post: found ' || n || ' matching notice(s)' end;

  insert into public.projects (client_id, freelancer_id, title, due_date) values (c, f, 'Notiftest booking', today + 10);
  select count(*) into n from public.user_notifications where user_id = c and type = 'job_filled' and created_at = now();
  res := res || case when n = 2 then E'\nPASS  5. a project from a booking (no job post) sends nothing'
                     else E'\nFAIL  5. expected 2 "filled" notices in this test, found ' || n end;

  -- ===== Closed (expired) =====
  select count(*) into n from public.job_posts j
  where public.job_state(j.id) = 'expired'
    and not exists (select 1 from public.scheduled_notices s where s.kind = 'job_expired' and s.target_id = j.id and s.due_date = j.due_date);
  res := res || case when n = 0 then E'\nPASS  6. the posts that were already expired count as told (no old news)'
                     else E'\nFAIL  6. ' || n || ' already-expired post(s) would get a notice' end;

  insert into public.job_posts (client_id, title, category, description, start_date, due_date, created_at)
    values (c, 'Notiftest expired', 'Graphic Design', 'A test post.', today - 10, today - 1, now() - interval '10 days') returning id into jx;
  insert into public.job_posts (client_id, title, category, description, start_date, due_date)
    values (c, 'Notiftest open', 'Graphic Design', 'A test post.', today, today + 10) returning id into jy;
  insert into public.job_posts (client_id, title, category, description, start_date, due_date, created_at)
    values (c, 'Notiftest filled late', 'Graphic Design', 'A test post.', today - 10, today - 1, now() - interval '10 days') returning id into jz;
  insert into public.projects (client_id, freelancer_id, title, due_date, job_post_id) values (c, f, 'Notiftest filled late 1', today + 3, jz);

  select public.send_daily_notices() into n;
  res := res || case when n = 1 then E'\nPASS  7. the daily job sent exactly 1 notice'
                     else E'\nFAIL  7. the daily job sent ' || n || ' notice(s), expected 1' end;

  select count(*) into n from public.user_notifications
  where user_id = c and type = 'job_expired' and title = 'Job post closed'
    and message = 'Your job post "Notiftest expired" closed because its due date passed. Edit it to reopen it.'
    and link = '/dashboard/job-details/' || jx;
  res := res || case when n = 1 then E'\nPASS  8. the expired post got one "Job post closed" notice'
                     else E'\nFAIL  8. the expired post got ' || n || ' notice(s)' end;

  select count(*) into n from public.user_notifications
  where type = 'job_expired' and link in ('/dashboard/job-details/' || jy, '/dashboard/job-details/' || jz);
  res := res || case when n = 0 then E'\nPASS  9. an open post and a filled post get no "closed" notice'
                     else E'\nFAIL  9. an open or filled post got ' || n || ' "closed" notice(s)' end;

  select public.send_daily_notices() into n;
  res := res || case when n = 0 then E'\nPASS 10. running it again sends nothing'
                     else E'\nFAIL 10. running it again sent ' || n end;

  -- The client changed the dates and it expired again: a new notice.
  update public.job_posts set due_date = today - 2 where id = jx;
  perform public.send_daily_notices();
  select count(*) into n from public.user_notifications where type = 'job_expired' and link = '/dashboard/job-details/' || jx;
  res := res || case when n = 2 then E'\nPASS 11. a new due date that passes again sends a new notice'
                     else E'\nFAIL 11. after a new due date passed, found ' || n || ' notice(s), expected 2' end;

  -- ===== Who can use it =====
  perform set_config('request.jwt.claims', json_build_object('sub', c, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    perform public.send_daily_notices();
    res := res || E'\nFAIL 12. a signed-in user could run the daily job';
  exception when insufficient_privilege then
    res := res || E'\nPASS 12. a signed-in user cannot run the daily job';
  end;
  begin
    select count(*) into n from public.scheduled_notices;
    res := res || E'\nFAIL 13. a signed-in user could read the sent log (' || n || ' rows)';
  exception when insufficient_privilege then
    res := res || E'\nPASS 13. a signed-in user cannot read the sent log';
  end;
  reset role;

  select count(*) into n from cron.job where jobname = 'daily-notices' and schedule = '0 0 * * *'
    and command = 'select public.send_daily_notices()';
  res := res || case when n = 1 then E'\nPASS 14. the daily job is scheduled for 8:00 AM Manila (00:00 UTC)'
                     else E'\nFAIL 14. the daily job is not scheduled as expected' end;

  raise exception 'Section 2 test results (all undone):%', res;
end;
$t$;
