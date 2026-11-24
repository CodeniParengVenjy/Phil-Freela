-- Appeals against the late block (PLAN-late-appeals.md). The user, 2026-11-24:
-- "add appeal function", and chose: the CLIENT decides, and only the late block
-- can be appealed. Runs after supabase_late_block_schema.sql.
--
-- A freelancer who didn't send a client's project by its due date can't apply
-- to that client's job posts until the client allows it again. Now the
-- freelancer can appeal to that client from the project's page with a short
-- message, and the client answers Allow or Decline (with an optional reason).
-- Two appeals per late project, one waiting at a time. Allowing does the same
-- as the "Allow to apply again" button. Admins are not involved.

-- ---------------------------------------------------------------------------
-- 1. The appeals
-- ---------------------------------------------------------------------------

create table if not exists public.late_appeals (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  freelancer_id uuid not null references public.profiles (id) on delete cascade,
  -- The functions below check 10-500 typed characters; the table allows a
  -- little more because the word filter can change the length.
  message text not null check (char_length(message) between 1 and 1000),
  status text not null default 'pending' check (status in ('pending', 'allowed', 'declined', 'cancelled')),
  -- The client's optional reason when declining (up to 300 typed characters).
  client_note text check (client_note is null or char_length(client_note) between 1 and 600),
  created_at timestamptz not null default now(),
  answered_at timestamptz
);

create index if not exists late_appeals_project_idx on public.late_appeals (project_id);
create index if not exists late_appeals_freelancer_idx on public.late_appeals (freelancer_id);

-- One appeal waiting for an answer at a time, for each project.
create unique index if not exists late_appeals_one_pending_idx
  on public.late_appeals (project_id) where status = 'pending';

-- Both texts go through the word filter, like every text people type.
create or replace trigger late_appeals_mask_words
  before insert or update of message, client_note on public.late_appeals
  for each row execute function public.mask_columns('message', 'client_note');

-- Only the project's client and freelancer can read; nobody changes a row
-- directly (only the three functions below do).
alter table public.late_appeals enable row level security;

create policy "late_appeals: the client and freelancer can view"
  on public.late_appeals for select to authenticated
  using (exists (
    select 1 from public.projects p
    where p.id = late_appeals.project_id
      and (select auth.uid()) in (p.client_id, p.freelancer_id)
  ));

revoke all on public.late_appeals from anon, authenticated;
grant select on public.late_appeals to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Three new kinds of notification (the LIVE list, 42 kinds on 2026-11-24,
--    plus the three below)
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
    'delay_requested', 'delay_accepted', 'delay_declined', 'project_ended',
    'late_appeal_sent', 'late_appeal_allowed', 'late_appeal_declined'
  ]::text[]));

-- ---------------------------------------------------------------------------
-- 3. "Allow to apply again" also answers a waiting appeal and tells the
--    freelancer (before, it told nobody). Spliced into the LIVE function: the
--    lines below go right after its update, nothing else changes.
-- ---------------------------------------------------------------------------

do $splice$
declare
  def text := pg_get_functiondef('public.allow_late_freelancer(uuid)'::regprocedure);
  anchor text := $a$  where id = target_project and late_allowed_at is null;
$a$;
  added text := $b$
  -- A waiting appeal counts as allowed, and the freelancer is told
  -- (PLAN-late-appeals.md). FOUND = this update really lifted the block.
  if found then
    update public.late_appeals set status = 'allowed', answered_at = now()
    where project_id = target_project and status = 'pending';
    insert into public.user_notifications (user_id, type, title, message, link)
    values (
      proj.freelancer_id, 'late_appeal_allowed', 'You can apply again',
      (select coalesce(nullif(full_name, ''), username, 'Your client') from public.profiles where id = proj.client_id)
        || ' allowed you to apply to their job posts again (the late project "' || proj.title || '").',
      '/dashboard/project-details/' || proj.id
    );
  end if;
$b$;
begin
  if position('late_appeal_allowed' in def) > 0 then
    return;   -- already done
  end if;
  if (length(def) - length(replace(def, anchor, ''))) / length(anchor) <> 1 then
    raise exception 'allow_late_freelancer: the anchor must appear exactly once';
  end if;
  execute replace(def, anchor, anchor || added);
end;
$splice$;

-- ---------------------------------------------------------------------------
-- 4. The three functions
-- ---------------------------------------------------------------------------

-- The freelancer appeals. Returns the new appeal's id. The sentences it raises
-- are plain words; the website shows them as they are.
create or replace function public.appeal_late_block(target_project uuid, appeal_message text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  proj public.projects%rowtype;
  typed text := btrim(coalesce(appeal_message, ''));
  new_id uuid;
  saved text;
  my_name text;
begin
  if me is null then
    raise exception 'Please sign in first.';
  end if;

  -- The project row is locked so two appeals sent at once are counted right.
  select * into proj from public.projects where id = target_project for update;
  if not found or proj.freelancer_id is distinct from me then
    raise exception 'Only the freelancer of this project can appeal.';
  end if;
  if not public.missed_deadline(proj) or proj.late_allowed_at is not null then
    raise exception 'Nothing is blocked for this project, so there is nothing to appeal.';
  end if;
  if char_length(typed) < 10 or char_length(typed) > 500 then
    raise exception 'Tell them why, in 10 to 500 characters.';
  end if;

  -- Two appeals per late project, whatever the answer; one waiting at a time.
  if exists (select 1 from public.late_appeals where project_id = proj.id and status = 'pending') then
    raise exception 'Your appeal is still waiting for an answer.';
  end if;
  if (select count(*) from public.late_appeals where project_id = proj.id) >= 2 then
    raise exception 'You have already used both of your appeals for this project.';
  end if;

  insert into public.late_appeals (project_id, freelancer_id, message)
  values (proj.id, me, typed)
  returning id, message into new_id, saved;   -- the message as the word filter left it

  -- Tell the client (the bell, and Gmail when they are offline).
  select coalesce(nullif(full_name, ''), username, 'Your freelancer') into my_name from public.profiles where id = me;
  insert into public.user_notifications (user_id, type, title, message, link)
  values (
    proj.client_id,
    'late_appeal_sent',
    'Appeal to apply again',
    my_name || ' appealed to apply to your job posts again. They were blocked because "' || proj.title
      || '" wasn''t sent by its due date (' || to_char(proj.due_date, 'FMMonth FMDD, YYYY') || '). Their message: "'
      || saved || '". Open the project to allow or decline.',
    '/dashboard/project-details/' || proj.id
  );

  return new_id;
end;
$$;

revoke execute on function public.appeal_late_block(uuid, text) from public, anon;
grant execute on function public.appeal_late_block(uuid, text) to authenticated, service_role;

-- The client answers: accept = true lifts the block (through
-- allow_late_freelancer, which also tells the freelancer), false keeps it,
-- with an optional reason the freelancer sees.
create or replace function public.answer_late_appeal(target_appeal uuid, accept boolean, decline_reason text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  req public.late_appeals%rowtype;
  proj public.projects%rowtype;
  typed_reason text := nullif(btrim(coalesce(decline_reason, '')), '');
  saved_reason text;
  my_name text;
  used integer;
begin
  if me is null then
    raise exception 'Please sign in first.';
  end if;

  select * into req from public.late_appeals where id = target_appeal for update;
  if not found then
    raise exception 'That appeal wasn''t found.';
  end if;
  select * into proj from public.projects where id = req.project_id;
  if proj.client_id is distinct from me then
    raise exception 'Only the client of this project can answer this appeal.';
  end if;
  if req.status <> 'pending' then
    raise exception 'This appeal was already answered or cancelled.';
  end if;

  if accept then
    if public.missed_deadline(proj) and proj.late_allowed_at is null then
      -- Lifts the block, marks this appeal allowed and tells the freelancer.
      perform public.allow_late_freelancer(proj.id);
    else
      -- Nothing is blocked any more (for example the due date was moved).
      update public.late_appeals set status = 'allowed', answered_at = now() where id = req.id;
    end if;
    return;
  end if;

  if char_length(typed_reason) > 300 then
    raise exception 'Keep the reason to 300 characters or fewer.';
  end if;
  update public.late_appeals
  set status = 'declined', client_note = typed_reason, answered_at = now()
  where id = req.id
  returning client_note into saved_reason;   -- the reason as the word filter left it

  select count(*) into used from public.late_appeals where project_id = proj.id;
  select coalesce(nullif(full_name, ''), username, 'Your client') into my_name from public.profiles where id = me;
  insert into public.user_notifications (user_id, type, title, message, link)
  values (
    req.freelancer_id,
    'late_appeal_declined',
    'Appeal declined',
    my_name || ' declined your appeal, so you still can''t apply to their job posts.'
      || coalesce(' Reason: "' || saved_reason || '".', '')
      || case when used < 2 then ' You can appeal one more time from the project''s page.'
              else ' You have used both appeals for this project.' end,
    '/dashboard/project-details/' || proj.id
  );
end;
$$;

revoke execute on function public.answer_late_appeal(uuid, boolean, text) from public, anon;
grant execute on function public.answer_late_appeal(uuid, boolean, text) to authenticated, service_role;

-- The freelancer takes a waiting appeal back. It still counts as one of the
-- two, so appealing and cancelling can't be repeated to bother the client.
create or replace function public.cancel_late_appeal(target_appeal uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  req public.late_appeals%rowtype;
begin
  select * into req from public.late_appeals where id = target_appeal for update;
  if not found or req.freelancer_id is distinct from auth.uid() then
    raise exception 'Only the freelancer who appealed can cancel it.';
  end if;
  if req.status <> 'pending' then
    raise exception 'This appeal was already answered or cancelled.';
  end if;
  update public.late_appeals set status = 'cancelled', answered_at = now() where id = req.id;
end;
$$;

revoke execute on function public.cancel_late_appeal(uuid) from public, anon;
grant execute on function public.cancel_late_appeal(uuid) to authenticated, service_role;
