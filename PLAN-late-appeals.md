# Plan: Appeal the late block

Written 2026-11-24. The user asked "add appeal function" right after asking whether a freelancer who failed a job is
kept from applying. Their two answers: **the client decides** the appeal (not an admin), and **only the late block**
can be appealed (not the unpaid-client block).

Status (2026-11-24): ALL 3 STEPS DONE. The user said "dont ask, just goooo" to the plan with the defaults below.
- Step 1 LIVE: migration `late_appeals` applied after a rolled-back trial on live (test 32/32), the test run again
  on the applied version (32/32, nothing left behind). Splice proof: removing exactly the added lines from
  `allow_late_freelancer` gives back the old md5 e6f4106e...; new md5 58030ba8...; its permissions are unchanged.
- Step 2 and Step 3: website + Terms + System Functions row; lint clean, build OK, browser check on a pretend
  backend 38/38 (dark, light with a yellow accent, phone width).
- Still untried: a real freelancer and a real client going through it on the live site.

## What is there today

- A freelancer who didn't send a client's project by its due date can't apply to any of that client's job posts
  (PLAN-delays.md, `database/supabase_late_block_schema.sql`). It ends only when the client taps "Allow to apply
  again" on that project's page. The freelancer has no way to ask for it, except messaging the client in chat.
- The existing appeals (`appeals` table, Admin > Appeals, `/appeal`) are only for suspensions and bans, and an admin
  decides them. They stay as they are.
- "Allow to apply again" notifies nobody today (a known gap in late-freelancer-block). This plan closes it.

## The idea

On the late project's page, the blocked freelancer taps **Appeal**, writes why they should be allowed again (for
example "the client sent the files 3 days late"), and sends it. The client gets a notice, sees the message on the same
project page, and taps **Allow** or **Decline** (with an optional reason). Allow lifts the block (same as "Allow to
apply again"). Both answers notify the freelancer.

## The rules (defaults I chose)

1. Only the project's freelancer, and only while the block is on (late and not allowed yet).
2. Message 10 to 500 characters, through the word filter like every typed text.
3. Two appeals per late project, one waiting at a time (the same rule as "Ask for more time"). The freelancer can
   cancel a waiting appeal; it still counts as one of the two.
4. The client's decline reason is optional, up to 300 characters, word filter too, shown to the freelancer.
5. If the client taps the existing "Allow to apply again" while an appeal waits, the appeal counts as allowed.
6. No answer = it just keeps waiting. No automatic allow, no admin step.
7. Notices (bell, number, Gmail when offline, all automatic through the existing trigger): to the client when an
   appeal arrives; to the freelancer when it is allowed or declined. The freelancer also gets "allowed" when the
   client uses the plain "Allow to apply again" button.

## Step 1: database (migration `late_appeals`, needs the user's typed "apply")

File: `database/supabase_late_appeals_schema.sql`, test `database/test_late_appeals.sql` (run in a rolled-back
transaction on live first, then again after applying).

1. New table `late_appeals`: id, project_id (projects), freelancer_id, message, status
   (pending / allowed / declined / cancelled), client_note, created_at, answered_at. One pending per project (unique
   index). Word filter trigger on message and client_note.
2. Row rules: only the project's client and freelancer can read; nobody writes directly (only the functions below).
3. Functions:
   - `appeal_late_block(project, message)`: checks the rules above, saves it, notifies the client.
   - `answer_late_appeal(appeal, allow, note)`: the client only; allow sets `projects.late_allowed_at`; notifies the
     freelancer.
   - `cancel_late_appeal(appeal)`: the freelancer only, while waiting.
4. `allow_late_freelancer`: spliced from the LIVE definition (two lines: mark a waiting appeal allowed, notify the
   freelancer), md5 proof like the earlier splices.
5. Three new notification kinds added to the LIVE list: `late_appeal_sent`, `late_appeal_allowed`,
   `late_appeal_declined`.

## Step 2: website (only after the migration is live)

1. `client/src/lib/lateBlock.js`: get the project's appeals, send, answer, cancel.
2. `client/src/pages/dashboard/components/LateBlockNotice.jsx`:
   - freelancer: Appeal button, then a message box; then "Waiting for {client}'s answer" with Cancel; after a
     decline, the client's reason and "Appeal again" if one is left.
   - client: the freelancer's message with Allow / Decline (Decline opens the optional reason box).
3. `client/src/pages/dashboard/views/JobDetailsView.jsx`: the blocked apply box says "You can appeal from that
   project's page" next to the existing Open project link.
4. `client/src/lib/notifications.js`: icons and labels for the three kinds.

## Step 3: words

1. `client/src/pages/legal/TermsAndPrivacy.jsx`: one sentence in the late-block bullet ("the freelancer can appeal to
   the client twice per project").
2. `PhilFreela-System-Functions.md`: the late-work row mentions the appeal.

## Not in this plan

- Appeals to an admin, or a second level after the client declines.
- Appealing the unpaid-client block.
- A reminder to a client who doesn't answer.
