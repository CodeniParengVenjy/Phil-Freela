-- GCash payments, Step 7: the admin's payment numbers (see PLAN-gcash-payments.md).
-- Run this in the Supabase SQL Editor after supabase_payments_schema.sql,
-- supabase_chat_payments_schema.sql and the admin schemas (it uses is_admin() and
-- archived_users).
--
-- The Admin Overview has a "Payments" card under Transactions. It shows how many
-- payments are at each step, from projects and chats together. Counts only, no
-- amounts and no names: admins can't read anyone's payments (they can open one
-- only through a report that carries it, see supabase_report_payments_schema.sql).
-- It is a new function, like admin_ratings(), so admin_transactions() is left as
-- it is. Until this file is run, the card says "Not set up yet".

-- admin_payment_counts(): one number per status.
--   { requested, sent, confirmed, not_received, cancelled }
-- A payment is not counted when either person on it is archived, the same rule
-- as the booking and project numbers.
create or replace function public.admin_payment_counts()
returns json
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Only admins can view stats.';
  end if;

  return (
    select json_build_object(
             'requested',    count(*) filter (where p.status = 'requested'),
             'sent',         count(*) filter (where p.status = 'sent'),
             'confirmed',    count(*) filter (where p.status = 'confirmed'),
             'not_received', count(*) filter (where p.status = 'not_received'),
             'cancelled',    count(*) filter (where p.status = 'cancelled'))
    from public.payments p
    where not exists (select 1 from public.archived_users a where a.user_id in (p.client_id, p.freelancer_id))
  );
end;
$$;

revoke execute on function public.admin_payment_counts() from public, anon;
grant execute on function public.admin_payment_counts() to authenticated;
