-- Private 1:1 messaging schema, extends database/supabase_schema.sql. Run
-- this in the Supabase SQL Editor after that file (or see supabase_schema.sql's
-- note -- this has already been applied to the live project via Supabase MCP
-- migrations: add_private_messaging, restrict_touch_conversation_trigger_fn).

create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  user_a uuid not null references public.profiles(id) on delete cascade,
  user_b uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  last_message_at timestamptz not null default now(),
  last_message_preview text,
  constraint conversations_distinct_users check (user_a <> user_b)
);

-- Strictly 1:1 DMs (no participants junction table -- there's no group-chat
-- UI anywhere in this app), so a pair of users can only ever have one
-- conversation regardless of who starts it.
create unique index conversations_unique_pair_idx
  on public.conversations (least(user_a, user_b), greatest(user_a, user_b));
create index conversations_user_a_idx on public.conversations (user_a);
create index conversations_user_b_idx on public.conversations (user_b);

alter table public.conversations enable row level security;

create policy "conversations: participants can select"
  on public.conversations for select
  using (auth.uid() = user_a or auth.uid() = user_b);

create policy "conversations: participants can insert"
  on public.conversations for insert
  with check (auth.uid() = user_a or auth.uid() = user_b);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  body text not null check (char_length(btrim(body)) > 0),
  created_at timestamptz not null default now()
);

create index messages_conversation_created_idx
  on public.messages (conversation_id, created_at);
create index messages_sender_id_idx on public.messages (sender_id);

alter table public.messages enable row level security;

create policy "messages: participants can select"
  on public.messages for select
  using (exists (
    select 1 from public.conversations c
    where c.id = messages.conversation_id
      and (c.user_a = auth.uid() or c.user_b = auth.uid())
  ));

create policy "messages: participants can insert own"
  on public.messages for insert
  with check (
    sender_id = auth.uid()
    and exists (
      select 1 from public.conversations c
      where c.id = messages.conversation_id
        and (c.user_a = auth.uid() or c.user_b = auth.uid())
    )
  );

-- Keeps the Inbox's ordering/preview denormalized on conversations without
-- granting participants a broad UPDATE there (same rationale as
-- admin_count() in supabase_admin_schema.sql: scope the privileged write to
-- exactly this one path). EXECUTE is revoked from public/anon/authenticated
-- below since this must only ever run as a trigger, never called directly.
create or replace function public.touch_conversation_last_message()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.conversations
    set last_message_at = new.created_at,
        last_message_preview = left(new.body, 140)
    where id = new.conversation_id;
  return new;
end;
$$;

create trigger messages_touch_conversation
  after insert on public.messages
  for each row execute function public.touch_conversation_last_message();

revoke execute on function public.touch_conversation_last_message() from public, anon, authenticated;

-- Get-or-create, so "message this user" is idempotent regardless of who
-- starts the conversation first. SECURITY INVOKER: the insert still goes
-- through conversations' own RLS insert policy above.
create or replace function public.get_or_create_conversation(other_id uuid)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  me uuid := auth.uid();
  conv_id uuid;
begin
  if me is null then
    raise exception 'Not authenticated';
  end if;
  if other_id = me then
    raise exception 'Cannot start a conversation with yourself';
  end if;

  select id into conv_id from public.conversations
    where least(user_a, user_b) = least(me, other_id)
      and greatest(user_a, user_b) = greatest(me, other_id);
  if conv_id is not null then
    return conv_id;
  end if;

  insert into public.conversations (user_a, user_b)
    values (me, other_id)
    on conflict (least(user_a, user_b), greatest(user_a, user_b)) do nothing
    returning id into conv_id;

  if conv_id is null then
    select id into conv_id from public.conversations
      where least(user_a, user_b) = least(me, other_id)
        and greatest(user_a, user_b) = greatest(me, other_id);
  end if;

  return conv_id;
end;
$$;

grant execute on function public.get_or_create_conversation(uuid) to authenticated;

-- profiles RLS is otherwise self-only (see supabase_schema.sql) plus an
-- admin-only policy (see supabase_admin_schema.sql), so without this, the
-- OTHER participant's name/username would silently fail to resolve in the
-- Inbox/Chat UI's profile embeds. Scoped narrowly: you can only see someone
-- you already share a real conversation with. No self-recursion risk since
-- this checks conversations, not profiles itself.
create policy "profiles: conversation participants can view each other"
  on public.profiles for select
  using (
    exists (
      select 1 from public.conversations c
      where (c.user_a = auth.uid() and c.user_b = profiles.id)
         or (c.user_b = auth.uid() and c.user_a = profiles.id)
    )
  );

alter publication supabase_realtime add table public.messages;
alter publication supabase_realtime add table public.conversations;
