-- GCash payments, Step 5: paying from a chat (see PLAN-gcash-payments.md). Run
-- this in the Supabase SQL Editor after supabase_payments_schema.sql,
-- supabase_report_payments_schema.sql and the chat schemas (it changes the
-- messages table).
--
-- The second way to pay. When a deal starts in a private message (no booking), a
-- verified person with GCash details saved can ask for payment in the chat: a
-- payment request card appears in the chat for the other person, with the
-- amount, the note, and (only to them) where to pay. They pay in the GCash app
-- and record it on the card (the same amount, reference number and receipt
-- screenshot as on a project); the freelancer confirms or says Not received.
-- It uses the same payments table as a payment on a project: a payment now
-- belongs to a project OR to a chat, never both. A chat payment adds nothing to
-- ratings or profile history, which stay project-only.
--
-- A card is a message with attachment_type 'payment' and a payment_id. It is
-- made only by request_payment(): the browser can't insert, edit, unsend or
-- remove one. Its text is "Payment request: ₱400.00", so the inbox preview and
-- the offline e-mail work without changing those triggers.

-- ---------------------------------------------------------------------------
-- 1. payments: a payment can belong to a chat
-- ---------------------------------------------------------------------------

-- A request has no reference number or receipt yet (it gets them when the
-- other person records the payment), so both may be empty for now.
alter table public.payments alter column project_id drop not null;
alter table public.payments alter column reference_no drop not null;
alter table public.payments alter column receipt_path drop not null;

alter table public.payments
  add column conversation_id uuid references public.conversations (id) on delete cascade;

-- What the request is for, e.g. "Poster design, first half". It goes through the
-- word filter like every other text people write.
alter table public.payments add column note text;
alter table public.payments add constraint payments_note_check
  check (note is null or char_length(note) <= 100);

-- Exactly one of the two.
alter table public.payments add constraint payments_one_place_check
  check (num_nonnulls(project_id, conversation_id) = 1);

-- requested -> sent -> confirmed or not_received (the freelancer's answer), or
-- requested -> cancelled (the freelancer took the request back).
alter table public.payments drop constraint payments_status_check;
alter table public.payments add constraint payments_status_check
  check (status in ('requested', 'sent', 'confirmed', 'not_received', 'cancelled'));

-- Not answered yet while requested or sent.
alter table public.payments drop constraint payments_answered_check;
alter table public.payments add constraint payments_answered_check
  check ((status in ('requested', 'sent')) = (answered_at is null));

-- The reference number and the receipt come together, and are there from the
-- moment the payment is recorded (not while it is only requested or cancelled).
alter table public.payments add constraint payments_reference_receipt_pair_check
  check ((reference_no is null) = (receipt_path is null));
alter table public.payments add constraint payments_recorded_check
  check ((status in ('requested', 'cancelled')) = (reference_no is null));

create index payments_conversation_id_idx on public.payments (conversation_id) where conversation_id is not null;

-- One open payment per chat at a time: a new request has to wait until the
-- earlier one is answered or cancelled.
create unique index payments_one_open_per_chat_idx
  on public.payments (conversation_id)
  where conversation_id is not null and status in ('requested', 'sent');

create trigger payments_mask_words
  before insert or update of note on public.payments
  for each row execute function public.mask_columns('note');

-- ---------------------------------------------------------------------------
-- 2. messages: the payment card
-- ---------------------------------------------------------------------------

-- If the payment goes away, so does its card.
alter table public.messages
  add column payment_id uuid references public.payments (id) on delete cascade;

create index messages_payment_id_idx on public.messages (payment_id) where payment_id is not null;

alter table public.messages drop constraint messages_attachment_type_check;
alter table public.messages add constraint messages_attachment_type_check
  check (attachment_type = any (array['image', 'video', 'file', 'audio', 'payment']));

-- A payment card has its payment, and nothing else has one.
alter table public.messages add constraint messages_payment_card_check
  check ((attachment_type is not distinct from 'payment') = (payment_id is not null));

-- The browser can't make, change or remove a payment card (request_payment()
-- does it): the three rules below are the same as before plus that.
alter policy "messages: participants can insert own" on public.messages
  with check (
    sender_id = auth.uid()
    and exists (
      select 1 from public.conversations c
      where c.id = messages.conversation_id and (c.user_a = auth.uid() or c.user_b = auth.uid())
    )
    and not public.is_messaging_blocked(auth.uid())
    and attachment_type is distinct from 'payment'
    and payment_id is null
  );

alter policy "messages: sender can update own" on public.messages
  using (sender_id = auth.uid() and attachment_type is distinct from 'payment')
  with check (sender_id = auth.uid() and not public.is_messaging_blocked(auth.uid()));

alter policy "messages: sender can delete own" on public.messages
  using (sender_id = auth.uid() and attachment_type is distinct from 'payment');

-- The same guard as before (only the text of a message can change; an unsent
-- message stays unsent), plus: a payment card can't be edited or unsent. Other
-- updates on it still work, because mark_messages_delivered() sets delivered_at
-- on every message the other person received.
create or replace function public.messages_edit_guard()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if auth.uid() is null then
    return new;
  end if;

  if (new.conversation_id, new.sender_id, new.created_at, new.call_id)
     is distinct from
     (old.conversation_id, old.sender_id, old.created_at, old.call_id) then
    raise exception 'Only the text of a message can be edited.';
  end if;

  if old.attachment_type = 'payment'
     and (new.unsent_at is distinct from old.unsent_at
          or new.body is distinct from old.body
          or new.edited_at is distinct from old.edited_at
          or new.attachment_type is distinct from old.attachment_type
          or new.payment_id is distinct from old.payment_id) then
    raise exception 'A payment request can''t be edited or unsent.';
  end if;

  if old.unsent_at is not null then
    if (new.unsent_at, new.body, new.edited_at, new.attachment_url,
        new.attachment_type, new.attachment_name, new.attachment_size)
       is distinct from
       (old.unsent_at, old.body, old.edited_at, old.attachment_url,
        old.attachment_type, old.attachment_name, old.attachment_size) then
      raise exception 'An unsent message can''t be changed.';
    end if;
  elsif new.unsent_at is not null then
    if old.call_id is not null then
      raise exception 'A call line can''t be unsent.';
    end if;
    new.unsent_at := now();
    new.body := null;
    new.edited_at := null;
    new.attachment_url := null;
    new.attachment_type := null;
    new.attachment_name := null;
    new.attachment_size := null;
  elsif (new.attachment_url, new.attachment_type, new.attachment_name, new.attachment_size)
        is distinct from
        (old.attachment_url, old.attachment_type, old.attachment_name, old.attachment_size) then
    raise exception 'Only the text of a message can be edited.';
  end if;

  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. New kind of notification (keeps every kind already live)
-- ---------------------------------------------------------------------------

alter table public.user_notifications drop constraint user_notifications_type_check;
alter table public.user_notifications add constraint user_notifications_type_check
  check (type in ('verification_approved', 'verification_rejected', 'suspension',
                  'suspension_lifted', 'appeal_accepted', 'appeal_rejected',
                  'report_resolved', 'report_dismissed',
                  'project_hired', 'project_submitted', 'project_done', 'project_changes',
                  'project_rated',
                  'booking_requested', 'booking_accepted', 'booking_declined', 'booking_cancelled',
                  'school_id_pass',
                  'payment_sent', 'payment_confirmed', 'payment_not_received',
                  'payment_requested'));

-- ---------------------------------------------------------------------------
-- 4. The payer can open the QR of a requested payment
-- ---------------------------------------------------------------------------

-- Before: the owner, or a client who has a project with that freelancer. Now
-- also the person asked to pay, while the request is waiting for their payment.
alter policy "gcash-qr: the owner and a client of theirs can open" on storage.objects
  using (
    bucket_id = 'gcash-qr'
    and (
      (storage.foldername(name))[1] = (select auth.uid())::text
      or exists (
        select 1 from public.projects p
        where p.client_id = (select auth.uid())
          and p.freelancer_id::text = (storage.foldername(name))[1]
      )
      or exists (
        select 1 from public.payments pay
        where pay.client_id = (select auth.uid())
          and pay.freelancer_id::text = (storage.foldername(name))[1]
          and pay.status = 'requested'
      )
    )
  );

-- ---------------------------------------------------------------------------
-- 5. The functions the buttons call. Problems are raised with a plain message
-- that the page shows as is.
-- ---------------------------------------------------------------------------

-- "Request payment" in a chat. The caller must be in the chat, verified, not
-- blocked from posting or messaging, and have saved GCash details; there can't
-- be another open payment in that chat; the amount is more than 0 and at most
-- 1,000,000 with up to 2 decimals; the note is up to 100 characters. Makes the
-- payment as "requested", writes the card into the chat, and tells the other
-- person. Returns the new payment's id.
create or replace function public.request_payment(target_conversation uuid, req_amount numeric, req_note text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  conv record;
  payer uuid;
  note_text text := nullif(btrim(coalesce(req_note, '')), '');
  new_payment uuid;
  my_name text;
  amount_text text;
begin
  select user_a, user_b into conv from public.conversations where id = target_conversation;
  if not found or me is null or me not in (conv.user_a, conv.user_b) then
    raise exception 'You can only ask for payment in your own chats.';
  end if;
  payer := case when conv.user_a = me then conv.user_b else conv.user_a end;

  if not public.is_verified(me) then
    raise exception 'Only verified freelancers can ask for payment.';
  end if;
  if public.is_posting_blocked(me) or public.is_messaging_blocked(me) then
    raise exception 'Your account can''t ask for payment right now because of a suspension.';
  end if;
  if not exists (select 1 from public.gcash_accounts where freelancer_id = me) then
    raise exception 'Add your GCash details in Settings first, so the other person can see where to pay.';
  end if;
  if req_amount is null or req_amount <= 0 or req_amount > 1000000 then
    raise exception 'The amount must be more than 0 and at most 1,000,000 pesos.';
  end if;
  if req_amount <> round(req_amount, 2) then
    raise exception 'The amount can have up to 2 decimals.';
  end if;
  if char_length(coalesce(note_text, '')) > 100 then
    raise exception 'The note can be up to 100 characters.';
  end if;
  if exists (
    select 1 from public.payments
     where conversation_id = target_conversation and status in ('requested', 'sent')
  ) then
    raise exception 'This chat already has a payment waiting. Cancel it, or wait for the answer, before asking again.';
  end if;

  begin
    insert into public.payments (conversation_id, client_id, freelancer_id, amount, note, status)
    values (target_conversation, payer, me, req_amount, note_text, 'requested')
    returning id into new_payment;
  exception when unique_violation then
    raise exception 'This chat already has a payment waiting. Cancel it, or wait for the answer, before asking again.';
  end;

  -- The note as the word filter left it.
  select note into note_text from public.payments where id = new_payment;
  amount_text := to_char(req_amount, 'FM999,999,990.00');

  insert into public.messages (conversation_id, sender_id, body, attachment_type, payment_id)
  values (target_conversation, me, 'Payment request: ₱' || amount_text, 'payment', new_payment);

  select coalesce(nullif(full_name, ''), username, 'A freelancer') into my_name
    from public.profiles where id = me;

  insert into public.user_notifications (user_id, type, title, message, link)
  values (
    payer, 'payment_requested', 'Payment request',
    my_name || ' asked for ₱' || amount_text || coalesce(' (' || note_text || ')', '') || '.'
      || E'\n\n' || 'Open the chat to see where to pay.',
    '/dashboard/chat/' || target_conversation
  );

  return new_payment;
end;
$$;

revoke execute on function public.request_payment(uuid, numeric, text) from public, anon;
grant execute on function public.request_payment(uuid, numeric, text) to authenticated;

-- The freelancer takes a request back, only while nobody has paid it yet. The
-- card in the chat shows "Cancelled".
create or replace function public.cancel_payment_request(target_payment uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  pay record;
begin
  select * into pay from public.payments where id = target_payment for update;

  if not found or pay.freelancer_id <> auth.uid() or pay.conversation_id is null then
    raise exception 'Only the freelancer who asked can cancel this request.';
  end if;
  if pay.status <> 'requested' then
    raise exception 'This request can''t be cancelled any more.';
  end if;

  update public.payments set status = 'cancelled', answered_at = now() where id = pay.id;
end;
$$;

revoke execute on function public.cancel_payment_request(uuid) from public, anon;
grant execute on function public.cancel_payment_request(uuid) to authenticated;

-- Where to pay, for the person asked to pay, while the request waits for their
-- payment. Nothing comes back when the freelancer has no details saved.
create or replace function public.get_request_pay_details(target_payment uuid)
returns table (account_name text, gcash_number text, qr_path text)
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_column
begin
  if not exists (
    select 1 from public.payments p
     where p.id = target_payment and p.client_id = auth.uid()
       and p.conversation_id is not null and p.status = 'requested'
  ) then
    raise exception 'Only the person asked to pay can see where to pay.';
  end if;

  return query
    select a.account_name, a.gcash_number, a.qr_path
      from public.gcash_accounts a
      join public.payments p on p.freelancer_id = a.freelancer_id
     where p.id = target_payment;
end;
$$;

revoke execute on function public.get_request_pay_details(uuid) from public, anon;
grant execute on function public.get_request_pay_details(uuid) to authenticated;

-- "I've paid" on a card. Only the person asked to pay, only while the request
-- waits. The same checks as record_payment() (amount, 13-digit reference that is
-- new, a receipt they really uploaded into their own folder); the amount starts
-- as the requested one but is what they say they sent. Makes it "sent", sets the
-- time it was recorded, and tells the freelancer.
create or replace function public.record_chat_payment(target_payment uuid, pay_amount numeric, pay_reference text, pay_receipt_path text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  pay record;
  ref text := regexp_replace(coalesce(pay_reference, ''), '\s', '', 'g');
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
  if pay_amount <> round(pay_amount, 2) then
    raise exception 'The amount can have up to 2 decimals.';
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
       set status = 'sent', amount = pay_amount, reference_no = ref, receipt_path = pay_receipt_path, created_at = now()
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
      || coalesce(' (' || pay.note || ')', '') || '.'
      || E'\n\n' || 'Check your GCash, then confirm it on the card in the chat.',
    '/dashboard/chat/' || pay.conversation_id
  );
end;
$$;

revoke execute on function public.record_chat_payment(uuid, numeric, text, text) from public, anon;
grant execute on function public.record_chat_payment(uuid, numeric, text, text) to authenticated;

-- The two answers now work for a payment from a chat too: the notification
-- links to the chat instead of a project. For a payment on a project nothing
-- changes.
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

  update public.payments set status = 'confirmed', answered_at = now() where id = pay.id;

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

create or replace function public.mark_payment_not_received(target_payment uuid)
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
  again text;
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

  update public.payments set status = 'not_received', answered_at = now() where id = pay.id;

  if pay.project_id is not null then
    select title into proj_title from public.projects where id = pay.project_id;
    what := ' for "' || coalesce(proj_title, 'the project') || '"';
    open_link := '/dashboard/project-details/' || pay.project_id;
    again := 'record the payment again with the right details.';
  else
    what := coalesce(' (' || pay.note || ')', '');
    open_link := '/dashboard/chat/' || pay.conversation_id;
    again := 'ask them to send a new request.';
  end if;
  select coalesce(nullif(full_name, ''), username, 'The freelancer') into freelancer_name
    from public.profiles where id = auth.uid();

  insert into public.user_notifications (user_id, type, title, message, link)
  values (
    pay.client_id, 'payment_not_received', 'Payment not received',
    freelancer_name || ' says your payment of ₱' || to_char(pay.amount, 'FM999,999,990.00') || what || ' did not arrive.'
      || E'\n\n' || 'Message them to sort it out. If you really paid, ' || again,
    open_link
  );
end;
$$;

revoke execute on function public.mark_payment_not_received(uuid) from public, anon;
grant execute on function public.mark_payment_not_received(uuid) to authenticated;
