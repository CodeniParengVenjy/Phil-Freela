-- Short payments ("kulang") and tips (PLAN-short-payment.md, Step 1). Run this in
-- the Supabase SQL Editor after supabase_payments_schema.sql,
-- supabase_chat_payments_schema.sql, supabase_project_price_schema.sql and
-- supabase_deliverable_lock_schema.sql.
--
-- PhilFreela still never sees GCash: the freelancer's own GCash is the check.
-- What this adds:
--   * the freelancer can answer "Received less" and say how much really arrived;
--   * the client can add an optional tip on top of the price;
--   * a one-time project with an agreed price keeps a balance: the agreed price
--     minus what the freelancer confirmed;
--   * that project's original file opens only when it is FULLY paid (the user's
--     choice, 2026-11-08). Projects without an agreed one-time price keep the old
--     rule: any confirmed payment opens it;
--   * when a project is marked Done with money still unpaid, the client is told.
--
-- How a payment's money is counted:
--   amount           what the client says they sent in GCash (price + tip)
--   tip_amount       the part of it the client marked as a tip (0 = no tip)
--   received_amount  what the freelancer says arrived (set when they answer)
--   counts toward the price = the smaller of received_amount and (amount - tip)
--   So if less arrived, the tip is the first thing that goes missing.

-- ---------------------------------------------------------------------------
-- 1. The columns. Only one payment is on the live database (a cancelled chat
-- request, 2026-11-08), so nothing old needs filling in.
-- ---------------------------------------------------------------------------

alter table public.payments
  add column if not exists tip_amount numeric(10,2) not null default 0,
  add column if not exists received_amount numeric(10,2);

alter table public.payments
  add constraint payments_tip_check check (tip_amount >= 0 and tip_amount <= amount),
  -- A confirmed payment always says how much arrived (never more than was sent);
  -- any other payment has no answer yet.
  add constraint payments_received_check check (
    (status = 'confirmed') = (received_amount is not null)
    and (received_amount is null or (received_amount > 0 and received_amount <= amount))
  );

-- ---------------------------------------------------------------------------
-- 2. The two new notification kinds. The list is copied from the LIVE database
-- (2026-11-08, 26 kinds) plus payment_short and payment_unpaid.
-- ---------------------------------------------------------------------------

alter table public.user_notifications
  drop constraint user_notifications_type_check,
  add constraint user_notifications_type_check check (type = any (array[
    'verification_approved', 'verification_rejected', 'suspension', 'suspension_lifted',
    'appeal_accepted', 'appeal_rejected', 'report_resolved', 'report_dismissed',
    'project_hired', 'project_submitted', 'project_done', 'project_changes', 'project_rated',
    'booking_requested', 'booking_accepted', 'booking_declined', 'booking_cancelled',
    'school_id_pass', 'payment_sent', 'payment_confirmed', 'payment_not_received',
    'payment_requested', 'promotion_approved', 'promotion_rejected', 'price_proposed',
    'price_agreed', 'payment_short', 'payment_unpaid'
  ]::text[]));

-- ---------------------------------------------------------------------------
-- 3. How much of a project's price is paid. Used by the rules below only (the
-- page works out the same numbers from the payments it already shows, see
-- projectMoney() in client/src/lib/payments.js).
--   with_waiting = false: only what the freelancer confirmed.
--   with_waiting = true:  also what the client recorded and the freelancer has
--                         not answered yet (so nobody can pay twice by mistake).
-- ---------------------------------------------------------------------------

create or replace function public.project_paid_amount(target_project uuid, with_waiting boolean)
returns numeric
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(sum(
           case when p.status = 'confirmed' then least(p.received_amount, p.amount - p.tip_amount)
                else p.amount - p.tip_amount end
         ), 0)
    from public.payments p
   where p.project_id = target_project
     and (p.status = 'confirmed' or (with_waiting and p.status = 'sent'));
$$;

revoke execute on function public.project_paid_amount(uuid, boolean) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4. "I've paid" on a project, now with a tip. pay_amount is everything sent in
-- GCash (price + tip), pay_tip the tip part (0 for none). On a one-time project
-- with an agreed price:
--   * the price part can't be more than what is left to pay (anything extra goes
--     in the tip box);
--   * a tip can be added only when this payment pays everything that is left.
-- The rest is the same as before: 13-digit reference used only once, a receipt
-- the client really uploaded, the freelancer is told.
-- ---------------------------------------------------------------------------

create or replace function public.record_payment(target_project uuid, pay_amount numeric, pay_tip numeric, pay_reference text, pay_receipt_path text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  proj record;
  ref text := regexp_replace(coalesce(pay_reference, ''), '\s', '', 'g');
  tip numeric := coalesce(pay_tip, 0);
  price_part numeric;
  left_now numeric;
  client_name text;
  new_payment uuid;
begin
  -- The row is locked, so two payments recorded at the same moment are checked
  -- one after the other against what is left.
  select id, title, client_id, freelancer_id, agreed_amount, price_basis, price_status into proj
    from public.projects where id = target_project for update;

  if not found or proj.client_id <> auth.uid() then
    raise exception 'Only the client of this project can record a payment.';
  end if;
  if pay_amount is null or pay_amount <= 0 or pay_amount > 1000000 then
    raise exception 'The amount must be more than 0 and at most 1,000,000 pesos.';
  end if;
  if pay_amount <> round(pay_amount, 2) or tip <> round(tip, 2) then
    raise exception 'The amount can have up to 2 decimals.';
  end if;
  if tip < 0 or tip > pay_amount then
    raise exception 'The tip must be between 0 and the amount you sent.';
  end if;
  if ref !~ '^[0-9]{13}$' then
    raise exception 'The GCash reference number is 13 digits.';
  end if;
  if pay_receipt_path is null
     or pay_receipt_path !~ ('^' || auth.uid()::text || '/[^/]+$')
     or not exists (
       select 1 from storage.objects o
        where o.bucket_id = 'receipts' and o.name = pay_receipt_path
     ) then
    raise exception 'Attach your receipt screenshot to continue.';
  end if;
  if exists (
    select 1 from public.payments where reference_no = ref and status <> 'not_received'
  ) then
    raise exception 'This reference number was already recorded.';
  end if;

  -- The balance rules, only for a one-time project with an agreed price.
  price_part := pay_amount - tip;
  if proj.price_status = 'agreed' and proj.price_basis = 'project' then
    left_now := greatest(proj.agreed_amount - public.project_paid_amount(proj.id, true), 0);
    if price_part > left_now then
      if left_now = 0 then
        raise exception 'This project is already fully paid, or the rest is waiting for the freelancer to confirm. To send extra, put it in the Tip box.';
      end if;
      raise exception 'Only ₱% is left to pay on this project. Put anything extra in the Tip box.', to_char(left_now, 'FM999,999,990.00');
    end if;
    if tip > 0 and price_part < left_now then
      raise exception 'A tip can be added only when this payment pays everything that is left (₱%).', to_char(left_now, 'FM999,999,990.00');
    end if;
  end if;

  begin
    insert into public.payments (project_id, client_id, freelancer_id, amount, tip_amount, reference_no, receipt_path)
    values (proj.id, proj.client_id, proj.freelancer_id, pay_amount, tip, ref, pay_receipt_path)
    returning id into new_payment;
  exception when unique_violation then
    raise exception 'This reference number was already recorded.';
  end;

  select coalesce(nullif(full_name, ''), username, 'A client') into client_name
    from public.profiles where id = auth.uid();

  insert into public.user_notifications (user_id, type, title, message, link)
  values (
    proj.freelancer_id, 'payment_sent', 'Payment sent',
    client_name || ' says they sent ₱' || to_char(pay_amount, 'FM999,999,990.00')
      || case when tip > 0 then ' (₱' || to_char(price_part, 'FM999,999,990.00') || ' + ₱' || to_char(tip, 'FM999,999,990.00') || ' tip)' else '' end
      || ' for "' || proj.title || '".'
      || E'\n\n' || 'Check your GCash, then confirm it on the project page.',
    '/dashboard/project-details/' || proj.id
  );

  return new_payment;
end;
$$;

revoke execute on function public.record_payment(uuid, numeric, numeric, text, text) from public, anon;
grant execute on function public.record_payment(uuid, numeric, numeric, text, text) to authenticated;

-- The old version without a tip stays, so the page that is live while the new
-- one deploys keeps working. It is the same as a payment with no tip.
create or replace function public.record_payment(target_project uuid, pay_amount numeric, pay_reference text, pay_receipt_path text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
begin
  return public.record_payment(target_project, pay_amount, 0::numeric, pay_reference, pay_receipt_path);
end;
$$;

revoke execute on function public.record_payment(uuid, numeric, text, text) from public, anon;
grant execute on function public.record_payment(uuid, numeric, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 5. "I've paid" on a chat payment card, now with a tip. A chat payment has no
-- project, so there is no balance: the tip only has to be between 0 and the
-- amount sent. Otherwise the same as before.
-- ---------------------------------------------------------------------------

create or replace function public.record_chat_payment(target_payment uuid, pay_amount numeric, pay_tip numeric, pay_reference text, pay_receipt_path text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  pay record;
  ref text := regexp_replace(coalesce(pay_reference, ''), '\s', '', 'g');
  tip numeric := coalesce(pay_tip, 0);
  payer_name text;
begin
  select * into pay from public.payments where id = target_payment for update;

  if not found or pay.client_id <> auth.uid() or pay.conversation_id is null then
    raise exception 'Only the person asked to pay can record this payment.';
  end if;
  if pay.status <> 'requested' then
    raise exception 'This request was already paid or cancelled.';
  end if;
  if pay_amount is null or pay_amount <= 0 or pay_amount > 1000000 then
    raise exception 'The amount must be more than 0 and at most 1,000,000 pesos.';
  end if;
  if pay_amount <> round(pay_amount, 2) or tip <> round(tip, 2) then
    raise exception 'The amount can have up to 2 decimals.';
  end if;
  if tip < 0 or tip > pay_amount then
    raise exception 'The tip must be between 0 and the amount you sent.';
  end if;
  if ref !~ '^[0-9]{13}$' then
    raise exception 'The GCash reference number is 13 digits.';
  end if;
  if pay_receipt_path is null
     or pay_receipt_path !~ ('^' || auth.uid()::text || '/[^/]+$')
     or not exists (
       select 1 from storage.objects o
        where o.bucket_id = 'receipts' and o.name = pay_receipt_path
     ) then
    raise exception 'Attach your receipt screenshot to continue.';
  end if;
  if exists (
    select 1 from public.payments where reference_no = ref and status <> 'not_received'
  ) then
    raise exception 'This reference number was already recorded.';
  end if;

  begin
    update public.payments
       set status = 'sent', amount = pay_amount, tip_amount = tip, reference_no = ref,
           receipt_path = pay_receipt_path, created_at = now()
     where id = pay.id;
  exception when unique_violation then
    raise exception 'This reference number was already recorded.';
  end;

  select coalesce(nullif(full_name, ''), username, 'The other person') into payer_name
    from public.profiles where id = auth.uid();

  insert into public.user_notifications (user_id, type, title, message, link)
  values (
    pay.freelancer_id, 'payment_sent', 'Payment sent',
    payer_name || ' says they sent ₱' || to_char(pay_amount, 'FM999,999,990.00')
      || case when tip > 0 then ' (₱' || to_char(pay_amount - tip, 'FM999,999,990.00') || ' + ₱' || to_char(tip, 'FM999,999,990.00') || ' tip)' else '' end
      || coalesce(' (' || pay.note || ')', '') || '.'
      || E'\n\n' || 'Check your GCash, then confirm it on the card in the chat.',
    '/dashboard/chat/' || pay.conversation_id
  );
end;
$$;

revoke execute on function public.record_chat_payment(uuid, numeric, numeric, text, text) from public, anon;
grant execute on function public.record_chat_payment(uuid, numeric, numeric, text, text) to authenticated;

-- The old version without a tip stays for the page that is live right now.
create or replace function public.record_chat_payment(target_payment uuid, pay_amount numeric, pay_reference text, pay_receipt_path text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.record_chat_payment(target_payment, pay_amount, 0::numeric, pay_reference, pay_receipt_path);
end;
$$;

revoke execute on function public.record_chat_payment(uuid, numeric, text, text) from public, anon;
grant execute on function public.record_chat_payment(uuid, numeric, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 6. "Confirm received": the same as before, and it now also saves that the
-- whole amount arrived (received_amount = amount).
-- ---------------------------------------------------------------------------

create or replace function public.confirm_payment(target_payment uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  pay record;
  proj_title text;
  freelancer_name text;
  what text;
  open_link text;
begin
  select * into pay from public.payments where id = target_payment for update;

  if not found or pay.freelancer_id <> auth.uid() then
    raise exception 'Only the freelancer who was paid can answer this payment.';
  end if;
  if pay.status = 'requested' then
    raise exception 'This payment hasn''t been recorded yet.';
  end if;
  if pay.status <> 'sent' then
    raise exception 'This payment was already answered.';
  end if;

  update public.payments
     set status = 'confirmed', received_amount = pay.amount, answered_at = now()
   where id = pay.id;

  if pay.project_id is not null then
    select title into proj_title from public.projects where id = pay.project_id;
    what := ' for "' || coalesce(proj_title, 'the project') || '"';
    open_link := '/dashboard/project-details/' || pay.project_id;
  else
    what := coalesce(' (' || pay.note || ')', '');
    open_link := '/dashboard/chat/' || pay.conversation_id;
  end if;
  select coalesce(nullif(full_name, ''), username, 'The freelancer') into freelancer_name
    from public.profiles where id = auth.uid();

  insert into public.user_notifications (user_id, type, title, message, link)
  values (
    pay.client_id, 'payment_confirmed', 'Payment confirmed',
    freelancer_name || ' confirmed your payment of ₱' || to_char(pay.amount, 'FM999,999,990.00') || what || '.',
    open_link
  );
end;
$$;

revoke execute on function public.confirm_payment(uuid) from public, anon;
grant execute on function public.confirm_payment(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 7. "Received less" (new). Only the freelancer who was paid, only while the
-- payment is "sent". got_amount is what really arrived in their GCash: more than
-- 0 and LESS than what the client recorded (if all of it arrived, that is
-- Confirm received). The payment becomes "confirmed" with that amount, so only
-- what arrived counts toward the price, and the client is told what is still
-- unpaid.
-- ---------------------------------------------------------------------------

create or replace function public.confirm_short_payment(target_payment uuid, got_amount numeric)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  pay record;
  proj record;
  freelancer_name text;
  what text;
  open_link text;
  next_step text;
  left_after numeric;
begin
  select * into pay from public.payments where id = target_payment for update;

  if not found or pay.freelancer_id <> auth.uid() then
    raise exception 'Only the freelancer who was paid can answer this payment.';
  end if;
  if pay.status = 'requested' then
    raise exception 'This payment hasn''t been recorded yet.';
  end if;
  if pay.status <> 'sent' then
    raise exception 'This payment was already answered.';
  end if;
  if got_amount is null or got_amount <= 0 then
    raise exception 'Enter how much arrived in your GCash. If nothing arrived, answer Not received.';
  end if;
  if got_amount <> round(got_amount, 2) then
    raise exception 'The amount can have up to 2 decimals.';
  end if;
  if got_amount >= pay.amount then
    raise exception 'That is the whole amount (₱%). Use Confirm received instead.', to_char(pay.amount, 'FM999,999,990.00');
  end if;

  update public.payments
     set status = 'confirmed', received_amount = got_amount, answered_at = now()
   where id = pay.id;

  select coalesce(nullif(full_name, ''), username, 'The freelancer') into freelancer_name
    from public.profiles where id = auth.uid();

  if pay.project_id is not null then
    select title, agreed_amount, price_basis, price_status into proj from public.projects where id = pay.project_id;
    what := ' for "' || coalesce(proj.title, 'the project') || '"';
    open_link := '/dashboard/project-details/' || pay.project_id;
    next_step := 'Message them to sort it out, then record what you send next on the project page.';
    if proj.price_status = 'agreed' and proj.price_basis = 'project' then
      left_after := greatest(proj.agreed_amount - public.project_paid_amount(pay.project_id, false), 0);
      if left_after > 0 then
        next_step := '₱' || to_char(left_after, 'FM999,999,990.00') || ' of the agreed price is still unpaid. Open the project to pay the rest.';
      else
        next_step := 'The agreed price is fully paid, so only the tip came up short.';
      end if;
    end if;
  else
    what := coalesce(' (' || pay.note || ')', '');
    open_link := '/dashboard/chat/' || pay.conversation_id;
    next_step := 'Message them to sort it out.';
  end if;

  insert into public.user_notifications (user_id, type, title, message, link)
  values (
    pay.client_id, 'payment_short', 'Less than you recorded arrived',
    freelancer_name || ' checked their GCash: ₱' || to_char(got_amount, 'FM999,999,990.00')
      || ' arrived, not ₱' || to_char(pay.amount, 'FM999,999,990.00') || what || '.'
      || E'\n\n' || next_step,
    open_link
  );
end;
$$;

revoke execute on function public.confirm_short_payment(uuid, numeric) from public, anon;
grant execute on function public.confirm_short_payment(uuid, numeric) to authenticated;

-- ---------------------------------------------------------------------------
-- 8. Unlocking (replaces the rule in supabase_deliverable_lock_schema.sql, same
-- trigger). A one-time project with an agreed price opens only when what the
-- freelancer confirmed covers the whole price. Any other project opens on any
-- confirmed payment, as before. Once open, it stays open.
-- ---------------------------------------------------------------------------

create or replace function public.unlock_project_files()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  proj record;
begin
  select agreed_amount, price_basis, price_status, unlocked_at into proj
    from public.projects where id = new.project_id;

  if not found or proj.unlocked_at is not null then
    return new;
  end if;
  if proj.price_status = 'agreed' and proj.price_basis = 'project'
     and public.project_paid_amount(new.project_id, false) < proj.agreed_amount then
    return new;  -- not fully paid yet: stays locked
  end if;

  update public.projects set unlocked_at = now()
   where id = new.project_id and unlocked_at is null;
  return new;
end;
$$;

revoke execute on function public.unlock_project_files() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 9. Marked Done with money still unpaid: the client is told once. Only a
-- one-time project with an agreed price has a total to compare with; a payment
-- still waiting for the freelancer's answer counts as paid here, so nobody is
-- reminded about money they already sent.
-- ---------------------------------------------------------------------------

create or replace function public.remind_unpaid_on_done()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  left_amount numeric;
begin
  if new.price_status <> 'agreed' or new.price_basis <> 'project' then
    return new;
  end if;

  left_amount := new.agreed_amount - public.project_paid_amount(new.id, true);
  if left_amount > 0 then
    insert into public.user_notifications (user_id, type, title, message, link)
    values (
      new.client_id, 'payment_unpaid', 'Payment still unpaid',
      'You marked "' || new.title || '" as done, but ₱' || to_char(left_amount, 'FM999,999,990.00')
        || ' of the agreed ₱' || to_char(new.agreed_amount, 'FM999,999,990.00') || ' is still unpaid.'
        || E'\n\n' || 'Pay the rest in GCash, then record it on the project page.',
      '/dashboard/project-details/' || new.id
    );
  end if;
  return new;
end;
$$;

revoke execute on function public.remind_unpaid_on_done() from public, anon, authenticated;

create or replace trigger projects_remind_unpaid_on_done
  after update of status on public.projects
  for each row
  when (new.status = 'done' and old.status is distinct from 'done')
  execute function public.remind_unpaid_on_done();
