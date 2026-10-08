-- Choosing which emails you get (Settings > Privacy & Notifications). Run this
-- once in the Supabase SQL Editor, after supabase_email_notifications_schema.sql.
--
-- "Email me when I'm offline" used to be all or nothing. Now a user can keep
-- it on and turn single kinds of email off: new messages, missed calls, job
-- applications, or account notifications (bookings, verification,
-- suspensions). No new rules are needed for the setting itself: users can
-- already update only their own profile row.

-- The kinds this user turned OFF. Empty = every kind is on, so nothing
-- changes for anyone until they untick something.
alter table public.profiles
  add column if not exists email_muted text[] not null default '{}'
    check (email_muted <@ array['chat', 'call', 'job', 'account']);

-- The one function that decides whether an offline email is sent. It is the
-- same as in supabase_email_notifications_schema.sql, with the user's choice
-- added to step 1. The kind is read from the topic the email is filed under:
--   'chat:<conversation>' = a new message      -> 'chat'
--   'call:<conversation>' = a missed call      -> 'call'
--   'job:<job post>'      = a job application  -> 'job'
--   no topic              = an account notification -> 'account'
create or replace function public.queue_offline_email(recipient uuid, email_topic text, details jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  recipient_name text;
  recipient_email text;
  email_kind text := case when email_topic is null then 'account' else split_part(email_topic, ':', 1) end;
begin
  -- 1. They haven't turned the emails off, or this kind of email off.
  select p.full_name into recipient_name
  from public.profiles p
  where p.id = recipient and p.email_when_offline
    and not (email_kind = any (p.email_muted));
  if not found then return; end if;

  -- 2. They're offline: no dashboard open in the last 2 minutes (the same
  --    rule as the "Online" dot in Chat, see supabase_presence_schema.sql).
  if exists (
    select 1 from public.user_presence u
    where u.user_id = recipient and u.last_seen_at > now() - interval '2 minutes'
  ) then return; end if;

  -- 3. They have an email address (a phone-only login may not).
  select u.email into recipient_email from auth.users u where u.id = recipient;
  if recipient_email is null or recipient_email = '' then return; end if;

  -- 4. Not already emailed about this chat or job in the last 30 minutes.
  if email_topic is not null then
    if exists (
      select 1 from public.email_log l
      where l.user_id = recipient and l.topic = email_topic
        and l.sent_at > now() - interval '30 minutes'
    ) then return; end if;

    insert into public.email_log (user_id, topic, sent_at)
    values (recipient, email_topic, now())
    on conflict (user_id, topic) do update set sent_at = excluded.sent_at;
  end if;

  -- 5. Ask the Edge Function to send it. pg_net sends the request after the
  --    message is saved, so a slow or failed email never delays the chat.
  perform net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'email_function_url'),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-email-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'email_hook_secret')
    ),
    body := details || jsonb_build_object('to', recipient_email, 'name', recipient_name)
  );
exception when others then
  -- An email problem must never stop a message or application from saving.
  raise warning 'Offline email skipped: %', sqlerrm;
end;
$$;
