-- Test for supabase_late_allow_all_schema.sql ("Allow" lifts the whole late
-- block between one freelancer and one client, 2026-11-26). Run it in the
-- Supabase SQL Editor AFTER the schema file (or send both in one call as a
-- trial). Nothing stays: the last line raises an error that carries the
-- PASS / FAIL list, and that rolls everything back.
--
-- It borrows a freelancer, two clients that each have a job post and no
-- project with that freelancer, and one more account. It adds made-up projects
-- and appeals as the owner and acts as each person (the id auth.uid() sees).
-- The triggers of user_notifications are off for the test (they come back with
-- the rollback), so nobody is emailed.

do $$
declare
  today date := (now() at time zone 'Asia/Manila')::date;
  fl uuid; cl uuid; cl2 uuid; other uuid;
  job_cl uuid; job_cl2 uuid;
  pa uuid; pb uuid; pc uuid; pd uuid; pe uuid; pok uuid; pf uuid; pf2 uuid;
  appeal_b uuid; appeal_f uuid;
  msg text; n integer; ok boolean; first_at timestamptz;
begin
  alter table public.user_notifications disable trigger user;

  select p.id into fl from public.profiles p where p.account_type = 'freelancer' limit 1;
  select p.id into cl from public.profiles p
  where p.account_type = 'client'
    and exists (select 1 from public.job_posts j where j.client_id = p.id)
    and not exists (select 1 from public.projects x where x.client_id = p.id and x.freelancer_id = fl)
  limit 1;
  select p.id into cl2 from public.profiles p
  where p.account_type = 'client' and p.id <> cl
    and exists (select 1 from public.job_posts j where j.client_id = p.id)
    and not exists (select 1 from public.projects x where x.client_id = p.id and x.freelancer_id = fl)
  limit 1;
  select p.id into other from public.profiles p where p.id not in (fl, cl, cl2) limit 1;
  if fl is null or cl is null or cl2 is null or other is null then
    raise exception 'The test needs a freelancer, two clients with a job post and no project with them, and one more account.';
  end if;
  select j.id into job_cl from public.job_posts j where j.client_id = cl limit 1;
  select j.id into job_cl2 from public.job_posts j where j.client_id = cl2 limit 1;

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

  -- Presses Allow as this person; answers 'allowed' or the error text.
  create function pg_temp.try_allow(u uuid, proj uuid) returns text
  language plpgsql as $f$
  begin
    perform pg_temp.act(u);
    perform public.allow_late_freelancer(proj);
    return 'allowed';
  exception when others then
    return sqlerrm;
  end;
  $f$;

  -- Projects between fl and cl. Days are Manila days.
  insert into public.projects (client_id, freelancer_id, title, due_date) values (cl, fl, 'ZZ A', today - 5) returning id into pa;
  insert into public.projects (client_id, freelancer_id, title, due_date) values (cl, fl, 'ZZ B', today - 3) returning id into pb;
  insert into public.projects (client_id, freelancer_id, title, due_date) values (cl, fl, 'ZZ C', today - 4) returning id into pc;
  insert into public.projects (client_id, freelancer_id, title, due_date) values (cl, fl, 'ZZ D', today + 3) returning id into pd;
  insert into public.projects (client_id, freelancer_id, title, due_date) values (cl, fl, 'ZZ E', today) returning id into pe;
  insert into public.projects (client_id, freelancer_id, title, due_date) values (cl, fl, 'ZZ on time', today - 2) returning id into pok;
  -- C was sent the day after its due date (late); "on time" was sent on its due date.
  update public.projects set status = 'submitted', submitted_at = ((today - 3)::timestamp + interval '12 hours') at time zone 'Asia/Manila' where id = pc;
  update public.projects set status = 'submitted', submitted_at = ((today - 2)::timestamp + interval '12 hours') at time zone 'Asia/Manila' where id = pok;
  -- Two late projects with the second client.
  insert into public.projects (client_id, freelancer_id, title, due_date) values (cl2, fl, 'ZZ F', today - 6) returning id into pf;
  insert into public.projects (client_id, freelancer_id, title, due_date) values (cl2, fl, 'ZZ F2', today - 2) returning id into pf2;

  -- The freelancer appeals on B, and is blocked by both clients.
  perform pg_temp.act(fl);
  appeal_b := public.appeal_late_block(pb, 'Please let me apply again, I can explain.');
  perform pg_temp.chk('blocked from the first client''s posts before anything is allowed', public.blocked_for_lateness(job_cl));
  perform pg_temp.chk('blocked from the second client''s posts too', public.blocked_for_lateness(job_cl2));

  -- Who may press Allow.
  msg := pg_temp.try_allow(fl, pa);
  perform pg_temp.chk('the freelancer can''t allow themselves', msg = 'Only the client of this project can allow this.', msg);
  msg := pg_temp.try_allow(other, pa);
  perform pg_temp.chk('a stranger can''t allow it', msg = 'Only the client of this project can allow this.', msg);
  msg := pg_temp.try_allow(cl, pok);
  perform pg_temp.chk('Allow on a project that wasn''t late is refused', msg = 'This project wasn''t late, so nothing is blocked.', msg);

  -- THE FIX: the client allows on A (the project with no appeal).
  msg := pg_temp.try_allow(cl, pa);
  perform pg_temp.chk('the client allows on A', msg = 'allowed', msg);
  select count(*), min(late_allowed_at) into n, first_at from public.projects where id in (pa, pb, pc) and late_allowed_at is not null;
  perform pg_temp.chk('A, B and C (all late with this client) are allowed', n = 3, n::text);
  select count(distinct late_allowed_at) = 1 into ok from public.projects where id in (pa, pb, pc);
  perform pg_temp.chk('...at the same moment', ok);
  select count(*) into n from public.projects where id in (pd, pe, pok) and late_allowed_at is not null;
  perform pg_temp.chk('projects that are not late (due later, due today, sent on time) are untouched', n = 0, n::text);
  select count(*) into n from public.projects where id in (pf, pf2) and late_allowed_at is not null;
  perform pg_temp.chk('the other client''s late projects are untouched', n = 0, n::text);
  select status = 'allowed' and answered_at is not null into ok from public.late_appeals where id = appeal_b;
  perform pg_temp.chk('the waiting appeal on B counts as allowed', ok);
  select count(*) into n from public.user_notifications where user_id = fl and type = 'late_appeal_allowed'
    and link in ('/dashboard/project-details/' || pa, '/dashboard/project-details/' || pb, '/dashboard/project-details/' || pc);
  perform pg_temp.chk('the freelancer is told once', n = 1, n::text);
  select message into msg from public.user_notifications where user_id = fl and type = 'late_appeal_allowed'
    and link = '/dashboard/project-details/' || pa;
  perform pg_temp.chk('...naming all three, oldest due date first',
    msg like '% allowed you to apply to their job posts again (the late projects "ZZ A", "ZZ C", "ZZ B").', msg);

  perform pg_temp.act(fl);
  perform pg_temp.chk('the freelancer can apply to the first client''s posts again', not public.blocked_for_lateness(job_cl));
  select count(*) into n from public.projects p
  where p.freelancer_id = fl and p.client_id = cl and p.missed_deadline and p.late_allowed_at is null;
  perform pg_temp.chk('the website''s check (late, not allowed) finds nothing', n = 0, n::text);
  perform pg_temp.chk('still blocked from the second client''s posts', public.blocked_for_lateness(job_cl2));

  -- Pressing Allow again on an allowed project: no error, no second notice.
  msg := pg_temp.try_allow(cl, pb);
  select count(*) into n from public.user_notifications where user_id = fl and type = 'late_appeal_allowed'
    and link in ('/dashboard/project-details/' || pa, '/dashboard/project-details/' || pb, '/dashboard/project-details/' || pc);
  perform pg_temp.chk('Allow again does nothing more', msg = 'allowed' and n = 1, msg || ' / ' || n);

  -- A project that becomes late LATER blocks again.
  update public.projects set due_date = today - 1 where id = pd;
  perform pg_temp.act(fl);
  perform pg_temp.chk('a project that becomes late later blocks again', public.blocked_for_lateness(job_cl));
  msg := pg_temp.try_allow(cl, pd);
  select message into msg from public.user_notifications where user_id = fl and type = 'late_appeal_allowed'
    and link = '/dashboard/project-details/' || pd;
  perform pg_temp.chk('...one late project: the notice says "the late project"',
    msg like '% allowed you to apply to their job posts again (the late project "ZZ D").', msg);
  perform pg_temp.act(fl);
  perform pg_temp.chk('...and once allowed, the freelancer can apply again', not public.blocked_for_lateness(job_cl));

  -- Through an appeal: the second client answers Allow on F; F2 is lifted too.
  perform pg_temp.act(fl);
  appeal_f := public.appeal_late_block(pf, 'I was sick that week, here is why.');
  perform pg_temp.act(cl2);
  perform public.answer_late_appeal(appeal_f, true);
  select count(*) into n from public.projects where id in (pf, pf2) and late_allowed_at is not null;
  perform pg_temp.chk('Allow on an appeal lifts both of that client''s late projects', n = 2, n::text);
  select status = 'allowed' into ok from public.late_appeals where id = appeal_f;
  perform pg_temp.chk('...the appeal is allowed', ok);
  select count(*) into n from public.user_notifications where user_id = fl and type = 'late_appeal_allowed'
    and link in ('/dashboard/project-details/' || pf, '/dashboard/project-details/' || pf2)
    and message like '%(the late projects "ZZ F", "ZZ F2").';
  perform pg_temp.chk('...one notice naming both', n = 1, n::text);
  perform pg_temp.act(fl);
  perform pg_temp.chk('...and the freelancer can apply to that client''s posts', not public.blocked_for_lateness(job_cl2));

  -- The permissions are unchanged.
  perform pg_temp.chk('signed-out users can''t call it', not has_function_privilege('anon', 'public.allow_late_freelancer(uuid)', 'execute'));
  perform pg_temp.chk('signed-in users can', has_function_privilege('authenticated', 'public.allow_late_freelancer(uuid)', 'execute'));

  raise exception E'RESULTS\n%', current_setting('test.report', true);
end;
$$;
