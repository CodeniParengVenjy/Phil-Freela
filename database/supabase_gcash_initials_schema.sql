-- GCash payments: no QR picture, and the name shows as initials (see
-- PLAN-gcash-payments.md, "Change asked 2026-10-25"). Run this in the Supabase SQL
-- Editor after supabase_payments_schema.sql and supabase_chat_payments_schema.sql.
--
-- Why: a real GCash QR can only come from the GCash app (PhilFreela can't make one),
-- and GCash itself hides part of a recipient's name when sending money. So the
-- freelancer saves only their GCash number and the name on the account. The name
-- stays private (only they can read it); the person who has to pay sees only its
-- initials ("A. R. S.") and the number, worked out HERE in the database so the full
-- name never reaches another person's browser.

-- ---------------------------------------------------------------------------
-- 1. Initials: the first letter of every word, "Ana R. Santos" -> "A. R. S.".
--    Only used inside the functions below.
-- ---------------------------------------------------------------------------

create or replace function public.name_initials(full_name text)
returns text
language sql
immutable
set search_path = public
as $$
  select string_agg(upper(left(w.word, 1)) || '.', ' ' order by w.n)
    from unnest(regexp_split_to_array(btrim(coalesce(full_name, '')), '\s+')) with ordinality as w(word, n)
   where w.word ~ '^[A-Za-zÀ-ÖØ-öø-ɏ]';
$$;

revoke execute on function public.name_initials(text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. Where to pay: the initials and the number, never the name and no QR. The
--    answer changes shape, so the two functions are made again. Same rules as
--    before about who may ask.
-- ---------------------------------------------------------------------------

drop function public.get_pay_details(uuid);
drop function public.get_request_pay_details(uuid);

-- "Pay via GCash" on a project. Only the client of that project. No rows come back
-- when the freelancer has not saved any details yet.
create function public.get_pay_details(target_project uuid)
returns table (initials text, gcash_number text)
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_column
begin
  if not exists (
    select 1 from public.projects p where p.id = target_project and p.client_id = auth.uid()
  ) then
    raise exception 'Only the client of this project can see where to pay.';
  end if;

  return query
    select public.name_initials(a.account_name), a.gcash_number
      from public.gcash_accounts a
      join public.projects p on p.freelancer_id = a.freelancer_id
     where p.id = target_project;
end;
$$;

revoke execute on function public.get_pay_details(uuid) from public, anon;
grant execute on function public.get_pay_details(uuid) to authenticated;

-- Where to pay for a payment request in a chat, for the person asked to pay, while
-- the request waits for their payment.
create function public.get_request_pay_details(target_payment uuid)
returns table (initials text, gcash_number text)
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_column
begin
  if not exists (
    select 1 from public.payments p
     where p.id = target_payment and p.client_id = auth.uid()
       and p.conversation_id is not null and p.status = 'requested'
  ) then
    raise exception 'Only the person asked to pay can see where to pay.';
  end if;

  return query
    select public.name_initials(a.account_name), a.gcash_number
      from public.gcash_accounts a
      join public.payments p on p.freelancer_id = a.freelancer_id
     where p.id = target_payment;
end;
$$;

revoke execute on function public.get_request_pay_details(uuid) from public, anon;
grant execute on function public.get_request_pay_details(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. The QR column and its storage rules go away.
-- ---------------------------------------------------------------------------

alter table public.gcash_accounts drop constraint gcash_accounts_qr_own_folder;
alter table public.gcash_accounts drop column qr_path;

drop policy "gcash-qr: freelancers can upload to their folder" on storage.objects;
drop policy "gcash-qr: freelancers can replace their own" on storage.objects;
drop policy "gcash-qr: freelancers can remove their own" on storage.objects;
drop policy "gcash-qr: the owner and a client of theirs can open" on storage.objects;

-- The bucket is removed only while it is EMPTY (the switch below only lets this one
-- statement through). If Supabase refuses anyway, the rest of this file still
-- stands: the bucket is then unusable (no rules) and can be removed in the Storage
-- page of the dashboard.
do $$
begin
  perform set_config('storage.allow_delete_query', 'true', true);
  delete from storage.buckets
   where id = 'gcash-qr'
     and not exists (select 1 from storage.objects o where o.bucket_id = 'gcash-qr');
  perform set_config('storage.allow_delete_query', 'false', true);
exception when others then
  raise notice 'The empty gcash-qr bucket was not removed (%). Remove it in Storage if you like.', sqlerrm;
end
$$;
