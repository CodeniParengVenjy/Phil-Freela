-- Test for supabase_payment_due_schema.sql (PLAN-delays.md, Step 1). Run it in the
-- Supabase SQL Editor AFTER the schema file. Nothing stays: the last line raises an
-- error that carries the PASS / FAIL list, and that rolls everything back.
--
-- It borrows one existing client and one existing freelancer (no made-up accounts,
-- so no user numbers are used up), adds made-up projects and payments as the owner,
-- runs the daily job, and counts the notices. The email trigger is switched off for
-- the test (it comes back with the rollback), so nobody gets an email.
--
-- Days are counted from today in Manila. A project marked Done N days ago is due for
-- payment 7 - N days from now.

do $$
declare
  today date := (now() at time zone 'Asia/Manila')::date;
  cl uuid;
  fr uuid;
  p_a uuid; p_b uuid; p_c uuid; p_c3 uuid; p_d uuid; p_d2 uuid; p_e uuid;
  p_f uuid; p_g uuid; p_h uuid; p_i uuid; p_j uuid; p_k uuid; p_l uuid; p_m uuid;
  sent1 integer;
  sent2 integer;
begin
  -- Nobody gets an email from this test.
  alter table public.user_notifications disable trigger email_offline_on_notification;

  select id into cl from public.profiles where account_type = 'client' limit 1;
  select id into fr from public.profiles where account_type = 'freelancer' limit 1;
  if cl is null or fr is null then
    raise exception 'The test needs one client and one freelancer account to borrow.';
  end if;

  -- Small helpers that live only for this test.
  create function pg_temp.chk(label text, passed boolean) returns void
  language plpgsql as $f$
  begin
    perform set_config('test.report',
      coalesce(current_setting('test.report', true), '')
        || case when coalesce(passed, false) then 'PASS  ' else 'FAIL  ' end || label || E'\n', true);
  end;
  $f$;

  -- A made-up project, marked Done done_days_ago days ago (at 10:00 Manila time).
  -- price null = no price; basis is project, day or month.
  create function pg_temp.mk_project(cl uuid, fr uuid, label text, st text, done_days_ago integer, basis text, price numeric)
  returns uuid language plpgsql as $f$
  declare new_id uuid;
  begin
    insert into public.projects (client_id, freelancer_id, title, status, due_date, completed_at,
                                 agreed_amount, price_basis, price_status, price_source, price_agreed_at)
    values (cl, fr, label, st, current_date + 30,
            case when st = 'done'
              then (((now() at time zone 'Asia/Manila')::date - done_days_ago)::timestamp + interval '10 hours') at time zone 'Asia/Manila'
            end,
            price, case when price is null then null else basis end,
            case when price is null then 'none' else 'agreed' end,
            case when price is null then null else 'job' end,
            case when price is null then null else now() end)
    returning id into new_id;
    return new_id;
  end;
  $f$;

  -- A made-up payment on a project (answered_at and received_amount follow the status rules).
  create function pg_temp.mk_payment(proj uuid, cl uuid, fr uuid, amt numeric, st text, ref text, got numeric, tip numeric)
  returns void language plpgsql as $f$
  begin
    insert into public.payments (project_id, client_id, freelancer_id, amount, tip_amount, reference_no, receipt_path,
                                 status, answered_at, received_amount)
    values (proj, cl, fr, amt, tip, ref, cl::text || '/zz-test.jpg', st,
            case when st = 'sent' then null else now() end,
            case when st = 'confirmed' then got end);
  end;
  $f$;

  -- How many notices of one kind a person got about a project, and what they say.
  create function pg_temp.notices(proj uuid, who uuid, kind text) returns integer
  language sql as $f$
    select count(*)::integer from public.user_notifications
    where link = '/dashboard/project-details/' || proj and user_id = who and type = kind;
  $f$;
  create function pg_temp.notice_title(proj uuid, who uuid, kind text) returns text
  language sql as $f$
    select title from public.user_notifications
    where link = '/dashboard/project-details/' || proj and user_id = who and type = kind limit 1;
  $f$;
  create function pg_temp.notice_text(proj uuid, who uuid, kind text) returns text
  language sql as $f$
    select message from public.user_notifications
    where link = '/dashboard/project-details/' || proj and user_id = who and type = kind limit 1;
  $f$;
  -- Any payment notice at all (to anybody) about a project.
  create function pg_temp.any_notice(proj uuid) returns integer
  language sql as $f$
    select count(*)::integer from public.user_notifications
    where link = '/dashboard/project-details/' || proj and type in ('payment_due_soon', 'payment_overdue');
  $f$;

  -- ===== The made-up projects (all agreed at 1,000 pesos for the whole project) =====
  p_a  := pg_temp.mk_project(cl, fr, 'ZZ pay A',  'done', 4,  'project', 1000);  -- due in 3 days
  p_b  := pg_temp.mk_project(cl, fr, 'ZZ pay B',  'done', 7,  'project', 1000);  -- due today
  p_c  := pg_temp.mk_project(cl, fr, 'ZZ pay C',  'done', 8,  'project', 1000);  -- 1 day late
  p_c3 := pg_temp.mk_project(cl, fr, 'ZZ pay C3', 'done', 10, 'project', 1000);  -- 3 days late
  p_d  := pg_temp.mk_project(cl, fr, 'ZZ pay D',  'done', 14, 'project', 1000);  -- 7 days late
  p_d2 := pg_temp.mk_project(cl, fr, 'ZZ pay D2', 'done', 19, 'project', 1000);  -- 12 days late
  p_e  := pg_temp.mk_project(cl, fr, 'ZZ pay E',  'done', 3,  'project', 1000);  -- due in 4 days: too early
  p_f  := pg_temp.mk_project(cl, fr, 'ZZ pay F',  'done', 14, 'project', 1000);  -- fully paid
  p_g  := pg_temp.mk_project(cl, fr, 'ZZ pay G',  'done', 14, 'project', 1000);  -- paid, freelancer hasn't answered
  p_h  := pg_temp.mk_project(cl, fr, 'ZZ pay H',  'done', 14, 'project', 1000);  -- answered "Not received"
  p_i  := pg_temp.mk_project(cl, fr, 'ZZ pay I',  'done', 14, 'day',     1000);  -- per day price
  p_j  := pg_temp.mk_project(cl, fr, 'ZZ pay J',  'done', 14, 'project', null);  -- no price
  p_k  := pg_temp.mk_project(cl, fr, 'ZZ pay K',  'submitted', 0, 'project', 1000);  -- not Done yet
  p_l  := pg_temp.mk_project(cl, fr, 'ZZ pay L',  'done', 14, 'project', 1000);  -- 400 of 1,000 paid
  p_m  := pg_temp.mk_project(cl, fr, 'ZZ pay M',  'done', 14, 'project', 1000);  -- 1,000 paid plus a 100 tip

  perform pg_temp.mk_payment(p_f, cl, fr, 1000, 'confirmed',    '9990000000001', 1000, 0);
  perform pg_temp.mk_payment(p_g, cl, fr, 1000, 'sent',         '9990000000002', null, 0);
  perform pg_temp.mk_payment(p_h, cl, fr, 1000, 'not_received', '9990000000003', null, 0);
  perform pg_temp.mk_payment(p_l, cl, fr, 400,  'confirmed',    '9990000000004', 400,  0);
  perform pg_temp.mk_payment(p_m, cl, fr, 1100, 'confirmed',    '9990000000005', 1100, 100);

  -- ===== 1. The payment due date =====
  perform pg_temp.chk('payment_due_date: Done + agreed = the Done day + 7 (8 days ago -> yesterday)',
    (select public.payment_due_date(p) from public.projects p where p.id = p_c) = today - 1);
  perform pg_temp.chk('payment_due_date: a project not Done has none',
    (select public.payment_due_date(p) from public.projects p where p.id = p_k) is null);
  perform pg_temp.chk('payment_due_date: a per day price has none',
    (select public.payment_due_date(p) from public.projects p where p.id = p_i) is null);
  perform pg_temp.chk('payment_due_date: no price has none',
    (select public.payment_due_date(p) from public.projects p where p.id = p_j) is null);
  perform pg_temp.chk('users can not call payment_due_date or send_daily_notices',
    not has_function_privilege('authenticated', 'public.payment_due_date(public.projects)', 'execute')
    and not has_function_privilege('anon', 'public.payment_due_date(public.projects)', 'execute')
    and not has_function_privilege('authenticated', 'public.send_daily_notices()', 'execute'));

  -- ===== 2. The daily job, first run =====
  sent1 := public.send_daily_notices();

  perform pg_temp.chk('A (due in 3 days): the client is told once, the freelancer is not',
    pg_temp.notices(p_a, cl, 'payment_due_soon') = 1
    and pg_temp.notices(p_a, fr, 'payment_due_soon') = 0
    and pg_temp.notices(p_a, fr, 'payment_overdue') = 0
    and pg_temp.notice_title(p_a, cl, 'payment_due_soon') = 'Payment due soon');
  perform pg_temp.chk('A says the amount and how to pay',
    pg_temp.notice_text(p_a, cl, 'payment_due_soon') like '%₱1,000.00 is still unpaid%'
    and pg_temp.notice_text(p_a, cl, 'payment_due_soon') like '%in 3 days%');
  perform pg_temp.chk('B (due today): the client is told once, the title says today',
    pg_temp.notices(p_b, cl, 'payment_due_soon') = 1
    and pg_temp.notices(p_b, fr, 'payment_due_soon') = 0
    and pg_temp.notice_title(p_b, cl, 'payment_due_soon') = 'Payment due today');
  perform pg_temp.chk('C (1 day late): both people are told once',
    pg_temp.notices(p_c, cl, 'payment_overdue') = 1 and pg_temp.notices(p_c, fr, 'payment_overdue') = 1
    and pg_temp.notice_text(p_c, cl, 'payment_overdue') like '%1 day late%');
  perform pg_temp.chk('C3 (3 days late): both told, it says 3 days late',
    pg_temp.notices(p_c3, cl, 'payment_overdue') = 1 and pg_temp.notices(p_c3, fr, 'payment_overdue') = 1
    and pg_temp.notice_text(p_c3, cl, 'payment_overdue') like '%3 days late%');
  perform pg_temp.chk('D (7 days late): both told, the freelancer is told they can report it',
    pg_temp.notices(p_d, cl, 'payment_overdue') = 1 and pg_temp.notices(p_d, fr, 'payment_overdue') = 1
    and pg_temp.notice_text(p_d, fr, 'payment_overdue') like '%report it if it stays unpaid%'
    and pg_temp.notice_text(p_c, fr, 'payment_overdue') not like '%report%');
  perform pg_temp.chk('D2 (12 days late, never told before): one notice each, it says 12 days late',
    pg_temp.notices(p_d2, cl, 'payment_overdue') = 1 and pg_temp.notices(p_d2, fr, 'payment_overdue') = 1
    and pg_temp.notice_text(p_d2, fr, 'payment_overdue') like '%12 days late%');
  perform pg_temp.chk('E (due in 4 days): nothing yet', pg_temp.any_notice(p_e) = 0);
  perform pg_temp.chk('F (fully paid): nothing', pg_temp.any_notice(p_f) = 0);
  perform pg_temp.chk('G (paid, the freelancer has not answered): counts as paid, nothing', pg_temp.any_notice(p_g) = 0);
  perform pg_temp.chk('H (answered "Not received"): counts as unpaid, both told',
    pg_temp.notices(p_h, cl, 'payment_overdue') = 1 and pg_temp.notices(p_h, fr, 'payment_overdue') = 1);
  perform pg_temp.chk('I (per day price): nothing', pg_temp.any_notice(p_i) = 0);
  perform pg_temp.chk('J (no price): nothing', pg_temp.any_notice(p_j) = 0);
  perform pg_temp.chk('K (not Done yet): nothing', pg_temp.any_notice(p_k) = 0);
  perform pg_temp.chk('L (400 of 1,000 paid): the notice says 600.00 is left',
    pg_temp.notice_text(p_l, cl, 'payment_overdue') like '%₱600.00 is still unpaid%');
  perform pg_temp.chk('M (1,000 paid plus a 100 tip): the tip does not count toward the price, price is paid, nothing',
    pg_temp.any_notice(p_m) = 0);

  perform pg_temp.chk('14 payment notices in all for the made-up projects (A1 B1 C2 C3 2 D2 D2 2 H2 L2)',
    (select count(*) from public.user_notifications
      where type in ('payment_due_soon', 'payment_overdue')
        and link in (select '/dashboard/project-details/' || x from unnest(array[p_a, p_b, p_c, p_c3, p_d, p_d2, p_e, p_f, p_g, p_h, p_i, p_j, p_k, p_l, p_m]) as x)) = 14);
  perform pg_temp.chk('the sent log has one row for each of those 8 projects',
    (select count(*) from public.scheduled_notices
      where kind in ('pay_due_3', 'pay_due_0', 'pay_late_1', 'pay_late_7')
        and target_id in (p_a, p_b, p_c, p_c3, p_d, p_d2, p_h, p_l)) = 8);

  -- ===== 3. A second run the same day sends nothing =====
  sent2 := public.send_daily_notices();
  perform pg_temp.chk('a second run the same day sends nothing at all', sent2 = 0);
  perform pg_temp.chk('and still 14 payment notices for the made-up projects',
    (select count(*) from public.user_notifications
      where type in ('payment_due_soon', 'payment_overdue')
        and link in (select '/dashboard/project-details/' || x from unnest(array[p_a, p_b, p_c, p_c3, p_d, p_d2, p_h, p_l]) as x)) = 14);

  -- ===== 4. The notification kinds =====
  begin
    insert into public.user_notifications (user_id, type, title, message) values (cl, 'zz_unknown_kind', 'x', 'x');
    perform pg_temp.chk('an unknown notification kind is refused', false);
  exception when check_violation then
    perform pg_temp.chk('an unknown notification kind is refused', true);
  end;

  -- Everything above is rolled back by this error; the list is in its message.
  raise exception E'RESULTS\n%', coalesce(current_setting('test.report', true), '(nothing was checked)');
end;
$$;
