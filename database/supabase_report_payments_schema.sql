-- GCash payments, Step 4: reporting with a payment (see PLAN-gcash-payments.md).
-- Run this in the Supabase SQL Editor after supabase_payments_schema.sql and
-- supabase_reports_schema.sql.
--
-- A payment answered "Not received" can end in a Report. Admins can't read
-- anyone's payments, so the person reporting can send the payment with the
-- report (like they can already send chat messages). The report keeps a link to
-- the payment, and an admin can read that one payment, and open its receipt,
-- only while a report points at it. Nothing else of anyone's payments is visible
-- to admins.

-- ---------------------------------------------------------------------------
-- 1. The payment a report carries (empty for every other report)
-- ---------------------------------------------------------------------------

-- If the payment goes away (the project or an account is removed), the report
-- stays and simply has no payment any more.
alter table public.reports
  add column payment_id uuid references public.payments (id) on delete set null;

create index reports_payment_id_idx on public.reports (payment_id) where payment_id is not null;

-- ---------------------------------------------------------------------------
-- 2. Only a payment between the two people can be sent
-- ---------------------------------------------------------------------------

-- Runs before a report with a payment is saved. The report must be about a
-- person, and the payment must be between the person reporting and the person
-- reported, so nobody can attach someone else's payment.
create or replace function public.check_report_payment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  pay record;
begin
  if new.target_type <> 'user' then
    raise exception 'A payment can only be sent with a report about a person.';
  end if;

  select client_id, freelancer_id into pay from public.payments where id = new.payment_id;

  if not found or not (
       (pay.client_id = new.reporter_id and pay.freelancer_id = new.target_id)
    or (pay.freelancer_id = new.reporter_id and pay.client_id = new.target_id)
  ) then
    raise exception 'That payment isn''t between you and the person you are reporting.';
  end if;

  return new;
end;
$$;

-- Only the trigger uses it.
revoke execute on function public.check_report_payment() from public, anon, authenticated;

create trigger reports_check_payment
  before insert on public.reports
  for each row
  when (new.payment_id is not null)
  execute function public.check_report_payment();

-- ---------------------------------------------------------------------------
-- 3. Admins can read a reported payment and open its receipt
-- ---------------------------------------------------------------------------

create policy "payments: admins can read a reported payment"
  on public.payments for select
  to authenticated
  using (
    public.is_admin()
    and exists (select 1 from public.reports r where r.payment_id = payments.id)
  );

create policy "receipts: admins can open a reported receipt"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'receipts'
    and public.is_admin()
    and exists (
      select 1
      from public.payments pay
      join public.reports r on r.payment_id = pay.id
      where pay.receipt_path = objects.name
    )
  );
