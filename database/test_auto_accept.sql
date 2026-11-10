-- Test for supabase_auto_accept_schema.sql (PLAN-delays.md, Step 4). Run it in the
-- Supabase SQL Editor AFTER the schema file. Nothing stays: the last line raises an
-- error that carries the PASS / FAIL list, and that rolls everything back.
--
-- It borrows one client and one freelancer (no made-up accounts, so no user numbers are
-- used up), adds made-up projects as the owner, runs the daily job, and looks at what
-- happened to each. The email trigger is switched off for the test (it comes back with
-- the rollback), so nobody is emailed. "Run 2" is the same job run again, which stands
-- for the next morning (the warning of run 1 is already in the sent log).
--
-- Work sent N days ago (counted in Manila days) has waited N days.

do $$
declare
  today date := (now() at time zone 'Asia/Manila')::date;
  cl uuid; fr uuid;
  s3 uuid; s5 uuid; s6 uuid; s7w uuid; s9 uuid; sp uuid; sold uuid; sre uuid; sman uuid; st uuid; sd uuid;
  msg text;
  sent integer;
begin
  alter table public.user_notifications disable trigger user;

  select id into cl from public.profiles where account_type = 'client' limit 1;
  select id into fr from public.profiles where account_type = 'freelancer' limit 1;
  if cl is null or fr is null then
    raise exception 'The test needs one client and one freelancer account to borrow.';
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

  -- A made-up project whose work was sent days_ago days ago (at 10:00 Manila time) and
  -- waits for the client. price null = no price.
  create function pg_temp.mk_sub(cl uuid, fr uuid, label text, st text, days_ago integer, price numeric)
  returns uuid language plpgsql as $f$
  declare new_id uuid;
  begin
    insert into public.projects (client_id, freelancer_id, title, status, due_date, submitted_at, completed_at,
                                 agreed_amount, price_basis, price_status, price_source, price_agreed_at)
    values (cl, fr, label, st, current_date + 30,
            (((now() at time zone 'Asia/Manila')::date - days_ago)::timestamp + interval '10 hours') at time zone 'Asia/Manila',
            case when st = 'done' then now() end,
            price, case when price is null then null else 'project' end,
            case when price is null then 'none' else 'agreed' end,
            case when price is null then null else 'job' end,
            case when price is null then null else now() end)
    returning id into new_id;
    return new_id;
  end;
  $f$;

  create function pg_temp.status_of(proj uuid) returns text
  language sql as $f$ select status from public.projects where id = proj; $f$;
  create function pg_temp.n(proj uuid, who uuid, kind text, wanted_title text) returns integer
  language sql as $f$
    select count(*)::integer from public.user_notifications
    where link = '/dashboard/project-details/' || proj and user_id = who and type = kind and title = wanted_title;
  $f$;
  create function pg_temp.text_of(proj uuid, who uuid, kind text) returns text
  language sql as $f$
    select message from public.user_notifications
    where link = '/dashboard/project-details/' || proj and user_id = who and type = kind order by created_at limit 1;
  $f$;
  -- The warning is in the sent log (as if run 1 had already warned about this sending).
  create function pg_temp.warned(proj uuid, sent_days_ago integer) returns void
  language sql as $f$
    insert into public.scheduled_notices (kind, target_id, due_date)
    values ('review_6', proj, (now() at time zone 'Asia/Manila')::date - sent_days_ago);
  $f$;

  -- ===== The made-up projects =====
  s3   := pg_temp.mk_sub(cl, fr, 'ZZ s3',   'submitted', 3, null);   -- too early
  s5   := pg_temp.mk_sub(cl, fr, 'ZZ s5',   'submitted', 5, null);   -- too early
  s6   := pg_temp.mk_sub(cl, fr, 'ZZ s6',   'submitted', 6, null);   -- warning
  s7w  := pg_temp.mk_sub(cl, fr, 'ZZ s7w',  'submitted', 7, null);   -- already warned: accepted
  s9   := pg_temp.mk_sub(cl, fr, 'ZZ s9',   'submitted', 9, null);   -- never warned: warning first, accepted next run
  sp   := pg_temp.mk_sub(cl, fr, 'ZZ sp',   'submitted', 7, 1000);   -- already warned, agreed price: accepted and a payment reminder
  sold := pg_temp.mk_sub(cl, fr, 'ZZ sold', 'submitted', 22, null);  -- waiting long before the rule: counted from today
  sre  := pg_temp.mk_sub(cl, fr, 'ZZ sre',  'submitted', 9, null);   -- sent 9 days ago, warned, then sent AGAIN today
  sman := pg_temp.mk_sub(cl, fr, 'ZZ sman', 'submitted', 2, 1000);   -- the client will tap Done by hand
  st   := pg_temp.mk_sub(cl, fr, 'ZZ st',   'started',   9, null);   -- not sent
  sd   := pg_temp.mk_sub(cl, fr, 'ZZ sd',   'done',      9, null);   -- already done
  perform pg_temp.warned(s7w, 7);
  perform pg_temp.warned(sp, 7);
  perform pg_temp.warned(sre, 9);
  update public.projects set review_counted_from = today where id = sold;
  -- sre: the work was sent again today (what submit_project does).
  update public.projects set submitted_at = now() where id = sre;

  -- ===== 1. Who can call it =====
  perform pg_temp.chk('users can not call auto_accept_project',
    not has_function_privilege('authenticated', 'public.auto_accept_project(uuid)', 'execute')
    and not has_function_privilege('anon', 'public.auto_accept_project(uuid)', 'execute'));

  -- ===== 2. Run 1 =====
  sent := public.send_daily_notices();

  perform pg_temp.chk('3 and 5 days: nothing happens',
    pg_temp.status_of(s3) = 'submitted' and pg_temp.status_of(s5) = 'submitted'
    and (select count(*) from public.user_notifications where link in ('/dashboard/project-details/' || s3, '/dashboard/project-details/' || s5) and type in ('project_review_reminder', 'project_done')) = 0);
  perform pg_temp.chk('6 days: the client is warned once, the work is still waiting',
    pg_temp.n(s6, cl, 'project_review_reminder', 'Last day to review') = 1 and pg_temp.status_of(s6) = 'submitted'
    and pg_temp.n(s6, fr, 'project_review_reminder', 'Last day to review') = 0);
  msg := pg_temp.text_of(s6, cl, 'project_review_reminder');
  perform pg_temp.chk('the warning says whose work, how long, and what happens tomorrow',
    msg like '%''s work for "ZZ s6" has been waiting for you for 6 days. If you don''t mark it done or ask for changes, it is accepted automatically tomorrow.', msg);
  perform pg_temp.chk('7 days and already warned: accepted (Done, flag, time)',
    pg_temp.status_of(s7w) = 'done' and (select auto_accepted and completed_at is not null from public.projects where id = s7w));
  perform pg_temp.chk('...both people are told once',
    pg_temp.n(s7w, fr, 'project_done', 'Work accepted automatically') = 1 and pg_temp.n(s7w, cl, 'project_done', 'Work accepted automatically') = 1);
  msg := pg_temp.text_of(s7w, fr, 'project_done');
  perform pg_temp.chk('...the freelancer is told the client did not answer, and that they can rate',
    msg like '% did not answer in 7 days, so "ZZ s7w" was accepted automatically.%' and msg like '%you can rate % on the project page.', msg);
  msg := pg_temp.text_of(s7w, cl, 'project_done');
  perform pg_temp.chk('...the client is told what happened',
    msg like 'You did not answer in 7 days, so the work for "ZZ s7w" was accepted automatically.%', msg);
  perform pg_temp.chk('9 days and never warned: only the warning now, still waiting (the warning always comes first)',
    pg_temp.n(s9, cl, 'project_review_reminder', 'Last day to review') = 1 and pg_temp.status_of(s9) = 'submitted'
    and pg_temp.n(s9, cl, 'project_done', 'Work accepted automatically') = 0
    and pg_temp.text_of(s9, cl, 'project_review_reminder') like '%waiting for you for 9 days.%');
  perform pg_temp.chk('agreed price, 7 days, warned: accepted, and the client gets the payment reminder with the automatic wording',
    pg_temp.status_of(sp) = 'done'
    and pg_temp.text_of(sp, cl, 'payment_unpaid') like '"ZZ sp" was accepted automatically, and ₱1,000.00 of the agreed ₱1,000.00 is still unpaid.%Pay the rest in GCash, then record it on the project page.'
    and pg_temp.text_of(sp, cl, 'payment_unpaid') not like '%You marked%', pg_temp.text_of(sp, cl, 'payment_unpaid'));
  perform pg_temp.chk('work that was waiting long before the rule (counted from today): nothing yet',
    pg_temp.status_of(sold) = 'submitted'
    and (select count(*) from public.user_notifications where link = '/dashboard/project-details/' || sold and type in ('project_review_reminder', 'project_done')) = 0);
  perform pg_temp.chk('sent again today after an earlier warning: the 7 days start over, nothing happens',
    pg_temp.status_of(sre) = 'submitted'
    and (select count(*) from public.user_notifications where link = '/dashboard/project-details/' || sre and type in ('project_review_reminder', 'project_done')) = 0);
  perform pg_temp.chk('work not sent (Started) and work already Done: untouched, nothing sent',
    pg_temp.status_of(st) = 'started' and pg_temp.status_of(sd) = 'done'
    and not (select auto_accepted from public.projects where id = sd)
    and (select count(*) from public.user_notifications where link in ('/dashboard/project-details/' || st, '/dashboard/project-details/' || sd) and type in ('project_review_reminder', 'project_done')) = 0);

  -- ===== 3. Run 2 (the next morning) =====
  sent := public.send_daily_notices();

  perform pg_temp.chk('run 2: the 9 day work (warned in run 1) is now accepted, both told once',
    pg_temp.status_of(s9) = 'done' and (select auto_accepted from public.projects where id = s9)
    and pg_temp.n(s9, cl, 'project_done', 'Work accepted automatically') = 1 and pg_temp.n(s9, fr, 'project_done', 'Work accepted automatically') = 1
    and pg_temp.n(s9, cl, 'project_review_reminder', 'Last day to review') = 1);
  perform pg_temp.chk('run 2: the 6 day work is not accepted yet (it needs 7 days) and is not warned twice',
    pg_temp.status_of(s6) = 'submitted' and pg_temp.n(s6, cl, 'project_review_reminder', 'Last day to review') = 1);
  perform pg_temp.chk('run 2: nothing happens twice for the work accepted in run 1',
    pg_temp.n(s7w, cl, 'project_done', 'Work accepted automatically') = 1 and pg_temp.n(s7w, fr, 'project_done', 'Work accepted automatically') = 1
    and (select count(*) from public.user_notifications where link = '/dashboard/project-details/' || sp and type = 'payment_unpaid') = 1);
  perform pg_temp.chk('run 2: the long waiting work and the sent again work are still waiting',
    pg_temp.status_of(sold) = 'submitted' and pg_temp.status_of(sre) = 'submitted');

  -- ===== 4. The client's own "Mark as Done" still says what it said =====
  perform set_config('request.jwt.claims', json_build_object('sub', cl, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', cl::text, true);
  set local role authenticated;
  perform public.mark_project_done(sman);
  reset role;
  perform pg_temp.chk('a client who taps Mark as Done: Done, not flagged automatic',
    pg_temp.status_of(sman) = 'done' and not (select auto_accepted from public.projects where id = sman));
  perform pg_temp.chk('...and the payment reminder keeps the old wording ("You marked ... as done")',
    pg_temp.text_of(sman, cl, 'payment_unpaid') like 'You marked "ZZ sman" as done, but ₱1,000.00 of the agreed ₱1,000.00 is still unpaid.%', pg_temp.text_of(sman, cl, 'payment_unpaid'));

  -- Calling the internal function on work that isn't waiting changes nothing.
  perform public.auto_accept_project(st);
  perform pg_temp.chk('accepting work that was never sent changes nothing', pg_temp.status_of(st) = 'started'
    and (select count(*) from public.user_notifications where link = '/dashboard/project-details/' || st and type = 'project_done') = 0);

  raise exception E'RESULTS\n%', coalesce(current_setting('test.report', true), '(nothing was checked)');
end;
$$;
