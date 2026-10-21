-- Unsent messages. Run this in the Supabase SQL Editor BEFORE the website that
-- uses it goes live (the chat asks for the new column unsent_at).
--
-- Before: Unsend removed the whole message row, so the chat showed nothing
-- where the message had been. Now the row stays with unsent_at filled in and
-- its content (text and file link) emptied, and both people see a line:
-- "Maria unsent a message" / "You unsent a message".
--
-- Needs supabase_chat_schema.sql, supabase_chat_files_schema.sql and
-- supabase_security_hardening_schema.sql (this changes messages_edit_guard).
-- Only the one DROP CONSTRAINT in part 1 is destructive; it is put back in the
-- next line of the same part.

-- ---------------------------------------------------------------------------
-- 1. The column, and the rules about it.
-- ---------------------------------------------------------------------------

alter table public.messages add column if not exists unsent_at timestamptz;

-- A message used to need text or an attachment. An unsent one has neither.
alter table public.messages drop constraint messages_body_or_attachment_check;
alter table public.messages add constraint messages_body_or_attachment_check
  check (
    unsent_at is not null
    or (body is not null and char_length(btrim(body)) > 0)
    or attachment_url is not null
  );

-- An unsent message is always empty, whichever way it got that way.
alter table public.messages add constraint messages_unsent_is_empty_check
  check (unsent_at is null or (body is null and attachment_url is null));

-- ---------------------------------------------------------------------------
-- 2. The edit guard: what a signed-in person may change on a message.
-- ---------------------------------------------------------------------------

-- Before: only the text. Now also: unsending (the content is emptied here, and
-- the time is the database's own), and once unsent nothing comes back (no
-- edit, no restoring). delivered_at is still set by mark_messages_delivered().
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

  if old.unsent_at is not null then
    if (new.unsent_at, new.body, new.edited_at, new.attachment_url,
        new.attachment_type, new.attachment_name, new.attachment_size)
       is distinct from
       (old.unsent_at, old.body, old.edited_at, old.attachment_url,
        old.attachment_type, old.attachment_name, old.attachment_size) then
      raise exception 'An unsent message can''t be changed.';
    end if;
  elsif new.unsent_at is not null then
    -- Unsending. A call line isn't a message the person wrote.
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
-- 3. The Unsend button calls this. Only the sender, never a call line. It is
-- security definer so it still works for someone suspended from messaging
-- (they could remove their messages before too).
-- ---------------------------------------------------------------------------

create or replace function public.unsend_message(target_message_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Please sign in first.';
  end if;

  update public.messages
    set unsent_at = now()
    where id = target_message_id
      and sender_id = auth.uid()
      and unsent_at is null
      and call_id is null;

  -- Nothing changed: fine if it was already unsent, otherwise it isn't theirs.
  if not found and not exists (
    select 1 from public.messages
    where id = target_message_id and sender_id = auth.uid() and unsent_at is not null
  ) then
    raise exception 'That message can''t be unsent.';
  end if;
end;
$$;

revoke all on function public.unsend_message(uuid) from public, anon, authenticated;
grant execute on function public.unsend_message(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. The Inbox preview. If the newest message of a chat is unsent, the preview
-- says so (the text is saved once for both people, so it has no name).
-- ---------------------------------------------------------------------------

create or replace function public.handle_message_unsent()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.unsent_at is null and new.unsent_at is not null
     and not exists (
       select 1 from public.messages
       where conversation_id = new.conversation_id and created_at > new.created_at
     ) then
    update public.conversations
      set last_message_preview = 'Message unsent'
      where id = new.conversation_id;
  end if;
  return new;
end;
$$;

create trigger messages_unsent_touch_conversation
  after update of unsent_at on public.messages
  for each row execute function public.handle_message_unsent();

revoke execute on function public.handle_message_unsent() from public, anon, authenticated;

-- Same label when a removed message makes an unsent one the newest (the older
-- version of this function is in supabase_chat_files_schema.sql).
create or replace function public.handle_message_deleted()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  latest record;
begin
  select body, attachment_type, unsent_at, created_at into latest
    from public.messages
    where conversation_id = old.conversation_id
    order by created_at desc
    limit 1;

  update public.conversations c
    set last_message_preview = case
          when latest.unsent_at is not null then 'Message unsent'
          when latest.body is not null then left(latest.body, 140)
          when latest.attachment_type = 'video' then 'Video'
          when latest.attachment_type = 'image' then 'Photo'
          when latest.attachment_type = 'file' then 'File'
          when latest.attachment_type = 'audio' then 'Voice message'
          else null
        end,
        last_message_at = coalesce(latest.created_at, c.created_at)
    where c.id = old.conversation_id;
  return old;
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. The unread number on the Inbox doesn't count unsent messages (there is
-- nothing to read in them).
-- ---------------------------------------------------------------------------

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
    and m.unsent_at is null
    and m.created_at > (case when c.user_a = auth.uid() then c.user_a_last_read_at else c.user_b_last_read_at end)
    and (m.call_id is null or exists (
      select 1 from public.calls k where k.id = m.call_id and k.status = 'missed'
    ));
$$;
