-- Test for supabase_short_payment_schema.sql (short payments, tips, unlock only
-- when fully paid). Send the schema file and this block together in ONE call to
-- try it before applying (the error at the end rolls the schema back too), or run
-- this alone in the Supabase SQL Editor after the schema file. It BORROWS three
-- normal accounts and one conversation (no accounts are made, so no user numbers
-- are used), adds made-up projects and payments as the database owner, acts as
-- each person and ends with an error that carries the PASS/FAIL list; that error
-- rolls everything back. The e-mail trigger on notifications is switched off for
-- the block (the switch rolls back too).
do $t$
declare
  res        text := '';
  n          int;
  ok         boolean;
  msg        text;
  today      date := (now() at time zone 'Asia/Manila')::date;
  cl         uuid;  -- the client
  fr         uuid;  -- the freelancer
  st         uuid;  -- a stranger
  cv         uuid;  -- a borrowed conversation (only its id is used)
  pa         uuid;  -- one-time project, agreed P1,500, a locked file sent
  pn         uuid;  -- no price, a locked file sent (old rule)
  pd         uuid;  -- agreed P800 per day, a locked file sent (old rule)
  pr2        uuid;  -- agreed P1,000, P400 paid, then marked Done -> reminder
  pr3        uuid;  -- agreed P1,000, P500 paid + P500 waiting, Done -> no reminder
  rc         text;  -- the made-up receipt picture
  p1         uuid;
  p2         uuid;
  p3         uuid;
  cp         uuid;
  pr         record;
  seq_before bigint;
  seq_after  bigint;
begin
  select last_value into seq_before from public.user_number_seq;
  alter table public.user_notifications disable trigger email_offline_on_notification;

  select p.id into cl from public.profiles p
   where not exists (select 1 from public.admins a where a.id = p.id)
   order by p.id limit 1;
  select p.id into fr from public.profiles p
   where p.id <> cl and not exists (select 1 from public.admins a where a.id = p.id)
   order by p.id limit 1;
  select p.id into st from public.profiles p
   where p.id not in (cl, fr) and not exists (select 1 from public.admins a where a.id = p.id)
   order by p.id limit 1;
  select c.id into cv from public.conversations c
   where not exists (select 1 from public.payments x where x.conversation_id = c.id and x.status in ('requested', 'sent'))
   order by c.id limit 1;
  if cl is null or fr is null or st is null or cv is null then
    raise exception 'Needs three normal accounts and one conversation already in the database.';
  end if;

  -- ---- made-up projects, receipt and payments (as the owner) ----------------------
  insert into public.projects (client_id, freelancer_id, title, due_date, status, submission_path, submitted_at, files_locked,
                               agreed_amount, price_basis, price_status, price_source, price_agreed_at)
  values (cl, fr, 'Test short A', today + 5, 'submitted', fr::text || '/a-1.mp4', now(), true,
          1500, 'project', 'agreed', 'job', now()) returning id into pa;
  insert into public.projects (client_id, freelancer_id, title, due_date, status, submission_path, submitted_at, files_locked)
  values (cl, fr, 'Test short N', today + 5, 'submitted', fr::text || '/n-1.mp4', now(), true) returning id into pn;
  insert into public.projects (client_id, freelancer_id, title, due_date, status, submission_path, submitted_at, files_locked,
                               agreed_amount, price_basis, price_status, price_source, price_agreed_at)
  values (cl, fr, 'Test short D', today + 5, 'submitted', fr::text || '/d-1.mp4', now(), true,
          800, 'day', 'agreed', 'job', now()) returning id into pd;
  insert into public.projects (client_id, freelancer_id, title, due_date, status, submitted_at,
                               agreed_amount, price_basis, price_status, price_source, price_agreed_at)
  values (cl, fr, 'Test short R2', today + 5, 'submitted', now(), 1000, 'project', 'agreed', 'job', now()) returning id into pr2;
  insert into public.projects (client_id, freelancer_id, title, due_date, status, submitted_at,
                               agreed_amount, price_basis, price_status, price_source, price_agreed_at)
  values (cl, fr, 'Test short R3', today + 5, 'submitted', now(), 1000, 'project', 'agreed', 'job', now()) returning id into pr3;

  rc := cl::text || '/test-short-receipt.jpg';
  insert into storage.objects (bucket_id, name) values ('receipts', rc);

  insert into public.payments (project_id, client_id, freelancer_id, amount, reference_no, receipt_path, status, answered_at, received_amount)
  values (pr2, cl, fr, 400, lpad((floor(random() * 1e13))::bigint::text, 13, '0'), rc, 'confirmed', now(), 400);
  insert into public.payments (project_id, client_id, freelancer_id, amount, reference_no, receipt_path, status, answered_at, received_amount)
  values (pr3, cl, fr, 500, lpad((floor(random() * 1e13))::bigint::text, 13, '0'), rc, 'confirmed', now(), 500);
  insert into public.payments (project_id, client_id, freelancer_id, amount, reference_no, receipt_path)
  values (pr3, cl, fr, 500, lpad((floor(random() * 1e13))::bigint::text, 13, '0'), rc);

  -- ---- 0. The table rules -----------------------------------------------------------
  begin
    insert into public.payments (project_id, client_id, freelancer_id, amount, reference_no, receipt_path, status, answered_at)
    values (pn, cl, fr, 100, lpad((floor(random() * 1e13))::bigint::text, 13, '0'), rc, 'confirmed', now());
    res := res || 'FAIL a confirmed payment was saved without saying how much arrived' || E'\n';
  exception when check_violation then
    res := res || 'PASS a confirmed payment must say how much arrived' || E'\n';
  end;
  begin
    insert into public.payments (project_id, client_id, freelancer_id, amount, tip_amount, reference_no, receipt_path)
    values (pn, cl, fr, 100, 150, lpad((floor(random() * 1e13))::bigint::text, 13, '0'), rc);
    res := res || 'FAIL a tip bigger than the amount was saved' || E'\n';
  exception when check_violation then
    res := res || 'PASS a tip cannot be bigger than the amount sent' || E'\n';
  end;
  ok := not has_function_privilege('authenticated', 'public.project_paid_amount(uuid, boolean)', 'execute')
        and not has_function_privilege('anon', 'public.project_paid_amount(uuid, boolean)', 'execute');
  res := res || case when ok then 'PASS' else 'FAIL' end || ' nobody can call the paid-amount helper directly' || E'\n';

  -- ---- 1. The client pays part of project A (P1,000 of P1,500) ------------------------
  perform set_config('request.jwt.claims', json_build_object('sub', cl, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', cl::text, true);
  set local role authenticated;
  p1 := public.record_payment(pa, 1000, 0, lpad((floor(random() * 1e13))::bigint::text, 13, '0'), rc);
  reset role;
  select * into pr from public.payments where id = p1;
  res := res || case when pr.status = 'sent' and pr.amount = 1000 and pr.tip_amount = 0 and pr.received_amount is null
                     then 'PASS' else 'FAIL' end || ' a part payment is recorded as sent, no tip' || E'\n';

  -- 1a. More than what is left (P500 left counting the one waiting) is refused.
  msg := null;
  begin
    set local role authenticated;
    perform public.record_payment(pa, 600, 0, lpad((floor(random() * 1e13))::bigint::text, 13, '0'), rc);
    reset role;
  exception when others then
    reset role;
    msg := sqlerrm;
  end;
  res := res || case when msg like 'Only ₱500.00 is left%' then 'PASS' else 'FAIL (' || coalesce(msg, 'no error') || ')' end
         || ' paying more than is left is refused (the waiting payment counts)' || E'\n';

  -- 1b. A tip while money is still left after this payment is refused.
  msg := null;
  begin
    set local role authenticated;
    perform public.record_payment(pa, 500, 100, lpad((floor(random() * 1e13))::bigint::text, 13, '0'), rc);
    reset role;
  exception when others then
    reset role;
    msg := sqlerrm;
  end;
  res := res || case when msg like 'A tip can be added only when%' then 'PASS' else 'FAIL (' || coalesce(msg, 'no error') || ')' end
         || ' a tip is refused when the payment does not pay everything left' || E'\n';

  -- ---- 2. "Received less": only P700 of the P1,000 arrived -----------------------------
  -- Who may not answer it.
  msg := null;
  begin
    set local role authenticated;
    perform public.confirm_short_payment(p1, 700);
    reset role;
  exception when others then
    reset role;
    msg := sqlerrm;
  end;
  res := res || case when msg like 'Only the freelancer%' then 'PASS' else 'FAIL (' || coalesce(msg, 'no error') || ')' end
         || ' the client cannot answer Received less' || E'\n';

  perform set_config('request.jwt.claims', json_build_object('sub', st, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', st::text, true);
  msg := null;
  begin
    set local role authenticated;
    perform public.confirm_short_payment(p1, 700);
    reset role;
  exception when others then
    reset role;
    msg := sqlerrm;
  end;
  res := res || case when msg like 'Only the freelancer%' then 'PASS' else 'FAIL (' || coalesce(msg, 'no error') || ')' end
         || ' a stranger cannot answer Received less' || E'\n';

  perform set_config('request.jwt.claims', json_build_object('sub', fr, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', fr::text, true);
  msg := null;
  begin
    set local role authenticated;
    perform public.confirm_short_payment(p1, 1000);
    reset role;
  exception when others then
    reset role;
    msg := sqlerrm;
  end;
  res := res || case when msg like 'That is the whole amount%' then 'PASS' else 'FAIL (' || coalesce(msg, 'no error') || ')' end
         || ' Received less with the whole amount points to Confirm received' || E'\n';
  msg := null;
  begin
    set local role authenticated;
    perform public.confirm_short_payment(p1, 0);
    reset role;
  exception when others then
    reset role;
    msg := sqlerrm;
  end;
  res := res || case when msg like 'Enter how much arrived%' then 'PASS' else 'FAIL (' || coalesce(msg, 'no error') || ')' end
         || ' Received less with nothing points to Not received' || E'\n';

  set local role authenticated;
  perform public.confirm_short_payment(p1, 700);
  reset role;
  select * into pr from public.payments where id = p1;
  res := res || case when pr.status = 'confirmed' and pr.received_amount = 700 and pr.answered_at is not null
                     then 'PASS' else 'FAIL' end || ' Received less saves the payment as confirmed with P700' || E'\n';
  select count(*) into n from public.user_notifications
   where user_id = cl and type = 'payment_short'
     and message like '%₱700.00 arrived, not ₱1,000.00 for "Test short A"%'
     and message like '%₱800.00 of the agreed price is still unpaid%';
  res := res || case when n = 1 then 'PASS' else 'FAIL (' || n || ')' end
         || ' the client is told what arrived and that P800 is still unpaid' || E'\n';
  select unlocked_at is null into ok from public.projects where id = pa;
  res := res || case when ok then 'PASS' else 'FAIL' end || ' a short, part payment does not unlock the file' || E'\n';
  res := res || case when public.project_paid_amount(pa, false) = 700 then 'PASS' else 'FAIL' end
         || ' only what arrived counts toward the price (P700)' || E'\n';

  -- A second answer to the same payment is refused.
  msg := null;
  begin
    set local role authenticated;
    perform public.confirm_payment(p1);
    reset role;
  exception when others then
    reset role;
    msg := sqlerrm;
  end;
  res := res || case when msg like 'This payment was already answered%' then 'PASS' else 'FAIL (' || coalesce(msg, 'no error') || ')' end
         || ' a payment answered Received less cannot be answered again' || E'\n';

  -- ---- 3. The client pays the rest (P800) plus a P100 tip -------------------------------
  perform set_config('request.jwt.claims', json_build_object('sub', cl, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', cl::text, true);
  set local role authenticated;
  p2 := public.record_payment(pa, 900, 100, lpad((floor(random() * 1e13))::bigint::text, 13, '0'), rc);
  reset role;
  select * into pr from public.payments where id = p2;
  res := res || case when pr.status = 'sent' and pr.amount = 900 and pr.tip_amount = 100 then 'PASS' else 'FAIL' end
         || ' the rest plus a tip is recorded (P900, tip P100)' || E'\n';
  select count(*) into n from public.user_notifications
   where user_id = fr and type = 'payment_sent'
     and message like '%sent ₱900.00 (₱800.00 + ₱100.00 tip) for "Test short A"%';
  res := res || case when n = 1 then 'PASS' else 'FAIL (' || n || ')' end
         || ' the freelancer is told the price part and the tip' || E'\n';

  -- Only P850 arrived: the tip goes missing first, the price is still covered.
  perform set_config('request.jwt.claims', json_build_object('sub', fr, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', fr::text, true);
  set local role authenticated;
  perform public.confirm_short_payment(p2, 850);
  reset role;
  res := res || case when public.project_paid_amount(pa, false) = 1500 then 'PASS' else 'FAIL (' || public.project_paid_amount(pa, false) || ')' end
         || ' a short tip still covers the price (P700 + P800 = P1,500)' || E'\n';
  select unlocked_at is not null into ok from public.projects where id = pa;
  res := res || case when ok then 'PASS' else 'FAIL' end || ' fully paid: the file unlocks by itself' || E'\n';
  select count(*) into n from public.user_notifications
   where user_id = cl and type = 'payment_short' and message like '%₱850.00 arrived, not ₱900.00%'
     and message like '%fully paid, so only the tip came up short%';
  res := res || case when n = 1 then 'PASS' else 'FAIL (' || n || ')' end
         || ' the client hears the tip was short, with nothing left unpaid' || E'\n';

  -- ---- 4. After it is fully paid: only a tip can be sent --------------------------------
  perform set_config('request.jwt.claims', json_build_object('sub', cl, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', cl::text, true);
  msg := null;
  begin
    set local role authenticated;
    perform public.record_payment(pa, 200, 0, lpad((floor(random() * 1e13))::bigint::text, 13, '0'), rc);
    reset role;
  exception when others then
    reset role;
    msg := sqlerrm;
  end;
  res := res || case when msg like 'This project is already fully paid%' then 'PASS' else 'FAIL (' || coalesce(msg, 'no error') || ')' end
         || ' paying the price again after it is fully paid is refused' || E'\n';
  set local role authenticated;
  p3 := public.record_payment(pa, 200, 200, lpad((floor(random() * 1e13))::bigint::text, 13, '0'), rc);
  reset role;
  select * into pr from public.payments where id = p3;
  res := res || case when pr.status = 'sent' and pr.tip_amount = 200 then 'PASS' else 'FAIL' end
         || ' a tip alone can be sent after it is fully paid' || E'\n';

  -- ---- 5. The old 4-box version (the page live during the deploy) ------------------------
  set local role authenticated;
  p3 := public.record_payment(pn, 300, lpad((floor(random() * 1e13))::bigint::text, 13, '0'), rc);
  reset role;
  select * into pr from public.payments where id = p3;
  res := res || case when pr.status = 'sent' and pr.amount = 300 and pr.tip_amount = 0 then 'PASS' else 'FAIL' end
         || ' the old record_payment still works (no tip)' || E'\n';

  perform set_config('request.jwt.claims', json_build_object('sub', fr, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', fr::text, true);
  set local role authenticated;
  perform public.confirm_payment(p3);
  reset role;
  select * into pr from public.payments where id = p3;
  res := res || case when pr.status = 'confirmed' and pr.received_amount = 300 then 'PASS' else 'FAIL' end
         || ' Confirm received saves that the whole amount arrived' || E'\n';
  select unlocked_at is not null into ok from public.projects where id = pn;
  res := res || case when ok then 'PASS' else 'FAIL' end || ' a project with no agreed price unlocks on any payment (old rule)' || E'\n';

  -- ---- 6. A per-day project keeps the old rule, even when paid short -----------------------
  perform set_config('request.jwt.claims', json_build_object('sub', cl, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', cl::text, true);
  set local role authenticated;
  p3 := public.record_payment(pd, 2000, 0, lpad((floor(random() * 1e13))::bigint::text, 13, '0'), rc);
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', fr, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', fr::text, true);
  set local role authenticated;
  perform public.confirm_short_payment(p3, 500);
  reset role;
  select unlocked_at is not null into ok from public.projects where id = pd;
  res := res || case when ok then 'PASS' else 'FAIL' end || ' a per-day project has no cap and unlocks on any payment' || E'\n';
  select count(*) into n from public.user_notifications
   where user_id = cl and type = 'payment_short' and message like '%for "Test short D".%Message them to sort it out%';
  res := res || case when n = 1 then 'PASS' else 'FAIL (' || n || ')' end
         || ' per-day short payment: the client is told to sort it out (no balance)' || E'\n';

  -- ---- 7. Marked Done with money unpaid ------------------------------------------------------
  perform set_config('request.jwt.claims', json_build_object('sub', cl, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', cl::text, true);
  set local role authenticated;
  perform public.mark_project_done(pr2);
  perform public.mark_project_done(pr3);
  reset role;
  select count(*) into n from public.user_notifications
   where user_id = cl and type = 'payment_unpaid' and message like '%"Test short R2" as done, but ₱600.00 of the agreed ₱1,000.00 is still unpaid%';
  res := res || case when n = 1 then 'PASS' else 'FAIL (' || n || ')' end
         || ' Done with P600 unpaid: the client is reminded once' || E'\n';
  select count(*) into n from public.user_notifications
   where user_id = cl and type = 'payment_unpaid' and message like '%Test short R3%';
  res := res || case when n = 0 then 'PASS' else 'FAIL (' || n || ')' end
         || ' Done with the rest waiting for the freelancer: no reminder' || E'\n';

  -- ---- 8. Chat payments: tip and Received less ------------------------------------------------
  insert into public.payments (conversation_id, client_id, freelancer_id, amount, status, note)
  values (cv, cl, fr, 1000, 'requested', 'Test short chat') returning id into cp;

  set local role authenticated;
  perform public.record_chat_payment(cp, 1100, 100, lpad((floor(random() * 1e13))::bigint::text, 13, '0'), rc);
  reset role;
  select * into pr from public.payments where id = cp;
  res := res || case when pr.status = 'sent' and pr.amount = 1100 and pr.tip_amount = 100 then 'PASS' else 'FAIL' end
         || ' a chat payment can carry a tip' || E'\n';

  perform set_config('request.jwt.claims', json_build_object('sub', fr, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', fr::text, true);
  set local role authenticated;
  perform public.confirm_short_payment(cp, 1000);
  reset role;
  select * into pr from public.payments where id = cp;
  res := res || case when pr.status = 'confirmed' and pr.received_amount = 1000 then 'PASS' else 'FAIL' end
         || ' Received less works on a chat card' || E'\n';
  select count(*) into n from public.user_notifications
   where user_id = cl and type = 'payment_short' and message like '%₱1,000.00 arrived, not ₱1,100.00 (Test short chat).%'
     and link = '/dashboard/chat/' || cv;
  res := res || case when n = 1 then 'PASS' else 'FAIL (' || n || ')' end
         || ' the chat short notification opens the chat' || E'\n';

  insert into public.payments (conversation_id, client_id, freelancer_id, amount, status, note)
  values (cv, cl, fr, 500, 'requested', 'Test short chat 2') returning id into cp;
  perform set_config('request.jwt.claims', json_build_object('sub', cl, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', cl::text, true);
  set local role authenticated;
  perform public.record_chat_payment(cp, 500, lpad((floor(random() * 1e13))::bigint::text, 13, '0'), rc);
  reset role;
  select * into pr from public.payments where id = cp;
  res := res || case when pr.status = 'sent' and pr.tip_amount = 0 then 'PASS' else 'FAIL' end
         || ' the old record_chat_payment still works (no tip)' || E'\n';

  -- ---- 9. No user number was used ------------------------------------------------------------
  select last_value into seq_after from public.user_number_seq;
  res := res || case when seq_after = seq_before then 'PASS' else 'FAIL' end || ' no user number was used' || E'\n';

  raise exception E'Results (everything rolled back):\n%', res;
end;
$t$;
