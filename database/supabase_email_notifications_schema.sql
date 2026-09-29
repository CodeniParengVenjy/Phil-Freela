-- Email when offline. Run this in the Supabase SQL Editor after
-- supabase_presence_schema.sql, supabase_calls_schema.sql and
-- supabase_applications_schema.sql.
--
-- When something happens to a user who isn't on PhilFreela right now, they
-- get an email so they know to come back:
--   - a new chat message (at most one email per chat every 30 minutes)
--   - a missed voice or video call (same 30-minute rule)
--   - a freelancer applied to their job (at most one per job every 30 minutes)
--   - account news: anything added to user_notifications (verification
--     result, suspension, appeal answer...)
--
-- The database decides, a small server function delivers: the triggers below
-- check the rules, then call the Edge Function "send-offline-email"
-- (supabase/functions/send-offline-email), which sends the email through
-- PhilFreela's Gmail account.
--
-- Two values live in Vault (Supabase's encrypted secret store), not in this
-- file. Run once, with your own random secret code:
--   select vault.create_secret('https://<project ref>.supabase.co/functions/v1/send-offline-email', 'email_function_url');
--   select vault.create_secret('<random secret code>', 'email_hook_secret');
-- The same secret code goes into Edge Functions > Secrets as EMAIL_HOOK_SECRET,
-- so the function only sends emails the database asked for.

-- Lets the database make web requests (to call the Edge Function). Its
-- functions live in the "net" schema (net.http_post).
create extension if not exists pg_net with schema extensions;

-- Settings > Privacy & Notifications > "Email me when I'm offline".
alter table public.profiles
  add column if not exists email_when_offline boolean not null default true;

-- When each user was last emailed about each chat or job ("chat:<id>",
-- "call:<id>", "job:<id>"), for the 30-minute rule. Only the functions below
-- use it; nobody can read or change it from the website.
create table if not exists public.email_log (
  user_id uuid not null references auth.users (id) on delete cascade,
  topic text not null,
  sent_at timestamptz not null default now(),
  primary key (user_id, topic)
);

alter table public.email_log enable row level security;
revoke all on public.email_log from anon, authenticated;

-- Checks the rules and, if they all pass, asks the Edge Function to send the
-- email. email_topic = null skips the 30-minute rule (account news always sends).
-- details = what the email is about, e.g. {"kind": "message", "from": "Juan"}.
create or replace function public.queue_offline_email(recipient uuid, email_topic text, details jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  recipient_name text;
  recipient_email text;
begin
  -- 1. They haven't turned the emails off.
  select p.full_name into recipient_name
  from public.profiles p
  where p.id = recipient and p.email_when_offline;
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

-- Only the triggers below may call it (they run as the database owner).
revoke execute on function public.queue_offline_email(uuid, text, jsonb) from public, anon, authenticated;

-- New chat message, or a missed call (a finished call adds a chat line with
-- call_id set, sent by the caller; see add_call_chat_line in
-- supabase_calls_schema.sql). The email never includes the message text.
create or replace function public.email_offline_on_message()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  recipient uuid;
  sender_name text;
  the_call public.calls%rowtype;
begin
  select case when c.user_a = new.sender_id then c.user_b else c.user_a end
  into recipient
  from public.conversations c
  where c.id = new.conversation_id;

  select p.full_name into sender_name from public.profiles p where p.id = new.sender_id;

  if new.call_id is null then
    perform public.queue_offline_email(recipient, 'chat:' || new.conversation_id, jsonb_build_object(
      'kind', 'message', 'from', sender_name, 'link', '/dashboard/chat/' || new.conversation_id));
  else
    -- Only missed calls; answered and declined calls don't need an email.
    select * into the_call from public.calls k where k.id = new.call_id;
    if the_call.status = 'missed' then
      perform public.queue_offline_email(recipient, 'call:' || new.conversation_id, jsonb_build_object(
        'kind', 'missed_call', 'from', sender_name, 'call_kind', the_call.kind,
        'link', '/dashboard/chat/' || new.conversation_id));
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists email_offline_on_message on public.messages;
create trigger email_offline_on_message
  after insert on public.messages
  for each row execute function public.email_offline_on_message();

-- A freelancer applied to a client's job.
create or replace function public.email_offline_on_application()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  job public.job_posts%rowtype;
  freelancer_name text;
begin
  select * into job from public.job_posts j where j.id = new.job_post_id;
  select p.full_name into freelancer_name from public.profiles p where p.id = new.freelancer_id;

  perform public.queue_offline_email(job.client_id, 'job:' || new.job_post_id, jsonb_build_object(
    'kind', 'application', 'from', freelancer_name, 'job_title', job.title, 'link', '/dashboard/projects'));
  return new;
end;
$$;

drop trigger if exists email_offline_on_application on public.job_applications;
create trigger email_offline_on_application
  after insert on public.job_applications
  for each row execute function public.email_offline_on_application();

-- Account news. These titles and messages are written by the database's own
-- triggers (never by users), so the email can repeat them as they are.
create or replace function public.email_offline_on_notification()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.queue_offline_email(new.user_id, null, jsonb_build_object(
    'kind', 'notification', 'title', new.title, 'message', new.message,
    'link', coalesce(new.link, '/dashboard/notifications')));
  return new;
end;
$$;

drop trigger if exists email_offline_on_notification on public.user_notifications;
create trigger email_offline_on_notification
  after insert on public.user_notifications
  for each row execute function public.email_offline_on_notification();

-- The trigger functions aren't meant to be called directly either.
revoke execute on function public.email_offline_on_message() from public, anon, authenticated;
revoke execute on function public.email_offline_on_application() from public, anon, authenticated;
revoke execute on function public.email_offline_on_notification() from public, anon, authenticated;
