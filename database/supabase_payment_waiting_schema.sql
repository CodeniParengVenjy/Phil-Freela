-- Late payments, Step 3 of PLAN-delays.md: a payment the freelancer does not answer
-- (the user, 2026-11-10: "go with step 3"). Run in the Supabase SQL Editor (or as a
-- migration) after supabase_payment_due_schema.sql (Step 1).
--
-- The problem: the client records a payment, and until the freelancer answers (Confirm
-- received, Received less or Not received) the client's file stays locked and the
-- project can't be paid up. Nothing reminded the freelancer, and the client could only
-- wait. PhilFreela never sees GCash, so it never confirms a payment for the freelancer;
-- it reminds, and it tells both people when the client can report it.
--
-- The rule, counted from when the client recorded the payment (payments.created_at; a
-- chat request gets a new created_at when the client records it), in days of the Manila
-- calendar, for a payment that is still "sent" (waiting):
--   2 to 4 days   the freelancer: "A payment is waiting for your answer"   (wait_2)
--   5 to 6 days   the freelancer: "Still waiting", with what happens next   (wait_5)
--   7 or more     both people: the client can now report it from the payment (wait_7)
-- Ranges plus the sent log (scheduled_notices), like Step 1, so a day the job didn't run
-- is caught up and nothing is sent twice. The Report button itself is on the website
-- (a payment waiting 7 days or more); the report already takes a payment along.
--
-- send_daily_notices() is changed by reading the LIVE function and adding only the lines
-- below (so nothing else in it can be lost, whether or not Step 2's two sentences are in
-- it yet). Each change stops with an error if its place is not found exactly once, and
-- does nothing when it was already made.

-- ---------------------------------------------------------------------------
-- 1. The new kind of notification (the list is the LIVE one, 37 kinds on 2026-11-10,
--    plus payment_waiting)
-- ---------------------------------------------------------------------------

alter table public.user_notifications
  drop constraint if exists user_notifications_type_check,
  add constraint user_notifications_type_check check (type = any (array[
    'verification_approved', 'verification_rejected', 'suspension', 'suspension_lifted',
    'appeal_accepted', 'appeal_rejected', 'report_resolved', 'report_dismissed',
    'project_hired', 'project_submitted', 'project_done', 'project_changes', 'project_rated',
    'booking_requested', 'booking_accepted', 'booking_declined', 'booking_cancelled',
    'school_id_pass', 'payment_sent', 'payment_confirmed', 'payment_not_received',
    'payment_requested', 'promotion_approved', 'promotion_rejected', 'price_proposed',
    'price_agreed', 'payment_short', 'payment_unpaid',
    'application_new', 'job_filled', 'job_expired',
    'project_due_soon', 'project_due_today', 'project_overdue', 'project_review_reminder',
    'payment_due_soon', 'payment_overdue',
    'payment_waiting'
  ]::text[]));

-- ---------------------------------------------------------------------------
-- 2. The daily job: the waiting payments
-- ---------------------------------------------------------------------------

do $$
declare
  def text;
  anchor text;
  extra text;
begin
  def := pg_get_functiondef('public.send_daily_notices()'::regprocedure);
  if position('Payments the freelancer has not answered' in def) = 0 then
    -- Two more variables, right after "pay record;".
    anchor := replace($a$  pay record;
$a$, E'\r', '');
    extra := replace($a$  for_text text;     -- ' for "Logo"' or ' in the chat'
  wait_text text;    -- "5 days"
$a$, E'\r', '');
    if (length(def) - length(replace(def, anchor, ''))) <> length(anchor) then
      raise exception 'send_daily_notices is not the version this change was written from (the place for the variables was not found exactly once).';
    end if;
    def := replace(def, anchor, anchor || extra);

    -- The new part, right before "return sent;".
    anchor := replace($a$
  return sent;
end;
$a$, E'\r', '');
    extra := replace($a$
  -- ===== Payments the freelancer has not answered (PLAN-delays.md, Step 3) =====
  -- Still "sent": the client recorded it and the freelancer hasn't answered. PhilFreela
  -- never confirms money it can't see; it only reminds, and says when the client can
  -- report it. days_left is the number of days it has been waiting here.
  for pay in
    select p.id, p.amount, p.client_id, p.freelancer_id, p.project_id, p.conversation_id, pr.title,
           (p.created_at at time zone 'Asia/Manila')::date as sent_day,
           coalesce(nullif(fp.full_name, ''), fp.username, 'The freelancer') as freelancer_name,
           coalesce(nullif(cp.full_name, ''), cp.username, 'The client') as client_name
    from public.payments p
    left join public.projects pr on pr.id = p.project_id
    left join public.profiles fp on fp.id = p.freelancer_id
    left join public.profiles cp on cp.id = p.client_id
    where p.status = 'sent'
      and (p.created_at at time zone 'Asia/Manila')::date <= today - 2
  loop
    days_left := today - pay.sent_day;

    kind := case
      when days_left >= 7 then 'wait_7'
      when days_left >= 5 then 'wait_5'
      else 'wait_2'
    end;

    -- Write it in the sent log first; if it was already there, skip.
    insert into public.scheduled_notices (kind, target_id, due_date)
    values (kind, pay.id, pay.sent_day)
    on conflict do nothing;
    get diagnostics added = row_count;
    continue when added = 0;

    -- A payment on a project goes to the project page, one from a chat to the chat.
    link_text := case when pay.project_id is not null
      then '/dashboard/project-details/' || pay.project_id
      else '/dashboard/chat/' || pay.conversation_id end;
    for_text := case when pay.project_id is not null then ' for "' || pay.title || '"' else ' in the chat' end;
    wait_text := days_left || ' days';
    amount_text := '₱' || to_char(pay.amount, 'FM999,999,990.00');

    if kind = 'wait_2' then
      insert into public.user_notifications (user_id, type, title, message, link)
      values (
        pay.freelancer_id, 'payment_waiting', 'Payment waiting for your answer',
        pay.client_name || ' says they sent ' || amount_text || for_text || ' ' || wait_text || ' ago.'
          || E'\n\n' || 'Check your GCash, then confirm it. If less arrived, answer Received less; if nothing arrived, answer Not received.',
        link_text);
      sent := sent + 1;

    elsif kind = 'wait_5' then
      insert into public.user_notifications (user_id, type, title, message, link)
      values (
        pay.freelancer_id, 'payment_waiting', 'Still waiting for your answer',
        pay.client_name || '''s ' || amount_text || ' payment' || for_text || ' is still waiting for your answer (' || wait_text || ').'
          || E'\n\n' || 'Please check your GCash and answer it. After 7 days ' || pay.client_name || ' can report it.',
        link_text);
      sent := sent + 1;

    else
      -- wait_7: the client can report it now.
      insert into public.user_notifications (user_id, type, title, message, link)
      values
        (pay.client_id, 'payment_waiting', 'Payment not answered yet',
          pay.freelancer_name || ' has not answered your ' || amount_text || ' payment' || for_text || '. It has been ' || wait_text || '.'
            || E'\n\n' || 'You can message ' || pay.freelancer_name || ', or report it from the payment.',
          link_text),
        (pay.freelancer_id, 'payment_waiting', 'Payment still not answered',
          pay.client_name || '''s ' || amount_text || ' payment' || for_text || ' has been waiting ' || wait_text || ' for your answer, so ' || pay.client_name || ' can report it now.'
            || E'\n\n' || 'Please check your GCash and answer it.',
          link_text);
      sent := sent + 2;
    end if;
  end loop;

  return sent;
end;
$a$, E'\r', '');
    if (length(def) - length(replace(def, anchor, ''))) <> length(anchor) then
      raise exception 'send_daily_notices is not the version this change was written from (the place for the new part was not found exactly once).';
    end if;
    execute replace(def, anchor, extra);
  end if;
end;
$$;
