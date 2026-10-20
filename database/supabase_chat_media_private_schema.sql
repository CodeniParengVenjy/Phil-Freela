-- Security hardening, part 2: chat photos and videos become private.
-- Run this in the Supabase SQL Editor AFTER the new website is live (the one
-- that opens chat photos through links that expire). Running it before makes
-- the photos in open chats stop loading, because the old website shows them
-- from the public link this file removes.
--
-- Why: chat photos and videos sat in a PUBLIC bucket, so anyone who had a
-- link could open them without signing in, forever, even after the message
-- was unsent. And the message could hold any web address, so someone calling
-- the database directly could send a picture hosted on another site and learn
-- the reader's IP address when the chat opened. Documents and voice messages
-- were already private; now photos and videos work the same way.
--
-- Test: database/test_chat_media_private.sql (rolled back, changes nothing).

-- 1. A message keeps only the file's path (chat id / sender id - time . type),
-- not the whole public link. The website reads both forms.
update public.messages
   set attachment_url = regexp_replace(
         attachment_url,
         '^https://[a-z0-9]+\.supabase\.co/storage/v1/object/public/chat-attachments/',
         '')
 where attachment_type in ('image', 'video')
   and attachment_url like 'https://%';

-- 2. A photo or video message must point at the sender's own file in this chat.
-- (The same rule documents and voice messages already have; see
-- messages_chat_file_path_check.)
alter table public.messages
  add constraint messages_chat_media_path_check
  check (
    attachment_type is null
    or attachment_type not in ('image', 'video')
    or attachment_url ~ ('^' || conversation_id::text || '/' || sender_id::text || '-[0-9]+\.[a-z0-9]+$')
  );

-- 3. The bucket is private from now on.
update storage.buckets set public = false where id = 'chat-attachments';

-- 4. Unsend: the sender can remove their own photo or video file (before, the
-- file stayed in the public bucket after the message was unsent).
create policy "chat-attachments: senders can delete their own"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'chat-attachments'
    and storage.filename(name) like (auth.uid()::text || '-%')
    and exists (
      select 1 from public.conversations c
      where c.id::text = (storage.foldername(objects.name))[1]
        and (c.user_a = auth.uid() or c.user_b = auth.uid())
    )
  );

-- 5. The sign-in page no longer asks whether an email belongs to an admin
-- (anyone could use that to list the admins' emails), so close the question.
revoke execute on function public.is_admin_email(text) from anon, authenticated, public;
