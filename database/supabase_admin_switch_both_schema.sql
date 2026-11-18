-- Switch to BOTH user accounts (PLAN-separate-accounts.md, Step 9).
-- Run after supabase_admin_switch_schema.sql and supabase_account_splits_schema.sql.
--
-- An admin links ONE user account (admin_user_links). Since Freelancer and
-- Client accounts were separated, that person may have two: the linked one and
-- its separated partner (account_splits). my_links() lists every account this
-- login can switch to (my_link() stays as it was, for older pages):
--   an admin    -> the linked user account (direct) and its separated partner
--   a user      -> the admin, when this account OR its separated partner is the
--                  linked one (so "Switch to admin" shows on both)
-- other_role is 'freelancer' / 'client' for user accounts, 'admin' for the admin.

create or replace function public.my_links()
returns table (side text, other_id uuid, other_name text, other_username text, other_role text, direct boolean)
language sql
stable
security definer
set search_path = public
as $$
  with mine as (
    -- the user account this admin linked
    select l.user_id from public.admin_user_links l
    where l.admin_id = auth.uid() and l.ended_at is null
  ),
  partners as (
    -- that account's separated partner
    select case when s.from_user = m.user_id then s.to_user else s.from_user end as id
    from mine m
    join public.account_splits s
      on s.done_at is not null and s.to_user is not null
     and (s.from_user = m.user_id or s.to_user = m.user_id)
  ),
  my_partners as (
    -- for a user login: its own separated partner
    select case when s.from_user = auth.uid() then s.to_user else s.from_user end as id
    from public.account_splits s
    where s.done_at is not null and s.to_user is not null
      and (s.from_user = auth.uid() or s.to_user = auth.uid())
  )
  select t.side, t.other_id, t.other_name, t.other_username, t.other_role, t.direct
  from (
    select 'admin'::text, p.id, p.full_name::text, p.username::text, p.account_type::text, true
    from mine m join public.profiles p on p.id = m.user_id
    union all
    select 'admin'::text, p.id, p.full_name::text, p.username::text, p.account_type::text, false
    from partners x join public.profiles p on p.id = x.id
    union all
    select 'user'::text, l.admin_id, a.full_name::text, a.username::text, 'admin'::text, l.user_id = auth.uid()
    from public.admin_user_links l
    join public.admins a on a.id = l.admin_id
    where l.ended_at is null
      and (l.user_id = auth.uid() or l.user_id in (select id from my_partners))
  ) as t(side, other_id, other_name, other_username, other_role, direct)
  order by t.direct desc, t.other_role;
$$;

revoke execute on function public.my_links() from public, anon;
grant execute on function public.my_links() to authenticated;
