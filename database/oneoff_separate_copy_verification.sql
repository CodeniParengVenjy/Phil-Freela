-- One-time (2026-11-18, PLAN-separate-accounts.md Step 6, part 4). Run once,
-- after the 4 two-sided accounts were separated (account_splits rows done).
--
-- The user: "how about to those who verified? separate the account as well".
-- A separated account is the same person, so an old account's APPROVED ID
-- check is copied to its new account: on PhilFreela "verified" just means an
-- approved identity_verifications row (is_verified, verified_user_ids).
-- The copy keeps the same photos (they stay in the old account's folder; the
-- admin can still open them), says where it came from in admin_note, and
-- points duplicate_of at the old account (the admin's "same face as" field).
-- On 2026-11-18 this covered @Ellen -> @Ellen_freelancer and
-- @venjokes -> @venjokes_client (both PhilSys); @testingVG1 and
-- @tinetestingnganeh were never verified, so their new accounts aren't either.
-- Safe to run twice: a new account that already has a check is skipped.

insert into public.identity_verifications (
  user_id, id_type, id_photo_path, selfie_path, face_match, face_distance, status, admin_note,
  reviewed_by, reviewed_at, created_at, id_back_path, selfie_left_path, selfie_right_path,
  liveness_passed, decided_by_ai, id_qr_status, id_qr_name, face_embedding, duplicate_of
)
select distinct on (s.to_user)
  s.to_user, v.id_type, v.id_photo_path, v.selfie_path, v.face_match, v.face_distance, 'approved',
  'Copied from @' || o.username || ' when the account was separated (2026-11-18, PLAN-separate-accounts.md).',
  v.reviewed_by, now(), now(), v.id_back_path, v.selfie_left_path, v.selfie_right_path,
  v.liveness_passed, v.decided_by_ai, v.id_qr_status, v.id_qr_name, v.face_embedding, s.from_user
from public.account_splits s
join public.identity_verifications v on v.user_id = s.from_user and v.status = 'approved'
join public.profiles o on o.id = s.from_user
where s.done_at is not null
  and s.to_user is not null
  and not exists (select 1 from public.identity_verifications x
                   where x.user_id = s.to_user and x.status in ('approved', 'pending'))
order by s.to_user, v.reviewed_at desc nulls last;
