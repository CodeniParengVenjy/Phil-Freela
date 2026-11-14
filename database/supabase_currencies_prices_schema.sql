-- Any currency, Step 2: prices and payments carry a currency (PLAN-currencies.md; the user,
-- 2026-11-14: "ok" to the plan). Run in the Supabase SQL Editor (or as a migration) after
-- supabase_currencies_schema.sql (Step 1). Running it twice is harmless.
--
-- What changes:
--   1. A `currency` column (default PHP) on services, job_posts, bookings, projects and
--      payments, plus payments.method (how the money was sent). Every row that exists today
--      is PHP, so nothing old changes.
--   2. The 1,000,000 limit becomes a limit per currency (currencies.max_amount), checked by
--      a trigger on all five tables; yen, won, rupiah and dong amounts must be whole.
--   3. A booking copies the offer's currency, a hire copies the job post's, a proposal can
--      pick one (only while the project has no payments in another currency).
--   4. Payments in pesos stay GCash payments (13-digit reference, receipt, AI check), and
--      can still only be recorded through the AI receipt check. Payments in any other
--      currency go through record_other_payment / record_other_chat_payment: they say how
--      they were sent (PayPal, Wise, bank, Payoneer, remittance, other) and keep the same
--      proof, a transaction number (4 to 60 letters or numbers) and a screenshot. There is
--      no AI check for them; the freelancer's "Received?" answer is the check.
--   5. A freelancer can save "other payment details" (PayPal email, bank...), shown only to
--      the person who has to pay them.
--   6. Every notification, chat line and error that names a client-freelancer amount uses
--      money_text() ("US$50.00") instead of a fixed "₱".
--
-- Premium, Featured posts, billboards and member ads are NOT touched: Xendit charges them in
-- pesos, so their texts stay in pesos.
--
-- How the existing functions are changed: instead of pasting whole copies, a small helper
-- (pg_temp.patch) finds an exact piece of the live function, checks it is there the expected
-- number of times, and replaces it. A run that finds the change already made skips it. At
-- the end a self-check undoes every edit on paper and confirms the result is exactly the
-- function as it was, so nothing else could have changed.

-- ---------------------------------------------------------------------------
-- 1. The columns
-- ---------------------------------------------------------------------------

alter table public.services
  add column if not exists currency text not null default 'PHP'
    constraint services_currency_fkey references public.currencies (code);
alter table public.job_posts
  add column if not exists currency text not null default 'PHP'
    constraint job_posts_currency_fkey references public.currencies (code);
alter table public.bookings
  add column if not exists currency text not null default 'PHP'
    constraint bookings_currency_fkey references public.currencies (code);
alter table public.projects
  add column if not exists currency text not null default 'PHP'
    constraint projects_currency_fkey references public.currencies (code);
alter table public.payments
  add column if not exists currency text not null default 'PHP'
    constraint payments_currency_fkey references public.currencies (code);
-- How the money was sent. Empty on payments recorded before this (they were GCash).
alter table public.payments add column if not exists method text;

comment on column public.services.currency is 'The currency of the starting price (PLAN-currencies.md).';
comment on column public.job_posts.currency is 'The currency of the budget (PLAN-currencies.md).';
comment on column public.bookings.currency is 'Copied from the offer when the client booked it.';
comment on column public.projects.currency is 'The currency of the agreed price and of every payment on the project.';
comment on column public.payments.currency is 'The project''s currency (or the chat request''s).';
comment on column public.payments.method is 'gcash for pesos; paypal, wise, bank, payoneer, remittance or other for any other currency. Empty = an older GCash payment.';

-- The limits that were fixed at 1,000,000 become "more than 0"; the per-currency limit is
-- the trigger in part 2.
alter table public.payments drop constraint if exists payments_amount_check,
  add constraint payments_amount_check check (amount > 0);
alter table public.projects drop constraint if exists projects_agreed_amount_check,
  add constraint projects_agreed_amount_check check (agreed_amount > 0);
alter table public.bookings drop constraint if exists bookings_price_check,
  add constraint bookings_price_check check (price is null or price > 0);

-- GCash references are 13 digits; other ways have their own transaction numbers.
alter table public.payments drop constraint if exists payments_reference_no_check,
  add constraint payments_reference_no_check check (
    reference_no ~ '^[0-9]{13}$'
    or (currency <> 'PHP' and reference_no ~ '^[A-Za-z0-9#/._-]{4,60}$'));

-- Pesos go by GCash, any other currency by one of the other ways.
alter table public.payments drop constraint if exists payments_method_check,
  add constraint payments_method_check check (
    method is null
    or (method in ('gcash', 'paypal', 'wise', 'bank', 'payoneer', 'remittance', 'other')
        and (method = 'gcash') = (currency = 'PHP')));

-- ---------------------------------------------------------------------------
-- 2. Small helpers and the per-currency limit
-- ---------------------------------------------------------------------------

-- The highest amount allowed in a currency (0 for a code that is not in the list, so
-- nothing passes).
create or replace function public.money_cap(currency text)
returns numeric
language sql
stable
set search_path = public
as $$
  select coalesce((select c.max_amount from public.currencies c where c.code = coalesce(currency, 'PHP')), 0);
$$;

-- How many decimals an amount in this currency may have (0 or 2).
create or replace function public.money_decimals(currency text)
returns integer
language sql
stable
set search_path = public
as $$
  select coalesce((select c.decimals::integer from public.currencies c where c.code = coalesce(currency, 'PHP')), 2);
$$;

-- The error for too many decimals.
create or replace function public.decimals_message(currency text)
returns text
language sql
stable
set search_path = public
as $$
  select coalesce(
    (select case when c.decimals = 0
                 then 'Amounts in ' || c.name || ' have no decimals: type a whole number.'
                 else 'The amount can have up to 2 decimals.' end
     from public.currencies c where c.code = coalesce(currency, 'PHP')),
    'The amount can have up to 2 decimals.');
$$;

-- Signed-in people may call these (the trigger below runs as them).
revoke execute on function public.money_cap(text) from public, anon;
revoke execute on function public.money_decimals(text) from public, anon;
revoke execute on function public.decimals_message(text) from public, anon;
grant execute on function public.money_cap(text) to authenticated;
grant execute on function public.money_decimals(text) to authenticated;
grant execute on function public.decimals_message(text) to authenticated;

-- A price in its currency: "US$5,000.00 for the whole project", "₱800.00 per day".
create or replace function public.price_text(amount numeric, basis text, currency text)
returns text
language sql
stable
set search_path = public
as $$
  select public.money_text(amount, currency)
         || case basis when 'day' then ' per day' when 'month' then ' per month' else ' for the whole project' end;
$$;

-- The older two-value form means pesos.
create or replace function public.price_text(amount numeric, basis text)
returns text
language sql
stable
set search_path = public
as $$
  select public.price_text(amount, basis, 'PHP');
$$;

revoke execute on function public.price_text(numeric, text, text) from public, anon;
grant execute on function public.price_text(numeric, text, text) to authenticated;

-- The trigger: the amount column (named when the trigger is made) must fit the row's
-- currency. Rows without an amount pass.
create or replace function public.check_money_cap()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  amt numeric;
  cur text;
begin
  amt := (to_jsonb(new) ->> tg_argv[0])::numeric;
  cur := coalesce(to_jsonb(new) ->> 'currency', 'PHP');
  if amt is null then
    return new;
  end if;
  if amt > public.money_cap(cur) then
    raise exception 'The amount must be at most %.', public.money_text(public.money_cap(cur), cur);
  end if;
  if amt <> round(amt, public.money_decimals(cur)) then
    raise exception '%', public.decimals_message(cur);
  end if;
  return new;
end;
$$;

revoke execute on function public.check_money_cap() from public, anon, authenticated;

create or replace trigger services_money_cap
  before insert or update of price, currency on public.services
  for each row execute function public.check_money_cap('price');
create or replace trigger job_posts_money_cap
  before insert or update of budget, currency on public.job_posts
  for each row execute function public.check_money_cap('budget');
create or replace trigger bookings_money_cap
  before insert or update of price, currency on public.bookings
  for each row execute function public.check_money_cap('price');
create or replace trigger projects_money_cap
  before insert or update of agreed_amount, currency on public.projects
  for each row execute function public.check_money_cap('agreed_amount');
create or replace trigger payments_money_cap
  before insert or update of amount, currency on public.payments
  for each row execute function public.check_money_cap('amount');

-- How a payment was sent, checked against its currency. Pesos: GCash. Any other currency:
-- one of the other ways and a transaction number. (The 13-digit GCash rule stays in the
-- recording functions.)
create or replace function public.check_payment_way(currency text, method text, ref text)
returns void
language plpgsql
stable
set search_path = public
as $$
begin
  if currency = 'PHP' then
    if method is distinct from 'gcash' then
      raise exception 'Payments in pesos are sent by GCash.';
    end if;
    return;
  end if;
  if method = 'gcash' then
    raise exception 'This price is in %. GCash and its receipt check are only for payments in pesos: pick how you sent it (PayPal, Wise, bank...).', currency;
  end if;
  if method is null or method not in ('paypal', 'wise', 'bank', 'payoneer', 'remittance', 'other') then
    raise exception 'Pick how you sent the payment: PayPal, Wise, bank, Payoneer, remittance or other.';
  end if;
  if coalesce(ref, '') !~ '^[A-Za-z0-9#/._-]{4,60}$' then
    raise exception 'Type the transaction number of your payment: 4 to 60 letters or numbers.';
  end if;
end;
$$;

revoke execute on function public.check_payment_way(text, text, text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. Other payment details (PayPal email, bank...) for payments not in pesos
-- ---------------------------------------------------------------------------

-- One row per freelancer, private to them, like their GCash details.
create table if not exists public.payment_details (
  freelancer_id uuid primary key references public.profiles (id) on delete cascade,
  details text not null check (char_length(btrim(details)) between 3 and 300),
  updated_at timestamptz not null default now()
);

comment on table public.payment_details is
  'Where to send a payment that is not in pesos (PayPal email, bank...). Only the owner reads it; the payer sees it through get_other_pay_details().';

alter table public.payment_details enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'payment_details' and policyname = 'payment_details: the owner can read') then
    create policy "payment_details: the owner can read" on public.payment_details
      for select to authenticated using (freelancer_id = auth.uid());
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'payment_details' and policyname = 'payment_details: the owner can add') then
    create policy "payment_details: the owner can add" on public.payment_details
      for insert to authenticated with check (freelancer_id = auth.uid());
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'payment_details' and policyname = 'payment_details: the owner can change') then
    create policy "payment_details: the owner can change" on public.payment_details
      for update to authenticated using (freelancer_id = auth.uid()) with check (freelancer_id = auth.uid());
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'payment_details' and policyname = 'payment_details: the owner can remove') then
    create policy "payment_details: the owner can remove" on public.payment_details
      for delete to authenticated using (freelancer_id = auth.uid());
  end if;
end $$;

revoke all on public.payment_details from anon;

-- The details of the freelancer on this project, for its client only (like get_pay_details).
create or replace function public.get_other_pay_details(target_project uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  found_details text;
begin
  if not exists (
    select 1 from public.projects p where p.id = target_project and p.client_id = auth.uid()
  ) then
    raise exception 'Only the client of this project can see where to pay.';
  end if;

  select d.details into found_details
  from public.payment_details d
  join public.projects p on p.freelancer_id = d.freelancer_id
  where p.id = target_project;
  return found_details;
end;
$$;

-- The details of the freelancer who asked for this chat payment, for the payer only.
create or replace function public.get_other_request_pay_details(target_payment uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  found_details text;
begin
  if not exists (
    select 1 from public.payments p
    where p.id = target_payment and p.client_id = auth.uid()
      and p.conversation_id is not null and p.status = 'requested'
  ) then
    raise exception 'Only the person asked to pay can see where to pay.';
  end if;

  select d.details into found_details
  from public.payment_details d
  join public.payments p on p.freelancer_id = d.freelancer_id
  where p.id = target_payment;
  return found_details;
end;
$$;

revoke execute on function public.get_other_pay_details(uuid) from public, anon;
revoke execute on function public.get_other_request_pay_details(uuid) from public, anon;
grant execute on function public.get_other_pay_details(uuid) to authenticated;
grant execute on function public.get_other_request_pay_details(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. The patch helpers (they live only while this file runs)
-- ---------------------------------------------------------------------------

create temp table if not exists currency_patch_base (fn text primary key, base_src text not null);
create temp table if not exists currency_patch_log (seq serial primary key, fn text not null, from_text text not null, to_text text not null);

-- Replaces old_text with new_text in a live function. old_text must be there `times`
-- times; if new_text is already there, the edit was made before and is skipped. (No
-- parameter is named like a column of the two log tables, or Postgres can't tell them
-- apart.)
create or replace function pg_temp.patch(target_fn regprocedure, old_text text, new_text text, times integer default 1)
returns void
language plpgsql
as $p$
declare
  src text := pg_get_functiondef(target_fn);
  f text := replace(old_text, chr(13), '');
  t text := replace(new_text, chr(13), '');
  n integer;
begin
  if position(t in src) > 0 then
    return;
  end if;
  n := (length(src) - length(replace(src, f, ''))) / length(f);
  if n <> times then
    raise exception 'Patching %: expected % match(es) of [%] but found %.', target_fn, times, f, n;
  end if;
  insert into pg_temp.currency_patch_base as b (fn, base_src) values (target_fn::text, src)
    on conflict on constraint currency_patch_base_pkey do nothing;
  insert into pg_temp.currency_patch_log (fn, from_text, to_text) values (target_fn::text, f, t);
  execute replace(src, f, t);
end;
$p$;

-- Makes a new version of a function with one more value, from a copy of the live one
-- (old_text/new_text change its first line). Skipped if that version already exists.
create or replace function pg_temp.patch_copy(base_fn regprocedure, new_sig text, old_text text, new_text text)
returns void
language plpgsql
as $p$
declare
  src text := pg_get_functiondef(base_fn);
  f text := replace(old_text, chr(13), '');
  t text := replace(new_text, chr(13), '');
begin
  if to_regprocedure(new_sig) is not null then
    return;
  end if;
  if (length(src) - length(replace(src, f, ''))) / length(f) <> 1 then
    raise exception 'Copying % into %: its first line was not found once.', base_fn, new_sig;
  end if;
  execute replace(src, f, t);
  insert into pg_temp.currency_patch_base (fn, base_src) values (to_regprocedure(new_sig)::text, src);
  insert into pg_temp.currency_patch_log (fn, from_text, to_text) values (to_regprocedure(new_sig)::text, f, t);
end;
$p$;

-- ---------------------------------------------------------------------------
-- 5. Bookings, hires and agreed prices copy the currency
-- ---------------------------------------------------------------------------

-- create_booking: the booking keeps the offer's price AND currency.
select pg_temp.patch('public.create_booking(uuid, text, date)',
  $f$select s.id, s.title, s.freelancer_id, s.price$f$,
  $f$select s.id, s.title, s.freelancer_id, s.price, s.currency$f$);
select pg_temp.patch('public.create_booking(uuid, text, date)',
  $f$insert into public.bookings (client_id, freelancer_id, service_id, title, note, due_date, price)$f$,
  $f$insert into public.bookings (client_id, freelancer_id, service_id, title, note, due_date, price, currency)$f$);
select pg_temp.patch('public.create_booking(uuid, text, date)',
  $f$case when svc.price > 0 and svc.price <= 1000000 then svc.price end)$f$,
  $f$case when svc.price > 0 and svc.price <= public.money_cap(svc.currency) then svc.price end, svc.currency)$f$);

-- accept_booking: the project gets the booking's currency.
select pg_temp.patch('public.accept_booking(uuid)',
  $f$insert into public.projects (booking_id, client_id, freelancer_id, title, note, due_date,$f$,
  $f$insert into public.projects (booking_id, client_id, freelancer_id, title, note, due_date, currency,$f$);
select pg_temp.patch('public.accept_booking(uuid)',
  $f$values (b.id, b.client_id, b.freelancer_id, b.title, b.note, b.due_date,$f$,
  $f$values (b.id, b.client_id, b.freelancer_id, b.title, b.note, b.due_date, b.currency,$f$);
select pg_temp.patch('public.accept_booking(uuid)',
  $f$public.price_text(b.price, 'project')$f$,
  $f$public.price_text(b.price, 'project', b.currency)$f$);

-- hire_applicant: the project gets the job post's currency.
select pg_temp.patch('public.hire_applicant(uuid, text, date)',
  $f$j.client_id, j.budget, j.budget_type$f$,
  $f$j.client_id, j.budget, j.budget_type, j.currency$f$);
select pg_temp.patch('public.hire_applicant(uuid, text, date)',
  $f$app.budget <= 1000000 then app.budget end;$f$,
  $f$app.budget <= public.money_cap(app.currency) then app.budget end;$f$);
select pg_temp.patch('public.hire_applicant(uuid, text, date)',
  $f$insert into public.projects (application_id, job_post_id, client_id, freelancer_id, title, note, due_date,$f$,
  $f$insert into public.projects (application_id, job_post_id, client_id, freelancer_id, title, note, due_date, currency,$f$);
select pg_temp.patch('public.hire_applicant(uuid, text, date)',
  $f$nullif(btrim(project_note), ''), project_due_date,$f$,
  $f$nullif(btrim(project_note), ''), project_due_date, app.currency,$f$);
select pg_temp.patch('public.hire_applicant(uuid, text, date)',
  $f$public.price_text(job_price, app.budget_type)$f$,
  $f$public.price_text(job_price, app.budget_type, app.currency)$f$);

-- agree_project_price: the notice names the price in its currency.
select pg_temp.patch('public.agree_project_price(uuid)',
  $f$public.price_text(p.agreed_amount, p.price_basis)$f$,
  $f$public.price_text(p.agreed_amount, p.price_basis, p.currency)$f$);

-- propose_project_price, new form with a currency (empty = keep the project's). It can
-- change the currency only while no payment on the project is sent or confirmed.
select pg_temp.patch_copy('public.propose_project_price(uuid, numeric)',
  'public.propose_project_price(uuid, numeric, text)',
  $f$public.propose_project_price(target_project uuid, new_amount numeric)$f$,
  $f$public.propose_project_price(target_project uuid, new_amount numeric, new_currency text)$f$);
select pg_temp.patch('public.propose_project_price(uuid, numeric, text)',
  $f$amt numeric(10,2);$f$,
  $f$amt numeric(10,2);
  cur text;$f$);
select pg_temp.patch('public.propose_project_price(uuid, numeric, text)',
  $f$if new_amount is null or new_amount > 1000000 then$f$,
  $f$-- The currency: the one picked, or the project's own.
  cur := coalesce(new_currency, p.currency);
  if not exists (select 1 from public.currencies c where c.code = cur) then
    raise exception 'Pick a currency from the list.';
  end if;
  if cur <> p.currency and exists (
    select 1 from public.payments x where x.project_id = p.id and x.status in ('sent', 'confirmed')
  ) then
    raise exception 'This project already has payments in %, so its price has to be in % too.', p.currency, p.currency;
  end if;
  if new_amount is null or new_amount > public.money_cap(cur) then$f$);
select pg_temp.patch('public.propose_project_price(uuid, numeric, text)',
  $f$raise exception 'The price must be more than ₱0 and at most ₱1,000,000.';$f$,
  $f$raise exception 'The price must be more than 0 and at most %.', public.money_text(public.money_cap(cur), cur);$f$,
  2);
select pg_temp.patch('public.propose_project_price(uuid, numeric, text)',
  $f$amt := round(new_amount, 2);$f$,
  $f$amt := round(new_amount, public.money_decimals(cur));$f$);
select pg_temp.patch('public.propose_project_price(uuid, numeric, text)',
  $f$p.price_proposed_by = auth.uid() and p.agreed_amount = amt then$f$,
  $f$p.price_proposed_by = auth.uid() and p.agreed_amount = amt and p.currency = cur then$f$);
select pg_temp.patch('public.propose_project_price(uuid, numeric, text)',
  $f$set agreed_amount = amt, price_basis = basis, price_status = 'proposed',$f$,
  $f$set agreed_amount = amt, currency = cur, price_basis = basis, price_status = 'proposed',$f$);
select pg_temp.patch('public.propose_project_price(uuid, numeric, text)',
  $f$public.price_text(amt, basis)$f$,
  $f$public.price_text(amt, basis, cur)$f$);

-- ---------------------------------------------------------------------------
-- 6. Recording payments
-- ---------------------------------------------------------------------------

-- record_payment, new form that also says how the money was sent (pay_method).
select pg_temp.patch_copy('public.record_payment(uuid, numeric, numeric, text, text)',
  'public.record_payment(uuid, numeric, numeric, text, text, text)',
  $f$public.record_payment(target_project uuid, pay_amount numeric, pay_tip numeric, pay_reference text, pay_receipt_path text)$f$,
  $f$public.record_payment(target_project uuid, pay_amount numeric, pay_tip numeric, pay_reference text, pay_receipt_path text, pay_method text)$f$);
select pg_temp.patch('public.record_payment(uuid, numeric, numeric, text, text, text)',
  $f$select id, title, client_id, freelancer_id, agreed_amount, price_basis, price_status into proj$f$,
  $f$select id, title, client_id, freelancer_id, agreed_amount, price_basis, price_status, currency into proj$f$);
select pg_temp.patch('public.record_payment(uuid, numeric, numeric, text, text, text)',
  $f$if pay_amount is null or pay_amount <= 0 or pay_amount > 1000000 then$f$,
  $f$if pay_amount is null or pay_amount <= 0 or pay_amount > public.money_cap(proj.currency) then$f$);
select pg_temp.patch('public.record_payment(uuid, numeric, numeric, text, text, text)',
  $f$raise exception 'The amount must be more than 0 and at most 1,000,000 pesos.';$f$,
  $f$raise exception 'The amount must be more than 0 and at most %.', public.money_text(public.money_cap(proj.currency), proj.currency);$f$);
select pg_temp.patch('public.record_payment(uuid, numeric, numeric, text, text, text)',
  $f$if pay_amount <> round(pay_amount, 2) or tip <> round(tip, 2) then$f$,
  $f$if pay_amount <> round(pay_amount, public.money_decimals(proj.currency)) or tip <> round(tip, public.money_decimals(proj.currency)) then$f$);
select pg_temp.patch('public.record_payment(uuid, numeric, numeric, text, text, text)',
  $f$raise exception 'The amount can have up to 2 decimals.';$f$,
  $f$raise exception '%', public.decimals_message(proj.currency);$f$);
select pg_temp.patch('public.record_payment(uuid, numeric, numeric, text, text, text)',
  $f$if ref !~ '^[0-9]{13}$' then$f$,
  $f$perform public.check_payment_way(proj.currency, pay_method, ref);
  if proj.currency = 'PHP' and ref !~ '^[0-9]{13}$' then$f$);
select pg_temp.patch('public.record_payment(uuid, numeric, numeric, text, text, text)',
  $f$raise exception 'Only ₱% is left to pay on this project. Put anything extra in the Tip box.', to_char(left_now, 'FM999,999,990.00');$f$,
  $f$raise exception 'Only % is left to pay on this project. Put anything extra in the Tip box.', public.money_text(left_now, proj.currency);$f$);
select pg_temp.patch('public.record_payment(uuid, numeric, numeric, text, text, text)',
  $f$raise exception 'A tip can be added only when this payment pays everything that is left (₱%).', to_char(left_now, 'FM999,999,990.00');$f$,
  $f$raise exception 'A tip can be added only when this payment pays everything that is left (%).', public.money_text(left_now, proj.currency);$f$);
select pg_temp.patch('public.record_payment(uuid, numeric, numeric, text, text, text)',
  $f$insert into public.payments (project_id, client_id, freelancer_id, amount, tip_amount, reference_no, receipt_path)$f$,
  $f$insert into public.payments (project_id, client_id, freelancer_id, amount, tip_amount, reference_no, receipt_path, currency, method)$f$);
select pg_temp.patch('public.record_payment(uuid, numeric, numeric, text, text, text)',
  $f$values (proj.id, proj.client_id, proj.freelancer_id, pay_amount, tip, ref, pay_receipt_path)$f$,
  $f$values (proj.id, proj.client_id, proj.freelancer_id, pay_amount, tip, ref, pay_receipt_path, proj.currency, pay_method)$f$);
select pg_temp.patch('public.record_payment(uuid, numeric, numeric, text, text, text)',
  $f$client_name || ' says they sent ₱' || to_char(pay_amount, 'FM999,999,990.00')$f$,
  $f$client_name || ' says they sent ' || public.money_text(pay_amount, proj.currency)$f$);
select pg_temp.patch('public.record_payment(uuid, numeric, numeric, text, text, text)',
  $f$case when tip > 0 then ' (₱' || to_char(price_part, 'FM999,999,990.00') || ' + ₱' || to_char(tip, 'FM999,999,990.00') || ' tip)' else '' end$f$,
  $f$case when tip > 0 then ' (' || public.money_text(price_part, proj.currency) || ' + ' || public.money_text(tip, proj.currency) || ' tip)' else '' end$f$);
select pg_temp.patch('public.record_payment(uuid, numeric, numeric, text, text, text)',
  $f$'Check your GCash, then confirm it on the project page.'$f$,
  $f$case when proj.currency = 'PHP' then 'Check your GCash, then confirm it on the project page.' else 'Check that it arrived, then confirm it on the project page.' end$f$);

-- record_chat_payment, the same for a payment asked for in a chat.
select pg_temp.patch_copy('public.record_chat_payment(uuid, numeric, numeric, text, text)',
  'public.record_chat_payment(uuid, numeric, numeric, text, text, text)',
  $f$public.record_chat_payment(target_payment uuid, pay_amount numeric, pay_tip numeric, pay_reference text, pay_receipt_path text)$f$,
  $f$public.record_chat_payment(target_payment uuid, pay_amount numeric, pay_tip numeric, pay_reference text, pay_receipt_path text, pay_method text)$f$);
select pg_temp.patch('public.record_chat_payment(uuid, numeric, numeric, text, text, text)',
  $f$if pay_amount is null or pay_amount <= 0 or pay_amount > 1000000 then$f$,
  $f$if pay_amount is null or pay_amount <= 0 or pay_amount > public.money_cap(pay.currency) then$f$);
select pg_temp.patch('public.record_chat_payment(uuid, numeric, numeric, text, text, text)',
  $f$raise exception 'The amount must be more than 0 and at most 1,000,000 pesos.';$f$,
  $f$raise exception 'The amount must be more than 0 and at most %.', public.money_text(public.money_cap(pay.currency), pay.currency);$f$);
select pg_temp.patch('public.record_chat_payment(uuid, numeric, numeric, text, text, text)',
  $f$if pay_amount <> round(pay_amount, 2) or tip <> round(tip, 2) then$f$,
  $f$if pay_amount <> round(pay_amount, public.money_decimals(pay.currency)) or tip <> round(tip, public.money_decimals(pay.currency)) then$f$);
select pg_temp.patch('public.record_chat_payment(uuid, numeric, numeric, text, text, text)',
  $f$raise exception 'The amount can have up to 2 decimals.';$f$,
  $f$raise exception '%', public.decimals_message(pay.currency);$f$);
select pg_temp.patch('public.record_chat_payment(uuid, numeric, numeric, text, text, text)',
  $f$if ref !~ '^[0-9]{13}$' then$f$,
  $f$perform public.check_payment_way(pay.currency, pay_method, ref);
  if pay.currency = 'PHP' and ref !~ '^[0-9]{13}$' then$f$);
select pg_temp.patch('public.record_chat_payment(uuid, numeric, numeric, text, text, text)',
  $f$set status = 'sent', amount = pay_amount, tip_amount = tip, reference_no = ref,$f$,
  $f$set status = 'sent', amount = pay_amount, tip_amount = tip, reference_no = ref, method = pay_method,$f$);
select pg_temp.patch('public.record_chat_payment(uuid, numeric, numeric, text, text, text)',
  $f$payer_name || ' says they sent ₱' || to_char(pay_amount, 'FM999,999,990.00')$f$,
  $f$payer_name || ' says they sent ' || public.money_text(pay_amount, pay.currency)$f$);
select pg_temp.patch('public.record_chat_payment(uuid, numeric, numeric, text, text, text)',
  $f$case when tip > 0 then ' (₱' || to_char(pay_amount - tip, 'FM999,999,990.00') || ' + ₱' || to_char(tip, 'FM999,999,990.00') || ' tip)' else '' end$f$,
  $f$case when tip > 0 then ' (' || public.money_text(pay_amount - tip, pay.currency) || ' + ' || public.money_text(tip, pay.currency) || ' tip)' else '' end$f$);
select pg_temp.patch('public.record_chat_payment(uuid, numeric, numeric, text, text, text)',
  $f$'Check your GCash, then confirm it on the card in the chat.'$f$,
  $f$case when pay.currency = 'PHP' then 'Check your GCash, then confirm it on the card in the chat.' else 'Check that it arrived, then confirm it on the card in the chat.' end$f$);

-- request_payment, new form with a currency. A request in pesos still needs GCash
-- details; any other currency needs the other payment details.
select pg_temp.patch_copy('public.request_payment(uuid, numeric, text)',
  'public.request_payment(uuid, numeric, text, text)',
  $f$public.request_payment(target_conversation uuid, req_amount numeric, req_note text)$f$,
  $f$public.request_payment(target_conversation uuid, req_amount numeric, req_note text, req_currency text)$f$);
select pg_temp.patch('public.request_payment(uuid, numeric, text, text)',
  $f$amount_text text;$f$,
  $f$amount_text text;
  cur text := coalesce(req_currency, 'PHP');$f$);
select pg_temp.patch('public.request_payment(uuid, numeric, text, text)',
  $f$if not exists (select 1 from public.gcash_accounts where freelancer_id = me) then$f$,
  $f$if not exists (select 1 from public.currencies c where c.code = cur) then
    raise exception 'Pick a currency from the list.';
  end if;
  if cur <> 'PHP' and not exists (select 1 from public.payment_details d where d.freelancer_id = me) then
    raise exception 'Add your payment details for other currencies in Settings first (PayPal, Wise, bank...), so the other person can see where to pay.';
  end if;
  if cur = 'PHP' and not exists (select 1 from public.gcash_accounts where freelancer_id = me) then$f$);
select pg_temp.patch('public.request_payment(uuid, numeric, text, text)',
  $f$if req_amount is null or req_amount <= 0 or req_amount > 1000000 then$f$,
  $f$if req_amount is null or req_amount <= 0 or req_amount > public.money_cap(cur) then$f$);
select pg_temp.patch('public.request_payment(uuid, numeric, text, text)',
  $f$raise exception 'The amount must be more than 0 and at most 1,000,000 pesos.';$f$,
  $f$raise exception 'The amount must be more than 0 and at most %.', public.money_text(public.money_cap(cur), cur);$f$);
select pg_temp.patch('public.request_payment(uuid, numeric, text, text)',
  $f$if req_amount <> round(req_amount, 2) then$f$,
  $f$if req_amount <> round(req_amount, public.money_decimals(cur)) then$f$);
select pg_temp.patch('public.request_payment(uuid, numeric, text, text)',
  $f$raise exception 'The amount can have up to 2 decimals.';$f$,
  $f$raise exception '%', public.decimals_message(cur);$f$);
select pg_temp.patch('public.request_payment(uuid, numeric, text, text)',
  $f$insert into public.payments (conversation_id, client_id, freelancer_id, amount, note, status)$f$,
  $f$insert into public.payments (conversation_id, client_id, freelancer_id, amount, note, status, currency)$f$);
select pg_temp.patch('public.request_payment(uuid, numeric, text, text)',
  $f$values (target_conversation, payer, me, req_amount, note_text, 'requested')$f$,
  $f$values (target_conversation, payer, me, req_amount, note_text, 'requested', cur)$f$);
select pg_temp.patch('public.request_payment(uuid, numeric, text, text)',
  $f$amount_text := to_char(req_amount, 'FM999,999,990.00');$f$,
  $f$amount_text := public.money_text(req_amount, cur);$f$);
select pg_temp.patch('public.request_payment(uuid, numeric, text, text)',
  $f$'Payment request: ₱' || amount_text$f$,
  $f$'Payment request: ' || amount_text$f$);
select pg_temp.patch('public.request_payment(uuid, numeric, text, text)',
  $f$' asked for ₱' || amount_text$f$,
  $f$' asked for ' || amount_text$f$);

-- ---------------------------------------------------------------------------
-- 7. Answers, reminders and blocks name the amount in its currency
-- ---------------------------------------------------------------------------

select pg_temp.patch('public.confirm_payment(uuid)',
  $f$' confirmed your payment of ₱' || to_char(pay.amount, 'FM999,999,990.00')$f$,
  $f$' confirmed your payment of ' || public.money_text(pay.amount, pay.currency)$f$);

select pg_temp.patch('public.mark_payment_not_received(uuid)',
  $f$' says your payment of ₱' || to_char(pay.amount, 'FM999,999,990.00')$f$,
  $f$' says your payment of ' || public.money_text(pay.amount, pay.currency)$f$);

select pg_temp.patch('public.confirm_short_payment(uuid, numeric)',
  $f$raise exception 'Enter how much arrived in your GCash. If nothing arrived, answer Not received.';$f$,
  $f$raise exception '%', case when pay.currency = 'PHP' then 'Enter how much arrived in your GCash. If nothing arrived, answer Not received.' else 'Enter how much arrived. If nothing arrived, answer Not received.' end;$f$);
select pg_temp.patch('public.confirm_short_payment(uuid, numeric)',
  $f$if got_amount <> round(got_amount, 2) then$f$,
  $f$if got_amount <> round(got_amount, public.money_decimals(pay.currency)) then$f$);
select pg_temp.patch('public.confirm_short_payment(uuid, numeric)',
  $f$raise exception 'The amount can have up to 2 decimals.';$f$,
  $f$raise exception '%', public.decimals_message(pay.currency);$f$);
select pg_temp.patch('public.confirm_short_payment(uuid, numeric)',
  $f$raise exception 'That is the whole amount (₱%). Use Confirm received instead.', to_char(pay.amount, 'FM999,999,990.00');$f$,
  $f$raise exception 'That is the whole amount (%). Use Confirm received instead.', public.money_text(pay.amount, pay.currency);$f$);
select pg_temp.patch('public.confirm_short_payment(uuid, numeric)',
  $f$next_step := '₱' || to_char(left_after, 'FM999,999,990.00') || ' of the agreed price$f$,
  $f$next_step := public.money_text(left_after, pay.currency) || ' of the agreed price$f$);
select pg_temp.patch('public.confirm_short_payment(uuid, numeric)',
  $f$freelancer_name || ' checked their GCash: ₱' || to_char(got_amount, 'FM999,999,990.00')$f$,
  $f$freelancer_name || case when pay.currency = 'PHP' then ' checked their GCash: ' else ' checked their account: ' end || public.money_text(got_amount, pay.currency)$f$);
select pg_temp.patch('public.confirm_short_payment(uuid, numeric)',
  $f$|| ' arrived, not ₱' || to_char(pay.amount, 'FM999,999,990.00') || what$f$,
  $f$|| ' arrived, not ' || public.money_text(pay.amount, pay.currency) || what$f$);

select pg_temp.patch('public.remind_unpaid_on_done()',
  $f$'" was accepted automatically, and ₱'$f$,
  $f$'" was accepted automatically, and '$f$);
select pg_temp.patch('public.remind_unpaid_on_done()',
  $f$'" as done, but ₱' end || to_char(left_amount, 'FM999,999,990.00')$f$,
  $f$'" as done, but ' end || public.money_text(left_amount, new.currency)$f$);
select pg_temp.patch('public.remind_unpaid_on_done()',
  $f$|| ' of the agreed ₱' || to_char(new.agreed_amount, 'FM999,999,990.00') || ' is still unpaid.'$f$,
  $f$|| ' of the agreed ' || public.money_text(new.agreed_amount, new.currency) || ' is still unpaid.'$f$);
select pg_temp.patch('public.remind_unpaid_on_done()',
  $f$'Pay the rest in GCash, then record it on the project page.'$f$,
  $f$case when new.currency = 'PHP' then 'Pay the rest in GCash, then record it on the project page.' else 'Pay the rest, then record it on the project page.' end$f$);

select pg_temp.patch('public.block_if_client_owes(uuid)',
  $f$public.project_paid_amount(p.id, true) as unpaid,$f$,
  $f$public.project_paid_amount(p.id, true) as unpaid, p.currency,$f$);
select pg_temp.patch('public.block_if_client_owes(uuid)',
  $f$'₱' || to_char(owed.unpaid, 'FM999,999,990.00')$f$,
  $f$public.money_text(owed.unpaid, owed.currency)$f$);

-- The daily 8:00 AM notices: payment reminders and the "waiting for your answer" ones.
select pg_temp.patch('public.send_daily_notices()',
  $f$public.project_paid_amount(p.id, true) as unpaid,$f$,
  $f$public.project_paid_amount(p.id, true) as unpaid, p.currency,$f$);
select pg_temp.patch('public.send_daily_notices()',
  $f$amount_text := '₱' || to_char(pay.unpaid, 'FM999,999,990.00');$f$,
  $f$amount_text := public.money_text(pay.unpaid, pay.currency);$f$);
select pg_temp.patch('public.send_daily_notices()',
  $f$select p.id, p.amount, p.client_id, p.freelancer_id, p.project_id, p.conversation_id, pr.title,$f$,
  $f$select p.id, p.amount, p.currency, p.client_id, p.freelancer_id, p.project_id, p.conversation_id, pr.title,$f$);
select pg_temp.patch('public.send_daily_notices()',
  $f$amount_text := '₱' || to_char(pay.amount, 'FM999,999,990.00');$f$,
  $f$amount_text := public.money_text(pay.amount, pay.currency);$f$);
select pg_temp.patch('public.send_daily_notices()',
  $f$'Pay the rest in GCash, then record it on the project page.'$f$,
  $f$case when pay.currency = 'PHP' then 'Pay the rest in GCash, then record it on the project page.' else 'Pay the rest, then record it on the project page.' end$f$,
  2);
select pg_temp.patch('public.send_daily_notices()',
  $f$'Check your GCash, then confirm it. If less arrived, answer Received less; if nothing arrived, answer Not received.'$f$,
  $f$case when pay.currency = 'PHP' then 'Check your GCash, then confirm it. If less arrived, answer Received less; if nothing arrived, answer Not received.' else 'Check that it arrived, then confirm it. If less arrived, answer Received less; if nothing arrived, answer Not received.' end$f$);
select pg_temp.patch('public.send_daily_notices()',
  $f$'Please check your GCash and answer it. After 7 days '$f$,
  $f$case when pay.currency = 'PHP' then 'Please check your GCash and answer it. After 7 days ' else 'Please check that it arrived and answer it. After 7 days ' end$f$);
select pg_temp.patch('public.send_daily_notices()',
  $f$'Please check your GCash and answer it.'$f$,
  $f$case when pay.currency = 'PHP' then 'Please check your GCash and answer it.' else 'Please check that it arrived and answer it.' end$f$);

-- ---------------------------------------------------------------------------
-- 8. The older forms call the new ones (so the website live today keeps working)
-- ---------------------------------------------------------------------------

-- Two values: keeps the project's currency.
create or replace function public.propose_project_price(target_project uuid, new_amount numeric)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.propose_project_price(target_project, new_amount, null::text);
end;
$$;

-- Five values: the GCash way (pesos). The AI receipt check (record_receipt_payment) uses it.
create or replace function public.record_payment(target_project uuid, pay_amount numeric, pay_tip numeric, pay_reference text, pay_receipt_path text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
begin
  return public.record_payment(target_project, pay_amount, pay_tip, pay_reference, pay_receipt_path, 'gcash');
end;
$$;

create or replace function public.record_chat_payment(target_payment uuid, pay_amount numeric, pay_tip numeric, pay_reference text, pay_receipt_path text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.record_chat_payment(target_payment, pay_amount, pay_tip, pay_reference, pay_receipt_path, 'gcash');
end;
$$;

-- Three values: a request in pesos.
create or replace function public.request_payment(target_conversation uuid, req_amount numeric, req_note text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
begin
  return public.request_payment(target_conversation, req_amount, req_note, 'PHP');
end;
$$;

-- record_payment and record_chat_payment stay inside the database, like their older forms:
-- a payment in pesos can only be recorded through the AI receipt check
-- (record_receipt_payment / record_chat_receipt_payment).
revoke all on function public.record_payment(uuid, numeric, numeric, text, text, text) from public, anon, authenticated;
revoke all on function public.record_chat_payment(uuid, numeric, numeric, text, text, text) from public, anon, authenticated;

-- What the website calls for a payment in any other currency. Pesos are refused here, so
-- the GCash way can't skip the receipt check.
create or replace function public.record_other_payment(target_project uuid, pay_amount numeric, pay_tip numeric, pay_method text, pay_reference text, pay_receipt_path text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (select 1 from public.projects p where p.id = target_project and p.currency = 'PHP') then
    raise exception 'Payments in pesos are recorded with the GCash receipt check.';
  end if;
  return public.record_payment(target_project, pay_amount, pay_tip, pay_reference, pay_receipt_path, pay_method);
end;
$$;

create or replace function public.record_other_chat_payment(target_payment uuid, pay_amount numeric, pay_tip numeric, pay_method text, pay_reference text, pay_receipt_path text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (select 1 from public.payments p where p.id = target_payment and p.currency = 'PHP') then
    raise exception 'Payments in pesos are recorded with the GCash receipt check.';
  end if;
  perform public.record_chat_payment(target_payment, pay_amount, pay_tip, pay_reference, pay_receipt_path, pay_method);
end;
$$;

-- The new forms people can call: signed-in people only, like the old ones.
revoke all on function public.propose_project_price(uuid, numeric, text) from public, anon;
revoke all on function public.request_payment(uuid, numeric, text, text) from public, anon;
revoke all on function public.record_other_payment(uuid, numeric, numeric, text, text, text) from public, anon;
revoke all on function public.record_other_chat_payment(uuid, numeric, numeric, text, text, text) from public, anon;
grant execute on function public.propose_project_price(uuid, numeric, text) to authenticated;
grant execute on function public.request_payment(uuid, numeric, text, text) to authenticated;
grant execute on function public.record_other_payment(uuid, numeric, numeric, text, text, text) to authenticated;
grant execute on function public.record_other_chat_payment(uuid, numeric, numeric, text, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 9. Self-check: undo every edit on paper; the result must be the function as it was
-- ---------------------------------------------------------------------------

do $$
declare
  b record;
  e record;
  src text;
begin
  for b in select fn, base_src from pg_temp.currency_patch_base loop
    src := pg_get_functiondef(b.fn::regprocedure);
    for e in select from_text, to_text from pg_temp.currency_patch_log where fn = b.fn order by seq desc loop
      src := replace(src, e.to_text, e.from_text);
    end loop;
    if src is distinct from b.base_src then
      raise exception 'Self-check failed for %: something other than the planned edits changed.', b.fn;
    end if;
  end loop;
end $$;
