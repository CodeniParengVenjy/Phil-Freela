-- Files (paperclip) and voice messages (mic) in chat. Run this in the
-- Supabase SQL Editor after supabase_chat_schema.sql and
-- supabase_admin_schema.sql (it uses is_messaging_blocked() from there).
--
-- Data Privacy (RA 10173): files and voice messages go in a PRIVATE bucket
-- that only the two people in the conversation can open, through links that
-- expire. This file also stops outsiders from LISTING the older photo/video
-- bucket (chat-attachments).

-- ---------------------------------------------------------------------------
-- messages: two new attachment kinds, plus the file's name and size.
-- ---------------------------------------------------------------------------

alter table public.messages
  add column if not exists attachment_name text
    check (attachment_name is null or char_length(attachment_name) <= 200),
  add column if not exists attachment_size integer
    check (attachment_size is null or attachment_size between 0 and 10485760);

-- 'file' = a document from the paperclip, 'audio' = a voice message.
alter table public.messages drop constraint if exists messages_attachment_type_check;
alter table public.messages add constraint messages_attachment_type_check
  check (attachment_type in ('image', 'video', 'file', 'audio'));

-- For files and voice messages, attachment_url holds the file's path in the
-- chat-files bucket: "<conversation id>/<sender id>-<time>.<ext>". This rule
-- only accepts the sender's own file in THIS conversation's folder.
alter table public.messages add constraint messages_chat_file_path_check
  check (
    attachment_type is null
    or attachment_type not in ('file', 'audio')
    or attachment_url like conversation_id::text || '/' || sender_id::text || '-%'
  );

-- ---------------------------------------------------------------------------
-- Inbox preview text ("File", "Voice message") for the new kinds.
-- ---------------------------------------------------------------------------

create or replace function public.touch_conversation_last_message()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.conversations
    set last_message_at = new.created_at,
        last_message_preview = coalesce(
          left(new.body, 140),
          case new.attachment_type
            when 'video' then 'Video'
            when 'image' then 'Photo'
            when 'file' then 'File'
            when 'audio' then 'Voice message'
            else 'Attachment'
          end
        )
    where id = new.conversation_id;
  return new;
end;
$$;

-- Same labels when an unsend makes an older message the latest one.
create or replace function public.handle_message_deleted()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  latest record;
begin
  select body, attachment_type, created_at into latest
    from public.messages
    where conversation_id = old.conversation_id
    order by created_at desc
    limit 1;

  update public.conversations c
    set last_message_preview = case
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
-- Storage: the private chat-files bucket.
-- ---------------------------------------------------------------------------

-- PDF, Word, Excel, PowerPoint and text files, and voice recordings
-- (browsers record WebM, MP4 or Ogg audio), up to 10 MB.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('chat-files', 'chat-files', false, 10485760, array[
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'text/plain',
  'audio/webm',
  'audio/mp4',
  'audio/ogg'
])
on conflict (id) do nothing;

-- Upload: only into a conversation you're in, only under your own name, and
-- not while suspended from messaging.
create policy "chat-files: participants can upload"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'chat-files'
    and storage.filename(objects.name) like auth.uid()::text || '-%'
    and not public.is_messaging_blocked(auth.uid())
    and exists (
      select 1 from public.conversations c
      where c.id::text = (storage.foldername(objects.name))[1]
        and (c.user_a = auth.uid() or c.user_b = auth.uid())
    )
  );

-- Open: only the two people in the conversation.
create policy "chat-files: participants can open"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'chat-files'
    and exists (
      select 1 from public.conversations c
      where c.id::text = (storage.foldername(objects.name))[1]
        and (c.user_a = auth.uid() or c.user_b = auth.uid())
    )
  );

-- Delete (unsend): only the person who sent it.
create policy "chat-files: senders can delete their own"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'chat-files'
    and storage.filename(objects.name) like auth.uid()::text || '-%'
    and exists (
      select 1 from public.conversations c
      where c.id::text = (storage.foldername(objects.name))[1]
        and (c.user_a = auth.uid() or c.user_b = auth.uid())
    )
  );

-- ---------------------------------------------------------------------------
-- Older photo/video bucket (chat-attachments): privacy fixes.
-- ---------------------------------------------------------------------------

-- Its "anyone can view" rule also let anyone LIST every chat photo and video.
-- Now only the two people in a conversation can list its files. (The bucket
-- stays public, so the photo and video links already in chats keep working.)
drop policy if exists "chat-attachments: anyone can view" on storage.objects;
create policy "chat-attachments: participants can view"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'chat-attachments'
    and exists (
      select 1 from public.conversations c
      where c.id::text = (storage.foldername(objects.name))[1]
        and (c.user_a = auth.uid() or c.user_b = auth.uid())
    )
  );

-- It accepted any file of any size; now only the photo and video types the
-- chat sends (photos up to 5 MB and videos up to 50 MB are checked in the app).
update storage.buckets
  set allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'video/webm'],
      file_size_limit = 52428800
  where id = 'chat-attachments';
