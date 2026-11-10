-- Late payments, Step 1 of PLAN-delays.md: a payment due date, reminders and late
-- notices (the user, 2026-11-10: "ok" on the plan). Run in the Supabase SQL Editor
-- (or as a migration) after supabase_project_price_schema.sql,
-- supabase_short_payment_schema.sql and supabase_notifications_more_schema.sql.
--
-- The rule:
--   * A one-time project with an agreed price is due for payment 7 days after it
--     was marked Done (the day in the Philippines).
--   * "Late" means money is still unpaid after that day. A payment the freelancer
--     has not answered yet counts as paid, so a freelancer who doesn't answer can
--     never make the client late. A payment answered "Not received" counts as unpaid.
--   * The 8:00 AM daily job (send_daily_notices) tells the client 3 days before
--     and on the last day, and both people when it is 1 to 6 days late and again
--     at 7 days or more. The sent log (scheduled_notices) keeps each notice to
--     once per project and payment due date, and because the job uses ranges, a
--     day it didn't run is caught up.
--   * Nothing here stops anyone from doing anything yet (that is Step 2).
--
-- The website works out the same date itself (payDueInfo in client/src/lib/payments.js,
-- like dueInfo does for the work), so change the 7 in both places together.
--
-- send_daily_notices() below is the LIVE function as it was read on 2026-11-10 (it
-- already holds the wording changes of the notifications_wording migration) plus the
-- new payments part. Older schema files still hold older sentences: do not run
-- them again.

-- ---------------------------------------------------------------------------
-- 1. The payment due date of a project
-- ---------------------------------------------------------------------------

-- The day payment is due: 7 days after the project was marked Done (the Manila
-- day), only for a Done project with an agreed one-time price. Empty otherwise.
-- It takes the project's row, like missed_deadline() does. Users can't call it;
-- only the daily job (and the Step 2 rules) use it.
create or replace function public.payment_due_date(p public.projects)
returns date
language sql
stable
set search_path = public
as $$
  select case
    when p.status = 'done'
      and p.price_status = 'agreed'
      and p.price_basis = 'project'
      and p.completed_at is not null
    then (p.completed_at at time zone 'Asia/Manila')::date + 7
  end;
$$;

revoke execute on function public.payment_due_date(public.projects) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. The two new kinds of notification (the list is the LIVE one, 35 kinds on
--    2026-11-10, plus payment_due_soon and payment_overdue)
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
    'payment_due_soon', 'payment_overdue'
  ]::text[]));

-- ---------------------------------------------------------------------------
-- 3. The daily job, now with the payment reminders. The job post and project
--    parts are the live function as it was; the payments part is new.
--    Gives back how many notices it sent. The pg_cron job "daily-notices"
--    (8:00 AM Manila) already calls it and stays as it is.
-- ---------------------------------------------------------------------------

create or replace function public.send_daily_notices()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  today date := (now() at time zone 'Asia/Manila')::date;
  sent integer := 0;
  added integer;
  post record;
  proj record;
  pay record;
  days_left integer;
  kind text;
  title_text text;
  link_text text;
  when_text text;   -- "in 3 days", "tomorrow", "today"
  late_text text;   -- "1 day late", "8 days late"
  date_text text;   -- "November 13"
  amount_text text; -- "₱1,200.00"
begin
  -- ===== Job posts that closed because their due date passed =====
  for post in
    select j.id, j.client_id, j.title, j.due_date
    from public.job_posts j
    where public.job_state(j.id) = 'expired'
      and not exists (
        select 1 from public.scheduled_notices s
        where s.kind = 'job_expired' and s.target_id = j.id and s.due_date = j.due_date
      )
  loop
    insert into public.scheduled_notices (kind, target_id, due_date)
    values ('job_expired', post.id, post.due_date);

    insert into public.user_notifications (user_id, type, title, message, link)
    values (
      post.client_id,
      'job_expired',
      'Job post closed',
      'Your job post "' || post.title || '" closed because its due date passed, so freelancers can''t see it or apply. Pick new dates to show it again.',
      '/dashboard/job-details/' || post.id
    );
    sent := sent + 1;
  end loop;

  -- ===== Projects: due soon, due today, late =====
  for proj in
    select p.id, p.title, p.status, p.due_date, p.client_id, p.freelancer_id,
           coalesce(nullif(fp.full_name, ''), fp.username, 'The freelancer') as freelancer_name,
           coalesce(nullif(cp.full_name, ''), cp.username, 'The client') as client_name
    from public.projects p
    left join public.profiles fp on fp.id = p.freelancer_id
    left join public.profiles cp on cp.id = p.client_id
    where p.status in ('started', 'submitted')
      and p.due_date <= today + 3
  loop
    days_left := proj.due_date - today;

    -- Which notice this project is due for today (null = none).
    if proj.status = 'submitted' then
      kind := case when days_left = 0 then 'review_0' end;
    else
      kind := case
        when days_left between 2 and 3 then 'due_3'
        when days_left = 1 then 'due_1'
        when days_left = 0 then 'due_0'
        when days_left between -6 and -1 then 'overdue_1'
        when days_left <= -7 then 'overdue_7'
      end;
    end if;
    continue when kind is null;

    -- Write it in the sent log first; if it was already there, skip.
    insert into public.scheduled_notices (kind, target_id, due_date)
    values (kind, proj.id, proj.due_date)
    on conflict do nothing;
    get diagnostics added = row_count;
    continue when added = 0;

    link_text := '/dashboard/project-details/' || proj.id;
    when_text := case days_left when 0 then 'today' when 1 then 'tomorrow' else 'in ' || days_left || ' days' end;
    late_text := (-days_left) || case when days_left = -1 then ' day late' else ' days late' end;
    date_text := to_char(proj.due_date, 'FMMonth FMDD');

    if kind = 'review_0' then
      insert into public.user_notifications (user_id, type, title, message, link)
      values (proj.client_id, 'project_review_reminder', 'Work waiting for your review',
        proj.freelancer_name || '''s work for "' || proj.title || '" is waiting for your review. The project is due today.',
        link_text);
      sent := sent + 1;

    elsif kind in ('due_3', 'due_1', 'due_0') then
      title_text := case when days_left = 0 then 'Project due today' else 'Project due soon' end;
      insert into public.user_notifications (user_id, type, title, message, link)
      values
        (proj.freelancer_id, case when days_left = 0 then 'project_due_today' else 'project_due_soon' end, title_text,
          '"' || proj.title || '" is due ' || when_text
            || case when days_left > 0 then ' (' || date_text || ')' else '' end
            || '. Submit your work on the project page.',
          link_text),
        (proj.client_id, case when days_left = 0 then 'project_due_today' else 'project_due_soon' end, title_text,
          '"' || proj.title || '" is due ' || when_text
            || case when days_left > 0 then ' (' || date_text || ')' else '' end
            || '. ' || proj.freelancer_name || ' is working on it.',
          link_text);
      sent := sent + 2;

    else
      -- overdue_1 or overdue_7: the due date passed and nothing was submitted.
      insert into public.user_notifications (user_id, type, title, message, link)
      values
        (proj.freelancer_id, 'project_overdue', 'Project is late',
          '"' || proj.title || '" is ' || late_text || '. Submit your work or message the client. Until the client allows it, you can''t apply to their other job posts.',
          link_text),
        (proj.client_id, 'project_overdue', 'Project is late',
          '"' || proj.title || '" is ' || late_text || '. Message ' || proj.freelancer_name || ' to ask about it.',
          link_text);
      sent := sent + 2;
    end if;
  end loop;

  -- ===== Payments: due soon, due today, late (PLAN-delays.md, Step 1) =====
  -- Done projects with an agreed one-time price and money still unpaid. Money the
  -- freelancer has not answered yet counts as paid (project_paid_amount with
  -- waiting = true), so a freelancer's silence never makes a client late.
  for pay in
    select p.id, p.title, p.client_id, p.freelancer_id,
           public.payment_due_date(p) as pay_due,
           p.agreed_amount - public.project_paid_amount(p.id, true) as unpaid,
           coalesce(nullif(fp.full_name, ''), fp.username, 'The freelancer') as freelancer_name,
           coalesce(nullif(cp.full_name, ''), cp.username, 'The client') as client_name
    from public.projects p
    left join public.profiles fp on fp.id = p.freelancer_id
    left join public.profiles cp on cp.id = p.client_id
    where public.payment_due_date(p) <= today + 3
      and p.agreed_amount - public.project_paid_amount(p.id, true) > 0
  loop
    days_left := pay.pay_due - today;

    -- Which notice this payment is due for today. Everything up to 3 days away
    -- is covered, so there is no gap, and the ranges don't overlap.
    kind := case
      when days_left between 1 and 3 then 'pay_due_3'
      when days_left = 0 then 'pay_due_0'
      when days_left between -6 and -1 then 'pay_late_1'
      else 'pay_late_7'
    end;

    -- Write it in the sent log first; if it was already there, skip.
    insert into public.scheduled_notices (kind, target_id, due_date)
    values (kind, pay.id, pay.pay_due)
    on conflict do nothing;
    get diagnostics added = row_count;
    continue when added = 0;

    link_text := '/dashboard/project-details/' || pay.id;
    when_text := case days_left when 0 then 'today' when 1 then 'tomorrow' else 'in ' || days_left || ' days' end;
    late_text := (-days_left) || case when days_left = -1 then ' day late' else ' days late' end;
    date_text := to_char(pay.pay_due, 'FMMonth FMDD');
    amount_text := '₱' || to_char(pay.unpaid, 'FM999,999,990.00');

    if kind in ('pay_due_3', 'pay_due_0') then
      -- Only the client is reminded before the day.
      insert into public.user_notifications (user_id, type, title, message, link)
      values (
        pay.client_id, 'payment_due_soon',
        case when days_left = 0 then 'Payment due today' else 'Payment due soon' end,
        'Payment for "' || pay.title || '" is due ' || when_text
          || case when days_left > 0 then ' (' || date_text || ')' else '' end
          || '. ' || amount_text || ' is still unpaid.'
          || E'\n\n' || 'Pay the rest in GCash, then record it on the project page.',
        link_text);
      sent := sent + 1;

    else
      -- pay_late_1 or pay_late_7: the day passed and money is still unpaid.
      insert into public.user_notifications (user_id, type, title, message, link)
      values
        (pay.client_id, 'payment_overdue', 'Payment is late',
          'Payment for "' || pay.title || '" is ' || late_text || '. ' || amount_text || ' is still unpaid.'
            || E'\n\n' || 'Pay the rest in GCash, then record it on the project page.',
          link_text),
        (pay.freelancer_id, 'payment_overdue', 'Payment is late',
          pay.client_name || ' has not paid ' || amount_text || ' for "' || pay.title || '" yet. It is ' || late_text || '.'
            || E'\n\n' || 'You can message ' || pay.client_name
            || case when kind = 'pay_late_7' then ', and report it if it stays unpaid.' else '.' end,
          link_text);
      sent := sent + 2;
    end if;
  end loop;

  return sent;
end;
$$;

revoke all on function public.send_daily_notices() from public, anon, authenticated;
