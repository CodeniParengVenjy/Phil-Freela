-- Test for supabase_unpaid_client_block_schema.sql (PLAN-delays.md, Step 2). Run it in
-- the Supabase SQL Editor AFTER the schema file. Nothing stays: the last line raises an
-- error that carries the PASS / FAIL list, and that rolls everything back.
--
-- It borrows two existing clients, a freelancer who has an offer, and one more
-- freelancer (no made-up accounts, so no user numbers are used up), adds made-up
-- projects, payments, job posts and applications as the owner, and acts as each person
-- (the signed-in role plus their id) to try Hire, Book and "Allow to hire again". The
-- email and notification triggers of the tables it touches are switched off for the
-- test (they come back with the rollback), so nobody is told or emailed.
--
-- People: cl owes fr (a project 3 days past its payment day); cl2 owes fr2.

do $$
declare
  today date := (now() at time zone 'Asia/Manila')::date;
  svc uuid; fr uuid; fr2 uuid; cl uuid; cl2 uuid;
  job_a uuid; job_b uuid; app_a uuid; app_b uuid;
  p_late uuid; p_today uuid;
  q_late uuid; q_paid uuid; q_wait uuid; q_notrec uuid; q_day uuid; q_open uuid;
  t1 timestamptz; t2 timestamptz;
  msg text; got uuid; sent integer;
begin
  alter table public.job_applications disable trigger user;
  alter table public.user_notifications disable trigger user;
  alter table public.bookings disable trigger user;

  -- People (only read; everything they get here rolls back).
  select s.id, s.freelancer_id into svc, fr
    from public.services s join public.profiles p on p.id = s.freelancer_id
   where p.available_for_work and public.is_verified(s.freelancer_id) and not public.is_posting_blocked(s.freelancer_id)
   limit 1;
  select p.id into fr2 from public.profiles p where p.account_type = 'freelancer' and p.id <> fr limit 1;
  select p.id into cl from public.profiles p
   where p.account_type = 'client' and not public.is_posting_blocked(p.id)
     and not exists (select 1 from public.bookings b where b.client_id = p.id and b.service_id = svc and b.status = 'pending')
   limit 1;
  select p.id into cl2 from public.profiles p
   where p.account_type = 'client' and p.id <> cl and not public.is_posting_blocked(p.id)
     and not exists (select 1 from public.bookings b where b.client_id = p.id and b.service_id = svc and b.status = 'pending')
   limit 1;
  if svc is null or fr is null or fr2 is null or cl is null or cl2 is null then
    raise exception 'The test needs two clients, a freelancer with an offer, and one more freelancer to borrow.';
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

  -- A made-up project, marked Done done_days_ago days ago (at 10:00 Manila time).
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

  create function pg_temp.notice_text(proj uuid, who uuid, kind text) returns text
  language sql as $f$
    select message from public.user_notifications
    where link = '/dashboard/project-details/' || proj and user_id = who and type = kind limit 1;
  $f$;

  -- ===== The made-up projects (all agreed at 1,000 pesos for the whole project) =====
  p_late   := pg_temp.mk_project(cl, fr, 'ZZ late',  'done', 10, 'project', 1000);  -- 3 days past its payment day, nothing paid
  p_today  := pg_temp.mk_project(cl, fr, 'ZZ today', 'done', 7,  'project', 1000);  -- payment day is today
  q_late   := pg_temp.mk_project(cl2, fr2, 'ZZ q late',   'done', 8,  'project', 1000);  -- 1 day late
  q_paid   := pg_temp.mk_project(cl2, fr2, 'ZZ q paid',   'done', 14, 'project', 1000);  -- fully paid
  q_wait   := pg_temp.mk_project(cl2, fr2, 'ZZ q wait',   'done', 14, 'project', 1000);  -- paid, not answered yet
  q_notrec := pg_temp.mk_project(cl2, fr2, 'ZZ q notrec', 'done', 14, 'project', 1000);  -- answered Not received (7 days late)
  q_day    := pg_temp.mk_project(cl2, fr2, 'ZZ q day',    'done', 14, 'day',     1000);  -- per day price
  q_open   := pg_temp.mk_project(cl2, fr2, 'ZZ q open',   'started', 0, 'project', 1000);  -- not Done
  perform pg_temp.mk_payment(q_paid,   cl2, fr2, 1000, 'confirmed',    '9990000000011', 1000, 0);
  perform pg_temp.mk_payment(q_wait,   cl2, fr2, 1000, 'sent',         '9990000000012', null, 0);
  perform pg_temp.mk_payment(q_notrec, cl2, fr2, 1000, 'not_received', '9990000000013', null, 0);

  -- A job post by cl for each freelancer, each with an application (as the owner).
  insert into public.job_posts (client_id, title, category, description, start_date, due_date)
  values (cl, 'ZZ job a', (select category from public.job_posts limit 1), 'A made-up post for a rolled-back test.', today + 1, today + 10)
  returning id into job_a;
  insert into public.job_posts (client_id, title, category, description, start_date, due_date)
  values (cl, 'ZZ job b', (select category from public.job_posts limit 1), 'A made-up post for a rolled-back test.', today + 1, today + 10)
  returning id into job_b;
  insert into public.job_applications (job_post_id, freelancer_id, resume_path) values (job_a, fr, fr || '/' || job_a || '-1.pdf') returning id into app_a;
  insert into public.job_applications (job_post_id, freelancer_id, resume_path) values (job_b, fr2, fr2 || '/' || job_b || '-1.pdf') returning id into app_b;

  -- ===== 1. What "late" means =====
  perform pg_temp.chk('payment_overdue: 3 days past the payment day with nothing paid is late', public.payment_overdue(p_late));
  perform pg_temp.chk('payment_overdue: the payment day itself is not late yet', not public.payment_overdue(p_today));
  perform pg_temp.chk('payment_overdue: 1 day late is late', public.payment_overdue(q_late));
  perform pg_temp.chk('payment_overdue: fully paid is not late', not public.payment_overdue(q_paid));
  perform pg_temp.chk('payment_overdue: paid but not answered yet counts as paid', not public.payment_overdue(q_wait));
  perform pg_temp.chk('payment_overdue: answered Not received is late', public.payment_overdue(q_notrec));
  perform pg_temp.chk('payment_overdue: a per day price is never late', not public.payment_overdue(q_day));
  perform pg_temp.chk('payment_overdue: a project that is not Done is not late', not public.payment_overdue(q_open));
  perform pg_temp.chk('payment_overdue: an unknown project is not late', not public.payment_overdue(gen_random_uuid()));

  -- ===== 2. Who can call what =====
  perform pg_temp.chk('users can not call payment_overdue or block_if_client_owes',
    not has_function_privilege('authenticated', 'public.payment_overdue(uuid)', 'execute')
    and not has_function_privilege('anon', 'public.payment_overdue(uuid)', 'execute')
    and not has_function_privilege('authenticated', 'public.block_if_client_owes(uuid)', 'execute')
    and not has_function_privilege('anon', 'public.block_if_client_owes(uuid)', 'execute'));
  perform pg_temp.chk('signed-in users can call allow_unpaid_client, signed-out users can not',
    has_function_privilege('authenticated', 'public.allow_unpaid_client(uuid)', 'execute')
    and not has_function_privilege('anon', 'public.allow_unpaid_client(uuid)', 'execute'));
  perform pg_temp.chk('Hire and Book are still callable by signed-in users and not by signed-out ones',
    has_function_privilege('authenticated', 'public.hire_applicant(uuid, text, date)', 'execute')
    and has_function_privilege('authenticated', 'public.create_booking(uuid, text, date)', 'execute')
    and not has_function_privilege('anon', 'public.hire_applicant(uuid, text, date)', 'execute')
    and not has_function_privilege('anon', 'public.create_booking(uuid, text, date)', 'execute'));

  -- ===== 3. The check itself, one person at a time =====
  perform pg_temp.act(cl);
  begin perform public.block_if_client_owes(fr); msg := 'no error'; exception when others then msg := sqlerrm; end;
  perform pg_temp.chk('the late client is stopped for this freelancer, in plain words (title, amount, how to get out)',
    msg like 'You still owe % ₱1,000.00 for "ZZ late", and its payment day has passed.%' and msg like '%to allow you to hire again.', msg);
  begin perform public.block_if_client_owes(fr2); msg := 'no error'; exception when others then msg := sqlerrm; end;
  perform pg_temp.chk('the same client is not stopped for another freelancer', msg = 'no error', msg);
  perform pg_temp.act(cl2);
  begin perform public.block_if_client_owes(fr); msg := 'no error'; exception when others then msg := sqlerrm; end;
  perform pg_temp.chk('another client is not stopped for this freelancer (it only looks at the caller)', msg = 'no error', msg);
  begin perform public.block_if_client_owes(fr2); msg := 'no error'; exception when others then msg := sqlerrm; end;
  perform pg_temp.chk('a client who owes another freelancer is stopped for that one', msg like 'You still owe %', msg);

  -- ===== 4. Book and Hire as the late client =====
  perform pg_temp.act(cl);
  set local role authenticated;
  begin perform public.create_booking(svc, 'ZZ test booking', today + 5); msg := 'created'; exception when others then msg := sqlerrm; end;
  reset role;
  perform pg_temp.chk('Book: the late client is refused with that sentence', msg like 'You still owe % for "ZZ late"%', msg);
  perform pg_temp.chk('Book: no booking was made', (select count(*) from public.bookings where client_id = cl and service_id = svc) = 0);

  set local role authenticated;
  begin perform public.hire_applicant(app_a, 'ZZ note', today + 5); msg := 'hired'; exception when others then msg := sqlerrm; end;
  reset role;
  perform pg_temp.chk('Hire: the late client is refused with that sentence', msg like 'You still owe % for "ZZ late"%', msg);
  perform pg_temp.chk('Hire: no project was started', (select count(*) from public.projects where application_id = app_a) = 0);

  set local role authenticated;
  begin perform public.hire_applicant(app_b, 'ZZ note', today - 1); msg := 'hired'; exception when others then msg := sqlerrm; end;
  reset role;
  perform pg_temp.chk('Hire: the older rules still work (a due date in the past is refused)', msg like 'The due date can%t be in the past.', msg);
  set local role authenticated;
  begin got := public.hire_applicant(app_b, 'ZZ note', today + 5); msg := 'hired'; exception when others then msg := sqlerrm; end;
  reset role;
  perform pg_temp.chk('Hire: the same client can hire a freelancer they do not owe', msg = 'hired' and got is not null, msg);

  -- ===== 5. Another client books the same freelancer =====
  perform pg_temp.act(cl2);
  set local role authenticated;
  begin got := public.create_booking(svc, 'ZZ test booking', today + 5); msg := 'created'; exception when others then msg := sqlerrm; end;
  reset role;
  perform pg_temp.chk('Book: another client, who owes this freelancer nothing, can book', msg = 'created' and got is not null, msg);
  set local role authenticated;
  begin perform public.create_booking(svc, 'ZZ test booking', today + 5); msg := 'created'; exception when others then msg := sqlerrm; end;
  reset role;
  perform pg_temp.chk('Book: the older rules still work (a second pending booking is refused)', msg like 'You already have a pending booking%', msg);

  -- ===== 6. "Allow to hire again" =====
  perform pg_temp.act(cl); set local role authenticated;
  begin perform public.allow_unpaid_client(p_late); msg := 'allowed'; exception when others then msg := sqlerrm; end;
  reset role;
  perform pg_temp.chk('Allow: the client can not allow it for themselves', msg = 'Only the freelancer on this project can allow this.', msg);
  perform pg_temp.act(fr2); set local role authenticated;
  begin perform public.allow_unpaid_client(p_late); msg := 'allowed'; exception when others then msg := sqlerrm; end;
  reset role;
  perform pg_temp.chk('Allow: another freelancer can not allow it', msg = 'Only the freelancer on this project can allow this.', msg);
  perform pg_temp.act(fr); set local role authenticated;
  begin perform public.allow_unpaid_client(p_today); msg := 'allowed'; exception when others then msg := sqlerrm; end;
  reset role;
  perform pg_temp.chk('Allow: a project whose payment is not late is refused', msg like 'This project%payment isn%t late%', msg);
  perform pg_temp.chk('Allow: ...and nothing was saved on it', (select pay_allowed_at from public.projects where id = p_today) is null);

  perform pg_temp.act(fr); set local role authenticated;
  perform public.allow_unpaid_client(p_late);
  reset role;
  select pay_allowed_at into t1 from public.projects where id = p_late;
  perform pg_temp.chk('Allow: the freelancer can allow it, and the time is saved', t1 is not null);
  perform pg_temp.act(fr); set local role authenticated;
  perform public.allow_unpaid_client(p_late);
  reset role;
  select pay_allowed_at into t2 from public.projects where id = p_late;
  perform pg_temp.chk('Allow: pressing it twice changes nothing', t1 = t2);

  perform pg_temp.act(cl);
  begin perform public.block_if_client_owes(fr); msg := 'no error'; exception when others then msg := sqlerrm; end;
  perform pg_temp.chk('after "Allow to hire again" the client is no longer stopped', msg = 'no error', msg);
  set local role authenticated;
  begin got := public.create_booking(svc, 'ZZ test booking', today + 5); msg := 'created'; exception when others then msg := sqlerrm; end;
  reset role;
  perform pg_temp.chk('...and Book works', msg = 'created' and got is not null, msg);

  -- ===== 7. Taking the permission away, then paying =====
  update public.projects set pay_allowed_at = null where id = p_late;
  begin perform public.block_if_client_owes(fr); msg := 'no error'; exception when others then msg := sqlerrm; end;
  perform pg_temp.chk('with the permission taken away the client is stopped again', msg like 'You still owe %', msg);
  perform pg_temp.mk_payment(p_late, cl, fr, 400, 'confirmed', '9990000000015', 400, 0);
  begin perform public.block_if_client_owes(fr); msg := 'no error'; exception when others then msg := sqlerrm; end;
  perform pg_temp.chk('a part payment still stops them, and the sentence shows what is left', msg like '%₱600.00 for "ZZ late"%', msg);
  perform pg_temp.mk_payment(p_late, cl, fr, 600, 'confirmed', '9990000000014', 600, 0);
  begin perform public.block_if_client_owes(fr); msg := 'no error'; exception when others then msg := sqlerrm; end;
  perform pg_temp.chk('paying the rest lifts it by itself', msg = 'no error', msg);

  -- ===== 8. The late notices now mention the limit (and keep Step 1's words) =====
  sent := public.send_daily_notices();
  msg := pg_temp.notice_text(q_late, cl2, 'payment_overdue');
  perform pg_temp.chk('the client''s late notice says they can''t hire or book the freelancer until it is paid or allowed',
    msg like '%1 day late.%' and msg like '%Pay the rest in GCash, then record it on the project page. Until it is paid, you can''t hire or book % again, unless % allows it.', msg);
  msg := pg_temp.notice_text(q_late, fr2, 'payment_overdue');
  perform pg_temp.chk('the freelancer''s late notice says the client can''t hire or book them unless they allow it',
    msg like '% Until it is paid, % can''t hire or book you again, unless you allow it on the project page.%' and msg like '%You can message %.', msg);
  msg := pg_temp.notice_text(q_notrec, fr2, 'payment_overdue');
  perform pg_temp.chk('the 7 days late notice also keeps the report sentence',
    msg like '%unless you allow it on the project page.%' and msg like '%, and report it if it stays unpaid.', msg);

  -- Everything above is rolled back by this error; the list is in its message.
  raise exception E'RESULTS\n%', coalesce(current_setting('test.report', true), '(nothing was checked)');
end;
$$;
