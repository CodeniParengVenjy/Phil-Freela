-- Asking for more time, PLAN-delay-requests.md (the user, 2026-11-11: "ok" on the plan and
-- its limits). Run in the Supabase SQL Editor (or as a migration) after
-- supabase_payment_due_schema.sql and supabase_payment_waiting_schema.sql.
--
-- The idea: the person who owes something can ask the other for more days.
--   * the CLIENT asks for more time to PAY   (kind 'payment', answered by the freelancer)
--   * the FREELANCER asks for more time to SEND the work (kind 'work', answered by the client)
-- Accepting moves the date; declining leaves it. Both are told by a bell notice (and the
-- Gmail email an offline user already gets for every notice).
--
-- The limits (the user agreed to these):
--   * up to 7 more days than the current date, each time
--   * 2 requests per project for each kind, whatever the answer (cancelled ones count too)
--   * only on or before the date (once it is late, the late rules apply)
--   * one request waiting for an answer at a time, for each kind
--   * a reason of 3 to 300 characters, through the word filter
--   * nobody answers = nothing changes, the old date stands (no automatic yes)
-- The 7 and the 2 live only in request_delay() below.
--
-- A work request moves projects.due_date. Everything that reads it (the late pill, the
-- 8:00 AM reminders, "missed the deadline", the on-time count) then follows the new day.
-- A payment request sets projects.payment_due_override, which payment_due_date() reads
-- first, so the payment reminders, the late pill and the hire/book limit follow it too.

-- ---------------------------------------------------------------------------
-- 1. The agreed later payment day
-- ---------------------------------------------------------------------------

-- Empty = the normal day (7 days after Done). Set only by answer_delay().
alter table public.projects add column if not exists payment_due_override date;

comment on column public.projects.payment_due_override is
  'A later payment day the freelancer agreed to (empty = the normal 7 days after Done). Set only by answer_delay().';

-- payment_due_date() as it is live, with the override read first.
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
    then coalesce(p.payment_due_override, (p.completed_at at time zone 'Asia/Manila')::date + 7)
  end;
$$;

revoke execute on function public.payment_due_date(public.projects) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. The requests
-- ---------------------------------------------------------------------------

create table if not exists public.delay_requests (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  kind text not null check (kind in ('work', 'payment')),
  asked_by uuid not null references public.profiles (id) on delete cascade,
  from_date date not null,   -- the date when it was asked
  to_date date not null,     -- the day asked for
  reason text not null check (char_length(reason) between 3 and 300),
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined', 'cancelled')),
  created_at timestamptz not null default now(),
  answered_at timestamptz,
  check (to_date > from_date)
);

create index if not exists delay_requests_project_idx on public.delay_requests (project_id);

-- One request waiting for an answer at a time, for each kind of request.
create unique index if not exists delay_requests_one_pending_idx
  on public.delay_requests (project_id, kind) where status = 'pending';

-- The reason goes through the word filter, like every text people type.
create trigger delay_requests_mask_words
  before insert on public.delay_requests
  for each row execute function public.mask_columns('reason');

-- Only the project's client and freelancer can read; nobody changes it directly
-- (only the three functions below do).
alter table public.delay_requests enable row level security;

create policy "delay_requests: the client and freelancer can view"
  on public.delay_requests for select to authenticated
  using (exists (
    select 1 from public.projects p
    where p.id = delay_requests.project_id
      and (select auth.uid()) in (p.client_id, p.freelancer_id)
  ));

revoke all on public.delay_requests from anon, authenticated;
grant select on public.delay_requests to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Three new kinds of notification (the list is the LIVE one, 38 kinds on
--    2026-11-11, plus the three below)
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
    'payment_due_soon', 'payment_overdue', 'payment_waiting',
    'delay_requested', 'delay_accepted', 'delay_declined'
  ]::text[]));

-- ---------------------------------------------------------------------------
-- 4. The three functions
-- ---------------------------------------------------------------------------

-- Ask for more time. Returns the new request's id. The sentences it raises are plain
-- words; the website shows them as they are.
create or replace function public.request_delay(target_project uuid, delay_kind text, new_date date, delay_reason text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  today date := (now() at time zone 'Asia/Manila')::date;
  proj public.projects%rowtype;
  current_day date;   -- the date the request would move
  reason_text text := btrim(coalesce(delay_reason, ''));
  new_id uuid;
  saved_reason text;
  my_name text;
  other uuid;
  what text;
begin
  if me is null then
    raise exception 'Please sign in first.';
  end if;
  if delay_kind not in ('work', 'payment') then
    raise exception 'Ask for more time to pay or to send the work.';
  end if;

  select * into proj from public.projects where id = target_project;
  if not found or (me is distinct from proj.client_id and me is distinct from proj.freelancer_id) then
    raise exception 'This project isn''t yours.';
  end if;

  -- The one who owes asks: the freelancer for the work, the client for the payment.
  if delay_kind = 'work' and me is distinct from proj.freelancer_id then
    raise exception 'Only the freelancer can ask for more time to send the work.';
  end if;
  if delay_kind = 'payment' and me is distinct from proj.client_id then
    raise exception 'Only the client can ask for more time to pay.';
  end if;

  -- It must still matter: work not sent yet, or money still left on a finished project.
  if delay_kind = 'work' then
    if proj.status <> 'started' then
      raise exception 'You can ask for more time to send the work only before you have sent it.';
    end if;
    current_day := proj.due_date;
  else
    if proj.status <> 'done' or public.payment_due_date(proj) is null then
      raise exception 'You can ask for more time to pay only on a finished project with an agreed price.';
    end if;
    if proj.agreed_amount - public.project_paid_amount(proj.id, true) <= 0 then
      raise exception 'Nothing is left to pay on this project.';
    end if;
    current_day := public.payment_due_date(proj);
  end if;

  -- Only on or before the date: once it is late, the late rules apply.
  if today > current_day then
    raise exception 'The date has already passed, so it is too late to ask for more time.';
  end if;

  if new_date is null or new_date <= current_day then
    raise exception 'Pick a day after %.', to_char(current_day, 'FMMonth FMDD, YYYY');
  end if;
  if new_date > current_day + 7 then
    raise exception 'You can ask for up to 7 more days at a time (until %).', to_char(current_day + 7, 'FMMonth FMDD, YYYY');
  end if;
  if char_length(reason_text) < 3 or char_length(reason_text) > 300 then
    raise exception 'Tell them why, in 3 to 300 characters.';
  end if;

  -- Two requests of each kind for a project, whatever the answer; one waiting at a time.
  if exists (select 1 from public.delay_requests
              where project_id = proj.id and kind = delay_kind and status = 'pending') then
    raise exception 'You already have a request waiting for an answer.';
  end if;
  if (select count(*) from public.delay_requests
       where project_id = proj.id and kind = delay_kind) >= 2 then
    raise exception 'You have already used both of your requests for this project.';
  end if;

  insert into public.delay_requests (project_id, kind, asked_by, from_date, to_date, reason)
  values (proj.id, delay_kind, me, current_day, new_date, reason_text)
  returning id, reason into new_id, saved_reason;   -- the reason as the word filter left it

  -- Tell the other person (the bell, and Gmail when they are offline).
  select coalesce(nullif(full_name, ''), username, 'Someone') into my_name from public.profiles where id = me;
  other := case when me = proj.client_id then proj.freelancer_id else proj.client_id end;
  what := case when delay_kind = 'work' then 'send' else 'pay' end;
  insert into public.user_notifications (user_id, type, title, message, link)
  values (
    other,
    'delay_requested',
    'More time requested',
    my_name || ' asks for more time to ' || what || ' "' || proj.title || '": until '
      || to_char(new_date, 'FMMonth FMDD, YYYY') || ' instead of ' || to_char(current_day, 'FMMonth FMDD, YYYY')
      || '. Reason: "' || saved_reason || '". Open the project to accept or decline.',
    '/dashboard/project-details/' || proj.id
  );

  return new_id;
end;
$$;

revoke execute on function public.request_delay(uuid, text, date, text) from public, anon;
grant execute on function public.request_delay(uuid, text, date, text) to authenticated, service_role;

-- Answer a request: accept = true moves the date, false leaves it. Only the OTHER person
-- answers (the freelancer for a payment request, the client for a work request).
create or replace function public.answer_delay(target_request uuid, accept boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  today date := (now() at time zone 'Asia/Manila')::date;
  req public.delay_requests%rowtype;
  proj public.projects%rowtype;
  my_name text;
  note_type text;
  note_title text;
  note_text text;
begin
  if me is null then
    raise exception 'Please sign in first.';
  end if;

  select * into req from public.delay_requests where id = target_request for update;
  if not found then
    raise exception 'That request wasn''t found.';
  end if;
  select * into proj from public.projects where id = req.project_id;

  if req.kind = 'work' and me is distinct from proj.client_id then
    raise exception 'Only the client can answer this request.';
  end if;
  if req.kind = 'payment' and me is distinct from proj.freelancer_id then
    raise exception 'Only the freelancer can answer this request.';
  end if;
  if req.status <> 'pending' then
    raise exception 'This request was already answered or cancelled.';
  end if;

  select coalesce(nullif(full_name, ''), username, 'Someone') into my_name from public.profiles where id = me;

  if accept then
    -- Saying yes only works while it still means something.
    if req.to_date < today then
      raise exception 'The new date has already passed, so this request can''t be accepted anymore.';
    end if;
    if req.kind = 'work' then
      if proj.status <> 'started' or proj.due_date <> req.from_date then
        raise exception 'The project has changed since this request, so it can''t be accepted anymore.';
      end if;
      update public.projects set due_date = req.to_date where id = proj.id;
    else
      if proj.status <> 'done'
         or public.payment_due_date(proj) is distinct from req.from_date
         or proj.agreed_amount - public.project_paid_amount(proj.id, true) <= 0 then
        raise exception 'The project has changed since this request, so it can''t be accepted anymore.';
      end if;
      update public.projects set payment_due_override = req.to_date where id = proj.id;
    end if;

    update public.delay_requests set status = 'accepted', answered_at = now() where id = req.id;
    note_type := 'delay_accepted';
    note_title := 'More time agreed';
    note_text := my_name || ' agreed. '
      || case when req.kind = 'work' then '"' || proj.title || '" is now due '
              else 'The rest of "' || proj.title || '" is now due ' end
      || to_char(req.to_date, 'FMMonth FMDD, YYYY') || '.';
  else
    update public.delay_requests set status = 'declined', answered_at = now() where id = req.id;
    note_type := 'delay_declined';
    note_title := 'More time declined';
    note_text := my_name || ' couldn''t give more time. '
      || case when req.kind = 'work' then '"' || proj.title || '" is still due '
              else 'The payment for "' || proj.title || '" is still due ' end
      || to_char(req.from_date, 'FMMonth FMDD, YYYY') || '.';
  end if;

  insert into public.user_notifications (user_id, type, title, message, link)
  values (req.asked_by, note_type, note_title, note_text, '/dashboard/project-details/' || proj.id);
end;
$$;

revoke execute on function public.answer_delay(uuid, boolean) from public, anon;
grant execute on function public.answer_delay(uuid, boolean) to authenticated, service_role;

-- Take a request back while it is still waiting. Only the one who asked. It still counts
-- as one of the two requests, so asking and cancelling can't be repeated to bother the
-- other person.
create or replace function public.cancel_delay_request(target_request uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  req public.delay_requests%rowtype;
begin
  select * into req from public.delay_requests where id = target_request for update;
  if not found or req.asked_by is distinct from auth.uid() then
    raise exception 'Only the person who asked can cancel this request.';
  end if;
  if req.status <> 'pending' then
    raise exception 'This request was already answered or cancelled.';
  end if;
  update public.delay_requests set status = 'cancelled', answered_at = now() where id = req.id;
end;
$$;

revoke execute on function public.cancel_delay_request(uuid) from public, anon;
grant execute on function public.cancel_delay_request(uuid) to authenticated, service_role;
