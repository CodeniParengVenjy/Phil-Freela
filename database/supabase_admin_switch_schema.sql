-- Switching between an admin's login and their own user login. Plan:
-- PLAN-admin-accounts.md, part 5. Run this in the Supabase SQL Editor.
--
-- A person who is an admin and also a freelancer or client has two logins (two
-- emails). This links the two, so the site can offer "Switch to my user
-- account" and "Switch to admin" for them and for nobody else. The link only
-- exists if the same person proved both logins: the admin asks for a one-time
-- code (10 minutes), then the user login hands the code back. The browser never
-- writes to these tables; only the functions below do.

-- One row per link. A link that is undone keeps its row with ended_at filled,
-- so there is never anything to remove. An admin has at most one active link
-- and so does a user account.
create table public.admin_user_links (
  id uuid primary key default gen_random_uuid(),
  admin_id uuid not null references public.admins (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  ended_at timestamptz
);

create unique index admin_user_links_one_per_admin on public.admin_user_links (admin_id) where ended_at is null;
create unique index admin_user_links_one_per_user on public.admin_user_links (user_id) where ended_at is null;
create index admin_user_links_admin_id_idx on public.admin_user_links (admin_id);
create index admin_user_links_user_id_idx on public.admin_user_links (user_id);

alter table public.admin_user_links enable row level security;
revoke all on public.admin_user_links from anon, authenticated;

-- The one-time code an admin asks for. Only a fingerprint (hash) of the code is
-- kept, and it stops working after 10 minutes or when used.
create table public.admin_link_codes (
  admin_id uuid primary key references public.admins (id) on delete cascade,
  code_hash text not null,
  expires_at timestamptz not null
);

alter table public.admin_link_codes enable row level security;
revoke all on public.admin_link_codes from anon, authenticated;

-- Step 1, signed in as the admin: get a code.
create or replace function public.make_admin_link_code()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  code text := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
begin
  if not exists (select 1 from public.admins where id = auth.uid()) then
    raise exception 'Only admins can link a user account.';
  end if;

  insert into public.admin_link_codes (admin_id, code_hash, expires_at)
  values (auth.uid(), encode(sha256(convert_to(code, 'utf8')), 'hex'), now() + interval '10 minutes')
  on conflict (admin_id) do update
    set code_hash = excluded.code_hash, expires_at = excluded.expires_at;

  return code;
end;
$$;

-- Step 2, signed in as the user account: hand the code back. This links the
-- two. An admin who links again replaces their old link.
create or replace function public.claim_admin_link(code text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  link_admin uuid;
begin
  if auth.uid() is null then
    raise exception 'Please sign in first.';
  end if;

  if exists (select 1 from public.admins where id = auth.uid()) then
    raise exception 'That is an admin login. Use your own freelancer or client account.';
  end if;

  if not exists (select 1 from public.profiles where id = auth.uid()) then
    raise exception 'That account has no PhilFreela profile yet. Finish setting it up first.';
  end if;

  select admin_id into link_admin
  from public.admin_link_codes
  where code_hash = encode(sha256(convert_to(coalesce(code, ''), 'utf8')), 'hex')
    and expires_at > now();

  if link_admin is null then
    raise exception 'That link code is wrong or has run out. Please try again.';
  end if;

  if exists (
    select 1 from public.admin_user_links
    where user_id = auth.uid() and ended_at is null and admin_id <> link_admin
  ) then
    raise exception 'That account is already linked to another admin.';
  end if;

  update public.admin_user_links set ended_at = now() where admin_id = link_admin and ended_at is null;
  insert into public.admin_user_links (admin_id, user_id) values (link_admin, auth.uid());

  -- The code is used up.
  update public.admin_link_codes set expires_at = now() where admin_id = link_admin;

  insert into public.admin_log (admin_id, admin_name, action, message, target_id)
  select a.id, a.full_name, 'admin', a.full_name || ' linked their user account.', auth.uid()
  from public.admins a where a.id = link_admin;
end;
$$;

-- Who am I linked to? One row, or none. For an admin it is their user account
-- (side = 'admin', the other is the user); for a user account it is the admin
-- (side = 'user'). Only the other login's id, name and username come back.
create or replace function public.my_link()
returns table (side text, other_id uuid, other_name text, other_username text)
language sql
stable
security definer
set search_path = public
as $$
  select 'admin'::text, l.user_id, p.full_name::text, p.username::text
  from public.admin_user_links l
  join public.profiles p on p.id = l.user_id
  where l.admin_id = auth.uid() and l.ended_at is null
  union all
  select 'user'::text, l.admin_id, a.full_name::text, a.username::text
  from public.admin_user_links l
  join public.admins a on a.id = l.admin_id
  where l.user_id = auth.uid() and l.ended_at is null;
$$;

-- Either login can undo the link.
create or replace function public.unlink_my_account()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  ended_admin uuid;
begin
  update public.admin_user_links
  set ended_at = now()
  where ended_at is null and (admin_id = auth.uid() or user_id = auth.uid())
  returning admin_id into ended_admin;

  if ended_admin is null then
    raise exception 'You are not linked to another account.';
  end if;

  insert into public.admin_log (admin_id, admin_name, action, message, target_id)
  select a.id, a.full_name, 'admin', a.full_name || ' unlinked their user account.', auth.uid()
  from public.admins a where a.id = ended_admin;
end;
$$;

revoke execute on function public.make_admin_link_code() from public, anon;
revoke execute on function public.claim_admin_link(text) from public, anon;
revoke execute on function public.my_link() from public, anon;
revoke execute on function public.unlink_my_account() from public, anon;
grant execute on function public.make_admin_link_code() to authenticated;
grant execute on function public.claim_admin_link(text) to authenticated;
grant execute on function public.my_link() to authenticated;
grant execute on function public.unlink_my_account() to authenticated;
