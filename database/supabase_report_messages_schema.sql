-- Reporting a chat with its messages. Plan: PLAN-chat-report-messages.md. Run
-- this in the Supabase SQL Editor after supabase_reports_schema.sql (and the
-- chat, chat files and calls schemas, which make the messages table).
--
-- Admins can't read anyone's chat, so a report about a person used to reach them
-- with no conversation at all, unless the reporter added screenshots by hand.
-- Now the reporter ticks the messages that show the problem. The website sends
-- their ids together with the report, and the database copies those messages
-- next to the report in the same step, so:
--   - none can be made up (only messages from the chat between the reporter and
--     the person reported are accepted),
--   - the copies stay if the sender unsends or edits the message afterwards (that
--     is the evidence),
--   - a report is never saved half way: with its messages, or not at all.
-- Only admins can read the copies. The person reported can't, and neither can
-- the reporter once it is sent. A photo, video, voice message or file is not
-- copied, only what it is (its type and a file's name).

-- ---------------------------------------------------------------------------
-- 1. The ids the reporter ticked, saved with the report itself
-- ---------------------------------------------------------------------------

-- Up to 50 messages per report (the popup lists 30). Only a report about a
-- person can carry them (the trigger below checks that).
alter table public.reports
  add column chat_message_ids uuid[] not null default '{}'
  check (cardinality(chat_message_ids) <= 50);

-- ---------------------------------------------------------------------------
-- 2. The copies
-- ---------------------------------------------------------------------------

create table public.report_messages (
  id uuid primary key default gen_random_uuid(),
  -- They go away with the report.
  report_id uuid not null references public.reports (id) on delete cascade,
  -- Which chat message this is a copy of. Not a link on purpose: the message can
  -- be unsent later and the copy stays.
  message_id uuid not null,
  -- true = written by the person who sent the report, false = by the person
  -- reported. (The chat has only these two people.)
  from_reporter boolean not null,
  body text check (body is null or char_length(body) <= 2000),
  -- 'image', 'video', 'file' or 'audio' for a message that carried one (the file
  -- itself is not copied); null for plain text.
  attachment_type text check (attachment_type is null or attachment_type in ('image', 'video', 'file', 'audio')),
  attachment_name text check (attachment_name is null or char_length(attachment_name) <= 200),
  -- The line the database writes after a call ("Video call, 3:12").
  is_call boolean not null default false,
  -- The sender had edited the message before it was reported.
  edited boolean not null default false,
  -- When it was sent in the chat.
  sent_at timestamptz not null,
  constraint report_messages_one_copy unique (report_id, message_id)
);

create index report_messages_report_idx on public.report_messages (report_id, sent_at);

alter table public.report_messages enable row level security;

-- Admins read; nothing can be written from the browser (the trigger below does
-- it).
revoke all on public.report_messages from anon, authenticated;
grant select on public.report_messages to authenticated;

create policy "report_messages: admins can read"
  on public.report_messages for select
  to authenticated
  using (public.is_admin());

-- ---------------------------------------------------------------------------
-- 3. Copying the messages when the report is saved
-- ---------------------------------------------------------------------------

-- Runs right after a report with ids is saved. If anything is wrong it raises
-- an error in plain words, and the report is not saved either.
create or replace function public.copy_report_messages()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  -- The same id twice counts once.
  wanted uuid[] := array(select distinct t.msg_id from unnest(new.chat_message_ids) as t (msg_id));
  copied integer;
begin
  if new.target_type <> 'user' then
    raise exception 'Chat messages can only be sent with a report about a person.';
  end if;

  -- Only messages from the chat between the person reporting and the person
  -- reported (a chat holds just those two people).
  insert into public.report_messages
    (report_id, message_id, from_reporter, body, attachment_type, attachment_name, is_call, edited, sent_at)
  select new.id, m.id, m.sender_id = new.reporter_id, left(m.body, 2000), m.attachment_type,
         left(m.attachment_name, 200), m.call_id is not null, m.edited_at is not null, m.created_at
  from public.messages m
  join public.conversations c on c.id = m.conversation_id
  where m.id = any (wanted)
    and ((c.user_a = new.reporter_id and c.user_b = new.target_id)
      or (c.user_b = new.reporter_id and c.user_a = new.target_id));

  get diagnostics copied = row_count;
  if copied <> cardinality(wanted) then
    raise exception 'Some of those messages aren''t in your chat with this person any more (they may have been unsent). Please open the report again.';
  end if;
  return new;
end;
$$;

-- Only the trigger uses it.
revoke execute on function public.copy_report_messages() from public, anon, authenticated;

create trigger reports_copy_messages
  after insert on public.reports
  for each row
  when (cardinality(new.chat_message_ids) > 0)
  execute function public.copy_report_messages();

-- ===========================================================================
-- Part 2 (added after part 1 was applied): which message was reported
-- Run it on its own, after part 1.
-- ===========================================================================

-- When the reporter right-clicks one message ("Report Message"), the website
-- also says which one it was, so the admin's transcript can mark it among the
-- messages around it. It has to be one of the messages sent with the report.
alter table public.reports add column flagged_message_id uuid;
alter table public.reports add constraint reports_flagged_message_check
  check (flagged_message_id is null or flagged_message_id = any (chat_message_ids));

-- The copy that was flagged.
alter table public.report_messages add column flagged boolean not null default false;

-- The same function as in part 1, now also marking the flagged copy.
create or replace function public.copy_report_messages()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  -- The same id twice counts once.
  wanted uuid[] := array(select distinct t.msg_id from unnest(new.chat_message_ids) as t (msg_id));
  copied integer;
begin
  if new.target_type <> 'user' then
    raise exception 'Chat messages can only be sent with a report about a person.';
  end if;

  -- Only messages from the chat between the person reporting and the person
  -- reported (a chat holds just those two people).
  insert into public.report_messages
    (report_id, message_id, from_reporter, body, attachment_type, attachment_name, is_call, edited, flagged, sent_at)
  select new.id, m.id, m.sender_id = new.reporter_id, left(m.body, 2000), m.attachment_type,
         left(m.attachment_name, 200), m.call_id is not null, m.edited_at is not null,
         coalesce(m.id = new.flagged_message_id, false), m.created_at
  from public.messages m
  join public.conversations c on c.id = m.conversation_id
  where m.id = any (wanted)
    and ((c.user_a = new.reporter_id and c.user_b = new.target_id)
      or (c.user_b = new.reporter_id and c.user_a = new.target_id));

  get diagnostics copied = row_count;
  if copied <> cardinality(wanted) then
    raise exception 'Some of those messages aren''t in your chat with this person any more (they may have been unsent). Please open the report again.';
  end if;
  return new;
end;
$$;
