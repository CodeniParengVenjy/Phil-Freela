-- Admin "My Profile": admins can change their own name and username, with the
-- same waiting times as users (name every 7 days, username every 30 days).
-- Plan: PLAN-admin-accounts.md, part 3. Run this in the Supabase SQL Editor.

-- When each was last changed. Empty until the first change.
alter table public.admins
  add column name_changed_at timestamptz,
  add column username_changed_at timestamptz;

-- The only way an admin changes their own name or username. There is still no
-- update rule on the admins table, so nobody can reach their role or the
-- dates through it. Changing one at a time or both is fine; a value that is
-- sent unchanged is ignored and starts no waiting time.
create or replace function public.update_my_admin_profile(new_name text, new_username text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  me public.admins%rowtype;
  name_changes boolean;
  username_changes boolean;
begin
  select * into me from public.admins where id = auth.uid();
  if not found then
    raise exception 'Only admins can change an admin profile.';
  end if;

  new_name := btrim(coalesce(new_name, ''));
  new_username := btrim(coalesce(new_username, ''));

  if new_name = '' then
    raise exception 'Please enter a name.';
  end if;
  if char_length(new_name) > 100 then
    raise exception 'Your name can''t be longer than 100 characters.';
  end if;
  if new_username = '' then
    raise exception 'Please choose a username.';
  end if;
  if char_length(new_username) > 60 then
    raise exception 'Your username can''t be longer than 60 characters.';
  end if;

  name_changes := new_name is distinct from me.full_name;
  username_changes := new_username is distinct from me.username;

  if name_changes and me.name_changed_at is not null and me.name_changed_at > now() - interval '7 days' then
    raise exception 'You can change your name again on %.',
      to_char((me.name_changed_at + interval '7 days') at time zone 'Asia/Manila', 'Mon FMDD, YYYY, FMHH12:MI AM');
  end if;
  if username_changes and me.username_changed_at is not null and me.username_changed_at > now() - interval '30 days' then
    raise exception 'You can change your username again on %.',
      to_char((me.username_changed_at + interval '30 days') at time zone 'Asia/Manila', 'Mon FMDD, YYYY, FMHH12:MI AM');
  end if;

  update public.admins
  set full_name = new_name,
      username = new_username,
      name_changed_at = case when name_changes then now() else name_changed_at end,
      username_changed_at = case when username_changes then now() else username_changed_at end
  where id = me.id;
exception
  when unique_violation then
    raise exception 'That username is already taken.';
end;
$$;

revoke execute on function public.update_my_admin_profile(text, text) from public, anon;
grant execute on function public.update_my_admin_profile(text, text) to authenticated;
