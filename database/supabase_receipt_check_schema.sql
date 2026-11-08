-- AI reads the GCash receipt, Step 1 (see PLAN-receipt-ai.md). Run after
-- supabase_payments_schema.sql, supabase_chat_payments_schema.sql,
-- supabase_gcash_initials_schema.sql and the short-payment schema
-- (PLAN-short-payment.md: tips and what is left to pay), whose five-value
-- record_payment() and record_chat_payment() the functions at the end call.
--
-- Before this, the client typed the amount and the 13-digit reference number and
-- added a receipt screenshot. Now the client only adds the screenshot: the AI
-- service (ai-service/receipt_check.py) reads it, checks it for signs of a fake,
-- saves a clean copy in the private receipts bucket and writes what it read into
-- receipt_checks. Recording the payment then takes everything from that row, so
-- nobody can type in a reference or an amount the receipt doesn't show.
--
-- The old record_payment() and record_chat_payment() keep working for now, so
-- the website that is live while this rolls out still works. They are switched
-- off by supabase_receipt_check_finish.sql once the new website is live.

-- ---------------------------------------------------------------------------
-- 1. receipt_checks: what the AI read on one screenshot
-- ---------------------------------------------------------------------------

create table public.receipt_checks (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.profiles (id) on delete cascade,
  -- Where the payment is for: a project, or a chat payment request (never both).
  project_id uuid references public.projects (id) on delete cascade,
  payment_id uuid references public.payments (id) on delete cascade,
  -- The clean copy the AI service saved: "<client id>/receipt-....jpg". Empty when
  -- the receipt was blocked or unreadable (nothing is kept then).
  receipt_path text,
  -- SHA-256 of the file the client picked, so the very same file can't be used twice.
  picture_hash text not null check (picture_hash ~ '^[0-9a-f]{64}$'),
  -- What the AI read. Empty when it couldn't read that part.
  reference_no text check (reference_no ~ '^[0-9]{13}$'),
  amount numeric(10, 2) check (amount > 0 and amount <= 1000000),
  paid_at timestamptz,
  receipt_name text check (char_length(receipt_name) <= 80),     -- the name as GCash printed it, e.g. "JU*N D."
  receipt_initials text check (char_length(receipt_initials) <= 30), -- e.g. "J. D."
  -- ok = every check passed; check = sent, but the freelancer is asked to look
  -- carefully; blocked = a sign of a fake, it can't be sent; unreadable = blurry
  -- or cut off.
  verdict text not null check (verdict in ('ok', 'check', 'blocked', 'unreadable')),
  reasons text[] not null default '{}',
  created_at timestamptz not null default now(),
  used_at timestamptz,
  constraint receipt_checks_one_place check (num_nonnulls(project_id, payment_id) = 1),
  constraint receipt_checks_own_folder check (receipt_path is null or split_part(receipt_path, '/', 1) = client_id::text),
  -- Only a receipt that may be sent has a saved copy and everything read.
  constraint receipt_checks_sendable check (
    (verdict in ('ok', 'check')) = (receipt_path is not null)
    and (verdict not in ('ok', 'check') or (reference_no is not null and amount is not null and paid_at is not null))
  ),
  constraint receipt_checks_used_only_sendable check (used_at is null or verdict in ('ok', 'check'))
);

create index receipt_checks_client_idx on public.receipt_checks (client_id, created_at desc);
create index receipt_checks_hash_idx on public.receipt_checks (picture_hash);

-- The browser can only read its own checks. Only the AI service (service role,
-- which skips these rules) adds them, and only the functions below mark them used.
alter table public.receipt_checks enable row level security;
revoke all on public.receipt_checks from anon, authenticated;
grant select on public.receipt_checks to authenticated;

create policy "receipt_checks: the client can read their own"
  on public.receipt_checks for select
  to authenticated
  using (client_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- 2. payments: what the AI read is kept on the payment
-- ---------------------------------------------------------------------------

alter table public.payments add column receipt_check_id uuid references public.receipt_checks (id) on delete set null;
alter table public.payments add column paid_at timestamptz;          -- the date and time on the receipt
alter table public.payments add column receipt_initials text check (char_length(receipt_initials) <= 30);
alter table public.payments add column ai_verdict text check (ai_verdict in ('ok', 'check'));
alter table public.payments add column ai_reasons text[];

-- ---------------------------------------------------------------------------
-- 3. Has this receipt been used before? (only the AI service asks)
-- ---------------------------------------------------------------------------

-- Three answers for the AI service:
--   reference_used: the reference number is on a payment that wasn't answered
--                   "Not received" (the same rule as record_payment()).
--   picture_used:   the very same file is on such a payment.
--   same_minute:    this freelancer already has such a payment of the same amount
--                   paid in the same minute (an edited copy of a used receipt
--                   usually keeps the amount and the time). Only "check carefully".
create or replace function public.receipt_reuse(pic_hash text, ref text, pay_amount numeric, pay_time timestamptz, target_freelancer uuid)
returns table (reference_used boolean, picture_used boolean, same_minute boolean)
language sql
stable
security definer
set search_path = public
as $$
  select
    exists (select 1 from public.payments p
             where ref is not null and p.reference_no = ref and p.status <> 'not_received'),
    exists (select 1 from public.payments p
              join public.receipt_checks c on c.id = p.receipt_check_id
             where c.picture_hash = pic_hash and p.status <> 'not_received'),
    exists (select 1 from public.payments p
             where pay_amount is not null and pay_time is not null
               and p.freelancer_id = target_freelancer
               and p.amount = pay_amount
               and p.status <> 'not_received'
               and date_trunc('minute', p.paid_at) = date_trunc('minute', pay_time));
$$;

revoke execute on function public.receipt_reuse(text, text, numeric, timestamptz, uuid) from public, anon, authenticated;
grant execute on function public.receipt_reuse(text, text, numeric, timestamptz, uuid) to service_role;

-- ---------------------------------------------------------------------------
-- 4. Recording a payment from a checked receipt
-- ---------------------------------------------------------------------------

-- The check the caller may use: their own, for this project or request, not
-- blocked, not used yet, made in the last hour. Locks it so it is used once.
create or replace function public.take_receipt_check(target_check uuid, target_project uuid, target_payment uuid)
returns public.receipt_checks
language plpgsql
security definer
set search_path = public
as $$
declare
  chk public.receipt_checks;
begin
  select * into chk from public.receipt_checks where id = target_check for update;

  if not found or chk.client_id <> auth.uid()
     or chk.project_id is distinct from target_project
     or chk.payment_id is distinct from target_payment then
    raise exception 'Add your receipt screenshot again.';
  end if;
  if chk.verdict not in ('ok', 'check') then
    raise exception 'This receipt can''t be sent. Add a different screenshot.';
  end if;
  if chk.used_at is not null then
    raise exception 'This receipt was already recorded.';
  end if;
  if chk.created_at < now() - interval '1 hour' then
    raise exception 'That reading is more than an hour old. Add your receipt screenshot again.';
  end if;
  if exists (
    select 1 from public.payments where reference_no = chk.reference_no and status <> 'not_received'
  ) then
    raise exception 'This reference number was already recorded.';
  end if;

  update public.receipt_checks set used_at = now() where id = chk.id;
  return chk;
end;
$$;

revoke execute on function public.take_receipt_check(uuid, uuid, uuid) from public, anon, authenticated;

-- The line added to the freelancer's notification when the AI asks them to look
-- carefully (empty when every check passed).
create or replace function public.receipt_check_note(chk public.receipt_checks)
returns text
language sql
immutable
set search_path = public
as $$
  select case when chk.verdict = 'check'
    then E'\n\n' || 'PhilFreela''s receipt check asks you to look carefully: '
         || coalesce(chk.reasons[1], 'something on the receipt looks unusual') || '.'
    else '' end;
$$;

revoke execute on function public.receipt_check_note(public.receipt_checks) from public, anon, authenticated;

-- "Record your payment" on a project. Only the project's client, with a check
-- the AI service made for this project. The amount and the reference number
-- come from the check; only the tip is chosen by the client (the short-payment
-- step, PLAN-short-payment.md: the amount read is the total sent, and the tip box
-- splits it). It calls the same record_payment() as before, so every rule there
-- (amount, reference used once, what is left to pay, when a tip is allowed) still
-- applies, then keeps what the AI read on the payment.
create or replace function public.record_receipt_payment(target_project uuid, receipt_check uuid, pay_tip numeric default 0)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  chk public.receipt_checks;
  new_payment uuid;
begin
  if not exists (select 1 from public.projects where id = target_project and client_id = auth.uid()) then
    raise exception 'Only the client of this project can record a payment.';
  end if;

  chk := public.take_receipt_check(receipt_check, target_project, null);
  new_payment := public.record_payment(target_project, chk.amount, coalesce(pay_tip, 0), chk.reference_no, chk.receipt_path);

  update public.payments
     set receipt_check_id = chk.id, paid_at = chk.paid_at, receipt_initials = chk.receipt_initials,
         ai_verdict = chk.verdict, ai_reasons = chk.reasons
   where id = new_payment;

  -- The freelancer's "Payment sent" notice was just written by record_payment()
  -- (in this same transaction, so its time is now()); add the AI's note to it.
  if chk.verdict = 'check' then
    update public.user_notifications n
       set message = n.message || public.receipt_check_note(chk)
      from public.payments p
     where p.id = new_payment
       and n.user_id = p.freelancer_id and n.type = 'payment_sent'
       and n.link = '/dashboard/project-details/' || target_project
       and n.created_at = now();
  end if;

  return new_payment;
end;
$$;

revoke execute on function public.record_receipt_payment(uuid, uuid, numeric) from public, anon;
grant execute on function public.record_receipt_payment(uuid, uuid, numeric) to authenticated;

-- "Record your payment" on a chat payment request. Only the person asked to pay;
-- record_chat_payment() checks the request is still open.
create or replace function public.record_chat_receipt_payment(target_payment uuid, receipt_check uuid, pay_tip numeric default 0)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  chk public.receipt_checks;
  pay record;
begin
  select id, client_id, freelancer_id, conversation_id into pay from public.payments where id = target_payment;
  if not found or pay.client_id <> auth.uid() or pay.conversation_id is null then
    raise exception 'Only the person asked to pay can record this payment.';
  end if;

  chk := public.take_receipt_check(receipt_check, null, target_payment);
  perform public.record_chat_payment(target_payment, chk.amount, coalesce(pay_tip, 0), chk.reference_no, chk.receipt_path);

  update public.payments
     set receipt_check_id = chk.id, paid_at = chk.paid_at, receipt_initials = chk.receipt_initials,
         ai_verdict = chk.verdict, ai_reasons = chk.reasons
   where id = target_payment;

  if chk.verdict = 'check' then
    update public.user_notifications n
       set message = n.message || public.receipt_check_note(chk)
     where n.user_id = pay.freelancer_id and n.type = 'payment_sent'
       and n.link = '/dashboard/chat/' || pay.conversation_id
       and n.created_at = now();
  end if;
end;
$$;

revoke execute on function public.record_chat_receipt_payment(uuid, uuid, numeric) from public, anon;
grant execute on function public.record_chat_receipt_payment(uuid, uuid, numeric) to authenticated;
