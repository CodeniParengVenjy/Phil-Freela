-- Admin > Pending Users: a Delete button, so a person who never confirmed (a
-- typo in the email, a lost link) can be cleared out and sign up again from the
-- start. Plan: PLAN-pending-users.md ("Delete a pending sign-up"). Run this in
-- the Supabase SQL Editor after supabase_pending_users_schema.sql.
--
-- A pending person has only a login (auth.users): no profile, no services, no
-- messages. Everything that points at a login is "on delete cascade" (checked
-- on the live database), so removing the login removes every trace and the same
-- email can sign up again. No new tables.
--
-- It uses the same rule as admin_pending_users() (not confirmed, no profile, not
-- an admin), and it checks that rule again right at the moment of deleting, so
-- someone who opened their confirmation link a second ago is never deleted by a
-- button that was drawn a minute ago.

create or replace function public.admin_delete_pending_user(target_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  pending_email text;
  pending_name text;
begin
  if not public.is_admin() then
    raise exception 'Only admins can delete pending users.';
  end if;

  -- Read who it is first, for the Activity Log line (the login is gone after).
  select u.email::text, coalesce(u.raw_user_meta_data->>'full_name', '')
  into pending_email, pending_name
  from auth.users u
  where u.id = target_id
    and u.email_confirmed_at is null
    and not exists (select 1 from public.profiles p where p.id = u.id)
    and not exists (select 1 from public.admins a where a.id = u.id);

  if not found then
    raise exception 'That person is no longer waiting on a confirmation email.';
  end if;

  delete from auth.users where id = target_id and email_confirmed_at is null;

  if not found then
    raise exception 'That person is no longer waiting on a confirmation email.';
  end if;

  perform public.write_admin_log(
    'user_delete',
    'deleted the pending sign-up of ' || coalesce(nullif(pending_name, ''), 'someone with no name') || ' (' || pending_email || ').'
  );
end;
$$;

revoke execute on function public.admin_delete_pending_user(uuid) from public, anon;
grant execute on function public.admin_delete_pending_user(uuid) to authenticated;
