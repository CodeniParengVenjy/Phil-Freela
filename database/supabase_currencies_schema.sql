-- Any currency, Step 1: the currency list and the exchange rates (PLAN-currencies.md; the
-- user, 2026-11-14: "ok" to the plan). Run in the Supabase SQL Editor (or as a migration).
-- Running it twice is harmless.
--
-- What this adds:
--   1. public.currencies: the 30 currencies people can price in, with the symbol, how many
--      decimals, the highest amount allowed, and today's rate against the peso.
--   2. money_text(amount, currency): "₱1,500.00", "US$50.00", "¥7,500", "CHF 120.00".
--      Every notification and chat line that names an amount switches to it in Step 2.
--   3. profiles.display_currency: the currency a person likes to see the "≈" estimates in
--      (Settings, Step 3). Default PHP.
--   4. The daily rate update: at 9:00 AM Manila time the database asks the free rate site
--      open.er-api.com for today's rates (pg_net, the same way the offline emails are
--      sent), and at 9:10 it reads the answer and copies the rates into the list. No Edge
--      Function is needed.
--
-- Rates are only for the "≈" estimates. What anyone owes is always the amount in its own
-- currency, never a converted one.

-- ---------------------------------------------------------------------------
-- 1. The currency list
-- ---------------------------------------------------------------------------

create table if not exists public.currencies (
  -- The ISO 4217 code: PHP, USD, EUR...
  code text primary key check (code ~ '^[A-Z]{3}$'),
  -- "US dollar"
  name text not null,
  -- "US$". A symbol that ends in a letter ("CHF", "RM", "Rp") gets a space before the number.
  symbol text not null,
  -- 0 for currencies with no cents in everyday use (yen, won, rupiah, dong), else 2.
  decimals smallint not null check (decimals in (0, 2)),
  -- The highest amount allowed: about what 1,000,000 pesos buy, rounded up to two digits.
  -- Written once, so it never follows the daily rate. Rupiah and dong stop at 99,999,999,
  -- the most the money columns (numeric(10,2)) can hold.
  max_amount numeric(10,2) not null check (max_amount > 0),
  -- How much of this currency one peso buys (PHP = 1). Updated every day.
  per_php numeric(18,8) not null check (per_php > 0),
  rate_updated_at timestamptz not null default now()
);

comment on table public.currencies is
  'The currencies people can price in (PLAN-currencies.md). Read by everyone, changed only by the daily rate update.';

alter table public.currencies enable row level security;

-- Everyone can read the list (prices show on public pages too). Nobody can change it from
-- the website: only the daily update below, which runs as the database owner.
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'currencies' and policyname = 'currencies: everyone can read'
  ) then
    create policy "currencies: everyone can read" on public.currencies
      for select to anon, authenticated using (true);
  end if;
end $$;

revoke all on public.currencies from anon, authenticated;
grant select on public.currencies to anon, authenticated;

-- The 30 currencies, with the rates of Sat, 14 Nov 2026 00:02 UTC (open.er-api.com). A
-- currency that is already there is left as it is (its rate may be newer).
insert into public.currencies (code, name, symbol, decimals, max_amount, per_php) values
  ('PHP', 'Philippine peso', '₱', 2, 1000000, 1),
  ('USD', 'US dollar', 'US$', 2, 16000, 0.01566),
  ('EUR', 'Euro', '€', 2, 15000, 0.014197),
  ('GBP', 'British pound', '£', 2, 12000, 0.011854),
  ('JPY', 'Japanese yen', '¥', 0, 2600000, 2.508026),
  ('KRW', 'South Korean won', '₩', 0, 21000000, 20.919639),
  ('CNY', 'Chinese yuan', 'CN¥', 2, 110000, 0.1045),
  ('HKD', 'Hong Kong dollar', 'HK$', 2, 130000, 0.123017),
  ('TWD', 'New Taiwan dollar', 'NT$', 2, 520000, 0.515486),
  ('SGD', 'Singapore dollar', 'S$', 2, 21000, 0.020189),
  ('MYR', 'Malaysian ringgit', 'RM', 2, 65000, 0.064069),
  ('THB', 'Thai baht', '฿', 2, 540000, 0.531222),
  ('IDR', 'Indonesian rupiah', 'Rp', 0, 99999999, 285.17959),
  ('VND', 'Vietnamese dong', '₫', 0, 99999999, 401.872665),
  ('INR', 'Indian rupee', '₹', 2, 1500000, 1.4773),
  ('AUD', 'Australian dollar', 'A$', 2, 24000, 0.023105),
  ('NZD', 'New Zealand dollar', 'NZ$', 2, 29000, 0.028317),
  ('CAD', 'Canadian dollar', 'CA$', 2, 23000, 0.022359),
  ('CHF', 'Swiss franc', 'CHF', 2, 14000, 0.013146),
  ('AED', 'UAE dirham', 'AED', 2, 58000, 0.057511),
  ('SAR', 'Saudi riyal', 'SAR', 2, 59000, 0.058724),
  ('QAR', 'Qatari riyal', 'QAR', 2, 58000, 0.057002),
  ('SEK', 'Swedish krona', 'SEK', 2, 160000, 0.157583),
  ('NOK', 'Norwegian krone', 'NOK', 2, 150000, 0.149767),
  ('DKK', 'Danish krone', 'DKK', 2, 110000, 0.106117),
  ('MXN', 'Mexican peso', 'MX$', 2, 300000, 0.291475),
  ('BRL', 'Brazilian real', 'R$', 2, 89000, 0.088534),
  ('ZAR', 'South African rand', 'R', 2, 270000, 0.264102),
  ('TRY', 'Turkish lira', '₺', 2, 790000, 0.789032),
  ('ILS', 'Israeli shekel', '₪', 2, 51000, 0.050155)
on conflict (code) do nothing;

-- ---------------------------------------------------------------------------
-- 2. An amount as text: "₱1,500.00", "US$50.00", "¥7,500", "CHF 120.00"
-- ---------------------------------------------------------------------------

-- The website's formatMoney() (client/src/lib/money.js) writes amounts the same way, from
-- the same symbols. An empty currency means pesos; a code that is not in the list is
-- written as the code itself ("XYZ 10.00").
create or replace function public.money_text(amount numeric, currency text)
returns text
language sql
stable
set search_path = public
as $$
  select coalesce(
    (select c.symbol
            || case when c.symbol ~ '[A-Za-z]$' then ' ' else '' end
            || to_char(amount, case when c.decimals = 0 then 'FM999,999,999,990' else 'FM999,999,999,990.00' end)
     from public.currencies c
     where c.code = coalesce(currency, 'PHP')),
    coalesce(currency, 'PHP') || ' ' || to_char(amount, 'FM999,999,999,990.00')
  );
$$;

revoke execute on function public.money_text(numeric, text) from public, anon;
grant execute on function public.money_text(numeric, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. The currency a person sees the "≈" estimates in
-- ---------------------------------------------------------------------------

alter table public.profiles
  add column if not exists display_currency text not null default 'PHP'
    constraint profiles_display_currency_fkey references public.currencies (code);

comment on column public.profiles.display_currency is
  'Settings > "Show estimates in": the currency the small "≈" estimates are shown in. Only for display.';

-- ---------------------------------------------------------------------------
-- 4. The daily rate update
-- ---------------------------------------------------------------------------

-- One row per daily check: the number pg_net gave the web request, and what came of it.
-- Only the functions below use it; nobody can read or change it from the website.
create table if not exists public.exchange_rate_checks (
  id bigint generated always as identity primary key,
  request_id bigint not null,
  asked_at timestamptz not null default now(),
  -- Empty until the answer is read: "updated 30 rates", "failed: ..." or "skipped: ...".
  result text
);

alter table public.exchange_rate_checks enable row level security;
revoke all on public.exchange_rate_checks from anon, authenticated;

-- Copies the rates out of an answer like {"result": "success", "rates": {"USD": 0.0157, ...}}
-- into the list. Only currencies already in the list are touched. A rate that is missing,
-- is not a number, or is less than half or more than double the one we have is ignored
-- (a jump like that in one day is much more likely a mistake than real), so the old rate
-- stays. Returns how many rates were updated.
create or replace function public.apply_exchange_rates(answer jsonb)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  changed integer;
begin
  if answer ->> 'result' is distinct from 'success'
     or jsonb_typeof(answer -> 'rates') is distinct from 'object' then
    return 0;
  end if;

  update public.currencies c
  set per_php = (answer -> 'rates' ->> c.code)::numeric,
      rate_updated_at = now()
  where case
          -- (a CASE, so the text is only turned into a number when it is one)
          when jsonb_typeof(answer -> 'rates' -> c.code) = 'number'
          then (answer -> 'rates' ->> c.code)::numeric between c.per_php / 2 and c.per_php * 2
          else false
        end;

  get diagnostics changed = row_count;
  return changed;
end;
$$;

-- Asks the rate site for today's rates. pg_net sends the request after this finishes and
-- keeps the answer in net._http_response for a few hours; read_exchange_rates() reads it.
create or replace function public.ask_exchange_rates()
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  request bigint;
begin
  request := net.http_get(
    url := 'https://open.er-api.com/v6/latest/PHP',
    timeout_milliseconds := 20000
  );
  insert into public.exchange_rate_checks (request_id) values (request);
  return request;
end;
$$;

-- Reads the answer to the newest check that has not been read yet and applies it. Returns
-- what happened ("updated 30 rates", "waiting", "failed: ...", "nothing to read").
create or replace function public.read_exchange_rates()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  chk public.exchange_rate_checks;
  answer record;
  outcome text;
begin
  select * into chk
  from public.exchange_rate_checks
  where result is null
  order by id desc
  limit 1;
  if not found then
    return 'nothing to read';
  end if;

  select r.status_code, r.content, r.timed_out, r.error_msg into answer
  from net._http_response r
  where r.id = chk.request_id;

  if not found then
    -- Not back yet. After an hour it is counted as lost, so it never waits forever.
    if chk.asked_at > now() - interval '1 hour' then
      return 'waiting';
    end if;
    outcome := 'failed: no answer';
  elsif answer.status_code = 200 then
    begin
      outcome := 'updated ' || public.apply_exchange_rates(answer.content::jsonb) || ' rates';
    exception when others then
      outcome := 'failed: ' || sqlerrm;
    end;
  else
    outcome := 'failed: ' || coalesce('status ' || answer.status_code, answer.error_msg, 'no answer');
  end if;

  update public.exchange_rate_checks set result = outcome where id = chk.id;
  -- Older checks that were never read (the reading job missed a day) are closed too.
  update public.exchange_rate_checks set result = 'skipped: a newer check was read'
  where result is null and id < chk.id;
  return outcome;
end;
$$;

-- Only the scheduled jobs run these (as the database owner).
revoke execute on function public.apply_exchange_rates(jsonb) from public, anon, authenticated;
revoke execute on function public.ask_exchange_rates() from public, anon, authenticated;
revoke execute on function public.read_exchange_rates() from public, anon, authenticated;

-- 01:00 and 01:10 UTC = 9:00 and 9:10 AM in Manila. The rate site publishes new rates just
-- after midnight UTC. Scheduling a job name again replaces it, so running this file twice
-- keeps one job each.
select cron.schedule('ask-exchange-rates', '0 1 * * *', 'select public.ask_exchange_rates()');
select cron.schedule('read-exchange-rates', '10 1 * * *', 'select public.read_exchange_rates()');
