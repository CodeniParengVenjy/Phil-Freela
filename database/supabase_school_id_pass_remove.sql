-- Removes the School ID pass from the database. It was a one-time exception for
-- one person, now finished (PLAN-school-id-pass.md). Run in the Supabase SQL Editor.
--
-- What stays on purpose: the three CHECK rules that accept 'school_id' as an ID
-- type, no back photo for it, and the 'school_id_pass' notification type. Her
-- approved verification and her notification still use those values, so taking
-- them out would be refused. Nothing can create a new School ID request any more:
-- the AI service no longer accepts the type, and browsers can't add verifications.
drop trigger if exists identity_verifications_school_id_pass on public.identity_verifications;
drop function if exists public.check_and_use_school_id_pass();
drop function if exists public.grant_school_id_pass(uuid);
drop function if exists public.cancel_school_id_pass(uuid);
drop table if exists public.verification_passes;
