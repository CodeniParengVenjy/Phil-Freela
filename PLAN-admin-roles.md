# Admin roles, round 2: who sees what, and super admin approval

Last updated: 2026-10-07. Plan approved by the owner, building step by step.
To continue in a new Claude session, say:
"Read PLAN-admin-roles.md and continue from the current step."

Builds on PLAN-super-admin.md (live) and PLAN-admin-log.md (live). The owner
asked on 2026-10-07 for a smaller regular admin and a bigger super admin.

## What the owner asked for

1. A regular admin only does moderation: monitor users, listings, reports,
   appeals, removing content, and checking for copied work. Plus Verifications,
   Overview, Browse Services and Browse Jobs.
2. In Reports, a regular admin's action needs a super admin's approval first.
   Answers given: **every** action (remove listing, suspend, ban, resolve,
   dismiss), and the **same rule on the Users page** for Suspend and Ban, with
   an **approval list** for the super admin.
3. Announcements and Billboard are for the super admin only.

## Who sees what after this

Regular admin (sidebar):
1. Overview, Users, Listings, Reports, Verifications, Appeals, Flagged
   Content (the copy check), Browse Services, Browse Jobs.
2. Activity Log (read only, as built; see defaults).

Super admin: all of the above, plus:
1. Announcements and Billboard (hidden from regular admins).
2. Admins page (add, remove, promote, demote). Regular admins no longer see it.
3. Approvals (new page, with a number badge for requests waiting).
4. Delete account on the Users page (already super admin only).
5. Suspend, Ban, Resolve, Dismiss and Remove listing take effect right away
   (a super admin is the one who approves, so they don't need approval).

## How approval works (what people see)

1. A regular admin opens a report and picks an action as today (the same
   pop-up, with the violation and note). The button now says "Send for
   approval" instead of doing it.
2. The report stays Pending and shows a badge "Waiting for super admin:
   Ban". The admin can't send a second request for the same report.
3. On the Users page, Suspend and Ban work the same way (a request, no report).
4. The super admin sees the new Approvals page: who asked, what, against whom,
   the violation and note, and when. Buttons: Approve, Decline (with an
   optional reason).
5. Approve: the action happens as the super admin (the same code the Reports
   and Users pages use today), then the request is marked approved. The
   report is resolved or dismissed and the Activity Log says who approved.
6. Decline: nothing happens to the user or listing. The report stays Pending
   and shows "Declined by Sam: reason", so the admin can pick another action.
7. The requesting admin sees the outcome on the report and under
   "My requests" on the Approvals page (read only for them).

## Database (new file: database/supabase_admin_roles_schema.sql)

1. New table `admin_requests`: id, requested_by (admin), kind (`suspend`,
   `ban`, `resolve`, `dismiss`, `remove_listing`), report_id (nullable),
   target_user_id (nullable), listing_table and listing_id (nullable),
   details (violation, days, note), status (`pending`, `approved`,
   `declined`), decided_by, decided_at, decision_note, created_at.
2. One pending request per report (a unique rule), so nobody spams a report.
3. Rules on `admin_requests`:
   a. A regular admin can insert a request as themselves, status pending, and
      read their own requests.
   b. A super admin can read all requests and change status once, from
      pending to approved or declined, recorded as themselves.
   c. Nobody deletes requests (permanent record).
4. Close the back door, so approval can't be skipped by calling the database
   directly:
   a. `user_suspensions` insert and update: super admin only (today any
      admin). Unsuspend and Unban (delete) stay with every admin, because
      lifting a penalty is not part of this round (see not included).
   b. `reports` update (resolve or dismiss): super admin only.
5. Announcements and billboards: change the admin write rules to
   `is_super_admin()` (insert, update, delete, and the billboard image
   storage rules). Everyone still reads them as today.
6. Activity Log: a trigger on `admin_requests` writes "Elena asked to ban
   Keanne (waiting for a super admin)" and "Sam approved Elena's request to
   ban Keanne" / "declined ...". The existing triggers still log the real
   action under the super admin who approved it.
7. Test file `database/test_admin_roles.sql`: rolled-back DO block, same style
   as the earlier two. Checks: a regular admin can request but cannot write
   suspensions, resolve a report, or write announcements and billboards; a
   super admin can do all; a request can be decided only once and only by a
   super admin; a regular admin can't approve their own request.

## Client (files to change or create)

1. `layout/AdminLayout.jsx`: hide Announcements, Billboard and Admins from
   regular admins, add the Approvals link (badge = pending requests) for
   super admins. Also guard the pages themselves: a regular admin who types
   `/admin/announcements` is sent to Overview.
2. `views/AdminReportsView.jsx`: for a regular admin, all five actions create
   a request (new helper `lib/adminRequests.js`) instead of running; show
   the "Waiting for super admin" and "Declined" badges. For a super admin
   nothing changes.
3. `views/AdminUsersView.jsx`: Suspend and Ban create a request for a regular
   admin; a "Waiting for super admin" tag shows on the user's row.
4. New `views/AdminApprovalsView.jsx` and a route in `App.jsx`: the
   approval list. Approve runs the existing code (`saveSuspension`,
   `removeListing`, the report update) as the super admin, then marks the
   request approved.
5. `views/AdminAdminsView.jsx`: super admin only now (the read-only version
   for regular admins is removed).

## Endpoints

None new. Everything goes through Supabase (the new table and its rules).
The Python AI service is not involved.

## Defaults I chose (change any of these)

1. Unsuspend, Unban, Appeals (accepting an appeal lifts a ban), Flagged
   Content review and the Listings page's Remove are **not** put behind
   approval, because the owner said "in reporting". Removing a listing from
   the Listings page therefore stays open to regular admins. Say so if you
   want these gated too.
2. The Activity Log stays readable by every admin.
3. Requests are never deleted, and a declined request can't be reopened (the
   admin sends a new one).
4. "Remove listing" approved from a report runs in the super admin's browser,
   because deleting the listing's photo and video is done by the page today.
5. No email or pop-up to the super admin; the sidebar badge is the signal.

## Not included

1. Approval for lifting penalties, appeals, flagged content or the Listings
   page (see defaults).
2. A super admin approving from their phone as a notification.
3. Several approvers needed for one request.

## Build steps (each one committed and pushed)

1. **Database (Medium):** the SQL file and its test. Apply to the live
   project and run the rolled-back test. Must come first, because step 2
   removes the regular admin's direct rights.
2. **Hide pages (Easy):** sidebar and page guards for Announcements,
   Billboard and Admins; Admins page becomes super admin only.
3. **Requests (Medium):** `lib/adminRequests.js`, Reports page and Users page
   send requests for regular admins.
4. **Approvals page (Medium):** the list, Approve and Decline, the sidebar
   badge.
5. **Browser check (Easy):** Playwright with the fake backend, laptop and
   phone: regular admin sees the smaller sidebar and "Send for approval",
   super admin approves and declines, and the right calls are made.

## Current step

Plan approved by the owner on 2026-10-07 ("Super Admin can do all, but
Announcements, Billboard, Admins, and new Approvals is for Super Admin only
role, lets go").

Step 1 (Database): built and applied to the live database (2026-10-07) as
`admin_requests_table`, `admin_requests_log` and `admin_roles_policies`. The
rolled-back test (`database/test_admin_roles.sql`) passed 29 of 29 before
applying. The Activity Log has no "request" kind, so request lines use the
kind they are about (ban, suspend or report); adding a kind would need a
drop, which the connector refuses.

Step 2 (Hide pages): done (2026-10-07). Step 3 (Requests): done. Steps 4 and 5: not started.
