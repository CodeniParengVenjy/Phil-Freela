-- Test for supabase_chat_payments_schema.sql. Paste this whole file into the
-- Supabase SQL Editor and run it AFTER the schema file. It borrows an existing
-- chat with a verified person, an existing project and a stranger (no accounts
-- are made, so no user numbers are used), acts as each of them, and ends with an
-- error that carries the PASS/FAIL list; that error rolls everything back, so
-- nothing is left behind.
--
-- Not covered here: removing a payment card from the browser. That needs a
-- statement the Supabase connector asks a person to confirm, so the test only
-- reads the rule on the remove policy.
do $t$
declare
  res        text := '';
  msg        text;
  n          int;
  n2         int;
  conv       uuid;   -- the borrowed chat
  f          uuid;   -- its verified person, who asks for payment
  p          uuid;   -- the other person, who is asked to pay
  s          uuid;   -- a stranger to the chat
  pr         uuid;   -- a borrowed project, to check payments on a project still work
  pc         uuid;
  pf         uuid;
  req1       uuid;
  req2       uuid;
  req3       uuid;
  msg1       uuid;
  plain      uuid;
  proj_pay   uuid;
  rp1        text;
  rp2        text;
  rp3        text;
  rp_pc      text;
  qr_file    text;
  txt        text;
  lnk        text;
  before_ts  timestamptz;
  pay        record;
  m          record;
  sent0      int;
  conf0      int;
  notr0      int;
  reqn0      int;
  seq_before bigint;
  seq_after  bigint;
begin
  select last_value into seq_before from public.user_number_seq;

  select c.id,
         case when public.is_verified(c.user_a) and not public.is_messaging_blocked(c.user_a) and not public.is_posting_blocked(c.user_a) then c.user_a else c.user_b end,
         case when public.is_verified(c.user_a) and not public.is_messaging_blocked(c.user_a) and not public.is_posting_blocked(c.user_a) then c.user_b else c.user_a end
    into conv, f, p
    from public.conversations c
   where (public.is_verified(c.user_a) and not public.is_messaging_blocked(c.user_a) and not public.is_posting_blocked(c.user_a))
      or (public.is_verified(c.user_b) and not public.is_messaging_blocked(c.user_b) and not public.is_posting_blocked(c.user_b))
   limit 1;
  select id into s from public.profiles where id not in (f, p) limit 1;
  select id, client_id, freelancer_id into pr, pc, pf from public.projects order by started_at limit 1;
  if conv is null or s is null or pr is null then
    raise exception 'Needs a chat with a verified person, a stranger and a project already in the database.';
  end if;

  -- Offline e-mails would fan the test messages and notifications out to real
  -- people; they are switched off for this block and come back with the rollback.
  alter table public.messages disable trigger email_offline_on_message;
  alter table public.user_notifications disable trigger email_offline_on_notification;

  rp1 := p::text || '/chat-1.jpg';
  rp2 := p::text || '/chat-2.jpg';
  rp3 := p::text || '/chat-3.jpg';
  rp_pc := pc::text || '/proj-1.jpg';
  qr_file := f::text || '/qr.png';
  insert into storage.objects (bucket_id, name) values
    ('receipts', rp1), ('receipts', rp2), ('receipts', rp3), ('receipts', rp_pc), ('gcash-qr', qr_file);

  select count(*) into sent0 from public.user_notifications where user_id = f and type = 'payment_sent';
  select count(*) into conf0 from public.user_notifications where user_id = p and type = 'payment_confirmed';
  select count(*) into notr0 from public.user_notifications where user_id = p and type = 'payment_not_received';
  select count(*) into reqn0 from public.user_notifications where user_id = p and type = 'payment_requested';

  -- ---- A. Asking for payment: what is refused --------------------------------
  perform set_config('request.jwt.claims', json_build_object('sub', s, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', s::text, true);
  set local role authenticated;
  begin perform public.request_payment(conv, 400, 'x'); msg := null;
  exception when others then msg := sqlerrm; end;
  res := res || case when msg like '%your own chats%' then 'PASS' else 'FAIL (' || coalesce(msg, 'no error') || ')' end
         || ' a stranger cannot ask for payment in someone else''s chat' || E'\n';
  reset role;

  perform set_config('request.jwt.claims', json_build_object('sub', f, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', f::text, true);
  set local role authenticated;
  begin perform public.request_payment(conv, 400, 'x'); msg := null;
  exception when others then msg := sqlerrm; end;
  res := res || case when msg like '%Add your GCash details%' then 'PASS' else 'FAIL (' || coalesce(msg, 'no error') || ')' end
         || ' without saved GCash details there is nothing to ask for' || E'\n';
  reset role;

  insert into public.gcash_accounts (freelancer_id, gcash_number, account_name, qr_path)
    values (f, '09171234567', 'Ana R. Santos', qr_file);

  if not public.is_verified(p) then
    perform set_config('request.jwt.claims', json_build_object('sub', p, 'role', 'authenticated')::text, true);
    perform set_config('request.jwt.claim.sub', p::text, true);
    set local role authenticated;
    begin perform public.request_payment(conv, 400, 'x'); msg := null;
    exception when others then msg := sqlerrm; end;
    res := res || case when msg like '%Only verified%' then 'PASS' else 'FAIL (' || coalesce(msg, 'no error') || ')' end
           || ' someone who is not verified cannot ask for payment' || E'\n';
    reset role;
  else
    res := res || 'SKIPPED someone who is not verified cannot ask (both people in this chat are verified)' || E'\n';
  end if;

  perform set_config('request.jwt.claims', json_build_object('sub', f, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', f::text, true);
  set local role authenticated;
  begin perform public.request_payment(conv, 0, 'x'); msg := null;
  exception when others then msg := sqlerrm; end;
  res := res || case when msg like '%more than 0%' then 'PASS' else 'FAIL (' || coalesce(msg, 'no error') || ')' end || ' an amount of 0 is refused' || E'\n';
  begin perform public.request_payment(conv, 1000000.01, 'x'); msg := null;
  exception when others then msg := sqlerrm; end;
  res := res || case when msg like '%at most 1,000,000%' then 'PASS' else 'FAIL (' || coalesce(msg, 'no error') || ')' end || ' an amount over 1,000,000 is refused' || E'\n';
  begin perform public.request_payment(conv, 10.005, 'x'); msg := null;
  exception when others then msg := sqlerrm; end;
  res := res || case when msg like '%2 decimals%' then 'PASS' else 'FAIL (' || coalesce(msg, 'no error') || ')' end || ' three decimals are refused' || E'\n';
  begin perform public.request_payment(conv, 400, repeat('a', 101)); msg := null;
  exception when others then msg := sqlerrm; end;
  res := res || case when msg like '%up to 100 characters%' then 'PASS' else 'FAIL (' || coalesce(msg, 'no error') || ')' end || ' a note over 100 characters is refused' || E'\n';
  reset role;

  -- ---- B. Asking for payment: the good case ----------------------------------
  perform set_config('request.jwt.claims', json_build_object('sub', f, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', f::text, true);
  set local role authenticated;
  req1 := public.request_payment(conv, 400, '  Poster design, first half  ');
  reset role;

  select * into pay from public.payments where id = req1;
  res := res || case when pay.status = 'requested' and pay.client_id = p and pay.freelancer_id = f and pay.conversation_id = conv
                      and pay.project_id is null and pay.amount = 400 and pay.note = 'Poster design, first half'
                      and pay.reference_no is null and pay.receipt_path is null and pay.answered_at is null
                     then 'PASS' else 'FAIL' end
         || ' the request is saved as requested, for the other person, with a tidy note and no reference or receipt yet' || E'\n';

  select * into m from public.messages where payment_id = req1;
  msg1 := m.id;
  res := res || case when m.conversation_id = conv and m.sender_id = f and m.attachment_type = 'payment' and m.body = 'Payment request: ₱400.00'
                     then 'PASS' else 'FAIL' end
         || ' a payment card message is in the chat, sent by the freelancer' || E'\n';
  select last_message_preview into txt from public.conversations where id = conv;
  res := res || case when txt = 'Payment request: ₱400.00' then 'PASS' else 'FAIL (' || coalesce(txt, 'null') || ')' end
         || ' the inbox preview reads the card''s text' || E'\n';
  select count(*) into n from public.user_notifications where user_id = p and type = 'payment_requested' and link = '/dashboard/chat/' || conv;
  res := res || case when n = reqn0 + 1 then 'PASS' else 'FAIL (' || n || ')' end
         || ' the other person is told, with a link to the chat' || E'\n';

  perform set_config('request.jwt.claims', json_build_object('sub', f, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', f::text, true);
  set local role authenticated;
  begin perform public.request_payment(conv, 100, 'again'); msg := null;
  exception when others then msg := sqlerrm; end;
  res := res || case when msg like '%already has a payment waiting%' then 'PASS' else 'FAIL (' || coalesce(msg, 'no error') || ')' end
         || ' only one open payment per chat' || E'\n';

  -- ---- C. The browser can't forge, change or remove a card --------------------
  begin
    insert into public.messages (conversation_id, sender_id, body, attachment_type, payment_id) values (conv, f, 'fake card', 'payment', req1);
    msg := null;
  exception when others then msg := sqlerrm; end;
  res := res || case when msg like '%row-level security%' then 'PASS' else 'FAIL (' || coalesce(msg, 'no error') || ')' end
         || ' the browser cannot insert a payment card' || E'\n';
  begin
    insert into public.messages (conversation_id, sender_id, body, payment_id) values (conv, f, 'sneaky', req1);
    msg := null;
  exception when others then msg := sqlerrm; end;
  res := res || case when msg like '%row-level security%' then 'PASS' else 'FAIL (' || coalesce(msg, 'no error') || ')' end
         || ' ... nor a message that only carries a payment id' || E'\n';
  update public.messages set body = 'hacked' where id = msg1;
  get diagnostics n = row_count;
  res := res || case when n = 0 then 'PASS' else 'FAIL (' || n || ')' end
         || ' the browser cannot edit a payment card' || E'\n';
  begin perform public.unsend_message(msg1); msg := null;
  exception when others then msg := sqlerrm; end;
  res := res || case when msg like '%can''t be edited or unsent%' then 'PASS' else 'FAIL (' || coalesce(msg, 'no error') || ')' end
         || ' a payment card cannot be unsent' || E'\n';
  insert into public.messages (conversation_id, sender_id, body) values (conv, f, 'a normal message') returning id into plain;
  res := res || case when plain is not null then 'PASS' else 'FAIL' end || ' a normal message can still be sent' || E'\n';
  begin perform public.unsend_message(plain); msg := null;
  exception when others then msg := sqlerrm; end;
  res := res || case when msg is null then 'PASS' else 'FAIL (' || msg || ')' end || ' ... and still be unsent' || E'\n';
  reset role;

  perform set_config('request.jwt.claims', json_build_object('sub', p, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', p::text, true);
  set local role authenticated;
  begin perform public.mark_messages_delivered(); msg := null;
  exception when others then msg := sqlerrm; end;
  reset role;
  select delivered_at into before_ts from public.messages where id = msg1;
  res := res || case when msg is null and before_ts is not null then 'PASS' else 'FAIL (' || coalesce(msg, 'not delivered') || ')' end
         || ' marking messages delivered still works with a payment card in the chat' || E'\n';

  select count(*) into n from pg_policies
   where tablename = 'messages' and (policyname like 'messages: sender can d%' or policyname like 'messages: sender can u%' or policyname like 'messages: participants can i%')
     and (coalesce(qual, '') || coalesce(with_check, '')) like '%payment%';
  res := res || case when n = 3 then 'PASS' else 'FAIL (' || n || ')' end
         || ' the insert, update and remove rules on messages all mention payment cards' || E'\n';

  -- ---- D. Where to pay -----------------------------------------------------
  perform set_config('request.jwt.claims', json_build_object('sub', p, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', p::text, true);
  set local role authenticated;
  select count(*) into n from public.get_request_pay_details(req1) d where d.gcash_number = '09171234567' and d.account_name = 'Ana R. Santos' and d.qr_path = qr_file;
  res := res || case when n = 1 then 'PASS' else 'FAIL (' || n || ')' end
         || ' the person asked to pay gets the number, the name and the QR' || E'\n';
  select count(*) into n from storage.objects where bucket_id = 'gcash-qr' and name = qr_file;
  res := res || case when n = 1 then 'PASS' else 'FAIL (' || n || ')' end
         || ' ... and can open the QR picture while the request waits' || E'\n';
  reset role;

  perform set_config('request.jwt.claims', json_build_object('sub', f, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', f::text, true);
  set local role authenticated;
  begin perform * from public.get_request_pay_details(req1); msg := null;
  exception when others then msg := sqlerrm; end;
  res := res || case when msg like 'Only the person asked to pay%' then 'PASS' else 'FAIL (' || coalesce(msg, 'no error') || ')' end
         || ' the freelancer cannot ask for the payer''s view' || E'\n';
  reset role;

  perform set_config('request.jwt.claims', json_build_object('sub', s, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', s::text, true);
  set local role authenticated;
  begin perform * from public.get_request_pay_details(req1); msg := null;
  exception when others then msg := sqlerrm; end;
  res := res || case when msg like 'Only the person asked to pay%' then 'PASS' else 'FAIL (' || coalesce(msg, 'no error') || ')' end
         || ' a stranger gets no pay details' || E'\n';
  select count(*) into n from storage.objects where bucket_id = 'gcash-qr' and name = qr_file;
  select count(*) into n2 from public.payments where id = req1;
  res := res || case when n = 0 and n2 = 0 then 'PASS' else 'FAIL (' || n || ', ' || n2 || ')' end
         || ' a stranger cannot open the QR or read the request' || E'\n';
  reset role;

  -- ---- E. Recording the payment on the card ------------------------------------
  perform set_config('request.jwt.claims', json_build_object('sub', f, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', f::text, true);
  set local role authenticated;
  begin perform public.record_chat_payment(req1, 400, '4021358091742', rp1); msg := null;
  exception when others then msg := sqlerrm; end;
  res := res || case when msg like 'Only the person asked to pay%' then 'PASS' else 'FAIL (' || coalesce(msg, 'no error') || ')' end
         || ' the freelancer cannot record the other person''s payment' || E'\n';
  reset role;

  perform set_config('request.jwt.claims', json_build_object('sub', p, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', p::text, true);
  set local role authenticated;
  begin perform public.record_chat_payment(req1, 0, '4021358091742', rp1); msg := null;
  exception when others then msg := sqlerrm; end;
  res := res || case when msg like '%more than 0%' then 'PASS' else 'FAIL (' || coalesce(msg, 'no error') || ')' end || ' recording: an amount of 0 is refused' || E'\n';
  begin perform public.record_chat_payment(req1, 400, '402135809174', rp1); msg := null;
  exception when others then msg := sqlerrm; end;
  res := res || case when msg like '%13 digits%' then 'PASS' else 'FAIL (' || coalesce(msg, 'no error') || ')' end || ' ... a 12-digit reference is refused' || E'\n';
  begin perform public.record_chat_payment(req1, 400, '4021358091742', p::text || '/never.jpg'); msg := null;
  exception when others then msg := sqlerrm; end;
  res := res || case when msg like '%receipt screenshot%' then 'PASS' else 'FAIL (' || coalesce(msg, 'no error') || ')' end || ' ... a receipt that was never uploaded is refused' || E'\n';
  begin perform public.record_chat_payment(req1, 400, '4021358091742', null); msg := null;
  exception when others then msg := sqlerrm; end;
  res := res || case when msg like '%receipt screenshot%' then 'PASS' else 'FAIL (' || coalesce(msg, 'no error') || ')' end || ' ... no receipt at all is refused' || E'\n';
  reset role;

  before_ts := now() - interval '1 second';
  perform set_config('request.jwt.claims', json_build_object('sub', p, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', p::text, true);
  set local role authenticated;
  perform public.record_chat_payment(req1, 450, '4021 358 091742', rp1);
  begin perform public.record_chat_payment(req1, 450, '4021358091742', rp1); msg := null;
  exception when others then msg := sqlerrm; end;
  reset role;

  select * into pay from public.payments where id = req1;
  res := res || case when pay.status = 'sent' and pay.amount = 450 and pay.reference_no = '4021358091742' and pay.receipt_path = rp1
                      and pay.answered_at is null and pay.created_at >= before_ts and pay.note = 'Poster design, first half'
                     then 'PASS' else 'FAIL' end
         || ' recording: the card becomes sent with the amount they paid, the reference without spaces and the receipt' || E'\n';
  res := res || case when msg like '%already paid or cancelled%' then 'PASS' else 'FAIL (' || coalesce(msg, 'no error') || ')' end
         || ' a paid request can''t be recorded twice' || E'\n';
  select count(*) into n from public.user_notifications where user_id = f and type = 'payment_sent' and link = '/dashboard/chat/' || conv;
  res := res || case when n = sent0 + 1 then 'PASS' else 'FAIL (' || n || ')' end
         || ' the freelancer is told, with a link to the chat' || E'\n';

  perform set_config('request.jwt.claims', json_build_object('sub', f, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', f::text, true);
  set local role authenticated;
  begin perform public.cancel_payment_request(req1); msg := null;
  exception when others then msg := sqlerrm; end;
  res := res || case when msg like '%can''t be cancelled any more%' then 'PASS' else 'FAIL (' || coalesce(msg, 'no error') || ')' end
         || ' a request that was paid can''t be cancelled' || E'\n';
  reset role;

  -- ---- F. The freelancer's answers ---------------------------------------------
  perform set_config('request.jwt.claims', json_build_object('sub', p, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', p::text, true);
  set local role authenticated;
  begin perform public.confirm_payment(req1); msg := null;
  exception when others then msg := sqlerrm; end;
  res := res || case when msg like 'Only the freelancer%' then 'PASS' else 'FAIL (' || coalesce(msg, 'no error') || ')' end
         || ' the person who paid cannot confirm their own payment' || E'\n';
  reset role;

  perform set_config('request.jwt.claims', json_build_object('sub', f, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', f::text, true);
  set local role authenticated;
  perform public.confirm_payment(req1);
  reset role;
  select * into pay from public.payments where id = req1;
  res := res || case when pay.status = 'confirmed' and pay.answered_at is not null then 'PASS' else 'FAIL' end
         || ' the freelancer confirms a chat payment' || E'\n';
  select message, link into txt, lnk from public.user_notifications
   where user_id = p and type = 'payment_confirmed' and link = '/dashboard/chat/' || conv limit 1;
  select count(*) into n from public.user_notifications where user_id = p and type = 'payment_confirmed';
  res := res || case when n = conf0 + 1 and lnk = '/dashboard/chat/' || conv and txt like '%₱450.00 (Poster design, first half).' then 'PASS' else 'FAIL (' || n || ', ' || coalesce(lnk, 'null') || ', ' || coalesce(txt, 'null') || ')' end
         || ' the other person is told, with the chat link and the note, not a project' || E'\n';

  -- a second request is allowed once the first is answered
  perform set_config('request.jwt.claims', json_build_object('sub', f, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', f::text, true);
  set local role authenticated;
  req2 := public.request_payment(conv, 100, null);
  begin perform public.confirm_payment(req2); msg := null;
  exception when others then msg := sqlerrm; end;
  res := res || case when msg like '%hasn''t been recorded yet%' then 'PASS' else 'FAIL (' || coalesce(msg, 'no error') || ')' end
         || ' a request that has not been paid can''t be confirmed' || E'\n';
  reset role;

  perform set_config('request.jwt.claims', json_build_object('sub', p, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', p::text, true);
  set local role authenticated;
  begin perform public.record_chat_payment(req2, 100, '4021358091742', rp2); msg := null;
  exception when others then msg := sqlerrm; end;
  res := res || case when msg like '%already recorded%' then 'PASS' else 'FAIL (' || coalesce(msg, 'no error') || ')' end
         || ' the reference of a confirmed payment stays taken, also for a chat request' || E'\n';
  perform public.record_chat_payment(req2, 100, '5178220664310', rp2);
  reset role;

  perform set_config('request.jwt.claims', json_build_object('sub', f, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', f::text, true);
  set local role authenticated;
  perform public.mark_payment_not_received(req2);
  reset role;
  select * into pay from public.payments where id = req2;
  res := res || case when pay.status = 'not_received' and pay.answered_at is not null then 'PASS' else 'FAIL' end
         || ' not received works for a chat payment' || E'\n';
  select message, link into txt, lnk from public.user_notifications
   where user_id = p and type = 'payment_not_received' and link = '/dashboard/chat/' || conv limit 1;
  res := res || case when lnk = '/dashboard/chat/' || conv and txt like '%did not arrive.%ask them to send a new request.' then 'PASS' else 'FAIL (' || coalesce(lnk, 'null') || ', ' || coalesce(txt, 'null') || ')' end
         || ' ... and the notification says to ask for a new request' || E'\n';

  -- ---- G. Cancelling a request ----------------------------------------------------
  perform set_config('request.jwt.claims', json_build_object('sub', f, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', f::text, true);
  set local role authenticated;
  req3 := public.request_payment(conv, 250, 'Second half');
  reset role;

  perform set_config('request.jwt.claims', json_build_object('sub', p, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', p::text, true);
  set local role authenticated;
  begin perform public.cancel_payment_request(req3); msg := null;
  exception when others then msg := sqlerrm; end;
  res := res || case when msg like 'Only the freelancer who asked%' then 'PASS' else 'FAIL (' || coalesce(msg, 'no error') || ')' end
         || ' the person asked to pay cannot cancel the request' || E'\n';
  reset role;

  perform set_config('request.jwt.claims', json_build_object('sub', f, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', f::text, true);
  set local role authenticated;
  perform public.cancel_payment_request(req3);
  reset role;
  select * into pay from public.payments where id = req3;
  res := res || case when pay.status = 'cancelled' and pay.answered_at is not null and pay.reference_no is null then 'PASS' else 'FAIL' end
         || ' the freelancer cancels a request nobody paid' || E'\n';

  perform set_config('request.jwt.claims', json_build_object('sub', p, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', p::text, true);
  set local role authenticated;
  begin perform public.record_chat_payment(req3, 250, '7014592338816', rp3); msg := null;
  exception when others then msg := sqlerrm; end;
  res := res || case when msg like '%already paid or cancelled%' then 'PASS' else 'FAIL (' || coalesce(msg, 'no error') || ')' end
         || ' a cancelled request can''t be paid' || E'\n';
  begin perform * from public.get_request_pay_details(req3); msg := null;
  exception when others then msg := sqlerrm; end;
  res := res || case when msg like 'Only the person asked to pay%' then 'PASS' else 'FAIL (' || coalesce(msg, 'no error') || ')' end
         || ' ... and shows no pay details any more' || E'\n';
  reset role;

  -- ---- H. A payment on a project works as before -----------------------------------
  insert into public.payments (project_id, client_id, freelancer_id, amount, reference_no, receipt_path)
    values (pr, pc, pf, 750, '8888000011110', rp_pc) returning id into proj_pay;
  select count(*) into n from public.user_notifications where user_id = pc and type = 'payment_confirmed';
  perform set_config('request.jwt.claims', json_build_object('sub', pf, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', pf::text, true);
  set local role authenticated;
  perform public.confirm_payment(proj_pay);
  reset role;
  select message, link into txt, lnk from public.user_notifications
   where user_id = pc and type = 'payment_confirmed' and link = '/dashboard/project-details/' || pr limit 1;
  select count(*) into n2 from public.user_notifications where user_id = pc and type = 'payment_confirmed';
  res := res || case when n2 = n + 1 and lnk = '/dashboard/project-details/' || pr and txt like '% for "%".' then 'PASS' else 'FAIL (' || coalesce(lnk, 'null') || ', ' || coalesce(txt, 'null') || ')' end
         || ' a payment on a project is confirmed as before: the notification links to the project' || E'\n';

  -- ---- I. The table's own rules ------------------------------------------------------
  begin
    insert into public.payments (project_id, conversation_id, client_id, freelancer_id, amount, status) values (pr, conv, p, f, 1, 'requested');
    msg := null;
  exception when others then msg := sqlerrm; end;
  res := res || case when msg like '%payments_one_place_check%' then 'PASS' else 'FAIL (' || coalesce(msg, 'no error') || ')' end
         || ' a payment can''t belong to a project and a chat at once' || E'\n';
  begin
    insert into public.payments (client_id, freelancer_id, amount, status) values (p, f, 1, 'requested');
    msg := null;
  exception when others then msg := sqlerrm; end;
  res := res || case when msg like '%payments_one_place_check%' then 'PASS' else 'FAIL (' || coalesce(msg, 'no error') || ')' end
         || ' ... or to neither' || E'\n';
  begin
    insert into public.payments (conversation_id, client_id, freelancer_id, amount, status) values (conv, p, f, 1, 'sent');
    msg := null;
  exception when others then msg := sqlerrm; end;
  res := res || case when msg like '%payments_recorded_check%' or msg like '%payments_answered_check%' then 'PASS' else 'FAIL (' || coalesce(msg, 'no error') || ')' end
         || ' a sent payment must have its reference and receipt' || E'\n';
  begin
    insert into public.payments (conversation_id, client_id, freelancer_id, amount, status, reference_no, receipt_path)
      values (conv, p, f, 1, 'requested', '1111222233334', p::text || '/x.jpg');
    msg := null;
  exception when others then msg := sqlerrm; end;
  res := res || case when msg like '%payments_recorded_check%' then 'PASS' else 'FAIL (' || coalesce(msg, 'no error') || ')' end
         || ' a request must not have a reference yet' || E'\n';
  begin
    insert into public.payments (conversation_id, client_id, freelancer_id, amount, status, answered_at)
      values (conv, p, f, 1, 'cancelled', null);
    msg := null;
  exception when others then msg := sqlerrm; end;
  res := res || case when msg like '%payments_answered_check%' then 'PASS' else 'FAIL (' || coalesce(msg, 'no error') || ')' end
         || ' a cancelled request has its answered time' || E'\n';
  begin
    insert into public.payments (conversation_id, client_id, freelancer_id, amount, status, answered_at, note)
      values (conv, p, f, 1, 'cancelled', now(), repeat('a', 101));
    msg := null;
  exception when others then msg := sqlerrm; end;
  res := res || case when msg like '%payments_note_check%' then 'PASS' else 'FAIL (' || coalesce(msg, 'no error') || ')' end
         || ' a note over 100 characters is refused by the table too' || E'\n';
  begin
    insert into public.messages (conversation_id, sender_id, body, attachment_type) values (conv, f, 'no payment', 'payment');
    msg := null;
  exception when others then msg := sqlerrm; end;
  res := res || case when msg like '%messages_payment_card_check%' then 'PASS' else 'FAIL (' || coalesce(msg, 'no error') || ')' end
         || ' a payment card must have its payment' || E'\n';
  begin
    insert into public.messages (conversation_id, sender_id, body, payment_id) values (conv, f, 'stray', req1);
    msg := null;
  exception when others then msg := sqlerrm; end;
  res := res || case when msg like '%messages_payment_card_check%' then 'PASS' else 'FAIL (' || coalesce(msg, 'no error') || ')' end
         || ' ... and nothing else can carry a payment id' || E'\n';

  -- ---- J. Reports and notifications -----------------------------------------------------
  begin
    insert into public.reports (reporter_id, target_type, target_id, reason, payment_id, status) values (p, 'user', f, 'other', req2, 'resolved');
    msg := null;
  exception when others then msg := sqlerrm; end;
  res := res || case when msg is null then 'PASS' else 'FAIL (' || msg || ')' end
         || ' a chat payment can be sent with a report (it is between the two people)' || E'\n';
  begin
    insert into public.user_notifications (user_id, type, title, message, link)
    values (p, 'payment_requested', 't', 'm', '/x'), (p, 'booking_requested', 't', 'm', '/x'), (p, 'payment_sent', 't', 'm', '/x');
    msg := null;
  exception when others then msg := sqlerrm; end;
  res := res || case when msg is null then 'PASS' else 'FAIL (' || msg || ')' end
         || ' the new notification kind and the old ones are accepted' || E'\n';
  begin
    insert into public.user_notifications (user_id, type, title, message, link) values (p, 'payment_bogus', 't', 'm', '/x');
    msg := null;
  exception when others then msg := sqlerrm; end;
  res := res || case when msg like '%type_check%' then 'PASS' else 'FAIL (' || coalesce(msg, 'no error') || ')' end
         || ' an unknown kind is still refused' || E'\n';

  -- ---- K. A signed-out visitor --------------------------------------------------------------
  set local role anon;
  begin perform public.request_payment(conv, 100, 'x'); msg := null;
  exception when others then msg := sqlerrm; end;
  res := res || case when msg like 'permission denied%' then 'PASS' else 'FAIL (' || coalesce(msg, 'no error') || ')' end
         || ' a signed-out visitor cannot call request_payment' || E'\n';
  begin perform public.record_chat_payment(req1, 1, '4021358091742', rp1); msg := null;
  exception when others then msg := sqlerrm; end;
  res := res || case when msg like 'permission denied%' then 'PASS' else 'FAIL (' || coalesce(msg, 'no error') || ')' end
         || ' ... record_chat_payment' || E'\n';
  begin perform public.cancel_payment_request(req1); msg := null;
  exception when others then msg := sqlerrm; end;
  res := res || case when msg like 'permission denied%' then 'PASS' else 'FAIL (' || coalesce(msg, 'no error') || ')' end
         || ' ... cancel_payment_request' || E'\n';
  begin perform * from public.get_request_pay_details(req1); msg := null;
  exception when others then msg := sqlerrm; end;
  res := res || case when msg like 'permission denied%' then 'PASS' else 'FAIL (' || coalesce(msg, 'no error') || ')' end
         || ' ... get_request_pay_details' || E'\n';
  reset role;

  -- ---- L. No user numbers were used ----------------------------------------------------------
  select last_value into seq_after from public.user_number_seq;
  res := res || case when seq_after = seq_before then 'PASS' else 'FAIL (' || seq_before || ' -> ' || seq_after || ')' end
         || ' the user number counter did not move' || E'\n';

  raise exception E'\n%', res;
end
$t$;
