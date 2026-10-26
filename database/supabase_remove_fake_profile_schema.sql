-- Removes the "Fake profile" violation (2026-10-27). Apply it after the website
-- stops offering it (lib/reports.js and lib/violations.js), so nobody on the
-- old page can pick a reason the database refuses.
--
-- Why: a fake account is stopped before it can post or apply, by identity
-- verification (a government ID and a face scan; the same face on another
-- account is flagged to an admin). So "Fake profile" is no longer a report
-- reason or a penalty. An account that still slips through can be reported and
-- banned under Scam / Fraud or Other.

-- 1. The one older report with this reason (already resolved on 2026-10-27)
--    becomes "Other"; its details keep what it was reported for. Only the
--    reason and details change, so no notification or log line is made.
update public.reports
  set reason = 'other',
      details = left('Reported as: Fake profile' || coalesce(E'\n' || details, ''), 1000)
  where reason = 'fake_profile';

-- 2. New reports and penalties can't use it any more. user_suspensions had no
--    row with it; if one appears before this runs, adding the rule fails
--    instead of changing a penalty (and notifying the person) behind their back.
alter table public.reports drop constraint reports_reason_check;
alter table public.reports add constraint reports_reason_check
  check (reason in ('spam', 'scam', 'inappropriate', 'harassment', 'stolen_work', 'other'));

alter table public.user_suspensions drop constraint user_suspensions_violation_check;
alter table public.user_suspensions add constraint user_suspensions_violation_check
  check (violation in ('spam', 'scam', 'inappropriate', 'harassment', 'stolen_work', 'other'));
