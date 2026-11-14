-- Test for supabase_currencies_schema.sql (PLAN-currencies.md, Step 1). Run it in the
-- Supabase SQL Editor AFTER the schema file (or in the same run, right after it). Nothing
-- stays: the last line raises an error that carries the PASS / FAIL list, and that rolls
-- everything back (the rate changes, the made-up web answers, the profile change).
--
-- It borrows one person, only to change their own "Show estimates in" setting. The
-- made-up pg_net answers use negative numbers, so they can never be mixed up with real
-- ones. Calling ask_exchange_rates() here sends nothing: pg_net only sends a request after
-- the transaction is saved, and this one never is.

do $$
declare
  me uuid;
  n integer;
  t text;
  usd numeric; eur numeric; gbp numeric;
  denied text;
  passes integer; fails integer; report text;
begin
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

  select p.id into me from public.profiles p order by p.created_at limit 1;
  if me is null then
    raise exception 'The test needs one person to borrow.';
  end if;

  -- ---------------------------------------------------------------------------
  -- 1. The list
  -- ---------------------------------------------------------------------------
  select count(*) into n from public.currencies;
  perform pg_temp.chk('30 currencies in the list', n = 30, n::text);
  perform pg_temp.chk('one peso is 1 peso', (select per_php from public.currencies where code = 'PHP') = 1);
  perform pg_temp.chk('yen, won, rupiah and dong have no decimals',
    (select string_agg(code, ',' order by code) from public.currencies where decimals = 0) = 'IDR,JPY,KRW,VND',
    (select string_agg(code, ',' order by code) from public.currencies where decimals = 0));
  perform pg_temp.chk('the peso max is still 1,000,000',
    (select max_amount from public.currencies where code = 'PHP') = 1000000);
  perform pg_temp.chk('every max fits the money columns',
    not exists (select 1 from public.currencies where max_amount > 99999999.99));
  perform pg_temp.chk('every max is about 1,000,000 pesos worth (rupiah and dong are capped)',
    not exists (select 1 from public.currencies
                where code not in ('IDR', 'VND') and max_amount / per_php not between 900000 and 1250000),
    (select string_agg(code, ',') from public.currencies
     where code not in ('IDR', 'VND') and max_amount / per_php not between 900000 and 1250000));

  -- ---------------------------------------------------------------------------
  -- 2. money_text
  -- ---------------------------------------------------------------------------
  t := public.money_text(1500, 'PHP');      perform pg_temp.chk('pesos: ₱1,500.00', t = '₱1,500.00', t);
  t := public.money_text(50, 'USD');        perform pg_temp.chk('dollars: US$50.00', t = 'US$50.00', t);
  t := public.money_text(7500, 'JPY');      perform pg_temp.chk('yen without decimals: ¥7,500', t = '¥7,500', t);
  t := public.money_text(120, 'CHF');       perform pg_temp.chk('a letter symbol gets a space: CHF 120.00', t = 'CHF 120.00', t);
  t := public.money_text(1500, 'ZAR');      perform pg_temp.chk('rand: R 1,500.00', t = 'R 1,500.00', t);
  t := public.money_text(15000000, 'IDR');  perform pg_temp.chk('rupiah: Rp 15,000,000', t = 'Rp 15,000,000', t);
  t := public.money_text(21000000, 'KRW');  perform pg_temp.chk('the won max: ₩21,000,000', t = '₩21,000,000', t);
  t := public.money_text(0.5, 'EUR');       perform pg_temp.chk('cents: €0.50', t = '€0.50', t);
  t := public.money_text(1000000, 'PHP');   perform pg_temp.chk('the peso max: ₱1,000,000.00', t = '₱1,000,000.00', t);
  t := public.money_text(10, null);         perform pg_temp.chk('no currency means pesos', t = '₱10.00', t);
  t := public.money_text(10, 'XYZ');        perform pg_temp.chk('a code not in the list is written as the code', t = 'XYZ 10.00', t);
  perform pg_temp.chk('no amount gives no text', public.money_text(null, 'USD') is null);

  -- ---------------------------------------------------------------------------
  -- 3. Who can read and change the list
  -- ---------------------------------------------------------------------------
  perform pg_temp.act(null);
  execute 'set local role anon';
  select count(*) into n from public.currencies;
  execute 'reset role';
  perform pg_temp.chk('signed-out visitors can read the list', n = 30, n::text);

  perform pg_temp.act(me);
  execute 'set local role authenticated';
  select count(*) into n from public.currencies;
  begin
    update public.currencies set per_php = 1 where code = 'USD';
    denied := 'no';
  exception when insufficient_privilege then
    denied := 'yes';
  end;
  execute 'reset role';
  perform pg_temp.chk('signed-in people can read the list', n = 30, n::text);
  perform pg_temp.chk('signed-in people can''t change a rate', denied = 'yes', denied);

  execute 'set local role authenticated';
  begin
    insert into public.currencies (code, name, symbol, decimals, max_amount, per_php)
    values ('XYZ', 'Made-up money', 'X', 2, 10, 1);
    denied := 'no';
  exception when insufficient_privilege then
    denied := 'yes';
  end;
  execute 'reset role';
  perform pg_temp.chk('signed-in people can''t add a currency', denied = 'yes', denied);

  perform pg_temp.chk('nobody but the database can run the rate functions',
    not has_function_privilege('authenticated', 'public.apply_exchange_rates(jsonb)', 'execute')
    and not has_function_privilege('authenticated', 'public.ask_exchange_rates()', 'execute')
    and not has_function_privilege('authenticated', 'public.read_exchange_rates()', 'execute')
    and not has_function_privilege('anon', 'public.apply_exchange_rates(jsonb)', 'execute')
    and not has_function_privilege('anon', 'public.ask_exchange_rates()', 'execute')
    and not has_function_privilege('anon', 'public.read_exchange_rates()', 'execute'));
  perform pg_temp.chk('signed-in people can use money_text, visitors can''t',
    has_function_privilege('authenticated', 'public.money_text(numeric,text)', 'execute')
    and not has_function_privilege('anon', 'public.money_text(numeric,text)', 'execute'));
  perform pg_temp.chk('nobody can read the rate check log from the website',
    not has_table_privilege('authenticated', 'public.exchange_rate_checks', 'select')
    and not has_table_privilege('anon', 'public.exchange_rate_checks', 'select'));

  -- ---------------------------------------------------------------------------
  -- 4. "Show estimates in"
  -- ---------------------------------------------------------------------------
  perform pg_temp.chk('the setting starts as PHP',
    (select column_default from information_schema.columns
     where table_schema = 'public' and table_name = 'profiles' and column_name = 'display_currency') like '''PHP''%'
    and (select is_nullable from information_schema.columns
         where table_schema = 'public' and table_name = 'profiles' and column_name = 'display_currency') = 'NO');

  t := null;
  perform pg_temp.act(me);
  execute 'set local role authenticated';
  begin
    update public.profiles set display_currency = 'USD' where id = me;
    get diagnostics n = row_count;
  exception when others then
    n := -1; t := sqlerrm;
  end;
  begin
    update public.profiles set display_currency = 'XYZ' where id = me;
    denied := 'no';
  exception when foreign_key_violation then
    denied := 'yes';
  end;
  execute 'reset role';
  perform pg_temp.chk('a person can pick USD for their estimates',
    n = 1 and (select display_currency from public.profiles where id = me) = 'USD', coalesce(t, n::text));
  perform pg_temp.chk('a code that is not in the list is refused', denied = 'yes', denied);

  -- ---------------------------------------------------------------------------
  -- 5. Copying rates out of an answer
  -- ---------------------------------------------------------------------------
  select per_php into eur from public.currencies where code = 'EUR';
  select per_php into gbp from public.currencies where code = 'GBP';
  n := public.apply_exchange_rates(jsonb_build_object('result', 'success', 'rates',
         jsonb_build_object('PHP', 1, 'USD', 0.016, 'EUR', eur * 3, 'GBP', 'abc', 'XYZ', 5)));
  perform pg_temp.chk('good rates are copied (PHP and USD)', n = 2, n::text);
  select per_php into usd from public.currencies where code = 'USD';
  perform pg_temp.chk('USD is now 0.016', usd = 0.016, usd::text);
  perform pg_temp.chk('a rate 3 times the old one is ignored',
    (select per_php from public.currencies where code = 'EUR') = eur);
  perform pg_temp.chk('a rate that is not a number is ignored',
    (select per_php from public.currencies where code = 'GBP') = gbp);
  perform pg_temp.chk('a code that is not in the list is not added',
    not exists (select 1 from public.currencies where code = 'XYZ'));
  perform pg_temp.chk('a failed answer changes nothing',
    public.apply_exchange_rates('{"result": "error", "error-type": "unsupported-code"}'::jsonb) = 0);
  perform pg_temp.chk('an answer without a rates list changes nothing',
    public.apply_exchange_rates('{"result": "success", "rates": [1, 2]}'::jsonb) = 0);

  -- ---------------------------------------------------------------------------
  -- 6. Reading the answer of a daily check
  -- ---------------------------------------------------------------------------
  n := public.ask_exchange_rates();
  perform pg_temp.chk('asking writes down the request',
    exists (select 1 from public.exchange_rate_checks where request_id = n and result is null));

  insert into public.exchange_rate_checks (request_id, asked_at) values (-101, now());
  t := public.read_exchange_rates();
  perform pg_temp.chk('a check without an answer yet is waiting', t = 'waiting', t);

  update public.exchange_rate_checks set asked_at = now() - interval '2 hours' where request_id = -101;
  t := public.read_exchange_rates();
  perform pg_temp.chk('no answer after an hour counts as lost', t = 'failed: no answer', t);

  insert into net._http_response (id, status_code, content, timed_out, created)
  values (-102, 200, '{"result": "success", "rates": {"PHP": 1, "USD": 0.0161}}', false, now());
  insert into public.exchange_rate_checks (request_id) values (-103);   -- older, never answered
  insert into public.exchange_rate_checks (request_id) values (-102);
  t := public.read_exchange_rates();
  perform pg_temp.chk('a good answer updates the rates', t = 'updated 2 rates', t);
  perform pg_temp.chk('USD is now 0.0161', (select per_php from public.currencies where code = 'USD') = 0.0161);
  perform pg_temp.chk('older unread checks are closed as skipped',
    (select result from public.exchange_rate_checks where request_id = -103) = 'skipped: a newer check was read'
    and not exists (select 1 from public.exchange_rate_checks where result is null));

  insert into net._http_response (id, status_code, content, timed_out, created)
  values (-104, 500, 'Server error', false, now());
  insert into public.exchange_rate_checks (request_id) values (-104);
  t := public.read_exchange_rates();
  perform pg_temp.chk('a server error is written down', t = 'failed: status 500', t);

  insert into net._http_response (id, status_code, content, timed_out, error_msg, created)
  values (-105, null, null, true, 'Timeout of 20000 ms reached', now());
  insert into public.exchange_rate_checks (request_id) values (-105);
  t := public.read_exchange_rates();
  perform pg_temp.chk('a timeout is written down with pg_net''s message', t = 'failed: Timeout of 20000 ms reached', t);

  insert into net._http_response (id, status_code, content, timed_out, created)
  values (-106, 200, 'this is not json', false, now());
  insert into public.exchange_rate_checks (request_id) values (-106);
  t := public.read_exchange_rates();
  perform pg_temp.chk('an answer that is not JSON is written down, nothing breaks', t like 'failed: %', t);
  perform pg_temp.chk('rates stay as they were after the failures',
    (select per_php from public.currencies where code = 'USD') = 0.0161);

  t := public.read_exchange_rates();
  perform pg_temp.chk('then there is nothing left to read', t = 'nothing to read', t);

  perform pg_temp.chk('the two daily jobs are scheduled',
    (select count(*) from cron.job where jobname in ('ask-exchange-rates', 'read-exchange-rates')) = 2);

  -- Everything above is rolled back by this error; the list is in its message.
  report := coalesce(current_setting('test.report', true), '(nothing was checked)');
  select count(*) filter (where l like 'PASS%'), count(*) filter (where l like 'FAIL%')
    into passes, fails from unnest(string_to_array(report, E'\n')) as l;
  raise exception E'RESULTS: % PASS, % FAIL\n%', passes, fails, report;
end;
$$;
