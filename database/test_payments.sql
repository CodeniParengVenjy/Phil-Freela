-- Test for supabase_payments_schema.sql. Paste this whole file into the Supabase
-- SQL Editor and run it AFTER the schema file. It borrows an existing project
-- and its two people (no accounts are made, so no user numbers are used), acts
-- as each of them, and ends with an error that carries the PASS/FAIL list; that
-- error rolls everything back, so nothing is left behind.
do $t$
declare
  res       text := '';
  msg       text;
  n         int;
  n2        int;
  pr        uuid;   -- the borrowed project
  c         uuid;   -- its client
  f         uuid;   -- its freelancer
  s         uuid;   -- a stranger to both
  ptitle    text;
  pr2       uuid;   -- a project of another freelancer, with no GCash details
  c2        uuid;
  pay1      uuid;
  pay2      uuid;
  pay3      uuid;
  rp1       text;
  rp2       text;
  rp3       text;
  rp_unused text;
  sent0     int;
  conf0     int;
  notr0     int;
  seq_before bigint;
  seq_after  bigint;
  b_qr      record;
  b_rc      record;
  pay       record;
begin
  select last_value into seq_before from public.user_number_seq;

  select id, client_id, freelancer_id, title into pr, c, f, ptitle
    from public.projects order by started_at limit 1;
  select id into s from public.profiles where id not in (c, f) limit 1;
  select id, client_id into pr2, c2 from public.projects where freelancer_id <> f limit 1;
  if pr is null or s is null then
    raise exception 'Needs one project and a third person already in the database.';
  end if;

  -- The offline-email trigger would fan the test notifications out to real
  -- people; it is switched off for this block and comes back with the rollback.
  alter table public.user_notifications disable trigger email_offline_on_notification;

  rp1 := c::text || '/receipt-1.jpg';
  rp2 := c::text || '/receipt-2.jpg';
  rp3 := c::text || '/receipt-3.jpg';
  rp_unused := c::text || '/unused.jpg';
  insert into storage.objects (bucket_id, name) values
    ('receipts', rp1), ('receipts', rp2), ('receipts', rp3), ('receipts', rp_unused),
    ('gcash-qr', f::text || '/qr.png');

  select count(*) into sent0 from public.user_notifications where user_id = f and type = 'payment_sent';
  select count(*) into conf0 from public.user_notifications where user_id = c and type = 'payment_confirmed';
  select count(*) into notr0 from public.user_notifications where user_id = c and type = 'payment_not_received';

  -- ---- A. The rules on the GCash details (as the owner) -------------------
  begin
    insert into public.gcash_accounts (freelancer_id, gcash_number, account_name) values (f, '08171234567', 'Ana R. Santos');
    msg := null;
  exception when others then msg := sqlerrm;
  end;
  res := res || case when msg like '%gcash_number_check%' then 'PASS' else 'FAIL (' || coalesce(msg, 'no error') || ')' end
         || ' a number that does not start with 09 is refused' || E'\n';

  begin
    insert into public.gcash_accounts (freelancer_id, gcash_number, account_name) values (f, '0917123456', 'Ana R. Santos');
    msg := null;
  exception when others then msg := sqlerrm;
  end;
  res := res || case when msg like '%gcash_number_check%' then 'PASS' else 'FAIL (' || coalesce(msg, 'no error') || ')' end
         || ' a 10-digit number is refused' || E'\n';

  begin
    insert into public.gcash_accounts (freelancer_id, gcash_number, account_name) values (f, '09171234567', 'Ana 2');
    msg := null;
  exception when others then msg := sqlerrm;
  end;
  res := res || case when msg like '%account_name_check%' then 'PASS' else 'FAIL (' || coalesce(msg, 'no error') || ')' end
         || ' a name with a digit is refused' || E'\n';

  begin
    insert into public.gcash_accounts (freelancer_id, gcash_number, account_name) values (f, '09171234567', 'ana.com/pay');
    msg := null;
  exception when others then msg := sqlerrm;
  end;
  res := res || case when msg like '%account_name_check%' then 'PASS' else 'FAIL (' || coalesce(msg, 'no error') || ')' end
         || ' a name that looks like a link is refused' || E'\n';

  begin
    insert into public.gcash_accounts (freelancer_id, gcash_number, account_name) values (f, '09171234567', 'Ana  Santos');
    msg := null;
  exception when others then msg := sqlerrm;
  end;
  res := res || case when msg like '%account_name_check%' then 'PASS' else 'FAIL (' || coalesce(msg, 'no error') || ')' end
         || ' a name with a double space is refused' || E'\n';

  begin
    insert into public.gcash_accounts (freelancer_id, gcash_number, account_name) values (f, '09171234567', 'María Peña-Muñoz Jr.');
    msg := null;
  exception when others then msg := sqlerrm;
  end;
  res := res || case when msg is null then 'PASS' else 'FAIL (' || msg || ')' end
         || ' a name with accents, a hyphen and a dot is accepted' || E'\n';

  begin
    update public.gcash_accounts set qr_path = s::text || '/qr.png' where freelancer_id = f;
    msg := null;
  exception when others then msg := sqlerrm;
  end;
  res := res || case when msg like '%qr_own_folder%' then 'PASS' else 'FAIL (' || coalesce(msg, 'no error') || ')' end
         || ' a QR path in someone else''s folder is refused' || E'\n';

  update public.gcash_accounts
     set account_name = 'Ana R. Santos', qr_path = f::text || '/qr.png'
   where freelancer_id = f;

  -- ---- B. Who can read the GCash details ----------------------------------
  perform set_config('request.jwt.claims', json_build_object('sub', f, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', f::text, true);
  set local role authenticated;
  select count(*) into n from public.gcash_accounts;
  res := res || case when n = 1 then 'PASS' else 'FAIL (' || n || ')' end
         || ' the freelancer reads their own GCash row' || E'\n';
  reset role;

  perform set_config('request.jwt.claims', json_build_object('sub', c, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', c::text, true);
  set local role authenticated;
  select count(*) into n from public.gcash_accounts where freelancer_id = f;
  res := res || case when n = 0 then 'PASS' else 'FAIL (' || n || ')' end
         || ' the client cannot read the table directly' || E'\n';
  reset role;

  perform set_config('request.jwt.claims', json_build_object('sub', s, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', s::text, true);
  set local role authenticated;
  select count(*) into n from public.gcash_accounts where freelancer_id = f;
  res := res || case when n = 0 then 'PASS' else 'FAIL (' || n || ')' end
         || ' a stranger cannot read the table' || E'\n';
  begin
    insert into public.gcash_accounts (freelancer_id, gcash_number, account_name) values (f, '09171234567', 'Ana R. Santos');
    msg := null;
  exception when others then msg := sqlerrm;
  end;
  res := res || case when msg like '%row-level security%' then 'PASS' else 'FAIL (' || coalesce(msg, 'no error') || ')' end
         || ' a stranger cannot add a row for someone else' || E'\n';
  reset role;

  set local role anon;
  begin
    perform count(*) from public.gcash_accounts;
    msg := null;
  exception when others then msg := sqlerrm;
  end;
  res := res || case when msg like 'permission denied%' then 'PASS' else 'FAIL (' || coalesce(msg, 'no error') || ')' end
         || ' a signed-out visitor cannot read the table' || E'\n';
  reset role;

  -- ---- C. Where to pay (get_pay_details) ----------------------------------
  perform set_config('request.jwt.claims', json_build_object('sub', c, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', c::text, true);
  set local role authenticated;
  select count(*) into n from public.get_pay_details(pr) d where d.gcash_number = '09171234567' and d.account_name = 'Ana R. Santos';
  res := res || case when n = 1 then 'PASS' else 'FAIL (' || n || ')' end
         || ' the project''s client gets the freelancer''s number and name' || E'\n';
  select count(*) into n from public.get_pay_details(pr) d where d.qr_path = f::text || '/qr.png';
  res := res || case when n = 1 then 'PASS' else 'FAIL (' || n || ')' end
         || ' ... and the QR path' || E'\n';
  reset role;

  perform set_config('request.jwt.claims', json_build_object('sub', f, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', f::text, true);
  set local role authenticated;
  begin
    perform * from public.get_pay_details(pr);
    msg := null;
  exception when others then msg := sqlerrm;
  end;
  res := res || case when msg like 'Only the client%' then 'PASS' else 'FAIL (' || coalesce(msg, 'no error') || ')' end
         || ' the freelancer cannot ask for the client''s view' || E'\n';
  reset role;

  perform set_config('request.jwt.claims', json_build_object('sub', s, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', s::text, true);
  set local role authenticated;
  begin
    perform * from public.get_pay_details(pr);
    msg := null;
  exception when others then msg := sqlerrm;
  end;
  res := res || case when msg like 'Only the client%' then 'PASS' else 'FAIL (' || coalesce(msg, 'no error') || ')' end
         || ' a stranger gets no pay details' || E'\n';
  reset role;

  if pr2 is not null then
    perform set_config('request.jwt.claims', json_build_object('sub', c2, 'role', 'authenticated')::text, true);
    perform set_config('request.jwt.claim.sub', c2::text, true);
    set local role authenticated;
    select count(*) into n from public.get_pay_details(pr2);
    res := res || case when n = 0 then 'PASS' else 'FAIL (' || n || ')' end
           || ' a freelancer with no GCash details gives no rows' || E'\n';
    reset role;
  end if;

  -- ---- D. Recording a payment: what is refused ----------------------------
  perform set_config('request.jwt.claims', json_build_object('sub', f, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', f::text, true);
  set local role authenticated;
  begin
    perform public.record_payment(pr, 750, '4021358091742', rp1);
    msg := null;
  exception when others then msg := sqlerrm;
  end;
  res := res || case when msg like 'Only the client%' then 'PASS' else 'FAIL (' || coalesce(msg, 'no error') || ')' end
         || ' the freelancer cannot record a payment' || E'\n';
  reset role;

  perform set_config('request.jwt.claims', json_build_object('sub', s, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', s::text, true);
  set local role authenticated;
  begin
    perform public.record_payment(pr, 750, '4021358091742', rp1);
    msg := null;
  exception when others then msg := sqlerrm;
  end;
  res := res || case when msg like 'Only the client%' then 'PASS' else 'FAIL (' || coalesce(msg, 'no error') || ')' end
         || ' a stranger cannot record a payment' || E'\n';
  reset role;

  perform set_config('request.jwt.claims', json_build_object('sub', c, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', c::text, true);
  set local role authenticated;

  begin perform public.record_payment(pr, 0, '4021358091742', rp1); msg := null;
  exception when others then msg := sqlerrm; end;
  res := res || case when msg like '%more than 0%' then 'PASS' else 'FAIL (' || coalesce(msg, 'no error') || ')' end
         || ' an amount of 0 is refused' || E'\n';

  begin perform public.record_payment(pr, 1000000.01, '4021358091742', rp1); msg := null;
  exception when others then msg := sqlerrm; end;
  res := res || case when msg like '%at most 1,000,000%' then 'PASS' else 'FAIL (' || coalesce(msg, 'no error') || ')' end
         || ' an amount over 1,000,000 is refused' || E'\n';

  begin perform public.record_payment(pr, 10.005, '4021358091742', rp1); msg := null;
  exception when others then msg := sqlerrm; end;
  res := res || case when msg like '%2 decimals%' then 'PASS' else 'FAIL (' || coalesce(msg, 'no error') || ')' end
         || ' an amount with 3 decimals is refused' || E'\n';

  begin perform public.record_payment(pr, 750, '402135809174', rp1); msg := null;
  exception when others then msg := sqlerrm; end;
  res := res || case when msg like '%13 digits%' then 'PASS' else 'FAIL (' || coalesce(msg, 'no error') || ')' end
         || ' a 12-digit reference is refused' || E'\n';

  begin perform public.record_payment(pr, 750, '40213580917AB', rp1); msg := null;
  exception when others then msg := sqlerrm; end;
  res := res || case when msg like '%13 digits%' then 'PASS' else 'FAIL (' || coalesce(msg, 'no error') || ')' end
         || ' a reference with letters is refused' || E'\n';

  begin perform public.record_payment(pr, 750, '4021358091742', s::text || '/receipt.jpg'); msg := null;
  exception when others then msg := sqlerrm; end;
  res := res || case when msg like '%receipt screenshot%' then 'PASS' else 'FAIL (' || coalesce(msg, 'no error') || ')' end
         || ' a receipt in someone else''s folder is refused' || E'\n';

  begin perform public.record_payment(pr, 750, '4021358091742', c::text || '/never-uploaded.jpg'); msg := null;
  exception when others then msg := sqlerrm; end;
  res := res || case when msg like '%receipt screenshot%' then 'PASS' else 'FAIL (' || coalesce(msg, 'no error') || ')' end
         || ' a receipt that was never uploaded is refused' || E'\n';

  begin perform public.record_payment(pr, 750, '4021358091742', null); msg := null;
  exception when others then msg := sqlerrm; end;
  res := res || case when msg like '%receipt screenshot%' then 'PASS' else 'FAIL (' || coalesce(msg, 'no error') || ')' end
         || ' no receipt at all is refused' || E'\n';

  -- ---- E. Recording a payment: the good case ------------------------------
  pay1 := public.record_payment(pr, 750, '4021 358 091742', rp1);
  reset role;
  select * into pay from public.payments where id = pay1;
  res := res || case when pay.status = 'sent' and pay.reference_no = '4021358091742' and pay.amount = 750
                      and pay.answered_at is null and pay.client_id = c and pay.freelancer_id = f
                      and pay.project_id = pr and pay.receipt_path = rp1
                     then 'PASS' else 'FAIL' end
         || ' a payment is saved as sent, the reference without spaces' || E'\n';

  select count(*) into n from public.user_notifications where user_id = f and type = 'payment_sent';
  res := res || case when n = sent0 + 1 then 'PASS' else 'FAIL (' || n || ')' end
         || ' the freelancer is told' || E'\n';

  perform set_config('request.jwt.claims', json_build_object('sub', c, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', c::text, true);
  set local role authenticated;
  begin perform public.record_payment(pr, 750, '4021358091742', rp2); msg := null;
  exception when others then msg := sqlerrm; end;
  res := res || case when msg like '%already recorded%' then 'PASS' else 'FAIL (' || coalesce(msg, 'no error') || ')' end
         || ' the same reference cannot be recorded twice' || E'\n';

  select count(*) into n from public.payments where id = pay1;
  res := res || case when n = 1 then 'PASS' else 'FAIL (' || n || ')' end
         || ' the client reads their payment' || E'\n';

  begin insert into public.payments (project_id, client_id, freelancer_id, amount, reference_no, receipt_path)
        values (pr, c, f, 1, '1111111111111', rp2); msg := null;
  exception when others then msg := sqlerrm; end;
  res := res || case when msg like 'permission denied%' then 'PASS' else 'FAIL (' || coalesce(msg, 'no error') || ')' end
         || ' the browser cannot insert a payment' || E'\n';

  begin update public.payments set status = 'confirmed' where id = pay1; msg := null;
  exception when others then msg := sqlerrm; end;
  res := res || case when msg like 'permission denied%' then 'PASS' else 'FAIL (' || coalesce(msg, 'no error') || ')' end
         || ' the client cannot confirm their own payment by editing it' || E'\n';
  reset role;

  perform set_config('request.jwt.claims', json_build_object('sub', f, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', f::text, true);
  set local role authenticated;
  select count(*) into n from public.payments where id = pay1;
  res := res || case when n = 1 then 'PASS' else 'FAIL (' || n || ')' end
         || ' the freelancer reads the payment' || E'\n';
  begin update public.payments set status = 'confirmed' where id = pay1; msg := null;
  exception when others then msg := sqlerrm; end;
  res := res || case when msg like 'permission denied%' then 'PASS' else 'FAIL (' || coalesce(msg, 'no error') || ')' end
         || ' the freelancer cannot confirm by editing the row either' || E'\n';
  reset role;

  perform set_config('request.jwt.claims', json_build_object('sub', s, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', s::text, true);
  set local role authenticated;
  select count(*) into n from public.payments where id = pay1;
  res := res || case when n = 0 then 'PASS' else 'FAIL (' || n || ')' end
         || ' a stranger cannot see the payment' || E'\n';
  reset role;

  -- ---- F. Answering a payment ---------------------------------------------
  perform set_config('request.jwt.claims', json_build_object('sub', c, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', c::text, true);
  set local role authenticated;
  begin perform public.confirm_payment(pay1); msg := null;
  exception when others then msg := sqlerrm; end;
  res := res || case when msg like 'Only the freelancer%' then 'PASS' else 'FAIL (' || coalesce(msg, 'no error') || ')' end
         || ' the client cannot confirm their own payment' || E'\n';
  reset role;

  perform set_config('request.jwt.claims', json_build_object('sub', s, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', s::text, true);
  set local role authenticated;
  begin perform public.mark_payment_not_received(pay1); msg := null;
  exception when others then msg := sqlerrm; end;
  res := res || case when msg like 'Only the freelancer%' then 'PASS' else 'FAIL (' || coalesce(msg, 'no error') || ')' end
         || ' a stranger cannot answer a payment' || E'\n';
  reset role;

  perform set_config('request.jwt.claims', json_build_object('sub', f, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', f::text, true);
  set local role authenticated;
  perform public.confirm_payment(pay1);
  begin perform public.confirm_payment(pay1); msg := null;
  exception when others then msg := sqlerrm; end;
  res := res || case when msg like '%already answered%' then 'PASS' else 'FAIL (' || coalesce(msg, 'no error') || ')' end
         || ' a second answer is refused' || E'\n';
  begin perform public.mark_payment_not_received(pay1); msg := null;
  exception when others then msg := sqlerrm; end;
  res := res || case when msg like '%already answered%' then 'PASS' else 'FAIL (' || coalesce(msg, 'no error') || ')' end
         || ' a confirmed payment cannot be turned into not received' || E'\n';
  reset role;

  select * into pay from public.payments where id = pay1;
  res := res || case when pay.status = 'confirmed' and pay.answered_at is not null then 'PASS' else 'FAIL' end
         || ' confirm sets confirmed and the time' || E'\n';
  select count(*) into n from public.user_notifications where user_id = c and type = 'payment_confirmed';
  res := res || case when n = conf0 + 1 then 'PASS' else 'FAIL (' || n || ')' end
         || ' the client is told it was confirmed' || E'\n';

  -- the reference of a confirmed payment stays taken
  perform set_config('request.jwt.claims', json_build_object('sub', c, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', c::text, true);
  set local role authenticated;
  begin perform public.record_payment(pr, 750, '4021358091742', rp2); msg := null;
  exception when others then msg := sqlerrm; end;
  res := res || case when msg like '%already recorded%' then 'PASS' else 'FAIL (' || coalesce(msg, 'no error') || ')' end
         || ' the reference of a confirmed payment stays taken' || E'\n';

  -- a second payment, answered "not received"
  pay2 := public.record_payment(pr, 500, '5178 220 664310', rp2);
  reset role;

  perform set_config('request.jwt.claims', json_build_object('sub', f, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', f::text, true);
  set local role authenticated;
  perform public.mark_payment_not_received(pay2);
  reset role;
  select * into pay from public.payments where id = pay2;
  res := res || case when pay.status = 'not_received' and pay.answered_at is not null then 'PASS' else 'FAIL' end
         || ' not received sets that status and the time' || E'\n';
  select count(*) into n from public.user_notifications where user_id = c and type = 'payment_not_received';
  res := res || case when n = notr0 + 1 then 'PASS' else 'FAIL (' || n || ')' end
         || ' the client is told it did not arrive' || E'\n';

  -- after "not received" the same reference can be recorded again
  perform set_config('request.jwt.claims', json_build_object('sub', c, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', c::text, true);
  set local role authenticated;
  pay3 := public.record_payment(pr, 500, '5178220664310', rp3);
  reset role;
  select count(*) into n from public.payments where id = pay3 and status = 'sent';
  res := res || case when n = 1 then 'PASS' else 'FAIL (' || n || ')' end
         || ' after not received, the same reference can be recorded again' || E'\n';

  -- ---- G. The private buckets ---------------------------------------------
  select * into b_qr from storage.buckets where id = 'gcash-qr';
  select * into b_rc from storage.buckets where id = 'receipts';
  res := res || case when b_qr.public = false and b_qr.file_size_limit = 2097152
                      and b_qr.allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp']
                     then 'PASS' else 'FAIL' end
         || ' gcash-qr is private, 2 MB, JPG/PNG/WEBP' || E'\n';
  res := res || case when b_rc.public = false and b_rc.file_size_limit = 5242880
                      and b_rc.allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp']
                     then 'PASS' else 'FAIL' end
         || ' receipts is private, 5 MB, JPG/PNG/WEBP' || E'\n';

  -- who can open the QR picture
  perform set_config('request.jwt.claims', json_build_object('sub', s, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', s::text, true);
  set local role authenticated;
  select count(*) into n from storage.objects where bucket_id = 'gcash-qr' and name = f::text || '/qr.png';
  select count(*) into n2 from storage.objects where bucket_id = 'receipts' and name = rp1;
  res := res || case when n = 0 and n2 = 0 then 'PASS' else 'FAIL (' || n || ', ' || n2 || ')' end
         || ' a stranger cannot open the QR or a receipt' || E'\n';
  begin
    insert into storage.objects (bucket_id, name) values ('gcash-qr', f::text || '/other.png');
    msg := null;
  exception when others then msg := sqlerrm; end;
  res := res || case when msg like '%row-level security%' then 'PASS' else 'FAIL (' || coalesce(msg, 'no error') || ')' end
         || ' a stranger cannot upload a QR into someone else''s folder' || E'\n';
  reset role;

  perform set_config('request.jwt.claims', json_build_object('sub', c, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', c::text, true);
  set local role authenticated;
  select count(*) into n from storage.objects where bucket_id = 'gcash-qr' and name = f::text || '/qr.png';
  res := res || case when n = 1 then 'PASS' else 'FAIL (' || n || ')' end
         || ' the client of a project with the freelancer can open the QR' || E'\n';
  select count(*) into n from storage.objects where bucket_id = 'receipts' and name = rp1;
  select count(*) into n2 from storage.objects where bucket_id = 'receipts' and name = rp_unused;
  res := res || case when n = 1 and n2 = 1 then 'PASS' else 'FAIL (' || n || ', ' || n2 || ')' end
         || ' the uploader can open their receipts, used or not' || E'\n';
  begin
    insert into storage.objects (bucket_id, name) values ('receipts', s::text || '/x.jpg');
    msg := null;
  exception when others then msg := sqlerrm; end;
  res := res || case when msg like '%row-level security%' then 'PASS' else 'FAIL (' || coalesce(msg, 'no error') || ')' end
         || ' a client cannot upload a receipt into someone else''s folder' || E'\n';
  begin
    insert into storage.objects (bucket_id, name) values ('receipts', c::text || '/own-upload.jpg');
    msg := null;
  exception when others then msg := sqlerrm; end;
  res := res || case when msg is null then 'PASS' else 'FAIL (' || msg || ')' end
         || ' a client can upload a receipt into their own folder' || E'\n';
  reset role;

  perform set_config('request.jwt.claims', json_build_object('sub', f, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', f::text, true);
  set local role authenticated;
  select count(*) into n from storage.objects where bucket_id = 'receipts' and name = rp1;
  select count(*) into n2 from storage.objects where bucket_id = 'receipts' and name = rp_unused;
  res := res || case when n = 1 and n2 = 0 then 'PASS' else 'FAIL (' || n || ', ' || n2 || ')' end
         || ' the freelancer opens a receipt that is on a payment, not an unused upload' || E'\n';
  select count(*) into n from storage.objects where bucket_id = 'gcash-qr' and name = f::text || '/qr.png';
  res := res || case when n = 1 then 'PASS' else 'FAIL (' || n || ')' end
         || ' the freelancer opens their own QR' || E'\n';
  reset role;

  -- a client with no project with this freelancer cannot open the QR
  if c2 is not null and c2 <> f
     and not exists (select 1 from public.projects where client_id = c2 and freelancer_id = f) then
    perform set_config('request.jwt.claims', json_build_object('sub', c2, 'role', 'authenticated')::text, true);
    perform set_config('request.jwt.claim.sub', c2::text, true);
    set local role authenticated;
    select count(*) into n from storage.objects where bucket_id = 'gcash-qr' and name = f::text || '/qr.png';
    res := res || case when n = 0 then 'PASS' else 'FAIL (' || n || ')' end
           || ' a client with no project with this freelancer cannot open the QR' || E'\n';
    reset role;
  end if;

  -- ---- H. The notification rule keeps the old kinds -----------------------
  begin
    insert into public.user_notifications (user_id, type, title, message, link)
    values (c, 'booking_requested', 't', 'm', '/x'), (c, 'school_id_pass', 't', 'm', '/x'), (c, 'payment_sent', 't', 'm', '/x');
    msg := null;
  exception when others then msg := sqlerrm; end;
  res := res || case when msg is null then 'PASS' else 'FAIL (' || msg || ')' end
         || ' old kinds and the new payment kinds are accepted' || E'\n';
  begin
    insert into public.user_notifications (user_id, type, title, message, link)
    values (c, 'payment_bogus', 't', 'm', '/x');
    msg := null;
  exception when others then msg := sqlerrm; end;
  res := res || case when msg like '%type_check%' then 'PASS' else 'FAIL (' || coalesce(msg, 'no error') || ')' end
         || ' an unknown kind is still refused' || E'\n';

  -- ---- I. A signed-out visitor ---------------------------------------------
  set local role anon;
  begin perform public.record_payment(pr, 750, '4021358091742', rp1); msg := null;
  exception when others then msg := sqlerrm; end;
  res := res || case when msg like 'permission denied%' then 'PASS' else 'FAIL (' || coalesce(msg, 'no error') || ')' end
         || ' a signed-out visitor cannot call record_payment' || E'\n';
  begin perform * from public.get_pay_details(pr); msg := null;
  exception when others then msg := sqlerrm; end;
  res := res || case when msg like 'permission denied%' then 'PASS' else 'FAIL (' || coalesce(msg, 'no error') || ')' end
         || ' ... or get_pay_details' || E'\n';
  begin perform count(*) from public.payments; msg := null;
  exception when others then msg := sqlerrm; end;
  res := res || case when msg like 'permission denied%' then 'PASS' else 'FAIL (' || coalesce(msg, 'no error') || ')' end
         || ' ... or read the payments table' || E'\n';
  reset role;

  -- ---- J. No user numbers were used ----------------------------------------
  select last_value into seq_after from public.user_number_seq;
  res := res || case when seq_after = seq_before then 'PASS' else 'FAIL (' || seq_before || ' -> ' || seq_after || ')' end
         || ' the user number counter did not move' || E'\n';

  raise exception E'\n%', res;
end
$t$;
