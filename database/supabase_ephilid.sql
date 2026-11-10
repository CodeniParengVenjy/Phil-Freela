-- ePhilID: the printed (or downloadable) PhilSys ID becomes its own ID type for
-- identity verification. Plan: PLAN-ephilid.md.
-- It has a front (photo, names, big QR code) and a back (address, birthday), so
-- unlike a passport it needs both photos: the "back required" rule is NOT
-- changed, only the list of ID types. 'school_id' stays in the list because one
-- approved record still uses it.
-- A CHECK rule can't be edited, only dropped and added again, so this file has a
-- DROP statement and the Supabase connector may ask for a confirm; paste it into
-- the Supabase SQL Editor if the connector declines it. Safe to run twice.
alter table public.identity_verifications
  drop constraint if exists identity_verifications_id_type_check;
alter table public.identity_verifications
  add constraint identity_verifications_id_type_check
  check (id_type in ('philsys', 'ephilid', 'drivers_license', 'passport', 'umid', 'prc', 'school_id'));
