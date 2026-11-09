-- Tests for database/supabase_late_block_schema.sql. Paste into the Supabase SQL
-- Editor AFTER that file. Everything rolls back by itself: the block ends with
-- an error whose text holds the PASS/FAIL lines. It borrows existing accounts
-- (a verified freelancer with no late project, and two clients) and adds its
-- own made-up job posts and projects, which roll back. The notification and
-- email triggers on job_applications are switched off inside the block (that
-- also rolls back), so nobody is told about the made-up applications.

do $$
declare
  today date := (now() at time zone 'Asia/Manila')::date;
  fl uuid; cl uuid; cl2 uuid; other uuid;
  job1 uuid; job2 uuid;
  p_on_time uuid; p_sent_late uuid; p_not_sent uuid; p_due_today uuid; p_resent uuid;
  first_time timestamptz;
  n integer;
  ok boolean;
  out text := '';
begin
  alter table public.job_applications disable trigger notify_new_applicant;
  alter table public.job_applications disable trigger email_offline_on_application;

  -- People (only read; everything they get here rolls back).
  select p.id into fl from public.profiles p
  where p.account_type = 'freelancer' and public.is_verified(p.id) and not public.is_posting_blocked(p.id)
    and not exists (select 1 from public.projects x where x.freelancer_id = p.id and public.missed_deadline(x))
  limit 1;
  select p.id into cl from public.profiles p where p.id <> fl limit 1;
  select p.id into cl2 from public.profiles p where p.id not in (fl, cl) limit 1;
  select p.id into other from public.profiles p where p.id not in (fl, cl, cl2) limit 1;
  if fl is null or cl is null or cl2 is null or other is null then
    raise exception 'needs a verified freelancer with no late project and three other accounts';
  end if;

  -- Two open job posts: one by the client of the late projects, one by someone else.
  insert into public.job_posts (client_id, title, category, description, start_date, due_date)
  values (cl, 'Test post one', (select category from public.job_posts limit 1), 'A made-up post for a rolled-back test.', today + 1, today + 10)
  returning id into job1;
  insert into public.job_posts (client_id, title, category, description, start_date, due_date)
  values (cl2, 'Test post two', (select category from public.job_posts limit 1), 'A made-up post for a rolled-back test.', today + 1, today + 10)
  returning id into job2;

  -- Projects between fl (freelancer) and cl (client).
  insert into public.projects (client_id, freelancer_id, title, due_date) values (cl, fl, 'On time', today - 2) returning id into p_on_time;
  insert into public.projects (client_id, freelancer_id, title, due_date) values (cl, fl, 'Sent late', today - 2) returning id into p_sent_late;
  insert into public.projects (client_id, freelancer_id, title, due_date) values (cl, fl, 'Not sent', today - 1) returning id into p_not_sent;
  insert into public.projects (client_id, freelancer_id, title, due_date) values (cl, fl, 'Due today', today) returning id into p_due_today;
  insert into public.projects (client_id, freelancer_id, title, due_date) values (cl, fl, 'Re-sent', today - 3) returning id into p_resent;
  -- Sent at noon Manila on the due date / the day after it.
  update public.projects set status = 'submitted', submitted_at = ((today - 2)::timestamp + interval '12 hours') at time zone 'Asia/Manila' where id = p_on_time;
  update public.projects set status = 'submitted', submitted_at = ((today - 1)::timestamp + interval '12 hours') at time zone 'Asia/Manila' where id = p_sent_late;
  -- Sent on time, sent back for changes, sent again after the due date.
  update public.projects set status = 'submitted', submitted_at = ((today - 3)::timestamp + interval '9 hours') at time zone 'Asia/Manila' where id = p_resent;
  select first_submitted_at into first_time from public.projects where id = p_resent;
  update public.projects set status = 'submitted', submitted_at = now() where id = p_resent;
  update public.projects set first_submitted_at = null where id = p_resent;

  -- 1-5: what counts as late.
  select public.missed_deadline(p) into ok from public.projects p where p.id = p_on_time;
  out := out || format('1 sent on the due date is on time = %s %s; ', not ok, case when not ok then 'PASS' else 'FAIL' end);
  select public.missed_deadline(p) into ok from public.projects p where p.id = p_sent_late;
  out := out || format('2 sent the day after is late = %s %s; ', ok, case when ok then 'PASS' else 'FAIL' end);
  select public.missed_deadline(p) into ok from public.projects p where p.id = p_not_sent;
  out := out || format('3 not sent, due yesterday, is late = %s %s; ', ok, case when ok then 'PASS' else 'FAIL' end);
  select public.missed_deadline(p) into ok from public.projects p where p.id = p_due_today;
  out := out || format('4 not sent, due today, is not late yet = %s %s; ', not ok, case when not ok then 'PASS' else 'FAIL' end);
  select (p.first_submitted_at = first_time) into ok from public.projects p where p.id = p_resent;
  out := out || format('5 the first sending time is kept (re-sent later, and an attempt to clear it) = %s %s; ', ok, case when ok then 'PASS' else 'FAIL' end);
  select public.missed_deadline(p) into ok from public.projects p where p.id = p_resent;
  out := out || format('6 sent on time then re-sent after changes is not late = %s %s; ', not ok, case when not ok then 'PASS' else 'FAIL' end);

  -- As the freelancer.
  perform set_config('request.jwt.claims', json_build_object('sub', fl, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', fl::text, true);
  set local role authenticated;
  select count(*) into n from public.projects p where p.freelancer_id = fl and p.client_id = cl and p.missed_deadline;
  out := out || format('7 the freelancer sees 2 late projects with this client (web API column) = %s %s; ', n, case when n = 2 then 'PASS' else 'FAIL' end);
  out := out || format('8 blocked for that client''s post = %s %s; ', public.blocked_for_lateness(job1), case when public.blocked_for_lateness(job1) then 'PASS' else 'FAIL' end);
  out := out || format('9 not blocked for another client''s post = %s %s; ', not public.blocked_for_lateness(job2), case when not public.blocked_for_lateness(job2) then 'PASS' else 'FAIL' end);
  begin
    insert into public.job_applications (job_post_id, freelancer_id, resume_path) values (job1, fl, fl || '/' || job1 || '-1.pdf');
    out := out || '10 applying to that client''s post refused FAIL; ';
  exception when insufficient_privilege then
    out := out || '10 applying to that client''s post refused PASS; ';
  end;
  begin
    insert into public.job_applications (job_post_id, freelancer_id, resume_path) values (job2, fl, fl || '/' || job2 || '-1.pdf');
    out := out || '11 applying to another client''s post allowed PASS; ';
  exception when others then
    out := out || format('11 applying to another client''s post allowed FAIL (%s); ', sqlerrm);
  end;
  begin
    perform public.allow_late_freelancer(p_not_sent);
    out := out || '12 the freelancer can''t allow themselves FAIL; ';
  exception when others then
    out := out || '12 the freelancer can''t allow themselves PASS; ';
  end;
  reset role;

  -- Someone else can't allow it either.
  perform set_config('request.jwt.claims', json_build_object('sub', other, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', other::text, true);
  set local role authenticated;
  begin
    perform public.allow_late_freelancer(p_not_sent);
    out := out || '13 a stranger can''t allow it FAIL; ';
  exception when others then
    out := out || '13 a stranger can''t allow it PASS; ';
  end;
  reset role;

  -- The client allows one late project: still blocked by the other one.
  perform set_config('request.jwt.claims', json_build_object('sub', cl, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', cl::text, true);
  set local role authenticated;
  begin
    perform public.allow_late_freelancer(p_on_time);
    out := out || '14 allowing a project that wasn''t late is refused FAIL; ';
  exception when others then
    out := out || '14 allowing a project that wasn''t late is refused PASS; ';
  end;
  perform public.allow_late_freelancer(p_sent_late);
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', fl, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', fl::text, true);
  set local role authenticated;
  ok := public.blocked_for_lateness(job1);
  out := out || format('15 one of two late projects allowed: still blocked = %s %s; ', ok, case when ok then 'PASS' else 'FAIL' end);
  reset role;

  -- The client allows the other one too: the freelancer may apply again.
  perform set_config('request.jwt.claims', json_build_object('sub', cl, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', cl::text, true);
  set local role authenticated;
  perform public.allow_late_freelancer(p_not_sent);
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', fl, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', fl::text, true);
  set local role authenticated;
  begin
    insert into public.job_applications (job_post_id, freelancer_id, resume_path) values (job1, fl, fl || '/' || job1 || '-2.pdf');
    out := out || '16 after both are allowed, applying works PASS; ';
  exception when others then
    out := out || format('16 after both are allowed, applying works FAIL (%s); ', sqlerrm);
  end;
  reset role;

  select count(*) into n from public.projects where id in (p_sent_late, p_not_sent) and late_allowed_at is not null;
  out := out || format('17 both projects record when they were allowed = %s %s; ', n, case when n = 2 then 'PASS' else 'FAIL' end);
  out := out || format('18 signed-out users can''t call the functions = %s %s; ',
    not (has_function_privilege('anon', 'public.blocked_for_lateness(uuid)', 'execute') or has_function_privilege('anon', 'public.allow_late_freelancer(uuid)', 'execute')),
    case when not (has_function_privilege('anon', 'public.blocked_for_lateness(uuid)', 'execute') or has_function_privilege('anon', 'public.allow_late_freelancer(uuid)', 'execute')) then 'PASS' else 'FAIL' end);

  raise exception 'RESULTS: %', out;
end;
$$;
