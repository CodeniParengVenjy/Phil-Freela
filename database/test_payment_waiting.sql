-- Test for supabase_payment_waiting_schema.sql (PLAN-delays.md, Step 3). Run it in the
-- Supabase SQL Editor AFTER the schema file. Nothing stays: the last line raises an
-- error that carries the PASS / FAIL list, and that rolls everything back.
--
-- It borrows one client and one freelancer, and three existing chats between two people
-- each (a chat can have only one open payment at a time, so three chats; no made-up
-- accounts, so no user numbers are used up), adds made-up payments as the owner, runs
-- the daily job, and counts the notices. Every payment has its own amount so its
-- notices can be told apart. The email trigger is switched off for the test (it comes
-- back with the rollback), so nobody is emailed.
--
-- A payment recorded N days ago (counted in Manila days) is waiting N days.

do $$
declare
  today date := (now() at time zone 'Asia/Manila')::date;
  cl uuid; fr uuid; proj uuid;
  conv1 uuid; a1 uuid; b1 uuid;   -- a chat (a1 asks b1 to pay)
  conv2 uuid; a2 uuid; b2 uuid;
  conv3 uuid; a3 uuid; b3 uuid;
  sent1 integer; sent2 integer;
  msg text;
begin
  alter table public.user_notifications disable trigger user;

  select id into cl from public.profiles where account_type = 'client' limit 1;
  select id into fr from public.profiles where account_type = 'freelancer' limit 1;
  select c.id, c.user_a, c.user_b into conv1, a1, b1 from public.conversations c order by c.id limit 1;
  select c.id, c.user_a, c.user_b into conv2, a2, b2 from public.conversations c where c.id <> conv1 order by c.id limit 1;
  select c.id, c.user_a, c.user_b into conv3, a3, b3 from public.conversations c where c.id not in (conv1, conv2) order by c.id limit 1;
  if cl is null or fr is null or conv1 is null or conv2 is null or conv3 is null then
    raise exception 'The test needs a client, a freelancer and three chats to borrow.';
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

  -- A made-up payment recorded days_ago days ago (at 10:00 Manila time). On a project,
  -- or (proj null) in the chat conv. Requested and cancelled ones have no reference.
  create function pg_temp.mk_pay(proj uuid, conv uuid, cl uuid, fr uuid, amt numeric, st text, ref text, days_ago integer)
  returns void language plpgsql as $f$
  begin
    insert into public.payments (project_id, conversation_id, client_id, freelancer_id, amount, reference_no, receipt_path,
                                 status, created_at, answered_at, received_amount)
    values (proj, conv, cl, fr, amt,
            case when st in ('requested', 'cancelled') then null else ref end,
            case when st in ('requested', 'cancelled') then null else cl::text || '/zz-test.jpg' end,
            st,
            (((now() at time zone 'Asia/Manila')::date - days_ago)::timestamp + interval '10 hours') at time zone 'Asia/Manila',
            case when st in ('sent', 'requested') then null else now() end,
            case when st = 'confirmed' then amt end);
  end;
  $f$;

  -- How many "payment_waiting" notices a person got with this title about the payment of this amount, and what they say.
  create function pg_temp.n_for(who uuid, wanted_title text, amount_text text) returns integer
  language sql as $f$
    select count(*)::integer from public.user_notifications
    where user_id = who and type = 'payment_waiting' and title = wanted_title and message like '%' || amount_text || '%';
  $f$;
  create function pg_temp.any_for(who uuid, amount_text text) returns integer
  language sql as $f$
    select count(*)::integer from public.user_notifications
    where user_id = who and type = 'payment_waiting' and message like '%' || amount_text || '%';
  $f$;
  create function pg_temp.msg_for(who uuid, amount_text text) returns text
  language sql as $f$
    select message from public.user_notifications
    where user_id = who and type = 'payment_waiting' and message like '%' || amount_text || '%' order by created_at limit 1;
  $f$;
  create function pg_temp.link_for(who uuid, amount_text text) returns text
  language sql as $f$
    select link from public.user_notifications
    where user_id = who and type = 'payment_waiting' and message like '%' || amount_text || '%' order by created_at limit 1;
  $f$;

  -- A project for the project payments.
  insert into public.projects (client_id, freelancer_id, title, due_date) values (cl, fr, 'ZZ wait project', today + 30) returning id into proj;

  -- ===== Payments on a project, between cl (the client) and fr (the freelancer) =====
  perform pg_temp.mk_pay(proj, null, cl, fr, 101, 'sent',         '9990000000101', 1);   -- too early
  perform pg_temp.mk_pay(proj, null, cl, fr, 102, 'sent',         '9990000000102', 2);   -- wait_2
  perform pg_temp.mk_pay(proj, null, cl, fr, 104, 'sent',         '9990000000104', 4);   -- still wait_2
  perform pg_temp.mk_pay(proj, null, cl, fr, 105, 'sent',         '9990000000105', 5);   -- wait_5
  perform pg_temp.mk_pay(proj, null, cl, fr, 106, 'sent',         '9990000000106', 6);   -- still wait_5
  perform pg_temp.mk_pay(proj, null, cl, fr, 107, 'sent',         '9990000000107', 7);   -- wait_7
  perform pg_temp.mk_pay(proj, null, cl, fr, 112, 'sent',         '9990000000112', 12);  -- never nudged before: wait_7
  perform pg_temp.mk_pay(proj, null, cl, fr, 205, 'confirmed',    '9990000000205', 5);   -- answered
  perform pg_temp.mk_pay(proj, null, cl, fr, 206, 'not_received', '9990000000206', 5);   -- answered
  -- ===== Payments in a chat (between that chat's two people; one open payment per chat) =====
  perform pg_temp.mk_pay(null, conv1, a1, b1, 301, 'requested', null,            5);    -- nobody has paid yet
  perform pg_temp.mk_pay(null, conv1, a1, b1, 302, 'cancelled', null,            5);    -- taken back
  perform pg_temp.mk_pay(null, conv2, a2, b2, 303, 'sent',      '9990000000303', 3);    -- wait_2, in the chat
  perform pg_temp.mk_pay(null, conv3, a3, b3, 309, 'sent',      '9990000000309', 9);    -- wait_7, in the chat

  sent1 := public.send_daily_notices();

  -- ===== 1. Which payments get a notice, and who gets it =====
  perform pg_temp.chk('1 day waiting: nothing yet', pg_temp.any_for(fr, '₱101.00') + pg_temp.any_for(cl, '₱101.00') = 0);
  perform pg_temp.chk('2 days: the freelancer is reminded once, the client is not told',
    pg_temp.n_for(fr, 'Payment waiting for your answer', '₱102.00') = 1 and pg_temp.any_for(cl, '₱102.00') = 0);
  perform pg_temp.chk('4 days: still the first reminder',
    pg_temp.n_for(fr, 'Payment waiting for your answer', '₱104.00') = 1 and pg_temp.any_for(cl, '₱104.00') = 0);
  perform pg_temp.chk('5 days: the second reminder, and the client is not told yet',
    pg_temp.n_for(fr, 'Still waiting for your answer', '₱105.00') = 1 and pg_temp.any_for(fr, '₱105.00') = 1 and pg_temp.any_for(cl, '₱105.00') = 0);
  perform pg_temp.chk('6 days: still the second reminder',
    pg_temp.n_for(fr, 'Still waiting for your answer', '₱106.00') = 1 and pg_temp.any_for(cl, '₱106.00') = 0);
  perform pg_temp.chk('7 days: both people are told, once each',
    pg_temp.n_for(cl, 'Payment not answered yet', '₱107.00') = 1 and pg_temp.n_for(fr, 'Payment still not answered', '₱107.00') = 1
    and pg_temp.any_for(fr, '₱107.00') = 1 and pg_temp.any_for(cl, '₱107.00') = 1);
  perform pg_temp.chk('12 days and never reminded: one notice each, not the early ones',
    pg_temp.n_for(cl, 'Payment not answered yet', '₱112.00') = 1 and pg_temp.n_for(fr, 'Payment still not answered', '₱112.00') = 1
    and pg_temp.any_for(fr, '₱112.00') = 1 and pg_temp.any_for(cl, '₱112.00') = 1);
  perform pg_temp.chk('an answered payment (confirmed, not received) gets nothing',
    pg_temp.any_for(fr, '₱205.00') + pg_temp.any_for(cl, '₱205.00') + pg_temp.any_for(fr, '₱206.00') + pg_temp.any_for(cl, '₱206.00') = 0);
  perform pg_temp.chk('a chat request nobody paid, and a cancelled one, get nothing',
    pg_temp.any_for(a1, '₱301.00') + pg_temp.any_for(b1, '₱301.00') + pg_temp.any_for(a1, '₱302.00') + pg_temp.any_for(b1, '₱302.00') = 0);

  -- ===== 2. What the notices say =====
  msg := pg_temp.msg_for(fr, '₱102.00');
  perform pg_temp.chk('first reminder: who sent how much, for which project, how long ago, what to do',
    msg like '% says they sent ₱102.00 for "ZZ wait project" 2 days ago.%' and msg like '%Check your GCash, then confirm it. If less arrived, answer Received less; if nothing arrived, answer Not received.', msg);
  perform pg_temp.chk('first reminder: goes to the project page',
    pg_temp.link_for(fr, '₱102.00') = '/dashboard/project-details/' || proj, pg_temp.link_for(fr, '₱102.00'));
  msg := pg_temp.msg_for(fr, '₱105.00');
  perform pg_temp.chk('second reminder: says how long, and that the client can report it after 7 days',
    msg like '%₱105.00 payment for "ZZ wait project" is still waiting for your answer (5 days).%' and msg like '%After 7 days % can report it.', msg);
  msg := pg_temp.msg_for(cl, '₱107.00');
  perform pg_temp.chk('7 days, to the client: not answered, how long, and that they can message or report it',
    msg like '% has not answered your ₱107.00 payment for "ZZ wait project". It has been 7 days.%' and msg like '%, or report it from the payment.', msg);
  msg := pg_temp.msg_for(fr, '₱107.00');
  perform pg_temp.chk('7 days, to the freelancer: the client can report it now',
    msg like '%has been waiting 7 days for your answer, so % can report it now.%' and msg like '%Please check your GCash and answer it.', msg);

  -- ===== 3. Payments in a chat =====
  perform pg_temp.chk('chat payment, 3 days: the freelancer is reminded, with the chat link and "in the chat"',
    pg_temp.n_for(b2, 'Payment waiting for your answer', '₱303.00') = 1 and pg_temp.any_for(a2, '₱303.00') = 0
    and pg_temp.link_for(b2, '₱303.00') = '/dashboard/chat/' || conv2 and pg_temp.msg_for(b2, '₱303.00') like '% says they sent ₱303.00 in the chat 3 days ago.%',
    pg_temp.msg_for(b2, '₱303.00'));
  perform pg_temp.chk('chat payment, 9 days: both people are told, with the chat link',
    pg_temp.n_for(a3, 'Payment not answered yet', '₱309.00') = 1 and pg_temp.n_for(b3, 'Payment still not answered', '₱309.00') = 1
    and pg_temp.link_for(a3, '₱309.00') = '/dashboard/chat/' || conv3);

  -- ===== 4. Once only =====
  perform pg_temp.chk('the sent log has one row for each of the 8 payments that were told about',
    (select count(*) from public.scheduled_notices where kind in ('wait_2', 'wait_5', 'wait_7')
       and target_id in (select id from public.payments where amount in (102, 104, 105, 106, 107, 112, 303, 309))) = 8);
  perform pg_temp.chk('11 notices in all for the made-up payments (1+1+1+1+2+2+1+2)',
    (select count(*) from public.user_notifications where type = 'payment_waiting'
       and (message like '%₱102.00%' or message like '%₱104.00%' or message like '%₱105.00%' or message like '%₱106.00%'
         or message like '%₱107.00%' or message like '%₱112.00%' or message like '%₱303.00%' or message like '%₱309.00%')) = 11);
  sent2 := public.send_daily_notices();
  perform pg_temp.chk('a second run the same day sends nothing at all', sent2 = 0, sent2::text);
  perform pg_temp.chk('...and still 11 notices',
    (select count(*) from public.user_notifications where type = 'payment_waiting'
       and (message like '%₱102.00%' or message like '%₱104.00%' or message like '%₱105.00%' or message like '%₱106.00%'
         or message like '%₱107.00%' or message like '%₱112.00%' or message like '%₱303.00%' or message like '%₱309.00%')) = 11);

  raise exception E'RESULTS\n%', coalesce(current_setting('test.report', true), '(nothing was checked)');
end;
$$;
