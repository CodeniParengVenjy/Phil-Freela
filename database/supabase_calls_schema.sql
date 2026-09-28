-- Voice and video calls (PLAN-hard-features.md, Step 3). Run this in the
-- Supabase SQL Editor after supabase_chat_schema.sql and
-- supabase_admin_schema.sql (it uses is_messaging_blocked()).
--
-- How a call works: WebRTC connects the two browsers directly, so the voice
-- and video never pass through our server. The browsers only need to swap
-- their "connection details" (an offer and an answer) first. Those travel in
-- the call's row below, which only the two people can read, and reach the
-- other browser instantly through Supabase Realtime.

-- ---------------------------------------------------------------------------
-- Calls
-- ---------------------------------------------------------------------------

create table public.calls (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  caller_id uuid not null references public.profiles (id) on delete cascade,
  callee_id uuid not null references public.profiles (id) on delete cascade,
  kind text not null check (kind in ('voice', 'video')),
  status text not null default 'ringing'
    check (status in ('ringing', 'accepted', 'declined', 'missed', 'ended')),
  -- The two browsers' connection details. They include IP addresses, so
  -- they're emptied as soon as the call finishes.
  offer text,
  answer text,
  created_at timestamptz not null default now(),
  answered_at timestamptz,
  -- Both browsers touch this every 20 seconds during a call (keep_call_alive),
  -- so a call whose browsers both closed can still be ended at the right time.
  last_active_at timestamptz,
  ended_at timestamptz
);

create index calls_conversation_id_idx on public.calls (conversation_id);
create index calls_caller_id_idx on public.calls (caller_id);
create index calls_callee_id_idx on public.calls (callee_id);

alter table public.calls enable row level security;

-- Only the two people in the call can see it. There are no insert, update or
-- delete rules: every change goes through the functions below, which check
-- who is asking and what the call's status allows.
create policy "calls: the two people can view"
  on public.calls for select
  to authenticated
  using (auth.uid() = caller_id or auth.uid() = callee_id);

revoke insert, update, delete on public.calls from anon, authenticated;

-- The chat line for a finished call ("Video call, 3:12", "Missed voice call").
-- One line per call; the line stays if the call row is ever deleted.
alter table public.messages
  add column call_id uuid unique references public.calls (id) on delete set null;

-- ---------------------------------------------------------------------------
-- Finishing a call
-- ---------------------------------------------------------------------------

-- Marks a call that is still ringing or going as finished, and empties the
-- connection details. Only the functions below use it.
create or replace function public.finish_call(target_call uuid, final_status text, finished_at timestamptz default now())
returns void
language sql
security definer
set search_path = public
as $$
  update public.calls
  set status = final_status, ended_at = finished_at, offer = null, answer = null
  where id = target_call and status in ('ringing', 'accepted');
$$;

revoke execute on function public.finish_call(uuid, text, timestamptz) from public, anon, authenticated;

-- Calls left behind by browsers that closed: still ringing after 45 seconds
-- (the ring lasts 30) becomes missed; a call with no keep-alive for 75
-- seconds becomes ended at its last keep-alive, so its length stays right.
create or replace function public.finish_stale_calls()
returns void
language sql
security definer
set search_path = public
as $$
  update public.calls
  set status = 'missed', ended_at = now(), offer = null, answer = null
  where status = 'ringing' and created_at < now() - interval '45 seconds';

  update public.calls
  set status = 'ended', ended_at = last_active_at, offer = null, answer = null
  where status = 'accepted' and last_active_at < now() - interval '75 seconds';
$$;

revoke execute on function public.finish_stale_calls() from public, anon, authenticated;

-- Checked every minute by Supabase's scheduler (pg_cron, already turned on
-- for the ban clean-up in supabase_admin_schema.sql).
select cron.schedule('finish-stale-calls', '* * * * *', 'select public.finish_stale_calls()');

-- When a call finishes, adds its line to the chat, sent by the caller. The
-- chat's own trigger then updates the Inbox preview, and the other person's
-- dashboard shows "Missed voice call from ..." for a missed call.
create or replace function public.add_call_chat_line()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  seconds int;
  call_length text;
  line text;
begin
  if new.status = 'ended' then
    seconds := greatest(0, round(extract(epoch from (new.ended_at - coalesce(new.answered_at, new.ended_at)))))::int;
    -- "3:12", or "1:05:09" past an hour
    call_length := case
      when seconds >= 3600 then format('%s:%s:%s', seconds / 3600, lpad((seconds % 3600 / 60)::text, 2, '0'), lpad((seconds % 60)::text, 2, '0'))
      else format('%s:%s', seconds / 60, lpad((seconds % 60)::text, 2, '0'))
    end;
    line := format('%s call, %s', initcap(new.kind), call_length);
  elsif new.status = 'missed' then
    line := format('Missed %s call', new.kind);
  else
    line := format('Declined %s call', new.kind);
  end if;

  insert into public.messages (conversation_id, sender_id, body, call_id)
  values (new.conversation_id, new.caller_id, line, new.id);
  return new;
end;
$$;

revoke execute on function public.add_call_chat_line() from public, anon, authenticated;

create trigger calls_add_chat_line
  after update of status on public.calls
  for each row
  when (old.status in ('ringing', 'accepted') and new.status in ('declined', 'missed', 'ended'))
  execute function public.add_call_chat_line();

-- ---------------------------------------------------------------------------
-- What the website calls
-- ---------------------------------------------------------------------------

-- Starts a call to the other person in a conversation. Returns the call's id.
create or replace function public.start_call(target_conversation uuid, call_kind text, offer_sdp text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  other uuid;
  new_call uuid;
begin
  if me is null then
    raise exception 'Please log in first.';
  end if;
  if call_kind is null or call_kind not in ('voice', 'video') then
    raise exception 'Unknown call type.';
  end if;
  if offer_sdp is null or length(offer_sdp) > 20000 then
    raise exception 'The call couldn''t be set up. Please try again.';
  end if;

  select case when user_a = me then user_b when user_b = me then user_a end
  into other
  from public.conversations
  where id = target_conversation;
  if other is null then
    raise exception 'Conversation not found.';
  end if;

  -- Suspended from messaging (bans included): no calls either way.
  if public.is_messaging_blocked(me) then
    raise exception 'You can''t make calls while you''re suspended from messaging.';
  end if;
  if public.is_messaging_blocked(other) then
    raise exception 'This person can''t take calls right now.';
  end if;

  -- One call at a time. These locks stop two calls to the same person from
  -- starting at the exact same moment (always taken in the same order, so
  -- two calls can't wait on each other forever).
  perform pg_advisory_xact_lock(hashtextextended(least(me, other)::text, 0));
  perform pg_advisory_xact_lock(hashtextextended(greatest(me, other)::text, 0));
  perform public.finish_stale_calls();

  if exists (
    select 1 from public.calls
    where status in ('ringing', 'accepted') and me in (caller_id, callee_id)
  ) then
    raise exception 'You''re already in a call.';
  end if;
  if exists (
    select 1 from public.calls
    where status in ('ringing', 'accepted') and other in (caller_id, callee_id)
  ) then
    raise exception 'They''re in another call. Please try again later.';
  end if;

  insert into public.calls (conversation_id, caller_id, callee_id, kind, offer)
  values (target_conversation, me, other, call_kind, offer_sdp)
  returning id into new_call;
  return new_call;
end;
$$;

-- The person being called accepts, sending their browser's connection details.
create or replace function public.answer_call(target_call uuid, answer_sdp text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
begin
  if me is null then
    raise exception 'Please log in first.';
  end if;
  if answer_sdp is null or length(answer_sdp) > 20000 then
    raise exception 'The call couldn''t be set up. Please try again.';
  end if;
  if public.is_messaging_blocked(me) then
    raise exception 'You can''t take calls while you''re suspended from messaging.';
  end if;

  -- Only while it's still ringing (30 seconds, plus a little slack for slow
  -- connections).
  update public.calls
  set status = 'accepted', answer = answer_sdp, answered_at = now(), last_active_at = now()
  where id = target_call
    and callee_id = me
    and status = 'ringing'
    and created_at > now() - interval '40 seconds';
  if not found then
    raise exception 'This call has already ended.';
  end if;
end;
$$;

-- Either person ends the call. Still ringing: the caller cancelling (or the
-- 30 seconds running out) makes it missed, the other person makes it
-- declined. Already answered: it's ended. Already finished: nothing happens.
create or replace function public.end_call(target_call uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  the_call public.calls;
begin
  select * into the_call
  from public.calls
  where id = target_call and me in (caller_id, callee_id)
  for update;
  if not found then
    raise exception 'Call not found.';
  end if;

  if the_call.status = 'ringing' then
    perform public.finish_call(the_call.id, case when me = the_call.caller_id then 'missed' else 'declined' end);
  elsif the_call.status = 'accepted' then
    perform public.finish_call(the_call.id, 'ended');
  end if;
end;
$$;

-- Both browsers call this every 20 seconds during a call. Returns false when
-- the call is no longer going (e.g. the other person hung up while this
-- browser missed the update), so the browser can close it too.
create or replace function public.keep_call_alive(target_call uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.calls
  set last_active_at = now()
  where id = target_call and auth.uid() in (caller_id, callee_id) and status = 'accepted';
  return found;
end;
$$;

revoke execute on function public.start_call(uuid, text, text) from public, anon;
revoke execute on function public.answer_call(uuid, text) from public, anon;
revoke execute on function public.end_call(uuid) from public, anon;
revoke execute on function public.keep_call_alive(uuid) from public, anon;
grant execute on function public.start_call(uuid, text, text) to authenticated;
grant execute on function public.answer_call(uuid, text) to authenticated;
grant execute on function public.end_call(uuid) to authenticated;
grant execute on function public.keep_call_alive(uuid) to authenticated;

-- Live updates: the ringing pop-up and every status change.
alter publication supabase_realtime add table public.calls;

-- ---------------------------------------------------------------------------
-- Added after the first tests (2026-09-28, migration "voice_video_calls_fixes")
-- ---------------------------------------------------------------------------

-- The Inbox badge's count (replaces the chat's own version): a finished or
-- declined call's line doesn't count as unread (both people were there), but
-- a missed call's line does.
create or replace function public.get_unread_message_count()
returns integer
language sql
stable
set search_path = public
as $$
  select count(*)::integer
  from public.messages m
  join public.conversations c on c.id = m.conversation_id
  where (c.user_a = auth.uid() or c.user_b = auth.uid())
    and m.sender_id <> auth.uid()
    and m.created_at > (case when c.user_a = auth.uid() then c.user_a_last_read_at else c.user_b_last_read_at end)
    and (m.call_id is null or exists (
      select 1 from public.calls k where k.id = m.call_id and k.status = 'missed'
    ));
$$;

-- Suspended from messaging (or banned) during a call: the call ends right
-- away for both people (a call still ringing counts as missed).
create or replace function public.end_calls_when_suspended()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  active_call record;
begin
  if not new.blocks_messaging or (new.ends_at is not null and new.ends_at <= now()) then
    return new;
  end if;

  for active_call in
    select id, status from public.calls
    where status in ('ringing', 'accepted') and new.user_id in (caller_id, callee_id)
  loop
    perform public.finish_call(active_call.id, case when active_call.status = 'ringing' then 'missed' else 'ended' end);
  end loop;
  return new;
end;
$$;

revoke execute on function public.end_calls_when_suspended() from public, anon, authenticated;

create trigger user_suspensions_end_calls
  after insert or update on public.user_suspensions
  for each row execute function public.end_calls_when_suspended();
