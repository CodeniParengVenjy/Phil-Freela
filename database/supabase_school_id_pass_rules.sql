-- School ID pass, second file: three CHECK rules that must accept the new
-- values. Run after supabase_school_id_pass_schema.sql. Plan: PLAN-school-id-pass.md.
-- A CHECK rule can't be edited, only dropped and added again, so this file has
-- DROP statements and the Supabase connector asks for a confirm; paste it into
-- the Supabase SQL Editor if the connector declines it.

-- The new ID type. A School ID takes a front photo only, like a passport.
alter table public.identity_verifications
  drop constraint identity_verifications_id_type_check;
alter table public.identity_verifications
  add constraint identity_verifications_id_type_check
  check (id_type in ('philsys', 'drivers_license', 'passport', 'umid', 'prc', 'school_id'));

alter table public.identity_verifications
  drop constraint identity_verifications_back_required;
alter table public.identity_verifications
  add constraint identity_verifications_back_required
  check (id_type in ('passport', 'school_id') or id_back_path is not null);

-- The "School ID pass" notification needs its own type.
alter table public.user_notifications
  drop constraint user_notifications_type_check;
alter table public.user_notifications
  add constraint user_notifications_type_check
  check (type in (
    'verification_approved', 'verification_rejected', 'suspension', 'suspension_lifted',
    'appeal_accepted', 'appeal_rejected', 'report_resolved', 'report_dismissed',
    'project_hired', 'project_submitted', 'project_done', 'project_changes', 'project_rated',
    'booking_requested', 'booking_accepted', 'booking_declined', 'booking_cancelled',
    'school_id_pass'
  ));
