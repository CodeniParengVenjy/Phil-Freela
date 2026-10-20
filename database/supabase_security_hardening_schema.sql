-- Security hardening, part 1 (from the 2026-10-20 security check).
-- Run this in the Supabase SQL Editor. It is safe to run while the website is
-- live: the website never does any of the things this closes.
--
-- What it closes:
--   1. Nobody can upload to the public "marketplace-images" bucket any more.
--      Service photos and videos now go through the AI service (watermark,
--      copy check), so a direct upload was a way around both.
--   2. services.image_url (the old, pre-watermark picture link) can no longer
--      be written by a signed-in user. Anyone could point it at any picture,
--      which then showed on the offer without a watermark or a copy check.
--   3. A message's sender can only change the text (and the "edited" time).
--      Before, the policy let them change every column of their own message,
--      for example move it into another chat or swap the attachment link.
--   4. A person can start at most 20 new chats a day (spam, and every new chat
--      can send an email from PhilFreela's mail account).
--   5. Signed-out visitors can no longer ask how many admins there are.
-- Part 2 (chat photos and videos become private) is
-- database/supabase_chat_media_private_schema.sql: run it AFTER the new
-- website is live, because it changes how those links are stored.
--
-- Test: database/test_security_hardening.sql (rolled back, changes nothing).

-- 1. marketplace-images: no more uploads. (alter policy, so there is never a
-- moment with no rule at all. Removing old files stays allowed.)
alter policy "marketplace-images: owners can upload to their folder"
  on storage.objects
  with check (false);

alter policy "marketplace-images: owners can update their files"
  on storage.objects
  using (false)
  with check (false);

-- 2. services.image_url: only the AI service (a call with no signed-in user)
-- may set it. Clearing it (null) is always fine.
create or replace function public.block_service_image_url()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if auth.uid() is not null
     and new.image_url is not null
     and (tg_op = 'INSERT' or new.image_url is distinct from old.image_url) then
    raise exception 'Photos and videos are added with the upload form.';
  end if;
  return new;
end;
$$;

create trigger services_block_image_url
  before insert or update of image_url on public.services
  for each row execute function public.block_service_image_url();

-- 3. messages: a signed-in person can only change the text and the edited time.
-- (delivered_at is also allowed: mark_messages_delivered() sets it.)
create or replace function public.messages_edit_guard()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if auth.uid() is not null
     and (new.conversation_id, new.sender_id, new.created_at, new.call_id,
          new.attachment_url, new.attachment_type, new.attachment_name, new.attachment_size)
         is distinct from
         (old.conversation_id, old.sender_id, old.created_at, old.call_id,
          old.attachment_url, old.attachment_type, old.attachment_name, old.attachment_size) then
    raise exception 'Only the text of a message can be edited.';
  end if;
  return new;
end;
$$;

create trigger messages_edit_guard
  before update on public.messages
  for each row execute function public.messages_edit_guard();

-- 4. conversations: the person starting a chat is always user_a (that is what
-- get_or_create_conversation does), so the policy now requires it and the
-- trigger can count a person's new chats exactly.
alter policy "conversations: participants can insert"
  on public.conversations
  with check (auth.uid() = user_a);

create or replace function public.limit_new_conversations()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if auth.uid() is not null
     and (select count(*) from public.conversations
          where user_a = new.user_a and created_at > now() - interval '24 hours') >= 20 then
    raise exception 'You have started a lot of new chats today. Please try again tomorrow.';
  end if;
  return new;
end;
$$;

create trigger conversations_limit_new
  before insert on public.conversations
  for each row execute function public.limit_new_conversations();

-- 5. admin_count(): the "first admin" setup rule still uses it for signed-in
-- people, but a signed-out visitor has no reason to ask.
revoke execute on function public.admin_count() from anon, public;
