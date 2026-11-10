-- Test for supabase_end_project_more_schema.sql (PLAN-end-project.md, round 2). Run it in the
-- Supabase SQL Editor AFTER the schema file. Nothing stays: the last line raises an error that
-- carries the PASS / FAIL list, and that rolls everything back.
--
-- It borrows two clients and two freelancers (no made-up accounts, so no user numbers are used
-- up), adds made-up job posts, projects, payments and requests for more time as the owner, and acts
-- as each person (the id the database rules see through auth.uid()). The email trigger of
-- user_notifications is switched off for the test (it comes back with the rollback), so nobody is
-- emailed. "Late 31" means the due date was 31 days ago (Manila days).
--
-- People: cl the client, fr the freelancer, cl2 an outsider client, fr2 another freelancer.

do $$
declare
  today date := (now() at time zone 'Asia/Manila')::date;
  cl uuid; cl2 uuid; fr uuid; fr2 uuid; adm uuid;
  job1 uuid; job2 uuid;
  c1 uuid; c2 uuid; c3 uuid; c4 uuid;
  w1 uuid; w2 uuid; w3 uuid; w4 uuid; w5 uuid; w6 uuid; w7 uuid;
  a1 uuid; a2 uuid; a3 uuid; a4 uuid; a5 uuid; a6 uuid; a7 uuid; a9 uuid;
  msg text; fm text; cm text; n integer; made integer; ended_admin integer; ended_all integer;
begin
  alter table public.user_notifications disable trigger user;

  select p.id into cl from public.profiles p where p.account_type = 'client' and not public.is_posting_blocked(p.id) limit 1;
  select p.id into cl2 from public.profiles p where p.account_type = 'client' and p.id <> cl and not public.is_posting_blocked(p.id) limit 1;
  select p.id into fr from public.profiles p where p.account_type = 'freelancer' limit 1;
  select p.id into fr2 from public.profiles p where p.account_type = 'freelancer' and p.id <> fr limit 1;
  select a.id into adm from public.admins a limit 1;
  if cl is null or cl2 is null or fr is null or fr2 is null then
    raise exception 'The test needs two clients and two freelancers to borrow.';
  end if;

  create function pg_temp.chk(label text, passed boolean, detail text default null) returns void
  language plpgsql as $f$
  begin
    perform set_config('test.report',
      coalesce(current_setting('test.report', true), '')
        || case when coalesce(passed, false) then 'PASS  ' else 'FAIL  ' end || label
        || case when not coalesce(passed, false) and detail is not null then '  -> ' || detail else '' end || E'\n', true);
  end;
  $f$;

  create function pg_temp.act(u uuid) returns void
  language plpgsql as $f$
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true);
    perform set_config('request.jwt.claim.sub', u::text, true);
  end;
  $f$;

  -- A made-up project; due_in counts from today (negative = already late).
  create function pg_temp.mk(cl uuid, fr uuid, label text, st text, due_in integer, job uuid, sent_before boolean default false)
  returns uuid language plpgsql as $f$
  declare new_id uuid;
  begin
    insert into public.projects (client_id, freelancer_id, job_post_id, title, status, due_date,
                                 first_submitted_at, submitted_at, completed_at, ended_at, ended_by)
    values (cl, fr, job, label, st, (now() at time zone 'Asia/Manila')::date + due_in,
            case when sent_before or st in ('submitted', 'done') then now() - interval '12 days' end,
            case when st = 'submitted' then now() - interval '12 days' end,
            case when st = 'done' then now() end,
            case when st = 'ended' then now() end,
            case when st = 'ended' then 'client' end)
    returning id into new_id;
    return new_id;
  end;
  $f$;

  create function pg_temp.sent_log(kind text, proj uuid, due_in integer) returns void
  language sql as $f$
    insert into public.scheduled_notices (kind, target_id, due_date)
    values (kind, proj, (now() at time zone 'Asia/Manila')::date + due_in);
  $f$;

  create function pg_temp.try_end(u uuid, proj uuid, note text default null) returns text
  language plpgsql as $f$
  declare msg text;
  begin
    perform pg_temp.act(u);
    begin
      perform public.end_project(proj, note);
      msg := 'ended';
    exception when others then
      msg := sqlerrm;
    end;
    return msg;
  end;
  $f$;

  create function pg_temp.try_withdraw(u uuid, proj uuid, note text default null) returns text
  language plpgsql as $f$
  declare msg text;
  begin
    perform pg_temp.act(u);
    begin
      perform public.withdraw_from_project(proj, note);
      msg := 'withdrawn';
    exception when others then
      msg := sqlerrm;
    end;
    return msg;
  end;
  $f$;

  create function pg_temp.notice_text(proj uuid, who uuid, kind text, wanted_title text default null) returns text
  language sql as $f$
    select message from public.user_notifications
    where link = '/dashboard/project-details/' || proj and user_id = who and type = kind
      and (wanted_title is null or title = wanted_title)
    order by created_at limit 1;
  $f$;

  create function pg_temp.status_of(proj uuid) returns text
  language sql as $f$ select status from public.projects where id = proj; $f$;

  -- ===== The made-up posts and projects =====
  insert into public.job_posts (client_id, title, category, description, start_date, due_date)
  values (cl, 'ZZ job 1', (select category from public.job_posts limit 1), 'A made-up post for a rolled-back test.', today + 1, today + 10)
  returning id into job1;
  insert into public.job_posts (client_id, title, category, description, start_date, due_date)
  values (cl, 'ZZ job 2', (select category from public.job_posts limit 1), 'A made-up post for a rolled-back test.', today + 1, today + 10)
  returning id into job2;

  -- For the client's End project (the reason box): never sent, 9 days late, the 7 days late notice sent.
  c1 := pg_temp.mk(cl, fr, 'ZZ c1', 'started', -9, null);  perform pg_temp.sent_log('overdue_7', c1, -9);
  c2 := pg_temp.mk(cl, fr, 'ZZ c2', 'started', -9, null);  perform pg_temp.sent_log('overdue_7', c2, -9);
  c3 := pg_temp.mk(cl, fr, 'ZZ c3', 'started', -9, null);  perform pg_temp.sent_log('overdue_7', c3, -9);
  c4 := pg_temp.mk(cl, fr, 'ZZ c4', 'started', -9, null);  perform pg_temp.sent_log('overdue_7', c4, -9);
  -- For the freelancer's Withdraw.
  w1 := pg_temp.mk(cl, fr, 'ZZ w1', 'started', 5, job1);                -- on time, from a job post that needs 1
  w2 := pg_temp.mk(cl, fr, 'ZZ w2', 'started', -3, null, true);         -- late, work was sent once before
  w3 := pg_temp.mk(cl, fr, 'ZZ w3', 'submitted', 5, null);              -- work waits for review
  w4 := pg_temp.mk(cl, fr, 'ZZ w4', 'done', 5, null);                   -- done
  w5 := pg_temp.mk(cl, fr, 'ZZ w5', 'ended', 5, null);                  -- already ended
  w6 := pg_temp.mk(cl, fr, 'ZZ w6', 'started', 5, null);                -- a request for more time is waiting
  insert into public.delay_requests (project_id, kind, asked_by, from_date, to_date, reason, status)
  values (w6, 'work', fr, today + 5, today + 9, 'ZZ reason', 'pending');
  w7 := pg_temp.mk(cl, fr, 'ZZ w7', 'started', 5, null);                -- the client paid something
  insert into public.payments (project_id, client_id, freelancer_id, amount, tip_amount, reference_no, receipt_path, status, answered_at, received_amount)
  values (w7, cl, fr, 500, 0, '9990000000701', cl::text || '/zz-test.jpg', 'confirmed', now(), 500);
  -- For the automatic ending.
  a1 := pg_temp.mk(cl, fr, 'ZZ a1', 'started', -29, null);              -- 29 days late, never warned: the warning
  a2 := pg_temp.mk(cl, fr, 'ZZ a2', 'started', -31, null);  perform pg_temp.sent_log('end_warn', a2, -31);   -- warned: ended
  a3 := pg_temp.mk(cl, fr, 'ZZ a3', 'started', -31, null);              -- 31 days late but never warned: the warning first
  a4 := pg_temp.mk(cl, fr, 'ZZ a4', 'started', -31, null, true);  perform pg_temp.sent_log('end_warn', a4, -31);  -- sent once: untouched
  a5 := pg_temp.mk(cl, fr, 'ZZ a5', 'started', -28, null);              -- 28 days late: too early
  a6 := pg_temp.mk(cl, fr, 'ZZ a6', 'submitted', -40, null);            -- work waits for review: untouched
  a7 := pg_temp.mk(cl, fr, 'ZZ a7', 'started', -31, job2);  perform pg_temp.sent_log('end_warn', a7, -31);   -- from a post, a request waiting, paid
  insert into public.delay_requests (project_id, kind, asked_by, from_date, to_date, reason, status)
  values (a7, 'work', fr, today - 31, today - 25, 'ZZ reason', 'pending');
  insert into public.payments (project_id, client_id, freelancer_id, amount, tip_amount, reference_no, receipt_path, status, answered_at, received_amount)
  values (a7, cl, fr, 300, 0, '9990000000702', cl::text || '/zz-test.jpg', 'sent', null, null);

  -- ===== 1. What exists =====
  perform pg_temp.chk('the one-argument end_project is gone and the two-argument one exists',
    to_regprocedure('public.end_project(uuid)') is null and to_regprocedure('public.end_project(uuid, text)') is not null);
  perform pg_temp.chk('signed-in users can call end_project and withdraw_from_project, signed-out users can not',
    has_function_privilege('authenticated', 'public.end_project(uuid, text)', 'execute')
    and has_function_privilege('authenticated', 'public.withdraw_from_project(uuid, text)', 'execute')
    and not has_function_privilege('anon', 'public.end_project(uuid, text)', 'execute')
    and not has_function_privilege('anon', 'public.withdraw_from_project(uuid, text)', 'execute'));
  perform pg_temp.chk('users can not call the inside functions (auto_end_projects, end_project_row, clean_end_note)',
    not has_function_privilege('authenticated', 'public.auto_end_projects()', 'execute')
    and not has_function_privilege('anon', 'public.auto_end_projects()', 'execute')
    and not has_function_privilege('authenticated', 'public.end_project_row(uuid, text, text)', 'execute')
    and not has_function_privilege('authenticated', 'public.clean_end_note(text)', 'execute'));
  perform pg_temp.chk('the daily job calls auto_end_projects and admin_transactions counts ended projects',
    (select prosrc from pg_proc where oid = 'public.send_daily_notices()'::regprocedure) like '%auto_end_projects%'
    and (select prosrc from pg_proc where oid = 'public.admin_transactions()'::regprocedure) like '%''ended''%');

  -- ===== 2. The reason box (the client ends a project) =====
  msg := pg_temp.try_end(cl, c1, 'He stopped answering my messages');
  perform pg_temp.chk('the client can end a project and write why', msg = 'ended', msg);
  perform pg_temp.chk('...the reason, who ended it, and the time are saved',
    (select end_reason = 'He stopped answering my messages' and ended_by = 'client' and ended_at is not null and status = 'ended' from public.projects where id = c1));
  fm := pg_temp.notice_text(c1, fr, 'project_ended');
  perform pg_temp.chk('...the notice does not carry the reason (the email repeats the notice as it is)',
    fm like '% ended "ZZ c1" because it was 9 days late and no work was sent.%' and fm not like '%stopped answering%', fm);

  msg := pg_temp.try_end(cl, c2, '    ');
  perform pg_temp.chk('an empty reason is fine and saves nothing', msg = 'ended' and (select end_reason is null from public.projects where id = c2), msg);
  msg := pg_temp.try_end(cl, c3, 'ab');
  perform pg_temp.chk('a reason of 2 letters is refused in plain words', msg = 'Write a few words for the reason, or leave it empty.', msg);
  msg := pg_temp.try_end(cl, c3, repeat('x', 301));
  perform pg_temp.chk('a reason over 300 characters is refused', msg = 'The reason can be up to 300 characters.', msg);
  perform pg_temp.chk('...and a refused reason ended nothing', pg_temp.status_of(c3) = 'started');
  msg := pg_temp.try_end(cl, c3, repeat('x', 300));
  perform pg_temp.chk('exactly 300 characters is fine', msg = 'ended', msg);
  msg := pg_temp.try_end(cl, c4, 'what the fuck, he never replied');
  perform pg_temp.chk('the word filter covers the reason',
    msg = 'ended' and (select end_reason not like '%fuck%' and end_reason like '%never replied%' from public.projects where id = c4),
    coalesce((select end_reason from public.projects where id = c4), 'null'));
  msg := pg_temp.try_end(cl, c1, 'again');
  perform pg_temp.chk('round 1 rules still hold (an ended project can not be ended again)', msg = 'This project was already ended.', msg);

  -- ===== 3. The freelancer withdraws =====
  msg := pg_temp.try_withdraw(cl, w1);
  perform pg_temp.chk('the client can not withdraw for the freelancer', msg = 'Only the freelancer of this project can withdraw from it.', msg);
  msg := pg_temp.try_withdraw(fr2, w1);
  perform pg_temp.chk('another freelancer can not withdraw', msg = 'Only the freelancer of this project can withdraw from it.', msg);
  msg := pg_temp.try_withdraw(fr, gen_random_uuid());
  perform pg_temp.chk('an unknown project is refused the same way', msg = 'Only the freelancer of this project can withdraw from it.', msg);
  msg := pg_temp.try_withdraw(fr, w3);
  perform pg_temp.chk('work waiting for review: refused, and it says to wait for the review',
    msg like 'You can only withdraw from a project that is still waiting for your work.%wait for the client''s review.', msg);
  msg := pg_temp.try_withdraw(fr, w4);
  perform pg_temp.chk('a Done project: refused', msg = 'This project is already done.', msg);
  msg := pg_temp.try_withdraw(fr, w5);
  perform pg_temp.chk('an Ended project: refused', msg = 'This project was already ended.', msg);
  perform pg_temp.chk('the refusals changed nothing', pg_temp.status_of(w1) = 'started' and pg_temp.status_of(w3) = 'submitted' and pg_temp.status_of(w4) = 'done');

  perform pg_temp.chk('before: the post needs 1 and this freelancer fills it', public.job_state(job1) = 'filled');
  msg := pg_temp.try_withdraw(fr, w1, 'I took a full time job');
  perform pg_temp.chk('the freelancer can withdraw from a project that is not late yet, and write why', msg = 'withdrawn', msg);
  perform pg_temp.chk('...it is Ended by the freelancer, with the reason',
    (select status = 'ended' and ended_by = 'freelancer' and end_reason = 'I took a full time job' and ended_at is not null from public.projects where id = w1));
  cm := pg_temp.notice_text(w1, cl, 'project_ended');
  fm := pg_temp.notice_text(w1, fr, 'project_ended');
  perform pg_temp.chk('...the client is told who withdrew, that the place on the job post is open again, and can message them',
    cm like '% withdrew from "ZZ w1". Its place on your job post is open again, so you can hire someone else. It shows as Ended on both your histories.%You can message %.'
    and cm not like '%payment%', cm);
  perform pg_temp.chk('...the freelancer is told it shows as Ended on both histories', fm = 'You withdrew from "ZZ w1". It shows as Ended on both your histories.', fm);
  perform pg_temp.chk('...the post is open again', public.job_state(job1) = 'open');

  msg := pg_temp.try_withdraw(fr, w2);
  perform pg_temp.chk('a late project that was sent once before can also be withdrawn from', msg = 'withdrawn' and pg_temp.status_of(w2) = 'ended', msg);
  msg := pg_temp.try_withdraw(fr, w6);
  perform pg_temp.chk('withdrawing cancels the freelancer''s waiting request for more time',
    msg = 'withdrawn' and (select status = 'cancelled' and answered_at is not null from public.delay_requests where project_id = w6), msg);
  msg := pg_temp.try_withdraw(fr, w7, null);
  cm := pg_temp.notice_text(w7, cl, 'project_ended');
  fm := pg_temp.notice_text(w7, fr, 'project_ended');
  perform pg_temp.chk('when the client had paid, the client is told to ask for it back, and may report it',
    msg = 'withdrawn' and cm like '%A payment was recorded on this project. PhilFreela doesn''t hold money, so ask % to return it. If they don''t, you can report it as Scam / Fraud.%', cm);
  perform pg_temp.chk('...and the freelancer is told to give it back directly',
    fm like '%A payment was recorded on this project. PhilFreela doesn''t hold money, so give it back to % directly. Keeping money for work you didn''t deliver can be reported as Scam / Fraud.', fm);

  -- ===== 4. The automatic ending =====
  made := public.auto_end_projects();
  perform pg_temp.chk('29 days late and never warned: both are warned, and it is still Started',
    pg_temp.status_of(a1) = 'started'
    and (select count(*) from public.user_notifications where link = '/dashboard/project-details/' || a1 and title = 'Project will be ended tomorrow') = 2);
  fm := pg_temp.notice_text(a1, fr, 'project_overdue', 'Project will be ended tomorrow');
  cm := pg_temp.notice_text(a1, cl, 'project_overdue', 'Project will be ended tomorrow');
  perform pg_temp.chk('...the freelancer is told what to do',
    fm like '"ZZ a1" is 29 days late and no work was sent. If nothing is sent, it is ended automatically tomorrow morning.%Send your work on the project page, or message %.', fm);
  perform pg_temp.chk('...the client is told it can also be ended by hand now',
    cm like '"ZZ a1" is 29 days late and % never sent any work. If nothing is sent, it is ended automatically tomorrow morning. You can also end it yourself now.', cm);
  perform pg_temp.chk('...the warning is in the sent log, once',
    (select count(*) from public.scheduled_notices where kind = 'end_warn' and target_id = a1) = 1);
  perform pg_temp.chk('31 days late and never warned: the warning first, not ended',
    pg_temp.status_of(a3) = 'started'
    and (select count(*) from public.user_notifications where link = '/dashboard/project-details/' || a3 and title = 'Project will be ended tomorrow') = 2);

  perform pg_temp.chk('30+ days late and already warned: ended by the system',
    (select status = 'ended' and ended_by = 'system' and end_reason is null and ended_at is not null from public.projects where id = a2));
  fm := pg_temp.notice_text(a2, fr, 'project_ended');
  cm := pg_temp.notice_text(a2, cl, 'project_ended');
  perform pg_temp.chk('...the freelancer is told it was ended automatically, and can message the client',
    fm like '"ZZ a2" was ended automatically because it was 31 days late and no work was sent. It shows as Ended on both your histories.%You can message %.', fm);
  perform pg_temp.chk('...the client is told the same', cm = '"ZZ a2" was ended automatically because it was 31 days late and no work was sent. It shows as Ended on both your histories.', cm);
  perform pg_temp.chk('sent once before, 28 days late, or Submitted: untouched',
    pg_temp.status_of(a4) = 'started' and pg_temp.status_of(a5) = 'started' and pg_temp.status_of(a6) = 'submitted');
  perform pg_temp.chk('...and nothing was sent about them',
    (select count(*) from public.user_notifications where link in ('/dashboard/project-details/' || a4, '/dashboard/project-details/' || a5, '/dashboard/project-details/' || a6)) = 0);
  perform pg_temp.chk('from a job post, with a request waiting and a payment waiting: ended, the request cancelled, the place open again',
    pg_temp.status_of(a7) = 'ended'
    and (select status = 'cancelled' from public.delay_requests where project_id = a7)
    and public.job_state(job2) = 'open');
  cm := pg_temp.notice_text(a7, cl, 'project_ended');
  perform pg_temp.chk('...the client is told about the open place and the recorded payment',
    cm like '%Its place on your job post is open again, so you can hire someone else. It shows as Ended on both your histories. A payment was recorded on this project. If the work never came, you can report it.', cm);
  made := public.auto_end_projects();
  perform pg_temp.chk('the next morning: the 29 day project is warned only once, the 31 day one (warned just now) is ended',
    (select count(*) from public.user_notifications where link = '/dashboard/project-details/' || a1 and title = 'Project will be ended tomorrow') = 2
    and pg_temp.status_of(a3) = 'ended');

  -- The daily job itself calls it: another pair's project, warned yesterday, 31 days late.
  a9 := pg_temp.mk(cl2, fr2, 'ZZ a9', 'started', -31, null);  perform pg_temp.sent_log('end_warn', a9, -31);
  perform pg_temp.chk('before the daily job: it is still Started', pg_temp.status_of(a9) = 'started');
  n := public.send_daily_notices();
  perform pg_temp.chk('the daily job ends it (it calls auto_end_projects)', pg_temp.status_of(a9) = 'ended' and (select ended_by = 'system' from public.projects where id = a9));

  -- ===== 5. What an ended project leaves alone =====
  perform pg_temp.chk('an ended project is out of the late and review reminders (nothing new for the Ended ones)',
    (select count(*) from public.user_notifications where link = '/dashboard/project-details/' || w1 and type <> 'project_ended') = 0
    and (select count(*) from public.user_notifications where link = '/dashboard/project-details/' || a2 and type <> 'project_ended') = 0);

  -- ===== 6. The admin card =====
  if adm is null then
    perform pg_temp.chk('admin_transactions counts ended projects (no admin account to borrow here: only the source was checked above)', true);
  else
    perform pg_temp.act(adm);
    ended_admin := ((public.admin_transactions()::jsonb) -> 'projects' ->> 'ended')::integer;
    select count(*) into ended_all from public.projects p
     where p.status = 'ended' and not exists (select 1 from public.archived_users a where a.user_id in (p.client_id, p.freelancer_id));
    perform pg_temp.chk('admin_transactions: the Ended count is the number of ended projects (and the old counts are still there)',
      ended_admin = ended_all and ended_admin >= 10
      and (public.admin_transactions()::jsonb) -> 'projects' ? 'started'
      and (public.admin_transactions()::jsonb) -> 'projects' ? 'done', coalesce(ended_admin::text, 'null') || ' vs ' || ended_all);
  end if;

  raise exception E'RESULTS\n%', coalesce(current_setting('test.report', true), '(nothing was checked)');
end;
$$;
