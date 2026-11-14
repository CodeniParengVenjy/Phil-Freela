-- Test for supabase_currencies_prices_schema.sql (PLAN-currencies.md, Step 2). Send the schema
-- file and this block together in ONE call to try it before applying (the error at the end
-- rolls the schema back too), or run this alone in the Supabase SQL Editor after the schema
-- file. Nothing stays: the last line raises an error that carries the PASS / FAIL list.
--
-- It BORROWS a client, a verified freelancer who is taking work, and a stranger (no accounts
-- are made, so no user numbers are used), adds a made-up US$ offer, job post, projects,
-- payments and a receipt as the database owner, then acts as each person (the signed-in
-- role plus their id). The email triggers are switched off for the block (the switch rolls
-- back too), so nobody is emailed. The 8 AM notices are run once inside the block; whatever
-- they write rolls back with everything else.

do $t$
declare
  today date := (now() at time zone 'Asia/Manila')::date;
  cl uuid; fr uuid; st uuid; cv uuid;
  sv uuid; jp uuid; ap uuid; bk uuid; pb uuid; ph uuid; pp uuid; pq uuid; pphp uuid;
  p17 uuid; p21 uuid; pjpy uuid; pphp_pay uuid; rq uuid; rq2 uuid;
  rc text;
  r text; t text;
  passes integer; fails integer; report text;
begin
  alter table public.user_notifications disable trigger email_offline_on_notification;
  alter table public.job_applications disable trigger email_offline_on_application;
  alter table public.messages disable trigger email_offline_on_message;
  alter table public.services disable trigger services_offer_limit;

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

  -- Acts as this person (null = nobody): the id the database rules see through auth.uid().
  create function pg_temp.act(u uuid) returns void
  language plpgsql as $f$
  begin
    perform set_config('request.jwt.claims', case when u is null then '' else json_build_object('sub', u, 'role', 'authenticated')::text end, true);
    perform set_config('request.jwt.claim.sub', coalesce(u::text, ''), true);
  end;
  $f$;

  -- Runs one query as this person, signed in. Returns its one value as text ('OK' when it
  -- has none), or 'ERROR: <message>'. A failed query changes nothing.
  create function pg_temp.run_as(u uuid, q text) returns text
  language plpgsql as $f$
  declare
    result text;
  begin
    perform pg_temp.act(u);
    begin
      execute 'set local role authenticated';
      execute q into result;
      execute 'reset role';
      return coalesce(nullif(result, ''), 'OK');
    exception when others then
      return 'ERROR: ' || sqlerrm;
    end;
  end;
  $f$;

  -- Runs one query as the database owner while auth.uid() is this person: the way the
  -- receipt check calls the inner record_payment, which people can't call themselves.
  create function pg_temp.run_claims(u uuid, q text) returns text
  language plpgsql as $f$
  declare
    result text;
  begin
    perform pg_temp.act(u);
    begin
      execute q into result;
      return coalesce(nullif(result, ''), 'OK');
    exception when others then
      return 'ERROR: ' || sqlerrm;
    end;
  end;
  $f$;

  -- Every notice of this kind this person got during the test, joined.
  create function pg_temp.notes(u uuid, kind text) returns text
  language sql as $f$
    select string_agg(n.message, ' || ') from public.user_notifications n
    where n.user_id = u and n.type = kind and n.created_at >= now()
  $f$;

  -- ---- people (only borrowed) -------------------------------------------------------
  select p.id into fr from public.profiles p
   where p.account_type = 'freelancer' and p.available_for_work and public.is_verified(p.id)
     and not public.is_posting_blocked(p.id) and not public.is_messaging_blocked(p.id)
     and not exists (select 1 from public.admins a where a.id = p.id)
   order by p.created_at limit 1;
  select p.id into cl from public.profiles p
   where p.account_type = 'client' and p.id <> fr and not public.is_posting_blocked(p.id)
     and not exists (select 1 from public.admins a where a.id = p.id)
     and not exists (select 1 from public.projects x
                     where x.client_id = p.id and x.freelancer_id = fr
                       and x.pay_allowed_at is null and public.payment_overdue(x.id))
   order by p.created_at limit 1;
  select p.id into st from public.profiles p
   where p.id <> fr and p.id <> cl and not exists (select 1 from public.admins a where a.id = p.id)
   order by p.created_at limit 1;
  if fr is null or cl is null or st is null then
    raise exception 'The test needs a verified freelancer taking work, a client and one more person to borrow.';
  end if;

  select c.id into cv from public.conversations c
   where ((c.user_a = fr and c.user_b = cl) or (c.user_a = cl and c.user_b = fr))
     and not exists (select 1 from public.payments x where x.conversation_id = c.id and x.status in ('requested', 'sent'))
   limit 1;
  if cv is null then
    alter table public.conversations disable trigger conversations_limit_new;
    insert into public.conversations (user_a, user_b) values (fr, cl) returning id into cv;
  end if;

  rc := cl::text || '/test-currency-receipt.jpg';
  insert into storage.objects (bucket_id, name) values ('receipts', rc);

  -- ---------------------------------------------------------------------------
  -- A. Columns, limits and helpers
  -- ---------------------------------------------------------------------------
  perform pg_temp.chk('the five tables have a currency column that starts as PHP',
    (select count(*) from information_schema.columns
      where table_schema = 'public' and column_name = 'currency' and is_nullable = 'NO' and column_default like '''PHP''%'
        and table_name in ('services', 'job_posts', 'bookings', 'projects', 'payments')) = 5);
  perform pg_temp.chk('helpers: the US$ limit, yen decimals, an unknown code allows nothing',
    public.money_cap('USD') = 16000 and public.money_decimals('JPY') = 0 and public.money_decimals('USD') = 2
    and public.money_cap('XYZ') = 0);
  perform pg_temp.chk('price_text in a currency, and the older form in pesos',
    public.price_text(5000, 'project', 'USD') = 'US$5,000.00 for the whole project'
    and public.price_text(800, 'day') = '₱800.00 per day'
    and public.price_text(30000, 'month', 'JPY') = '¥30,000 per month',
    public.price_text(5000, 'project', 'USD') || ' / ' || public.price_text(800, 'day') || ' / ' || public.price_text(30000, 'month', 'JPY'));

  insert into public.services (freelancer_id, title, category, description, price, currency)
  values (fr, 'Test currency offer', 'Design', 'A made-up offer for the currency test.', 50, 'USD')
  returning id into sv;

  begin
    update public.services set price = 16001 where id = sv;
    r := 'no error';
  exception when others then r := sqlerrm;
  end;
  perform pg_temp.chk('an offer over the US$ limit is refused', r = 'The amount must be at most US$16,000.00.', r);
  begin
    update public.services set currency = 'JPY', price = 1500.5 where id = sv;
    r := 'no error';
  exception when others then r := sqlerrm;
  end;
  perform pg_temp.chk('an offer in yen with decimals is refused', r like 'Amounts in Japanese yen have no decimals%', r);
  update public.services set price = 16000 where id = sv;
  perform pg_temp.chk('an offer right at the US$ limit is fine', (select price from public.services where id = sv) = 16000);
  update public.services set price = 50 where id = sv;

  insert into public.job_posts (client_id, title, category, description, budget, currency, job_type, budget_type,
                                start_date, due_date, freelancers_needed)
  values (cl, 'Test currency job', 'Design', 'A made-up job for the currency test.', 200, 'USD', 'project', 'project',
          today, today + 10, 1)
  returning id into jp;
  begin
    update public.job_posts set budget = 20000 where id = jp;
    r := 'no error';
  exception when others then r := sqlerrm;
  end;
  perform pg_temp.chk('a budget over the US$ limit is refused', r = 'The amount must be at most US$16,000.00.', r);
  begin
    update public.job_posts set currency = 'PHP', budget = 1000001 where id = jp;
    r := 'no error';
  exception when others then r := sqlerrm;
  end;
  perform pg_temp.chk('a peso budget over 1,000,000 is still refused', r = 'The amount must be at most ₱1,000,000.00.', r);
  begin
    update public.job_posts set currency = 'KRW', budget = 5000000 where id = jp;
    r := 'ok';
  exception when others then r := sqlerrm;
  end;
  perform pg_temp.chk('a won budget above 1,000,000 is fine now', r = 'ok', r);
  update public.job_posts set currency = 'USD', budget = 200 where id = jp;

  insert into public.job_applications (job_post_id, freelancer_id, resume_path)
  values (jp, fr, fr::text || '/' || jp::text || '-1.pdf')
  returning id into ap;

  -- ---------------------------------------------------------------------------
  -- B. A booking copies the offer's currency
  -- ---------------------------------------------------------------------------
  r := pg_temp.run_as(cl, format('select public.create_booking(%L, %L, %L)::text', sv, 'Currency test booking', today + 5));
  bk := case when r like 'ERROR:%' then null else r::uuid end;
  perform pg_temp.chk('the client can book the US$ offer', bk is not null, r);
  perform pg_temp.chk('the booking keeps US$50',
    (select price = 50 and currency = 'USD' from public.bookings where id = bk));
  r := pg_temp.run_as(fr, format('select public.accept_booking(%L)::text', bk));
  pb := case when r like 'ERROR:%' then null else r::uuid end;
  perform pg_temp.chk('the freelancer can accept it', pb is not null, r);
  perform pg_temp.chk('the project is in US$ with the agreed US$50',
    (select currency = 'USD' and agreed_amount = 50 and price_status = 'agreed' from public.projects where id = pb));
  t := pg_temp.notes(cl, 'booking_accepted');
  perform pg_temp.chk('the client is told the price in US$', t like '%The price is US$50.00 for the whole project.%', t);

  -- ---------------------------------------------------------------------------
  -- C. A hire copies the job post's currency
  -- ---------------------------------------------------------------------------
  r := pg_temp.run_as(cl, format('select public.hire_applicant(%L, %L, %L)::text', ap, 'Currency test hire', today + 7));
  ph := case when r like 'ERROR:%' then null else r::uuid end;
  perform pg_temp.chk('the client can hire for the US$ job', ph is not null, r);
  perform pg_temp.chk('the hired project is in US$ with US$200',
    (select currency = 'USD' and agreed_amount = 200 from public.projects where id = ph));
  t := pg_temp.notes(fr, 'project_hired');
  perform pg_temp.chk('the freelancer is told the price in US$', t like '%The price is US$200.00 for the whole project.%', t);

  -- ---------------------------------------------------------------------------
  -- D. Proposals can pick a currency
  -- ---------------------------------------------------------------------------
  insert into public.projects (client_id, freelancer_id, title, due_date)
  values (cl, fr, 'Test currency no price', today + 9) returning id into pp;
  r := pg_temp.run_as(fr, format('select public.propose_project_price(%L, %s, %L)::text', pp, 120, 'EUR'));
  perform pg_temp.chk('the freelancer can propose €120 on a project without a price', r = 'OK', r);
  perform pg_temp.chk('the project is now proposed at €120',
    (select currency = 'EUR' and agreed_amount = 120 and price_status = 'proposed' from public.projects where id = pp));
  t := pg_temp.notes(cl, 'price_proposed');
  perform pg_temp.chk('the client is told €120.00', t like '%: €120.00 for the whole project.%', t);
  r := pg_temp.run_as(cl, format('select public.agree_project_price(%L)::text', pp));
  t := pg_temp.notes(fr, 'price_agreed');
  perform pg_temp.chk('agreeing names €120.00', r = 'OK' and t like '%agreed to €120.00 for the whole project%',
    coalesce(r, '') || ' / ' || coalesce(t, ''));

  insert into public.projects (client_id, freelancer_id, title, due_date)
  values (cl, fr, 'Test currency proposals', today + 9) returning id into pq;
  r := pg_temp.run_as(cl, format('select public.propose_project_price(%L, %s)::text', pq, 500));
  perform pg_temp.chk('the older two-value proposal stays in pesos',
    r = 'OK' and (select currency = 'PHP' and agreed_amount = 500 from public.projects where id = pq), r);
  r := pg_temp.run_as(fr, format('select public.propose_project_price(%L, %s, %L)::text', pq, 20000, 'USD'));
  perform pg_temp.chk('a proposal over the US$ limit is refused',
    r = 'ERROR: The price must be more than 0 and at most US$16,000.00.', r);
  r := pg_temp.run_as(fr, format('select public.propose_project_price(%L, %s, %L)::text', pq, 10, 'XYZ'));
  perform pg_temp.chk('a currency that is not in the list is refused', r = 'ERROR: Pick a currency from the list.', r);
  r := pg_temp.run_as(fr, format('select public.propose_project_price(%L, %s, %L)::text', pq, 1500.4, 'JPY'));
  perform pg_temp.chk('a yen proposal is rounded to whole yen',
    r = 'OK' and (select currency = 'JPY' and agreed_amount = 1500 from public.projects where id = pq), r);

  insert into public.payments (project_id, client_id, freelancer_id, amount, currency, method, reference_no, receipt_path)
  values (pq, cl, fr, 1000, 'JPY', 'bank', 'JPY-TEST-0001', rc) returning id into pjpy;
  r := pg_temp.run_as(cl, format('select public.propose_project_price(%L, %s, %L)::text', pq, 10, 'USD'));
  perform pg_temp.chk('the currency can''t change once a payment is sent',
    r = 'ERROR: This project already has payments in JPY, so its price has to be in JPY too.', r);

  -- ---------------------------------------------------------------------------
  -- E. Recording payments in US$ (the US$50 project from the booking)
  -- ---------------------------------------------------------------------------
  r := pg_temp.run_as(cl, format('select public.record_other_payment(%L, %s, %s, %L, %L, %L)::text', pb, 30, 0, 'paypal', 'PAYPAL-123', rc));
  p17 := case when r like 'ERROR:%' then null else r::uuid end;
  perform pg_temp.chk('a US$30 PayPal payment can be recorded', p17 is not null, r);
  perform pg_temp.chk('it is saved in US$, by PayPal',
    (select currency = 'USD' and method = 'paypal' and amount = 30 and status = 'sent' from public.payments where id = p17));
  t := pg_temp.notes(fr, 'payment_sent');
  perform pg_temp.chk('the freelancer is told US$30.00 and to check that it arrived',
    t like '%says they sent US$30.00 for "Test currency offer".%Check that it arrived, then confirm it on the project page.%', t);

  r := pg_temp.run_claims(cl, format('select public.record_payment(%L, %s, %s, %L, %L)::text', pb, 5, 0, '1234567890123', rc));
  perform pg_temp.chk('the GCash receipt way is refused for a US$ project',
    r like 'ERROR: This price is in USD. GCash and its receipt check are only for payments in pesos%', r);
  r := pg_temp.run_as(cl, format('select public.record_other_payment(%L, %s, %s, %L, %L, %L)::text', pb, 5, 0, 'wise', 'AB', rc));
  perform pg_temp.chk('a too-short transaction number is refused',
    r = 'ERROR: Type the transaction number of your payment: 4 to 60 letters or numbers.', r);
  r := pg_temp.run_as(cl, format('select public.record_other_payment(%L, %s, %s, %L, %L, %L)::text', pb, 5, 0, 'venmo', 'VENMO-1', rc));
  perform pg_temp.chk('a way that is not in the list is refused', r like 'ERROR: Pick how you sent the payment%', r);
  r := pg_temp.run_as(cl, format('select public.record_other_payment(%L, %s, %s, %L, %L, %L)::text', pb, 5, 0, 'gcash', '1234567890123', rc));
  perform pg_temp.chk('GCash can''t be picked for a US$ project either', r like 'ERROR: This price is in USD.%', r);
  r := pg_temp.run_as(cl, format('select public.record_other_payment(%L, %s, %s, %L, %L, %L)::text', pb, 25, 0, 'wise', 'WISE-777', rc));
  perform pg_temp.chk('paying more than is left is refused in US$',
    r = 'ERROR: Only US$20.00 is left to pay on this project. Put anything extra in the Tip box.', r);
  r := pg_temp.run_as(cl, format('select public.record_other_payment(%L, %s, %s, %L, %L, %L)::text', pb, 16001, 0, 'wise', 'WISE-779', rc));
  perform pg_temp.chk('an amount over the US$ limit is refused',
    r = 'ERROR: The amount must be more than 0 and at most US$16,000.00.', r);
  r := pg_temp.run_as(st, format('select public.record_other_payment(%L, %s, %s, %L, %L, %L)::text', pb, 5, 0, 'wise', 'WISE-780', rc));
  perform pg_temp.chk('someone who is not the client can''t record one', r like 'ERROR: Only the client of this project%', r);
  r := pg_temp.run_as(cl, format('select public.record_other_payment(%L, %s, %s, %L, %L, %L)::text', pb, 25, 5, 'wise', 'WISE-778', rc));
  p21 := case when r like 'ERROR:%' then null else r::uuid end;
  perform pg_temp.chk('the rest plus a US$5 tip can be recorded', p21 is not null, r);
  t := pg_temp.notes(fr, 'payment_sent');
  perform pg_temp.chk('the notice splits price and tip in US$', t like '%says they sent US$25.00 (US$20.00 + US$5.00 tip)%', t);

  insert into public.projects (client_id, freelancer_id, title, due_date,
                               agreed_amount, price_basis, price_status, price_source, price_agreed_at)
  values (cl, fr, 'Test currency peso project', today + 9, 1000, 'project', 'agreed', 'job', now())
  returning id into pphp;
  r := pg_temp.run_claims(cl, format('select public.record_payment(%L, %s, %s, %L, %L)::text',
         pphp, 100, 0, lpad((floor(random() * 1e13))::bigint::text, 13, '0'), rc));
  pphp_pay := case when r like 'ERROR:%' then null else r::uuid end;
  perform pg_temp.chk('a peso GCash payment still works (the way the receipt check records it)', pphp_pay is not null, r);
  perform pg_temp.chk('it is saved as PHP, by GCash',
    (select currency = 'PHP' and method = 'gcash' from public.payments where id = pphp_pay));
  t := pg_temp.notes(fr, 'payment_sent');
  perform pg_temp.chk('the peso notice still says ₱ and GCash',
    t like '%says they sent ₱100.00 for "Test currency peso project".%Check your GCash, then confirm it on the project page.%', t);
  r := pg_temp.run_as(cl, format('select public.record_other_payment(%L, %s, %s, %L, %L, %L)::text', pphp, 100, 0, 'paypal', 'PAYPAL-999', rc));
  perform pg_temp.chk('a peso project can''t skip the receipt check', r = 'ERROR: Payments in pesos are recorded with the GCash receipt check.', r);
  r := pg_temp.run_claims(cl, format('select public.record_payment(%L, %s, %s, %L, %L, %L)::text', pphp, 100, 0, 'PAYPAL-999', rc, 'paypal'));
  perform pg_temp.chk('the inner form refuses PayPal for pesos too', r = 'ERROR: Payments in pesos are sent by GCash.', r);

  -- ---------------------------------------------------------------------------
  -- F. The freelancer's answers
  -- ---------------------------------------------------------------------------
  r := pg_temp.run_as(fr, format('select public.confirm_payment(%L)::text', p17));
  t := pg_temp.notes(cl, 'payment_confirmed');
  perform pg_temp.chk('confirming names US$30.00',
    r = 'OK' and t like '%confirmed your payment of US$30.00 for "Test currency offer".%', coalesce(r, '') || ' / ' || coalesce(t, ''));
  r := pg_temp.run_as(fr, format('select public.confirm_short_payment(%L, %s)::text', p21, 1000000));
  perform pg_temp.chk('a "received less" that is the whole amount is refused in US$',
    r = 'ERROR: That is the whole amount (US$25.00). Use Confirm received instead.', r);
  r := pg_temp.run_as(fr, format('select public.confirm_short_payment(%L, %s)::text', p21, 0));
  perform pg_temp.chk('the empty-amount message has no GCash for US$',
    r = 'ERROR: Enter how much arrived. If nothing arrived, answer Not received.', r);
  r := pg_temp.run_as(fr, format('select public.confirm_short_payment(%L, %s)::text', p21, 10));
  t := pg_temp.notes(cl, 'payment_short');
  perform pg_temp.chk('"received less" names US$10.00 of US$25.00',
    r = 'OK' and t like '%checked their account: US$10.00 arrived, not US$25.00 for "Test currency offer".%',
    coalesce(r, '') || ' / ' || coalesce(t, ''));
  perform pg_temp.chk('its next step names the balance in US$',
    t like '%US$% of the agreed price is still unpaid.%' or t like '%fully paid%', t);
  r := pg_temp.run_as(fr, format('select public.confirm_short_payment(%L, %s)::text', pjpy, 10.5));
  perform pg_temp.chk('yen with decimals is refused when answering', r like 'ERROR: Amounts in Japanese yen have no decimals%', r);
  r := pg_temp.run_as(fr, format('select public.mark_payment_not_received(%L)::text', pjpy));
  t := pg_temp.notes(cl, 'payment_not_received');
  perform pg_temp.chk('"not received" names ¥1,000',
    r = 'OK' and t like '%says your payment of ¥1,000 for "Test currency proposals" did not arrive.%',
    coalesce(r, '') || ' / ' || coalesce(t, ''));

  -- ---------------------------------------------------------------------------
  -- G. Payments asked for in a chat
  -- ---------------------------------------------------------------------------
  insert into public.gcash_accounts (freelancer_id, gcash_number, account_name)
  select fr, '09171234567', 'Test Name'
  where not exists (select 1 from public.gcash_accounts g where g.freelancer_id = fr);

  r := pg_temp.run_as(fr, format('select public.request_payment(%L, %s, %L)::text', cv, 300, 'Peso test'));
  rq := case when r like 'ERROR:%' then null else r::uuid end;
  perform pg_temp.chk('the older request form asks in pesos',
    rq is not null and (select currency = 'PHP' from public.payments where id = rq), r);
  perform pg_temp.chk('its chat line says ₱300.00',
    exists (select 1 from public.messages where payment_id = rq and body = 'Payment request: ₱300.00'));
  r := pg_temp.run_as(fr, format('select public.cancel_payment_request(%L)::text', rq));
  perform pg_temp.chk('the peso request can be cancelled', r = 'OK', r);

  r := pg_temp.run_as(fr, format('select public.request_payment(%L, %s, %L, %L)::text', cv, 40, 'Logo', 'USD'));
  perform pg_temp.chk('a US$ request needs the other payment details first',
    r like 'ERROR: Add your payment details for other currencies in Settings first%', r);
  insert into public.payment_details (freelancer_id, details) values (fr, 'PayPal: currency-test@example.invalid');
  r := pg_temp.run_as(fr, format('select public.request_payment(%L, %s, %L, %L)::text', cv, 10, null, 'XYZ'));
  perform pg_temp.chk('a request in a currency that is not in the list is refused', r = 'ERROR: Pick a currency from the list.', r);
  r := pg_temp.run_as(fr, format('select public.request_payment(%L, %s, %L, %L)::text', cv, 40, 'Logo', 'USD'));
  rq2 := case when r like 'ERROR:%' then null else r::uuid end;
  perform pg_temp.chk('a US$40 request can be made',
    rq2 is not null and (select currency = 'USD' and status = 'requested' from public.payments where id = rq2), r);
  perform pg_temp.chk('its chat line says US$40.00',
    exists (select 1 from public.messages where payment_id = rq2 and body = 'Payment request: US$40.00'));
  t := pg_temp.notes(cl, 'payment_requested');
  perform pg_temp.chk('the payer is told US$40.00', t like '%asked for US$40.00 (Logo).%', t);
  r := pg_temp.run_as(cl, format('select public.get_other_request_pay_details(%L)', rq2));
  perform pg_temp.chk('the payer sees where to pay', r = 'PayPal: currency-test@example.invalid', r);
  r := pg_temp.run_as(st, format('select public.get_other_request_pay_details(%L)', rq2));
  perform pg_temp.chk('a stranger can''t', r like 'ERROR: Only the person asked to pay%', r);
  r := pg_temp.run_as(cl, format('select public.record_other_chat_payment(%L, %s, %s, %L, %L, %L)::text', rq, 300, 0, 'paypal', 'PP-554-TEST', rc));
  perform pg_temp.chk('a peso chat request can''t skip the receipt check',
    r = 'ERROR: Payments in pesos are recorded with the GCash receipt check.', r);
  r := pg_temp.run_as(cl, format('select public.record_other_chat_payment(%L, %s, %s, %L, %L, %L)::text', rq2, 40, 0, 'paypal', 'PP-555-TEST', rc));
  perform pg_temp.chk('the payer records the US$40 PayPal payment',
    r = 'OK' and (select status = 'sent' and method = 'paypal' and currency = 'USD' from public.payments where id = rq2), r);
  t := pg_temp.notes(fr, 'payment_sent');
  perform pg_temp.chk('the freelancer is told US$40.00 and to check the card',
    t like '%says they sent US$40.00 (Logo).%Check that it arrived, then confirm it on the card in the chat.%', t);

  -- ---------------------------------------------------------------------------
  -- H. Who sees the other payment details
  -- ---------------------------------------------------------------------------
  r := pg_temp.run_as(cl, format('select public.get_other_pay_details(%L)', pb));
  perform pg_temp.chk('the client of the US$ project sees them', r = 'PayPal: currency-test@example.invalid', r);
  r := pg_temp.run_as(st, format('select public.get_other_pay_details(%L)', pb));
  perform pg_temp.chk('nobody else can', r like 'ERROR: Only the client of this project%', r);
  r := pg_temp.run_as(st, format('select count(*)::text from public.payment_details where freelancer_id = %L', fr));
  perform pg_temp.chk('other people can''t read the details table', r = '0', r);
  r := pg_temp.run_as(fr, format('select count(*)::text from public.payment_details where freelancer_id = %L', fr));
  perform pg_temp.chk('the freelancer reads their own', r = '1', r);

  -- ---------------------------------------------------------------------------
  -- I. Done with money still unpaid, the hire block, and the 8 AM notices
  -- ---------------------------------------------------------------------------
  perform pg_temp.act(null);
  update public.projects
     set status = 'done', completed_at = (((today - 8)::timestamp + interval '10 hours') at time zone 'Asia/Manila')
   where id = pb;
  t := pg_temp.notes(cl, 'payment_unpaid');
  perform pg_temp.chk('marking it done names the balance in US$',
    t like '%of the agreed US$50.00 is still unpaid.%Pay the rest, then record it on the project page.%', t);

  r := pg_temp.run_as(cl, format('select public.create_booking(%L, %L, %L)::text', sv, 'Second booking', today + 6));
  perform pg_temp.chk('a client late on a US$ payment is blocked with the US$ amount',
    r like 'ERROR: You still owe % US$% for "Test currency offer"%', r);

  perform pg_temp.act(null);
  update public.payments set created_at = now() - interval '2 days' where id = rq2;
  perform public.send_daily_notices();
  t := pg_temp.notes(cl, 'payment_overdue');
  perform pg_temp.chk('the 8 AM late notice names the balance in US$',
    t like '%Payment for "Test currency offer" is 1 day late. US$% is still unpaid.%Pay the rest, then record it on the project page.%', t);
  t := pg_temp.notes(fr, 'payment_overdue');
  perform pg_temp.chk('the freelancer''s late notice names it in US$ too', t like '%has not paid US$% for "Test currency offer" yet.%', t);
  t := pg_temp.notes(fr, 'payment_waiting');
  perform pg_temp.chk('the 8 AM waiting notice names US$40.00',
    t like '%says they sent US$40.00 in the chat 2 days ago.%Check that it arrived, then confirm it.%', t);

  -- ---------------------------------------------------------------------------
  -- J. What the functions now look like, and who may call them
  -- ---------------------------------------------------------------------------
  perform pg_temp.chk('no client-freelancer money function writes ₱ any more',
    not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                where n.nspname = 'public' and p.prosrc like '%₱%'
                  and p.proname in ('create_booking', 'accept_booking', 'hire_applicant', 'agree_project_price',
                                    'propose_project_price', 'record_payment', 'record_chat_payment', 'request_payment',
                                    'confirm_payment', 'mark_payment_not_received', 'confirm_short_payment',
                                    'remind_unpaid_on_done', 'block_if_client_owes', 'price_text',
                                    'record_other_payment', 'record_other_chat_payment')),
    (select string_agg(p.proname, ', ') from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.prosrc like '%₱%'
       and p.proname in ('create_booking', 'accept_booking', 'hire_applicant', 'agree_project_price',
                         'propose_project_price', 'record_payment', 'record_chat_payment', 'request_payment',
                         'confirm_payment', 'mark_payment_not_received', 'confirm_short_payment',
                         'remind_unpaid_on_done', 'block_if_client_owes', 'price_text')));
  perform pg_temp.chk('the 8 AM notices keep ₱ only in a comment',
    (select length(prosrc) - length(replace(prosrc, '₱', '')) from pg_proc where oid = 'public.send_daily_notices()'::regprocedure) = 1);
  perform pg_temp.chk('people still can''t call record_payment or record_chat_payment themselves (any form)',
    not has_function_privilege('authenticated', 'public.record_payment(uuid,numeric,numeric,text,text,text)', 'execute')
    and not has_function_privilege('authenticated', 'public.record_payment(uuid,numeric,numeric,text,text)', 'execute')
    and not has_function_privilege('authenticated', 'public.record_chat_payment(uuid,numeric,numeric,text,text,text)', 'execute')
    and not has_function_privilege('authenticated', 'public.record_chat_payment(uuid,numeric,numeric,text,text)', 'execute'));
  perform pg_temp.chk('the new forms are for signed-in people only',
    has_function_privilege('authenticated', 'public.record_other_payment(uuid,numeric,numeric,text,text,text)', 'execute')
    and not has_function_privilege('anon', 'public.record_other_payment(uuid,numeric,numeric,text,text,text)', 'execute')
    and has_function_privilege('authenticated', 'public.record_other_chat_payment(uuid,numeric,numeric,text,text,text)', 'execute')
    and not has_function_privilege('anon', 'public.record_other_chat_payment(uuid,numeric,numeric,text,text,text)', 'execute')
    and has_function_privilege('authenticated', 'public.request_payment(uuid,numeric,text,text)', 'execute')
    and not has_function_privilege('anon', 'public.request_payment(uuid,numeric,text,text)', 'execute')
    and has_function_privilege('authenticated', 'public.propose_project_price(uuid,numeric,text)', 'execute')
    and not has_function_privilege('anon', 'public.propose_project_price(uuid,numeric,text)', 'execute')
    and has_function_privilege('authenticated', 'public.get_other_pay_details(uuid)', 'execute')
    and not has_function_privilege('anon', 'public.get_other_pay_details(uuid)', 'execute')
    and has_function_privilege('authenticated', 'public.get_other_request_pay_details(uuid)', 'execute')
    and not has_function_privilege('anon', 'public.get_other_request_pay_details(uuid)', 'execute'));
  perform pg_temp.chk('people can''t call the inside helpers',
    not has_function_privilege('authenticated', 'public.check_payment_way(text,text,text)', 'execute')
    and not has_function_privilege('authenticated', 'public.check_money_cap()', 'execute'));

  -- Everything above is rolled back by this error; the list is in its message.
  report := coalesce(current_setting('test.report', true), '(nothing was checked)');
  select count(*) filter (where l like 'PASS%'), count(*) filter (where l like 'FAIL%')
    into passes, fails from unnest(string_to_array(report, E'\n')) as l;
  raise exception E'RESULTS: % PASS, % FAIL\n%', passes, fails, report;
end;
$t$;
