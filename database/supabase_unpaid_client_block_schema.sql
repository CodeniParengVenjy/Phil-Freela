-- Late payments, Step 2 of PLAN-delays.md: a client who is late paying a freelancer
-- can't hire or book THAT freelancer again until it is paid, or until the freelancer
-- allows it ("Allow to hire again"). Run in the Supabase SQL Editor (or as a migration)
-- after supabase_payment_due_schema.sql (Step 1).
--
-- The rule (the user, 2026-11-10: "ok" on the plan, then "go" for Step 2):
--   * "Late" is Step 1's rule: a Done project with an agreed one-time price whose money
--     is still unpaid after its payment day (7 days after Done). A payment the freelancer
--     hasn't answered yet counts as paid, so a freelancer who doesn't answer never blocks
--     anyone.
--   * A late client can't hire this freelancer (Hire on Projects & Resumes) or book them
--     (Book on an offer) until that project is paid in full, or the freelancer taps
--     "Allow to hire again" on it. Other freelancers are not affected.
--   * It only ever looks at the signed-in person (auth.uid()), so nobody can use it to
--     look up someone else's record.
--   * Nothing is blocked site-wide: a bigger penalty is for an admin, through a report.
--
-- hire_applicant(), create_booking() and send_daily_notices() are changed by reading the
-- LIVE function and adding only the lines in Section 3 (the way the notifications_wording
-- migration changed sentences), so nothing else in them can be lost. Each change stops
-- with an error if the place to add it is not found exactly once, and does nothing when
-- it was already made.

-- ---------------------------------------------------------------------------
-- 1. The freelancer's "Allow to hire again"
-- ---------------------------------------------------------------------------

-- When the freelancer allowed this client to hire or book them again although the
-- payment is late (empty = not allowed). The same idea as late_allowed_at. Nobody can
-- change projects directly from the website; only allow_unpaid_client() sets it.
alter table public.projects add column if not exists pay_allowed_at timestamptz;

comment on column public.projects.pay_allowed_at is
  'When the freelancer allowed the client to hire or book them again although the payment is late (empty = not allowed). Set only by allow_unpaid_client().';

-- ---------------------------------------------------------------------------
-- 2. The three functions
-- ---------------------------------------------------------------------------

-- Is the payment of this project late? Step 1's rule, in one place: Done, agreed
-- one-time price, today (Manila) after the payment day, money still unpaid (money
-- the freelancer has not answered yet counts as paid). Users can't call it.
create or replace function public.payment_overdue(target_project uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select public.payment_due_date(p) < (now() at time zone 'Asia/Manila')::date
            and p.agreed_amount - public.project_paid_amount(p.id, true) > 0
       from public.projects p
      where p.id = target_project),
    false);
$$;

revoke execute on function public.payment_overdue(uuid) from public, anon, authenticated;

-- Stops, with a plain sentence, a client who is late paying this freelancer. Called
-- near the top of hire_applicant() and create_booking(). It only looks at the
-- signed-in person (auth.uid()) and their own projects with this freelancer, and
-- users can't call it themselves.
create or replace function public.block_if_client_owes(target_freelancer uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  owed record;
begin
  -- The one that has been late the longest.
  select p.title,
         p.agreed_amount - public.project_paid_amount(p.id, true) as unpaid,
         coalesce(nullif(fp.full_name, ''), fp.username, 'the freelancer') as freelancer_name
    into owed
    from public.projects p
    left join public.profiles fp on fp.id = p.freelancer_id
   where p.client_id = auth.uid()
     and p.freelancer_id = target_freelancer
     and p.pay_allowed_at is null
     and public.payment_overdue(p.id)
   order by public.payment_due_date(p)
   limit 1;

  if found then
    raise exception 'You still owe % % for "%", and its payment day has passed. Pay what is left on that project first, or ask % to allow you to hire again.',
      owed.freelancer_name, '₱' || to_char(owed.unpaid, 'FM999,999,990.00'), owed.title, owed.freelancer_name;
  end if;
end;
$$;

revoke execute on function public.block_if_client_owes(uuid) from public, anon, authenticated;

-- "Allow to hire again": the freelancer on a late project lets that client hire or
-- book them again. Only the project's freelancer, only while the payment is late.
-- Pressing it twice changes nothing.
create or replace function public.allow_unpaid_client(target_project uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  proj public.projects%rowtype;
begin
  select * into proj from public.projects where id = target_project;
  if not found or proj.freelancer_id is distinct from auth.uid() then
    raise exception 'Only the freelancer on this project can allow this.';
  end if;
  if not public.payment_overdue(target_project) then
    raise exception 'This project''s payment isn''t late, so nothing is blocked.';
  end if;
  update public.projects
     set pay_allowed_at = now()
   where id = target_project and pay_allowed_at is null;
end;
$$;

revoke execute on function public.allow_unpaid_client(uuid) from public, anon;
grant execute on function public.allow_unpaid_client(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 3. The lines added to the live functions
-- ---------------------------------------------------------------------------
-- hire_applicant and create_booking: one call right after their suspension check.
-- send_daily_notices: one sentence in each of the two "Payment is late" notices
-- (Step 1), now that there is something to say about the limit.

do $$
declare
  def text;
  anchor text;
  extra text;
begin
  -- ===== hire_applicant =====
  def := pg_get_functiondef('public.hire_applicant(uuid, text, date)'::regprocedure);
  if position('block_if_client_owes' in def) = 0 then
    anchor := replace($a$  if public.is_posting_blocked(auth.uid()) then
    raise exception 'Your account can''t hire right now because of a suspension.';
  end if;
$a$, E'\r', '');
    extra := replace($a$  -- A client who is late paying this freelancer can't hire them again until it is paid
  -- or allowed (PLAN-delays.md, Step 2).
  perform public.block_if_client_owes(app.freelancer_id);
$a$, E'\r', '');
    if (length(def) - length(replace(def, anchor, ''))) <> length(anchor) then
      raise exception 'hire_applicant is not the version this change was written from (the place for the check was not found exactly once).';
    end if;
    execute replace(def, anchor, anchor || extra);
  end if;

  -- ===== create_booking =====
  def := pg_get_functiondef('public.create_booking(uuid, text, date)'::regprocedure);
  if position('block_if_client_owes' in def) = 0 then
    anchor := replace($a$  if public.is_posting_blocked(auth.uid()) then
    raise exception 'Your account can''t book right now because of a suspension.';
  end if;
$a$, E'\r', '');
    extra := replace($a$  -- A client who is late paying this freelancer can't book them again until it is paid
  -- or allowed (PLAN-delays.md, Step 2).
  perform public.block_if_client_owes(svc.freelancer_id);
$a$, E'\r', '');
    if (length(def) - length(replace(def, anchor, ''))) <> length(anchor) then
      raise exception 'create_booking is not the version this change was written from (the place for the check was not found exactly once).';
    end if;
    execute replace(def, anchor, anchor || extra);
  end if;

  -- ===== send_daily_notices: the two "Payment is late" notices =====
  def := pg_get_functiondef('public.send_daily_notices()'::regprocedure);
  if position('hire or book you again' in def) = 0 then
    -- The client's notice: a sentence after "Pay the rest in GCash...".
    anchor := replace($a$            || E'\n\n' || 'Pay the rest in GCash, then record it on the project page.',
          link_text),
        (pay.freelancer_id, 'payment_overdue', 'Payment is late',
$a$, E'\r', '');
    extra := replace($a$            || E'\n\n' || 'Pay the rest in GCash, then record it on the project page.'
            || ' Until it is paid, you can''t hire or book ' || pay.freelancer_name || ' again, unless ' || pay.freelancer_name || ' allows it.',
          link_text),
        (pay.freelancer_id, 'payment_overdue', 'Payment is late',
$a$, E'\r', '');
    if (length(def) - length(replace(def, anchor, ''))) <> length(anchor) then
      raise exception 'send_daily_notices is not the version this change was written from (the client notice was not found exactly once).';
    end if;
    def := replace(def, anchor, extra);

    -- The freelancer's notice: a sentence about the new button.
    anchor := replace($a$          pay.client_name || ' has not paid ' || amount_text || ' for "' || pay.title || '" yet. It is ' || late_text || '.'
            || E'\n\n' || 'You can message ' || pay.client_name
$a$, E'\r', '');
    extra := replace($a$          pay.client_name || ' has not paid ' || amount_text || ' for "' || pay.title || '" yet. It is ' || late_text || '.'
            || ' Until it is paid, ' || pay.client_name || ' can''t hire or book you again, unless you allow it on the project page.'
            || E'\n\n' || 'You can message ' || pay.client_name
$a$, E'\r', '');
    if (length(def) - length(replace(def, anchor, ''))) <> length(anchor) then
      raise exception 'send_daily_notices is not the version this change was written from (the freelancer notice was not found exactly once).';
    end if;
    execute replace(def, anchor, extra);
  end if;
end;
$$;
