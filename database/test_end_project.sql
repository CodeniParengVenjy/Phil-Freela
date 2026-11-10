-- Test for supabase_end_project_schema.sql (PLAN-end-project.md, Step 1). Run it in the
-- Supabase SQL Editor AFTER the schema file. Nothing stays: the last line raises an error
-- that carries the PASS / FAIL list, and that rolls everything back.
--
-- It borrows two clients and two freelancers (no made-up accounts, so no user numbers are
-- used up), adds made-up job posts, projects and a request for more time as the owner, and
-- acts as each person (the id the database rules see through auth.uid()). The email trigger
-- of user_notifications is switched off for the test (it comes back with the rollback), so
-- nobody is emailed.
--
-- People: cl is the client, fr the freelancer, cl2 an outsider client, fr2 another freelancer.
-- Days are Manila days: "late 9" means the due date was 9 days ago.

do $$
declare
  today date := (now() at time zone 'Asia/Manila')::date;
  cl uuid; cl2 uuid; fr uuid; fr2 uuid;
  job1 uuid; job2 uuid;
  pa uuid; pb uuid; pc uuid; pd uuid; pe uuid; pf uuid; pg uuid; ph uuid; pi uuid; pj uuid; pk uuid; pr uuid;
  p2a uuid; p2b uuid; p2c uuid;
  msg text; fm text; cm text; n integer; sent integer;
begin
  alter table public.user_notifications disable trigger user;

  select p.id into cl from public.profiles p where p.account_type = 'client' and not public.is_posting_blocked(p.id) limit 1;
  select p.id into cl2 from public.profiles p where p.account_type = 'client' and p.id <> cl and not public.is_posting_blocked(p.id) limit 1;
  select p.id into fr from public.profiles p where p.account_type = 'freelancer' limit 1;
  select p.id into fr2 from public.profiles p where p.account_type = 'freelancer' and p.id <> fr limit 1;
  if cl is null or cl2 is null or fr is null or fr2 is null then
    raise exception 'The test needs two clients and two freelancers to borrow.';
  end if;

  -- Small helpers that live only for this test.
  create function pg_temp.chk(label text, passed boolean, detail text default null) returns void
  language plpgsql as $f$
  begin
    perform set_config('test.report',
      coalesce(current_setting('test.report', true), '')
        || case when coalesce(passed, false) then 'PASS  ' else 'FAIL  ' end || label
        || case when not coalesce(passed, false) and detail is not null then '  -> ' || detail else '' end || E'\n', true);
  end;
  $f$;

  -- Acts as this person: the id the database rules see through auth.uid().
  create function pg_temp.act(u uuid) returns void
  language plpgsql as $f$
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true);
    perform set_config('request.jwt.claim.sub', u::text, true);
  end;
  $f$;

  -- A made-up project; due_in is the due date counted from today (negative = already late).
  create function pg_temp.mk(cl uuid, fr uuid, label text, st text, due_in integer, job uuid, sent_before boolean default false)
  returns uuid language plpgsql as $f$
  declare new_id uuid;
  begin
    insert into public.projects (client_id, freelancer_id, job_post_id, title, status, due_date,
                                 first_submitted_at, submitted_at, completed_at, ended_at)
    values (cl, fr, job, label, st, (now() at time zone 'Asia/Manila')::date + due_in,
            case when sent_before or st in ('submitted', 'done') then now() - interval '12 days' end,
            case when st = 'submitted' then now() - interval '12 days' end,
            case when st = 'done' then now() end,
            case when st = 'ended' then now() end)
    returning id into new_id;
    return new_id;
  end;
  $f$;

  -- The "7 days late" notice is in the sent log (as if the 8:00 AM job had sent it).
  create function pg_temp.warned(proj uuid, due_in integer) returns void
  language sql as $f$
    insert into public.scheduled_notices (kind, target_id, due_date)
    values ('overdue_7', proj, (now() at time zone 'Asia/Manila')::date + due_in);
  $f$;

  -- Presses End project as this person; answers 'ended' or the error text.
  create function pg_temp.try_end(u uuid, proj uuid) returns text
  language plpgsql as $f$
  declare msg text;
  begin
    perform pg_temp.act(u);
    begin
      perform public.end_project(proj);
      msg := 'ended';
    exception when others then
      msg := sqlerrm;
    end;
    return msg;
  end;
  $f$;

  create function pg_temp.notice_text(proj uuid, who uuid, kind text) returns text
  language sql as $f$
    select message from public.user_notifications
    where link = '/dashboard/project-details/' || proj and user_id = who and type = kind order by created_at limit 1;
  $f$;

  -- ===== The made-up posts and projects =====
  insert into public.job_posts (client_id, title, category, description, start_date, due_date)
  values (cl, 'ZZ job 1', (select category from public.job_posts limit 1), 'A made-up post for a rolled-back test.', today + 1, today + 10)
  returning id into job1;
  insert into public.job_posts (client_id, title, category, description, start_date, due_date, freelancers_needed)
  values (cl, 'ZZ job 2', (select category from public.job_posts limit 1), 'A made-up post for a rolled-back test.', today + 1, today + 10, 2)
  returning id into job2;

  pa := pg_temp.mk(cl, fr, 'ZZ a', 'started', -9, job1);          -- the one that gets ended (job post needs 1)
  perform pg_temp.warned(pa, -9);
  pb := pg_temp.mk(cl, fr, 'ZZ b', 'started', -9, null);          -- 9 days late, the 7 days late notice NOT sent yet
  pc := pg_temp.mk(cl, fr, 'ZZ c', 'started', -7, null);          -- exactly 7 days late (not more)
  perform pg_temp.warned(pc, -7);
  pd := pg_temp.mk(cl, fr, 'ZZ d', 'started', -9, null, true);    -- late, but work was sent once before
  perform pg_temp.warned(pd, -9);
  pe := pg_temp.mk(cl, fr, 'ZZ e', 'submitted', -9, null);        -- work waiting for review
  perform pg_temp.warned(pe, -9);
  pf := pg_temp.mk(cl, fr, 'ZZ f', 'done', -9, null);             -- already done
  perform pg_temp.warned(pf, -9);
  pg := pg_temp.mk(cl, fr, 'ZZ g', 'started', -9, null);          -- a request for more time is waiting
  perform pg_temp.warned(pg, -9);
  insert into public.delay_requests (project_id, kind, asked_by, from_date, to_date, reason, status)
  values (pg, 'work', fr, today - 9, today + 3, 'ZZ reason', 'pending');
  ph := pg_temp.mk(cl, fr, 'ZZ h', 'started', 3, null);           -- not late yet
  pi := pg_temp.mk(cl, fr, 'ZZ i', 'started', -9, null);          -- a booked project (no job post), ready to end
  perform pg_temp.warned(pi, -9);
  pj := pg_temp.mk(cl, fr, 'ZZ j', 'ended', -1, null);            -- already ended, would be 1 day late
  pk := pg_temp.mk(cl, fr, 'ZZ k', 'started', -1, null);          -- control: the same, not ended

  -- ===== 1. What exists =====
  perform pg_temp.chk('the status check lists ended',
    (select pg_get_constraintdef(oid) from pg_constraint where conname = 'projects_status_check') like '%''ended''%');
  perform pg_temp.chk('the notification kinds list project_ended',
    (select pg_get_constraintdef(oid) from pg_constraint where conname = 'user_notifications_type_check') like '%''project_ended''%');
  perform pg_temp.chk('the status check still has the old three',
    (select pg_get_constraintdef(oid) from pg_constraint where conname = 'projects_status_check') like '%''started''%'
    and (select pg_get_constraintdef(oid) from pg_constraint where conname = 'projects_status_check') like '%''submitted''%'
    and (select pg_get_constraintdef(oid) from pg_constraint where conname = 'projects_status_check') like '%''done''%');
  perform pg_temp.chk('job_state, notify_job_filled, admin_job_hires and admin_job_hiring leave out ended projects',
    (select count(*) from pg_proc
      where oid in ('public.job_state(uuid)'::regprocedure, 'public.notify_job_filled()'::regprocedure,
                    'public.admin_job_hires()'::regprocedure, 'public.admin_job_hiring()'::regprocedure)
        and prosrc ~ 'status <> ''ended''') = 4);
  perform pg_temp.chk('signed-in users can call end_project, signed-out users can not',
    has_function_privilege('authenticated', 'public.end_project(uuid, text)', 'execute')
    and not has_function_privilege('anon', 'public.end_project(uuid, text)', 'execute'));
  begin update public.projects set status = 'bogus' where id = ph; msg := 'updated'; exception when check_violation then msg := 'refused'; end;
  perform pg_temp.chk('the status check still refuses a made-up status', msg = 'refused', msg);

  -- ===== 2. Who may end a project =====
  msg := pg_temp.try_end(fr, pa);
  perform pg_temp.chk('the freelancer can not end it', msg = 'Only the client of this project can end it.', msg);
  msg := pg_temp.try_end(cl2, pa);
  perform pg_temp.chk('another client can not end it', msg = 'Only the client of this project can end it.', msg);
  msg := pg_temp.try_end(cl, gen_random_uuid());
  perform pg_temp.chk('an unknown project is refused the same way', msg = 'Only the client of this project can end it.', msg);

  -- ===== 3. The rules, one refusal at a time =====
  msg := pg_temp.try_end(cl, ph);
  perform pg_temp.chk('not late yet is refused, in plain words',
    msg = 'A project can be ended once it is more than 7 days late. This one is not late yet.', msg);
  msg := pg_temp.try_end(cl, pc);
  perform pg_temp.chk('exactly 7 days late is not enough', msg = 'A project can be ended once it is more than 7 days late. This one is 7 days late.', msg);
  msg := pg_temp.try_end(cl, pb);
  perform pg_temp.chk('9 days late but the 7 days late notice was not sent yet: refused',
    msg like 'The freelancer has not been sent the "7 days late" notice yet.%8:00 AM Philippine time%', msg);
  msg := pg_temp.try_end(cl, pd);
  perform pg_temp.chk('work was sent once before: refused', msg like 'The freelancer already sent work on this project, so it can''t be ended.%report it%', msg);
  msg := pg_temp.try_end(cl, pe);
  perform pg_temp.chk('work waiting for review: refused', msg = 'Only a project that is still waiting for the freelancer''s work can be ended.', msg);
  msg := pg_temp.try_end(cl, pf);
  perform pg_temp.chk('a Done project: refused', msg = 'Only a project that is still waiting for the freelancer''s work can be ended.', msg);
  msg := pg_temp.try_end(cl, pg);
  perform pg_temp.chk('a request for more time is waiting: refused', msg = 'A request for more time is waiting for your answer. Answer it first.', msg);
  msg := pg_temp.try_end(cl, pj);
  perform pg_temp.chk('an Ended project: refused', msg = 'This project was already ended.', msg);
  perform pg_temp.chk('the refusals changed nothing',
    (select count(*) from public.projects where id in (pa, pb, pc, pd, pe, pf, pg, ph) and status = 'ended') = 0
    and (select count(*) from public.user_notifications where type = 'project_ended') = 0);

  update public.delay_requests set status = 'cancelled', answered_at = now() where project_id = pg;
  msg := pg_temp.try_end(cl, pg);
  perform pg_temp.chk('with the waiting request cancelled, that project can be ended', msg = 'ended', msg);

  -- ===== 4. Ending a project from a job post =====
  perform pg_temp.chk('before: the post needs 1 and the late project counts, so it is Filled', public.job_state(job1) = 'filled');
  n := (select count(*) from public.user_notifications where type = 'job_filled' and link = '/dashboard/job-details/' || job1);
  perform pg_temp.chk('the Filled notice came once when that freelancer was hired', n = 1, n::text);

  msg := pg_temp.try_end(cl, pa);
  perform pg_temp.chk('the client can end it: Started, never sent, 9 days late, the 7 days late notice sent', msg = 'ended', msg);
  perform pg_temp.chk('...it is Ended and has a time',
    (select status = 'ended' and ended_at is not null from public.projects where id = pa));
  fm := pg_temp.notice_text(pa, fr, 'project_ended');
  cm := pg_temp.notice_text(pa, cl, 'project_ended');
  perform pg_temp.chk('...the freelancer is told who ended it, why, and that they can message them',
    fm like '% ended "ZZ a" because it was 9 days late and no work was sent. It shows as Ended on both your histories.%'
    and fm like '%You can message %.', fm);
  perform pg_temp.chk('...the client is told the place on the job post is open again',
    cm = 'You ended "ZZ a". Its place on your job post is open again, so you can hire someone else. It shows as Ended on both your histories.', cm);
  perform pg_temp.chk('...both notices are called Project ended and open the project',
    (select count(*) from public.user_notifications
      where type = 'project_ended' and title = 'Project ended' and link = '/dashboard/project-details/' || pa) = 2);
  msg := pg_temp.try_end(cl, pa);
  perform pg_temp.chk('...pressing it again is refused', msg = 'This project was already ended.', msg);

  perform pg_temp.chk('the post is open again (the ended project no longer counts)', public.job_state(job1) = 'open');
  pr := pg_temp.mk(cl, fr2, 'ZZ replacement', 'started', 5, job1);
  perform pg_temp.chk('hiring someone else fills it again',
    public.job_state(job1) = 'filled');
  n := (select count(*) from public.user_notifications where type = 'job_filled' and link = '/dashboard/job-details/' || job1);
  perform pg_temp.chk('...and the Filled notice comes for the replacement too', n = 2, n::text);

  -- A post that needs 2.
  p2a := pg_temp.mk(cl, fr2, 'ZZ 2a', 'ended', -9, job2);
  p2b := pg_temp.mk(cl, fr2, 'ZZ 2b', 'started', 5, job2);
  perform pg_temp.chk('a post that needs 2, with one ended and one working, is still open', public.job_state(job2) = 'open');
  p2c := pg_temp.mk(cl, fr2, 'ZZ 2c', 'started', 5, job2);
  perform pg_temp.chk('...with two working it is Filled', public.job_state(job2) = 'filled');

  -- ===== 5. A booked project (no job post) =====
  msg := pg_temp.try_end(cl, pi);
  cm := pg_temp.notice_text(pi, cl, 'project_ended');
  perform pg_temp.chk('a booked project can be ended, and its notice has no job post sentence',
    msg = 'ended' and cm = 'You ended "ZZ i". It shows as Ended on both your histories.', coalesce(msg, '') || ' / ' || coalesce(cm, ''));

  -- ===== 6. What stays =====
  perform pg_temp.act(fr);
  perform pg_temp.chk('the freelancer is still blocked from this client''s other posts (missed_deadline stays true)',
    (select public.missed_deadline(p) from public.projects p where p.id = pa) and public.blocked_for_lateness(job1));
  perform pg_temp.act(cl);
  begin perform public.allow_late_freelancer(pa); msg := 'allowed'; exception when others then msg := sqlerrm; end;
  perform pg_temp.chk('...and the client can still allow it on the ended project',
    msg = 'allowed' and (select late_allowed_at is not null from public.projects where id = pa), msg);

  perform pg_temp.act(fr);
  begin perform public.request_delay(pa, 'work', today + 2, 'ZZ reason text'); msg := 'accepted'; exception when others then msg := sqlerrm; end;
  perform pg_temp.chk('Ask for more time is refused on an ended project (and it is a rule, not a missing function)',
    msg <> 'accepted' and msg not like '%does not exist%', msg);
  perform pg_temp.act(cl);
  begin perform public.mark_project_done(pa); msg := 'done'; exception when others then msg := sqlerrm; end;
  perform pg_temp.chk('Mark done is refused on an ended project', msg = 'There''s no submitted work waiting for your review.', msg);
  begin perform public.request_project_changes(pa); msg := 'changes'; exception when others then msg := sqlerrm; end;
  perform pg_temp.chk('Ask for changes is refused on an ended project', msg = 'There''s no submitted work waiting for your review.', msg);

  -- ===== 7. The daily job ignores an ended project =====
  sent := public.send_daily_notices();
  perform pg_temp.chk('the daily job still sends a late notice for a Started project (the control)',
    (select count(*) from public.user_notifications where link = '/dashboard/project-details/' || pk and type = 'project_overdue') = 2);
  perform pg_temp.chk('...and sends nothing for an Ended one',
    (select count(*) from public.user_notifications where link = '/dashboard/project-details/' || pj) = 0
    and (select count(*) from public.user_notifications where link = '/dashboard/project-details/' || pa and type <> 'project_ended') = 0);
  msg := pg_temp.try_end(cl, pb);
  perform pg_temp.chk('after the daily job sent the 7 days late notice, the project that was refused for it can be ended', msg = 'ended', msg);

  -- Everything above is rolled back by this error; the list is in its message.
  raise exception E'RESULTS\n%', coalesce(current_setting('test.report', true), '(nothing was checked)');
end;
$$;
