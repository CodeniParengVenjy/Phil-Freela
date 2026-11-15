-- Revisions and the freelancer's own terms on an offer (panel revision,
-- PLAN-panel-revisions.md, item 7, 2026-11-15).
--
-- A freelancer says how many rounds of changes the price includes (0 to 5, or
-- unlimited) and can add their own short terms (at most 500 characters). The
-- client reads both on the offer page before booking (ServiceDetailsView.jsx).
-- When a booking is sent, the database copies both into the booking, so a later
-- edit of the offer never changes what the client booked, and nobody can type
-- other values into a booking. The Contract of Service PDF reads them from the
-- booking (lib/contractPdf.js).
--
-- Apply it BEFORE the website update: the offer pages ask for the new columns.

-- 1. The columns. Empty on older offers and bookings (= "not stated").
alter table public.services
  add column if not exists revisions text
    constraint services_revisions_check check (revisions in ('0', '1', '2', '3', '4', '5', 'unlimited')),
  add column if not exists extra_terms text
    constraint services_extra_terms_check check (char_length(extra_terms) <= 500);

alter table public.bookings
  add column if not exists revisions text
    constraint bookings_revisions_check check (revisions in ('0', '1', '2', '3', '4', '5', 'unlimited')),
  add column if not exists extra_terms text
    constraint bookings_extra_terms_check check (char_length(extra_terms) <= 500);

-- 2. Bad words in the terms are hidden, like in the description (the same
--    word filter, mask_columns, as services_mask_words).
create trigger services_mask_terms
  before insert or update on public.services
  for each row execute function public.mask_columns('extra_terms');

-- 3. A new booking gets the offer's revisions and terms as they are at that
--    moment, whatever the website sent; afterwards they never change.
create or replace function public.copy_service_terms()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    -- No offer found (it was removed): both stay empty.
    select s.revisions, s.extra_terms into new.revisions, new.extra_terms
      from public.services s where s.id = new.service_id;
  else
    new.revisions := old.revisions;
    new.extra_terms := old.extra_terms;
  end if;
  return new;
end;
$$;

revoke execute on function public.copy_service_terms() from public, anon, authenticated;

create trigger bookings_copy_service_terms
  before insert or update on public.bookings
  for each row execute function public.copy_service_terms();
