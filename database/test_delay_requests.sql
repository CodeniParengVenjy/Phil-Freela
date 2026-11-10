-- Test for supabase_delay_requests_schema.sql (PLAN-delay-requests.md). Run it in the Supabase
-- SQL Editor AFTER the schema file (or in the same run, right after it). Nothing stays: the
-- last line raises an error that carries the PASS / FAIL list, and that rolls everything back.
--
-- It borrows a client, a freelancer and one more person (a stranger) and adds made-up
-- projects and payments as the owner, then acts as each person (the signed-in role plus
-- their id) to ask for more time, answer, cancel and read. The email triggers of
-- user_notifications are switched off for the test (they come back with the rollback), so
-- nobody is told or emailed.
--
-- People: cl (client), fr (freelancer), st (a stranger to every project).

do $$
declare
  today date := (now() at time zone 'Asia/Manila')::date;
  cl uuid; fr uuid; st uuid;
  w1 uuid; w2 uuid; w3 uuid; w_today uuid; w_late uuid; w_sub uuid; w_stale uuid; w_past uuid;
  p1 uuid; p2 uuid; p_late uuid; p_paid uuid; p_day uuid; p_open uuid; p_over uuid; p_ctl uuid;
  r1 uuid; r2 uuid; r3 uuid; r4 uuid;
  msg text; n integer; seen_st integer; seen_cl integer; denied text;
  passes integer; fails integer; report text;
begin
  alter table public.user_notifications disable trigger user;

  -- People (only read; everything they get here rolls back).
  select p.id into cl from public.profiles p where p.account_type = 'client' limit 1;
  select p.id into fr from public.profiles p where p.account_type = 'freelancer' limit 1;
  select p.id into st from public.profiles p where p.id <> cl and p.id <> fr limit 1;
  if cl is null or fr is null or st is null then
    raise exception 'The test needs a client, a freelancer and one more person to borrow.';
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
    perform set_config('request.jwt.claim.sub', coalesce(u::text, ''), true);   -- null = nobody signed in
  end;
  $f$;

  -- A made-up project: status, due in due_in days (Manila), and for a Done one, marked Done
  -- done_days_ago days ago (at 10:00 Manila time). price null = no agreed price.
  create function pg_temp.mk_project(cl uuid, fr uuid, label text, st text, done_days_ago integer, basis text, price numeric, due_in integer)
  returns uuid language plpgsql as $f$
  declare
    t date := (now() at time zone 'Asia/Manila')::date;
    new_id uuid;
  begin
    insert into public.projects (client_id, freelancer_id, title, status, due_date, completed_at,
                                 agreed_amount, price_basis, price_status, price_source, price_agreed_at)
    values (cl, fr, label, st, t + due_in,
            case when st = 'done' then (((t - done_days_ago)::timestamp + interval '10 hours') at time zone 'Asia/Manila') end,
            price, case when price is null then null else basis end,
            case when price is null then 'none' else 'agreed' end,
            case when price is null then null else 'job' end,
            case when price is null then null else now() end)
    returning id into new_id;
    return new_id;
  end;
  $f$;

  create function pg_temp.mk_payment(proj uuid, cl uuid, fr uuid, amt numeric, ref text)
  returns void language plpgsql as $f$
  begin
    insert into public.payments (project_id, client_id, freelancer_id, amount, tip_amount, reference_no, receipt_path,
                                 status, answered_at, received_amount)
    values (proj, cl, fr, amt, 0, ref, cl::text || '/zz-test.jpg', 'confirmed', now(), amt);
  end;
  $f$;

  -- Ask / answer / cancel as the current person; give back 'ok' or the sentence the database raised.
  create function pg_temp.ask(proj uuid, k text, d date, why text) returns text
  language plpgsql as $f$
  begin
    perform public.request_delay(proj, k, d, why);
    return 'ok';
  exception when others then return sqlerrm;
  end;
  $f$;

  create function pg_temp.reply(req uuid, yes boolean) returns text
  language plpgsql as $f$
  begin
    perform public.answer_delay(req, yes);
    return 'ok';
  exception when others then return sqlerrm;
  end;
  $f$;

  create function pg_temp.cancel(req uuid) returns text
  language plpgsql as $f$
  begin
    perform public.cancel_delay_request(req);
    return 'ok';
  exception when others then return sqlerrm;
  end;
  $f$;

  -- The request of this kind on this project that is still waiting, else the newest one.
  -- (Everything here runs in one transaction, so every row gets the same created_at:
  -- ordering by time alone can pick an old cancelled request.)
  create function pg_temp.last_req(proj uuid, k text) returns uuid
  language sql as $f$
    select id from public.delay_requests where project_id = proj and kind = k
    order by (status = 'pending') desc, created_at desc, id limit 1;
  $f$;

  create function pg_temp.notice_text(proj uuid, who uuid, kind text) returns text
  language sql as $f$
    select message from public.user_notifications
    where link = '/dashboard/project-details/' || proj and user_id = who and type = kind
    order by created_at desc limit 1;
  $f$;

  create function pg_temp.notice_count(proj uuid, who uuid, kind text) returns integer
  language sql as $f$
    select count(*)::integer from public.user_notifications
    where link = '/dashboard/project-details/' || proj and user_id = who and type = kind;
  $f$;

  -- ===== The made-up projects =====
  -- work (started, due in 5 days unless said otherwise)
  w1      := pg_temp.mk_project(cl, fr, 'ZZ w1',      'started', 0, null, null, 5);
  w2      := pg_temp.mk_project(cl, fr, 'ZZ w2',      'started', 0, null, null, 5);
  w3      := pg_temp.mk_project(cl, fr, 'ZZ w3',      'started', 0, null, null, 5);
  w_today := pg_temp.mk_project(cl, fr, 'ZZ w today', 'started', 0, null, null, 0);   -- due today
  w_late  := pg_temp.mk_project(cl, fr, 'ZZ w late',  'started', 0, null, null, -1);  -- due yesterday
  w_sub   := pg_temp.mk_project(cl, fr, 'ZZ w sub',   'started', 0, null, null, 5);
  w_stale := pg_temp.mk_project(cl, fr, 'ZZ w stale', 'started', 0, null, null, 5);
  w_past  := pg_temp.mk_project(cl, fr, 'ZZ w past',  'started', 0, null, null, -5);
  update public.projects set status = 'submitted', submitted_at = now() where id = w_sub;
  -- payment (Done 5 days ago = payment day in 2 days, agreed 1,000 for the whole project)
  p1     := pg_temp.mk_project(cl, fr, 'ZZ p1',     'done', 5,  'project', 1000, 30);
  p2     := pg_temp.mk_project(cl, fr, 'ZZ p2',     'done', 5,  'project', 1000, 30);
  p_late := pg_temp.mk_project(cl, fr, 'ZZ p late', 'done', 10, 'project', 1000, 30);  -- 3 days past its payment day
  p_paid := pg_temp.mk_project(cl, fr, 'ZZ p paid', 'done', 5,  'project', 1000, 30);
  p_day  := pg_temp.mk_project(cl, fr, 'ZZ p day',  'done', 5,  'day',     1000, 30);  -- a per-day price
  p_open := pg_temp.mk_project(cl, fr, 'ZZ p open', 'started', 0, 'project', 1000, 30);  -- not Done
  p_over := pg_temp.mk_project(cl, fr, 'ZZ p over', 'done', 7,  'project', 1000, 30);  -- payment day is today
  perform pg_temp.mk_payment(p_paid, cl, fr, 1000, '9991000000001');

  -- ===== 1. Who can ask for what =====
  perform pg_temp.act(fr);
  msg := pg_temp.ask(w1, 'work', today + 10, 'I am sick this week and need a few more days.');
  perform pg_temp.chk('the freelancer can ask for more time to send the work', msg = 'ok', msg);
  r1 := pg_temp.last_req(w1, 'work');
  perform pg_temp.chk('the request is saved waiting, from the due day to the day asked for',
    (select status = 'pending' and kind = 'work' and asked_by = fr and from_date = today + 5 and to_date = today + 10
       from public.delay_requests where id = r1));
  msg := pg_temp.notice_text(w1, cl, 'delay_requested');
  perform pg_temp.chk('the client is told, with both days and the reason',
    msg like '% asks for more time to send "ZZ w1": until % instead of %. Reason: "I am sick this week and need a few more days.". Open the project to accept or decline.', msg);
  perform pg_temp.chk('the freelancer who asked gets no notice about it', pg_temp.notice_count(w1, fr, 'delay_requested') = 0);

  msg := pg_temp.ask(p1, 'payment', today + 7, 'My salary comes in on the fifth.');
  perform pg_temp.chk('the freelancer can''t ask for more time to PAY', msg = 'Only the client can ask for more time to pay.', msg);
  perform pg_temp.act(cl);
  msg := pg_temp.ask(w2, 'work', today + 8, 'Please send it later.');
  perform pg_temp.chk('the client can''t ask for more time to send the work', msg = 'Only the freelancer can ask for more time to send the work.', msg);
  perform pg_temp.act(st);
  msg := pg_temp.ask(w2, 'work', today + 8, 'Please send it later.');
  perform pg_temp.chk('a stranger can''t ask on someone else''s project', msg = 'This project isn''t yours.', msg);
  perform pg_temp.act(null);
  msg := pg_temp.ask(w2, 'work', today + 8, 'Please send it later.');
  perform pg_temp.chk('nobody signed in can''t ask', msg = 'Please sign in first.', msg);
  perform pg_temp.act(fr);
  msg := pg_temp.ask(w2, 'weekly', today + 8, 'Please send it later.');
  perform pg_temp.chk('only the two kinds exist', msg = 'Ask for more time to pay or to send the work.', msg);

  -- ===== 2. It must still matter =====
  msg := pg_temp.ask(w_sub, 'work', today + 8, 'Please send it later.');
  perform pg_temp.chk('no more time for work that was already sent', msg like 'You can ask for more time to send the work only before%', msg);
  msg := pg_temp.ask(w_late, 'work', today + 3, 'Please send it later.');
  perform pg_temp.chk('work that is already late: too late to ask', msg like 'The date has already passed%', msg);
  msg := pg_temp.ask(w_today, 'work', today + 7, 'The files are too heavy to finish today.');
  perform pg_temp.chk('on the due day itself it is still allowed (7 days is the most)', msg = 'ok', msg);
  perform pg_temp.act(cl);
  msg := pg_temp.ask(p_open, 'payment', today + 40, 'Please wait.');
  perform pg_temp.chk('no payment request before the project is Done', msg like 'You can ask for more time to pay only on a finished project%', msg);
  msg := pg_temp.ask(p_day, 'payment', today + 9, 'Please wait.');
  perform pg_temp.chk('no payment request on a per-day price', msg like 'You can ask for more time to pay only on a finished project%', msg);
  msg := pg_temp.ask(p_paid, 'payment', today + 9, 'Please wait.');
  perform pg_temp.chk('no payment request when nothing is left to pay', msg = 'Nothing is left to pay on this project.', msg);
  msg := pg_temp.ask(p_late, 'payment', today + 1, 'Please wait.');
  perform pg_temp.chk('a late payment: too late to ask', msg like 'The date has already passed%', msg);

  -- ===== 3. The days and the reason =====
  perform pg_temp.act(fr);
  msg := pg_temp.ask(w2, 'work', today + 5, 'Same day is not later.');
  perform pg_temp.chk('the same day is refused', msg like 'Pick a day after %', msg);
  msg := pg_temp.ask(w2, 'work', today + 2, 'An earlier day is not later.');
  perform pg_temp.chk('an earlier day is refused', msg like 'Pick a day after %', msg);
  msg := pg_temp.ask(w2, 'work', null, 'No day at all.');
  perform pg_temp.chk('no day is refused', msg like 'Pick a day after %', msg);
  msg := pg_temp.ask(w2, 'work', today + 13, 'Eight days is too many.');
  perform pg_temp.chk('8 more days is refused (7 at a time)', msg like 'You can ask for up to 7 more days at a time (until %).', msg);
  msg := pg_temp.ask(w2, 'work', today + 8, 'ab');
  perform pg_temp.chk('a 2-letter reason is refused', msg = 'Tell them why, in 3 to 300 characters.', msg);
  msg := pg_temp.ask(w2, 'work', today + 8, repeat('x', 301));
  perform pg_temp.chk('a 301-letter reason is refused', msg = 'Tell them why, in 3 to 300 characters.', msg);
  msg := pg_temp.ask(w2, 'work', today + 8, '     ');
  perform pg_temp.chk('a reason of only spaces is refused', msg = 'Tell them why, in 3 to 300 characters.', msg);
  perform pg_temp.chk('nothing was saved by the refused ones', (select count(*) from public.delay_requests where project_id = w2) = 0);
  msg := pg_temp.ask(w2, 'work', today + 12, repeat('y', 300));
  perform pg_temp.chk('a 300-letter reason and exactly 7 more days are fine', msg = 'ok', msg);
  perform pg_temp.cancel(pg_temp.last_req(w2, 'work'));
  -- (that one is cancelled again so w2 is clean for the answer tests below; it still counts as 1 of 2)

  -- The word filter.
  msg := pg_temp.ask(w_stale, 'work', today + 6, 'what the fuck, I need time');
  perform pg_temp.chk('a blocked word in the reason is saved as ***',
    msg = 'ok' and (select reason like '%***%' and reason not like '%fuck%' from public.delay_requests where id = pg_temp.last_req(w_stale, 'work')), msg);

  -- ===== 4. One at a time, and two in all =====
  msg := pg_temp.ask(w1, 'work', today + 9, 'Another one while the first waits.');
  perform pg_temp.chk('a second request while one is waiting is refused', msg = 'You already have a request waiting for an answer.', msg);

  -- ===== 5. Answering =====
  perform pg_temp.chk('the one who asked can''t answer their own request',
    pg_temp.reply(r1, true) = 'Only the client can answer this request.');
  perform pg_temp.act(st);
  perform pg_temp.chk('a stranger can''t answer', pg_temp.reply(r1, true) = 'Only the client can answer this request.');
  perform pg_temp.chk('a stranger can''t cancel', pg_temp.cancel(r1) = 'Only the person who asked can cancel this request.');
  perform pg_temp.act(cl);
  perform pg_temp.chk('the client can''t cancel the freelancer''s request', pg_temp.cancel(r1) = 'Only the person who asked can cancel this request.');
  msg := pg_temp.reply(r1, true);
  perform pg_temp.chk('the client can accept', msg = 'ok', msg);
  perform pg_temp.chk('accepting moves the due date to the day asked for',
    (select due_date = today + 10 from public.projects where id = w1));
  perform pg_temp.chk('the request is now accepted and has an answer time',
    (select status = 'accepted' and answered_at is not null from public.delay_requests where id = r1));
  msg := pg_temp.notice_text(w1, fr, 'delay_accepted');
  perform pg_temp.chk('the freelancer is told the new day', msg like '% agreed. "ZZ w1" is now due %.' and msg like '%' || to_char(today + 10, 'FMMonth FMDD, YYYY') || '.', msg);
  perform pg_temp.chk('answering again is refused', pg_temp.reply(r1, false) = 'This request was already answered or cancelled.');
  perform pg_temp.act(fr);
  perform pg_temp.chk('an answered request can''t be cancelled', pg_temp.cancel(r1) = 'This request was already answered or cancelled.');

  -- Declining (w2 has one cancelled request already): ask, decline, then no third request.
  perform pg_temp.ask(w2, 'work', today + 8, 'First reason.');
  r2 := pg_temp.last_req(w2, 'work');
  perform pg_temp.act(cl);
  msg := pg_temp.reply(r2, false);
  perform pg_temp.chk('the client can decline', msg = 'ok', msg);
  perform pg_temp.chk('declining leaves the due date alone and marks it declined',
    (select p.due_date = today + 5 and r.status = 'declined' from public.projects p, public.delay_requests r where p.id = w2 and r.id = r2));
  msg := pg_temp.notice_text(w2, fr, 'delay_declined');
  perform pg_temp.chk('the freelancer is told it stays the same day', msg like '% couldn''t give more time. "ZZ w2" is still due %.', msg);
  -- Now the freelancer has used 2 of 2 on w2 (one cancelled, one declined).
  perform pg_temp.act(fr);
  msg := pg_temp.ask(w2, 'work', today + 8, 'A third reason.');
  perform pg_temp.chk('cancelled and declined ones count: no third request', msg = 'You have already used both of your requests for this project.', msg);

  -- Two that are cancelled use up the two requests too.
  perform pg_temp.ask(w3, 'work', today + 8, 'First.');
  msg := pg_temp.cancel(pg_temp.last_req(w3, 'work'));
  perform pg_temp.chk('the freelancer can cancel a waiting request', msg = 'ok', msg);
  perform pg_temp.chk('a cancelled request is marked cancelled', (select status = 'cancelled' and answered_at is not null from public.delay_requests where id = pg_temp.last_req(w3, 'work')));
  perform pg_temp.ask(w3, 'work', today + 8, 'Second.');
  perform pg_temp.cancel(pg_temp.last_req(w3, 'work'));
  msg := pg_temp.ask(w3, 'work', today + 8, 'Third.');
  perform pg_temp.chk('ask-and-cancel can''t go on forever', msg = 'You have already used both of your requests for this project.', msg);

  -- ===== 6. Payment requests =====
  perform pg_temp.act(cl);
  msg := pg_temp.ask(p1, 'payment', today + 7, 'My salary comes in on the fifth.');
  perform pg_temp.chk('the client can ask for more time to pay (payment day was in 2 days, +5)', msg = 'ok', msg);
  r3 := pg_temp.last_req(p1, 'payment');
  perform pg_temp.chk('the request starts from the normal payment day',
    (select from_date = today + 2 and to_date = today + 7 and kind = 'payment' and asked_by = cl from public.delay_requests where id = r3));
  msg := pg_temp.notice_text(p1, fr, 'delay_requested');
  perform pg_temp.chk('the freelancer is told, in words about paying', msg like '% asks for more time to pay "ZZ p1": until % instead of %', msg);
  perform pg_temp.chk('the client can''t answer their own payment request', pg_temp.reply(r3, true) = 'Only the freelancer can answer this request.');
  perform pg_temp.act(fr);
  msg := pg_temp.reply(r3, true);
  perform pg_temp.chk('the freelancer can accept', msg = 'ok', msg);
  perform pg_temp.chk('accepting sets the later payment day and leaves the work date alone',
    (select payment_due_override = today + 7 and due_date = today + 30 from public.projects where id = p1));
  perform pg_temp.chk('payment_due_date now gives the new day', (select public.payment_due_date(p) = today + 7 from public.projects p where p.id = p1));
  msg := pg_temp.notice_text(p1, cl, 'delay_accepted');
  perform pg_temp.chk('the client is told the new payment day', msg like '% agreed. The rest of "ZZ p1" is now due %.', msg);

  -- A second request on the same project starts from the new day.
  perform pg_temp.act(cl);
  msg := pg_temp.ask(p1, 'payment', today + 15, 'One more week, please.');
  perform pg_temp.chk('the next request counts from the new day (8 more days is refused)', msg like 'You can ask for up to 7 more days at a time (until %).', msg);
  msg := pg_temp.ask(p1, 'payment', today + 14, 'One more week, please.');
  perform pg_temp.chk('and exactly 7 more is fine', msg = 'ok', msg);

  -- Declining a payment request leaves the day alone.
  msg := pg_temp.ask(p2, 'payment', today + 6, 'Please wait.');
  r4 := pg_temp.last_req(p2, 'payment');
  perform pg_temp.act(fr);
  perform pg_temp.reply(r4, false);
  perform pg_temp.chk('declining a payment request changes nothing',
    (select payment_due_override is null and public.payment_due_date(p) = today + 2 from public.projects p where p.id = p2));
  msg := pg_temp.notice_text(p2, cl, 'delay_declined');
  perform pg_temp.chk('the client is told the payment is still due on the same day', msg like '% couldn''t give more time. The payment for "ZZ p2" is still due %.', msg);

  -- ===== 7. Answers that are too late to matter =====
  -- w_stale already has a request waiting (the word-filter one). The work is sent meanwhile.
  update public.projects set status = 'submitted', submitted_at = now() where id = w_stale;
  perform pg_temp.act(cl);
  msg := pg_temp.reply(pg_temp.last_req(w_stale, 'work'), true);
  perform pg_temp.chk('a request can''t be accepted after the work was sent', msg = 'The project has changed since this request, so it can''t be accepted anymore.', msg);
  perform pg_temp.chk('but it can still be declined', pg_temp.reply(pg_temp.last_req(w_stale, 'work'), false) = 'ok');
  insert into public.delay_requests (project_id, kind, asked_by, from_date, to_date, reason)
  values (w_past, 'work', fr, today - 5, today - 1, 'Asked a while ago.');
  msg := pg_temp.reply(pg_temp.last_req(w_past, 'work'), true);
  perform pg_temp.chk('a request whose new day has already passed can''t be accepted', msg = 'The new date has already passed, so this request can''t be accepted anymore.', msg);

  -- ===== 8. The new payment day is what the late rules use =====
  perform pg_temp.act(cl);
  perform pg_temp.ask(p_over, 'payment', today + 3, 'Three more days, please.');
  perform pg_temp.act(fr);
  perform pg_temp.reply(pg_temp.last_req(p_over, 'payment'), true);
  -- Let 3 days pass: the normal payment day would now be 3 days ago.
  update public.projects set completed_at = completed_at - interval '3 days' where id = p_over;
  perform pg_temp.chk('3 days on, the agreed day keeps it from being late', not public.payment_overdue(p_over));
  -- p_late (late, no agreement) is "allowed" by the freelancer so only p_over can stop the client here.
  update public.projects set pay_allowed_at = now() where id = p_late;
  perform pg_temp.act(cl);
  begin perform public.block_if_client_owes(fr); msg := 'no error'; exception when others then msg := sqlerrm; end;
  perform pg_temp.chk('and the client isn''t stopped from hiring or booking', msg = 'no error', msg);
  update public.projects set payment_due_override = today - 1 where id = p_over;
  perform pg_temp.chk('once the agreed day has passed it is late again', public.payment_overdue(p_over));
  perform pg_temp.chk('the same project without the agreement was late', public.payment_overdue(p_late));

  -- ===== 9. Who can read, and who can call =====
  perform pg_temp.act(st);
  execute 'set local role authenticated';
  select count(*) into seen_st from public.delay_requests;
  begin
    insert into public.delay_requests (project_id, kind, asked_by, from_date, to_date, reason)
    values (w1, 'work', st, today, today + 1, 'Sneaky.');
    denied := 'inserted';
  exception when others then denied := sqlerrm;
  end;
  execute 'reset role';
  perform pg_temp.chk('a stranger sees no requests', seen_st = 0, seen_st::text);
  perform pg_temp.chk('and can''t write one directly', denied like 'permission denied%', denied);
  perform pg_temp.act(cl);
  execute 'set local role authenticated';
  select count(*) into seen_cl from public.delay_requests;
  execute 'reset role';
  perform pg_temp.chk('the client sees the requests on their projects', seen_cl > 0, seen_cl::text);
  perform pg_temp.chk('anon can''t call the three functions',
    not has_function_privilege('anon', 'public.request_delay(uuid,text,date,text)', 'execute')
    and not has_function_privilege('anon', 'public.answer_delay(uuid,boolean)', 'execute')
    and not has_function_privilege('anon', 'public.cancel_delay_request(uuid)', 'execute'));
  perform pg_temp.chk('signed-in people can call them',
    has_function_privilege('authenticated', 'public.request_delay(uuid,text,date,text)', 'execute')
    and has_function_privilege('authenticated', 'public.answer_delay(uuid,boolean)', 'execute')
    and has_function_privilege('authenticated', 'public.cancel_delay_request(uuid)', 'execute'));
  perform pg_temp.chk('people can''t call payment_due_date themselves',
    not has_function_privilege('authenticated', 'public.payment_due_date(public.projects)', 'execute'));

  -- Everything above is rolled back by this error; the list is in its message.
  report := coalesce(current_setting('test.report', true), '(nothing was checked)');
  select count(*) filter (where l like 'PASS%'), count(*) filter (where l like 'FAIL%')
    into passes, fails from unnest(string_to_array(report, E'\n')) as l;
  raise exception E'RESULTS: % PASS, % FAIL\n%', passes, fails, report;
end;
$$;
