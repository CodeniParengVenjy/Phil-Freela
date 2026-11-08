-- Test for supabase_receipt_check_schema.sql. Paste this whole file into the
-- Supabase SQL Editor and run it AFTER the schema file. It borrows existing
-- projects and a chat (no accounts are made, so no user numbers are used), adds
-- receipt checks and their receipt files the way the AI service does, acts as
-- each person, and ends with an error that carries the PASS/FAIL list; that
-- error rolls everything back, so nothing is left behind.
do $t$
declare
  res     text := '';
  n       int;
  pr      uuid;   -- a borrowed project without an agreed price
  pc      uuid;   -- its client
  pf      uuid;   -- its freelancer
  pr2     uuid;   -- a borrowed one-time project with an agreed price, nothing paid yet
  pc2     uuid;
  agreed  numeric;
  conv    uuid;   -- a borrowed chat
  req     uuid;   -- a payment request in that chat
  c_ok    uuid;
  c_other uuid;
  c_block uuid;
  c_old   uuid;
  c_dup   uuid;
  c_big   uuid;
  c_chat  uuid;
  c_wrong uuid;
  pay_id  uuid;
  pay     record;
  reuse   record;
  hash1   text := encode(sha256('receipt test one'::bytea), 'hex');
  hash2   text := encode(sha256('receipt test two'::bytea), 'hex');
  t_paid  timestamptz := date_trunc('minute', now()) - interval '20 minutes';
begin
  -- The offline e-mail must not go out for the test notifications.
  alter table public.user_notifications disable trigger email_offline_on_notification;

  select id, client_id, freelancer_id into pr, pc, pf from public.projects
   where price_status = 'none' order by started_at desc limit 1;
  select id, client_id, agreed_amount into pr2, pc2, agreed from public.projects
   where price_status = 'agreed' and price_basis = 'project' and agreed_amount >= 100
     and public.project_paid_amount(id, true) = 0
   order by started_at desc limit 1;
  select id into conv from public.conversations
   where not exists (select 1 from public.payments p where p.conversation_id = conversations.id and p.status in ('requested', 'sent'))
   limit 1;
  if pr is null or pr2 is null or conv is null then
    raise exception 'This test needs a project without a price, a one-time project with an agreed price and a chat.';
  end if;

  -- The receipt files the AI service would have saved (record_payment() checks
  -- that the file is really in the receipts bucket).
  insert into storage.objects (bucket_id, name, owner)
  select 'receipts', path, split_part(path, '/', 1)::uuid
    from unnest(array[pc || '/receipt-test-1.jpg', pc || '/receipt-test-3.jpg', pc || '/receipt-test-4.jpg',
                      pc || '/receipt-test-5.jpg', pc || '/receipt-test-6.jpg', pc2 || '/receipt-test-7.jpg']) as path;

  -- Checks the way the AI service writes them (it skips the row rules).
  insert into public.receipt_checks (client_id, project_id, receipt_path, picture_hash, reference_no, amount, paid_at,
                                     receipt_name, receipt_initials, verdict, reasons)
  values (pc, pr, pc || '/receipt-test-1.jpg', hash1, '9000000000001', 1500, t_paid, 'JU*N D.', 'J. D.', 'check',
          array['only the initials on the receipt match the freelancer''s GCash'])
  returning id into c_ok;
  insert into public.receipt_checks (client_id, project_id, receipt_path, picture_hash, reference_no, amount, paid_at, verdict)
  values (pc, pr2, pc || '/receipt-test-2.jpg', hash2, '9000000000002', 200, t_paid, 'ok') returning id into c_other;
  insert into public.receipt_checks (client_id, project_id, picture_hash, verdict, reasons)
  values (pc, pr, hash2, 'blocked', array['this is not a GCash receipt']) returning id into c_block;
  insert into public.receipt_checks (client_id, project_id, receipt_path, picture_hash, reference_no, amount, paid_at, verdict, created_at)
  values (pc, pr, pc || '/receipt-test-3.jpg', hash2, '9000000000003', 300, t_paid, 'ok', now() - interval '2 hours') returning id into c_old;
  insert into public.receipt_checks (client_id, project_id, receipt_path, picture_hash, reference_no, amount, paid_at, verdict)
  values (pc, pr, pc || '/receipt-test-4.jpg', hash2, '9000000000001', 400, t_paid, 'ok') returning id into c_dup;
  insert into public.receipt_checks (client_id, project_id, receipt_path, picture_hash, reference_no, amount, paid_at, verdict)
  values (pc2, pr2, pc2 || '/receipt-test-7.jpg', hash2, '9000000000007', agreed + 500, t_paid, 'ok') returning id into c_big;

  -- A row rule: a blocked receipt keeps no picture.
  begin
    insert into public.receipt_checks (client_id, project_id, receipt_path, picture_hash, verdict)
    values (pc, pr, pc || '/x.jpg', hash1, 'blocked');
    res := res || E'\nFAIL 1 a blocked check with a picture was accepted';
  exception when check_violation then
    res := res || E'\nPASS 1 a blocked check keeps no picture';
  end;

  -- ---- As the freelancer ----
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', pf, 'role', 'authenticated')::text, true);

  select count(*) into n from public.receipt_checks where id = c_ok;
  res := res || case when n = 0 then E'\nPASS 2 the freelancer can''t read the client''s checks' else E'\nFAIL 2 the freelancer read a check' end;

  begin
    perform public.record_receipt_payment(pr, c_ok);
    res := res || E'\nFAIL 3 the freelancer recorded a payment';
  exception when others then
    res := res || case when sqlerrm like 'Only the client%' then E'\nPASS 3 only the client can record' else E'\nFAIL 3 ' || sqlerrm end;
  end;

  -- ---- As the client ----
  perform set_config('request.jwt.claims', json_build_object('sub', pc, 'role', 'authenticated')::text, true);

  select count(*) into n from public.receipt_checks where client_id = pc;
  res := res || case when n = 5 then E'\nPASS 4 the client reads their own checks' else E'\nFAIL 4 the client sees ' || n end;

  begin
    insert into public.receipt_checks (client_id, project_id, picture_hash, verdict) values (pc, pr, hash1, 'unreadable');
    res := res || E'\nFAIL 5 the browser added a check';
  exception when insufficient_privilege then
    res := res || E'\nPASS 5 the browser can''t add a check';
  end;

  begin
    perform public.receipt_reuse(hash1, '9000000000001', 1500, t_paid, pf);
    res := res || E'\nFAIL 6 the browser asked receipt_reuse';
  exception when insufficient_privilege then
    res := res || E'\nPASS 6 only the AI service can ask receipt_reuse';
  end;

  begin
    perform public.take_receipt_check(c_ok, pr, null);
    res := res || E'\nFAIL 7 the browser called take_receipt_check';
  exception when insufficient_privilege then
    res := res || E'\nPASS 7 take_receipt_check is not for the browser';
  end;

  begin
    perform public.record_receipt_payment(pr, c_other);
    res := res || E'\nFAIL 8 a check for another project worked';
  exception when others then
    res := res || case when sqlerrm like 'Add your receipt screenshot again%' then E'\nPASS 8 a check for another project is refused' else E'\nFAIL 8 ' || sqlerrm end;
  end;

  begin
    perform public.record_receipt_payment(pr, c_block);
    res := res || E'\nFAIL 9 a blocked receipt was recorded';
  exception when others then
    res := res || case when sqlerrm like '%can''t be sent%' then E'\nPASS 9 a blocked receipt is refused' else E'\nFAIL 9 ' || sqlerrm end;
  end;

  begin
    perform public.record_receipt_payment(pr, c_old);
    res := res || E'\nFAIL 10 a reading from 2 hours ago was used';
  exception when others then
    res := res || case when sqlerrm like '%more than an hour old%' then E'\nPASS 10 an old reading is refused' else E'\nFAIL 10 ' || sqlerrm end;
  end;

  pay_id := public.record_receipt_payment(pr, c_ok);
  select * into pay from public.payments where id = pay_id;
  res := res || case when pay.amount = 1500 and pay.tip_amount = 0 and pay.reference_no = '9000000000001' and pay.paid_at = t_paid
                          and pay.receipt_initials = 'J. D.' and pay.ai_verdict = 'check' and pay.status = 'sent'
                          and pay.receipt_path = pc || '/receipt-test-1.jpg' and pay.receipt_check_id = c_ok
                          and pay.ai_reasons[1] like 'only the initials%'
                     then E'\nPASS 11 the payment takes everything from the receipt check'
                     else E'\nFAIL 11 the payment has ' || row_to_json(pay)::text end;

  select count(*) into n from public.receipt_checks where id = c_ok and used_at is not null;
  res := res || case when n = 1 then E'\nPASS 12 the check is marked used' else E'\nFAIL 12 the check is not marked used' end;

  begin
    perform public.record_receipt_payment(pr, c_ok);
    res := res || E'\nFAIL 13 the same check was used twice';
  exception when others then
    res := res || case when sqlerrm like 'This receipt was already recorded%' then E'\nPASS 13 a check is used once' else E'\nFAIL 13 ' || sqlerrm end;
  end;

  begin
    perform public.record_receipt_payment(pr, c_dup);
    res := res || E'\nFAIL 14 a reference number was recorded twice';
  exception when others then
    res := res || case when sqlerrm like 'This reference number was already recorded%' then E'\nPASS 14 the same reference is refused' else E'\nFAIL 14 ' || sqlerrm end;
  end;

  -- ---- The short-payment rules still apply (what is left, tips) ----
  perform set_config('request.jwt.claims', json_build_object('sub', pc2, 'role', 'authenticated')::text, true);

  begin
    perform public.record_receipt_payment(pr2, c_big);
    res := res || E'\nFAIL 15 more than what is left was recorded as the price';
  exception when others then
    res := res || case when sqlerrm like 'Only ₱% is left to pay%' then E'\nPASS 15 more than what is left is refused (record_payment''s rule)' else E'\nFAIL 15 ' || sqlerrm end;
  end;

  select count(*) into n from public.receipt_checks where id = c_big and used_at is null;
  res := res || case when n = 1 then E'\nPASS 16 a refused payment leaves the check unused' else E'\nFAIL 16 the check was used up' end;

  pay_id := public.record_receipt_payment(pr2, c_big, 500);
  select * into pay from public.payments where id = pay_id;
  res := res || case when pay.amount = agreed + 500 and pay.tip_amount = 500 and pay.ai_verdict = 'ok'
                     then E'\nPASS 17 the extra goes in as a tip'
                     else E'\nFAIL 17 the payment has ' || row_to_json(pay)::text end;

  -- ---- As the owner again: the notification and receipt_reuse ----
  reset role;

  select count(*) into n from public.user_notifications
   where user_id = pf and type = 'payment_sent' and message like '%look carefully: only the initials%'
     and link = '/dashboard/project-details/' || pr and created_at = now();
  res := res || case when n = 1 then E'\nPASS 18 the freelancer is told to look carefully' else E'\nFAIL 18 notifications found: ' || n end;

  select count(*) into n from public.user_notifications
   where type = 'payment_sent' and message like '%look carefully%'
     and link = '/dashboard/project-details/' || pr2 and created_at = now();
  res := res || case when n = 0 then E'\nPASS 19 no note when every check passed' else E'\nFAIL 19 a note was added to an ok receipt' end;

  select * into reuse from public.receipt_reuse(hash1, '9000000000001', 1500, t_paid + interval '30 seconds', pf);
  res := res || case when reuse.reference_used and reuse.picture_used and reuse.same_minute
                     then E'\nPASS 20 receipt_reuse sees the used reference, file and minute'
                     else E'\nFAIL 20 receipt_reuse said ' || row_to_json(reuse)::text end;

  select * into reuse from public.receipt_reuse(encode(sha256('receipt test three'::bytea), 'hex'), '9000000000009', 1500, t_paid + interval '5 minutes', pf);
  res := res || case when not reuse.reference_used and not reuse.picture_used and not reuse.same_minute
                     then E'\nPASS 21 receipt_reuse says no for a new receipt'
                     else E'\nFAIL 21 receipt_reuse said ' || row_to_json(reuse)::text end;

  -- ---- A chat payment request ----
  insert into public.payments (conversation_id, client_id, freelancer_id, amount, status, note)
  values (conv, pc, pf, 750, 'requested', 'Test request') returning id into req;
  insert into public.receipt_checks (client_id, payment_id, receipt_path, picture_hash, reference_no, amount, paid_at,
                                     receipt_initials, verdict, reasons)
  values (pc, req, pc || '/receipt-test-5.jpg', hash2, '9000000000005', 700, t_paid, 'A. S.', 'check',
          array['the amount (₱700.00) is different from the ₱750.00 asked for']) returning id into c_chat;
  insert into public.receipt_checks (client_id, project_id, receipt_path, picture_hash, reference_no, amount, paid_at, verdict)
  values (pc, pr, pc || '/receipt-test-6.jpg', hash2, '9000000000006', 750, t_paid, 'ok') returning id into c_wrong;

  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', pc, 'role', 'authenticated')::text, true);

  begin
    perform public.record_chat_receipt_payment(req, c_wrong);
    res := res || E'\nFAIL 22 a project''s check worked on a chat request';
  exception when others then
    res := res || case when sqlerrm like 'Add your receipt screenshot again%' then E'\nPASS 22 a project''s check is refused on a chat request' else E'\nFAIL 22 ' || sqlerrm end;
  end;

  perform public.record_chat_receipt_payment(req, c_chat, 50);
  select * into pay from public.payments where id = req;
  res := res || case when pay.status = 'sent' and pay.amount = 700 and pay.tip_amount = 50 and pay.reference_no = '9000000000005'
                          and pay.ai_verdict = 'check' and pay.receipt_initials = 'A. S.' and pay.paid_at = t_paid
                     then E'\nPASS 23 a chat request is recorded from its check (the receipt''s amount, the chosen tip)'
                     else E'\nFAIL 23 the request has ' || row_to_json(pay)::text end;

  -- The client reads the new columns through the normal payments rule.
  select count(*) into n from public.payments where id = req and ai_verdict = 'check' and paid_at is not null;
  res := res || case when n = 1 then E'\nPASS 24 the client reads the new payment columns' else E'\nFAIL 24 the client can''t read them' end;

  reset role;
  select count(*) into n from public.user_notifications
   where user_id = pf and type = 'payment_sent' and link = '/dashboard/chat/' || conv
     and message like '%look carefully: the amount (₱700.00)%' and created_at = now();
  res := res || case when n = 1 then E'\nPASS 25 the chat notice carries the AI''s note' else E'\nFAIL 25 chat notices found: ' || n end;

  raise exception 'RESULTS:%', res;
end
$t$;
