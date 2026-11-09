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


-- =====================================================================
-- Section 3 test: due-date reminders and late notices (run AFTER Section 3).
-- Borrows a real client and freelancer, makes up projects with due dates
-- around today, runs the daily job twice, ends with an error that undoes
-- everything. Only the made-up projects' notices are counted (real projects
-- are processed too, inside the same undone block).
-- =====================================================================
do $t$
declare
  res text := '';
  c uuid; f uuid; f_name text;
  today date := (now() at time zone 'Asia/Manila')::date;
  p3 uuid; p2 uuid; p1 uuid; p0 uuid; s0 uuid; s3 uuid; l1 uuid; l10 uuid; sl uuid; pd uuid; pfar uuid;
  n int; m int;
  d3 text;
begin
  create or replace function public.queue_offline_email(recipient uuid, email_topic text, details jsonb)
  returns void language plpgsql as $f$ begin null; end; $f$;

  select p.id into c from public.profiles p where p.account_type = 'client' order by p.created_at limit 1;
  select p.id, coalesce(nullif(p.full_name, ''), p.username) into f, f_name
  from public.profiles p where p.account_type = 'freelancer' and p.id <> c order by p.created_at limit 1;
  if c is null or f is null then
    raise exception 'needs a client and a freelancer';
  end if;
  d3 := to_char(today + 3, 'FMMonth FMDD');

  insert into public.projects (client_id, freelancer_id, title, due_date) values (c, f, 'Notiftest p3', today + 3) returning id into p3;
  insert into public.projects (client_id, freelancer_id, title, due_date) values (c, f, 'Notiftest p2', today + 2) returning id into p2;
  insert into public.projects (client_id, freelancer_id, title, due_date) values (c, f, 'Notiftest p1', today + 1) returning id into p1;
  insert into public.projects (client_id, freelancer_id, title, due_date) values (c, f, 'Notiftest p0', today) returning id into p0;
  insert into public.projects (client_id, freelancer_id, title, due_date, status, submitted_at) values (c, f, 'Notiftest s0', today, 'submitted', now()) returning id into s0;
  insert into public.projects (client_id, freelancer_id, title, due_date, status, submitted_at) values (c, f, 'Notiftest s3', today + 3, 'submitted', now()) returning id into s3;
  insert into public.projects (client_id, freelancer_id, title, due_date) values (c, f, 'Notiftest l1', today - 1) returning id into l1;
  insert into public.projects (client_id, freelancer_id, title, due_date) values (c, f, 'Notiftest l10', today - 10) returning id into l10;
  insert into public.projects (client_id, freelancer_id, title, due_date, status, submitted_at) values (c, f, 'Notiftest sl', today - 5, 'submitted', now()) returning id into sl;
  insert into public.projects (client_id, freelancer_id, title, due_date, status, submitted_at, completed_at) values (c, f, 'Notiftest done', today - 2, 'done', now(), now()) returning id into pd;
  insert into public.projects (client_id, freelancer_id, title, due_date) values (c, f, 'Notiftest far', today + 5) returning id into pfar;

  perform public.send_daily_notices();

  -- ===== Due soon / due today =====
  select count(*) into n from public.user_notifications where user_id = f and type = 'project_due_soon'
    and title = 'Project due soon' and link = '/dashboard/project-details/' || p3
    and message = '"Notiftest p3" is due in 3 days (' || d3 || '). Submit your work on the project page.';
  select count(*) into m from public.user_notifications where user_id = c and type = 'project_due_soon'
    and link = '/dashboard/project-details/' || p3
    and message = '"Notiftest p3" is due in 3 days (' || d3 || '). ' || f_name || ' is working on it.';
  res := res || case when n = 1 and m = 1 then E'\nPASS  1. 3 days left: the freelancer and the client each got "due in 3 days (date)"'
                     else E'\nFAIL  1. 3 days left: freelancer ' || n || ', client ' || m end;

  select count(*) into n from public.user_notifications where link = '/dashboard/project-details/' || p2 and message like '%is due in 2 days (%';
  res := res || case when n = 2 then E'\nPASS  2. 2 days left: both got "due in 2 days"'
                     else E'\nFAIL  2. 2 days left: found ' || n end;

  select count(*) into n from public.user_notifications where link = '/dashboard/project-details/' || p1 and type = 'project_due_soon' and message like '%is due tomorrow (%';
  res := res || case when n = 2 then E'\nPASS  3. 1 day left: both got "due tomorrow"'
                     else E'\nFAIL  3. 1 day left: found ' || n end;

  select count(*) into n from public.user_notifications where link = '/dashboard/project-details/' || p0 and type = 'project_due_today'
    and title = 'Project due today' and message in ('"Notiftest p0" is due today. Submit your work on the project page.', '"Notiftest p0" is due today. ' || f_name || ' is working on it.');
  res := res || case when n = 2 then E'\nPASS  4. due today: both got "due today" (no date in brackets)'
                     else E'\nFAIL  4. due today: found ' || n end;

  -- ===== Submitted work =====
  select count(*) into n from public.user_notifications where user_id = c and type = 'project_review_reminder'
    and title = 'Work waiting for your review' and link = '/dashboard/project-details/' || s0
    and message = f_name || '''s work for "Notiftest s0" is waiting for your review. The project is due today.';
  select count(*) into m from public.user_notifications where user_id = f and link = '/dashboard/project-details/' || s0;
  res := res || case when n = 1 and m = 0 then E'\nPASS  5. submitted and due today: only the client is asked to review'
                     else E'\nFAIL  5. submitted and due today: client ' || n || ', freelancer ' || m end;

  select count(*) into n from public.user_notifications
  where link in ('/dashboard/project-details/' || s3, '/dashboard/project-details/' || sl, '/dashboard/project-details/' || pd, '/dashboard/project-details/' || pfar)
    and type in ('project_due_soon', 'project_due_today', 'project_overdue', 'project_review_reminder');
  res := res || case when n = 0 then E'\nPASS  6. submitted (not due today), Done and 5-days-away projects get nothing'
                     else E'\nFAIL  6. those projects got ' || n || ' notice(s)' end;

  -- ===== Late =====
  select count(*) into n from public.user_notifications where user_id = f and type = 'project_overdue' and title = 'Project is late'
    and link = '/dashboard/project-details/' || l1 and message = '"Notiftest l1" is 1 day late. Submit your work or message the client.';
  select count(*) into m from public.user_notifications where user_id = c and type = 'project_overdue'
    and link = '/dashboard/project-details/' || l1 and message = '"Notiftest l1" is 1 day late. Message ' || f_name || ' to ask about it.';
  res := res || case when n = 1 and m = 1 then E'\nPASS  7. 1 day late: the freelancer and the client each got a late notice'
                     else E'\nFAIL  7. 1 day late: freelancer ' || n || ', client ' || m end;

  select count(*) into n from public.user_notifications where link = '/dashboard/project-details/' || l10 and type = 'project_overdue' and message like '%is 10 days late.%';
  select count(*) into m from public.user_notifications where link = '/dashboard/project-details/' || l10;
  res := res || case when n = 2 and m = 2 then E'\nPASS  8. 10 days late: one notice each ("10 days late"), not two'
                     else E'\nFAIL  8. 10 days late: matching ' || n || ', all ' || m end;

  -- ===== Never twice =====
  select count(*) into n from public.user_notifications
  where type in ('project_due_soon', 'project_due_today', 'project_overdue', 'project_review_reminder')
    and link in (select '/dashboard/project-details/' || x from unnest(array[p3, p2, p1, p0, s0, s3, l1, l10, sl, pd, pfar]) x);
  perform public.send_daily_notices();
  select count(*) into m from public.user_notifications
  where type in ('project_due_soon', 'project_due_today', 'project_overdue', 'project_review_reminder')
    and link in (select '/dashboard/project-details/' || x from unnest(array[p3, p2, p1, p0, s0, s3, l1, l10, sl, pd, pfar]) x);
  res := res || case when n = 13 and m = 13 then E'\nPASS  9. 13 notices the first time, none more the second time'
                     else E'\nFAIL  9. first run ' || n || ' (expected 13), after the second run ' || m end;

  -- ===== Who can use it =====
  perform set_config('request.jwt.claims', json_build_object('sub', f, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    perform public.send_daily_notices();
    res := res || E'\nFAIL 10. a signed-in user could run the daily job';
  exception when insufficient_privilege then
    res := res || E'\nPASS 10. a signed-in user cannot run the daily job';
  end;
  reset role;

  raise exception 'Section 3 test results (all undone):%', res;
end;
$t$;


-- =====================================================================
-- Section 4 test: read / unread for each item (run AFTER Section 4).
-- Borrows two real people, adds made-up notifications and an announcement,
-- ends with an error that undoes everything.
-- =====================================================================
do $t$
declare
  res text := '';
  u uuid; v uuid;          -- two borrowed people
  n1 uuid; n2 uuid;        -- u's made-up notifications
  ann uuid;                -- a made-up announcement
  seen timestamptz;
  n int;
  t timestamptz;
begin
  create or replace function public.queue_offline_email(recipient uuid, email_topic text, details jsonb)
  returns void language plpgsql as $f$ begin null; end; $f$;

  select p.id, p.notifications_seen_at into u, seen from public.profiles p order by p.created_at limit 1;
  select p.id into v from public.profiles p where p.id <> u order by p.created_at limit 1;

  insert into public.user_notifications (user_id, type, title, message) values (u, 'project_done', 'Notiftest one', 'Notiftest one') returning id into n1;
  insert into public.user_notifications (user_id, type, title, message) values (u, 'project_done', 'Notiftest two', 'Notiftest two') returning id into n2;
  insert into public.announcements (title, message, audience) values ('Notiftest news', 'Notiftest news', 'all') returning id into ann;

  select read_at into t from public.user_notifications where id = n1;
  res := res || case when t is null then E'\nPASS  1. a new notification starts unread (read_at empty)'
                     else E'\nFAIL  1. a new notification already has read_at' end;

  set local role authenticated;

  -- Someone else can't mark u's notification.
  perform set_config('request.jwt.claims', json_build_object('sub', v, 'role', 'authenticated')::text, true);
  perform public.mark_notification_read('notification', n1);
  -- u opens n1.
  perform set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true);
  select count(*) into n from public.user_notifications where id = n1 and read_at is null;
  res := res || case when n = 1 then E'\nPASS  2. another person cannot mark someone''s notification as read'
                     else E'\nFAIL  2. another person marked it' end;
  perform public.mark_notification_read('notification', n1);
  select count(*) into n from public.user_notifications where id in (n1, n2) and read_at is not null;
  res := res || case when n = 1 then E'\nPASS  3. opening one notification marks only that one'
                     else E'\nFAIL  3. ' || n || ' marked, expected 1' end;

  -- The unread count the website asks for: newer than seen_at and not opened.
  select count(*) into n from public.user_notifications
  where created_at > coalesce(seen, '-infinity'::timestamptz) and read_at is null and id in (n1, n2);
  res := res || case when n = 1 then E'\nPASS  4. the unread count drops by one (1 of the 2 left)'
                     else E'\nFAIL  4. unread count ' || n || ', expected 1' end;

  -- Can't change read_at directly.
  update public.user_notifications set read_at = null where id = n1;
  get diagnostics n = row_count;
  res := res || case when n = 0 then E'\nPASS  5. nobody can change read_at directly'
                     else E'\nFAIL  5. read_at was changed directly' end;

  -- Announcements.
  perform public.mark_notification_read('announcement', ann);
  perform public.mark_notification_read('announcement', ann);
  select count(*) into n from public.announcement_reads where announcement_id = ann;
  res := res || case when n = 1 then E'\nPASS  6. opening an announcement marks it read for this person (once)'
                     else E'\nFAIL  6. found ' || n || ' read mark(s)' end;

  perform set_config('request.jwt.claims', json_build_object('sub', v, 'role', 'authenticated')::text, true);
  select count(*) into n from public.announcement_reads where announcement_id = ann;
  res := res || case when n = 0 then E'\nPASS  7. another person cannot see that mark, and it is still unread for them'
                     else E'\nFAIL  7. the other person sees ' || n || ' mark(s)' end;

  begin
    insert into public.announcement_reads (user_id, announcement_id) values (v, ann);
    res := res || E'\nFAIL  8. a person could add a read mark directly';
  exception when insufficient_privilege then
    res := res || E'\nPASS  8. nobody can add a read mark directly';
  end;

  begin
    perform public.mark_notification_read('something', ann);
    res := res || E'\nFAIL  9. an unknown kind was accepted';
  exception when raise_exception then
    res := res || E'\nPASS  9. an unknown kind is refused';
  end;

  perform set_config('request.jwt.claims', '', true);
  set local role anon;
  begin
    perform public.mark_notification_read('notification', n2);
    res := res || E'\nFAIL 10. a signed-out visitor could call it';
  exception when insufficient_privilege then
    res := res || E'\nPASS 10. a signed-out visitor cannot call it';
  end;
  reset role;

  raise exception 'Section 4 test results (all undone):%', res;
end;
$t$;
