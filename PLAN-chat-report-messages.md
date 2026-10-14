# Reporting a chat with its messages: plan and progress

Status (2026-10-14): approved ("ok") as step 4 of the plan that also had the
upload date, the ratings and comments on an offer (PLAN-offer-reviews.md) and
the blur for all text files (PLAN-document-previews.md). To continue in a new
Claude session, say: "Read PLAN-chat-report-messages.md and continue from the
current step."

## Why

The user asked: "in reporting chat in inbox, can you provide when reporting, it
appear the screenshot convos that reported, or report the specific chats, when
reporting, so admins can determine what is the reason".

Only the two people in a chat can read its messages; admins can't. So a report
about a person reached the admins with no conversation at all, unless the
reporter attached screenshots by hand (up to 3).

## What people see

1. In a chat, the flag in the header opens the Report popup as before, with a new
   list, "Messages to send with your report": the last 30 messages of the chat,
   the last 10 ticked. The reporter ticks or unticks any of them, or picks
   "Select all" / "Clear".
2. Right-clicking a message from the OTHER person has a new item, "Report
   Message". It opens the same popup with 30 messages around that one, and that
   message plus the 2 before and the 2 after ticked.
3. Text shows as it is. A photo, video, voice message or file shows as a label
   ("Photo", "Voice message", "File: contract.pdf"), never the file itself. A
   call shows as its own line ("Video call, 3:12").
4. A line in the popup says only the ticked messages are copied and only admins
   can read them; the person reported never sees them. The Privacy Policy says
   the same.
5. Admin > Reports shows the ticked messages as a chat transcript under the
   report (who wrote it, when, the text or label), oldest first, in a box that
   scrolls. Nothing else of the chat is visible to admins.

## How it works (defaults I chose)

1. The messages are COPIED by the database when the report is saved, so none
   can be made up (the website only sends the ids it ticked, and the database
   only accepts ids of messages in the chat between the reporter and the
   person reported). The copies stay even if the sender unsends or edits the
   message afterwards, because that is the evidence.
2. The ids go in the same insert as the report (a new column
   `reports.chat_message_ids`), and a trigger copies the messages in the same
   transaction. So a report is never saved half way: either it has its
   messages or it isn't saved and the popup says why in plain words. (The plan
   in chat said "a function attach_report_messages"; a trigger does the same
   check and copy, and removes the case of a report saved with no messages.)
3. At most 50 messages per report (the popup lists 30). Only a report about a
   person (target_type "user") can carry messages.
4. Only admins can read the copies (new table `report_messages`). The reporter
   can't read them back, nobody can write or change them from the browser, and
   they go away with the report (if the reporter deletes their account).
5. One waiting report per person stays as it is: reporting the same person
   again while one is waiting says "You already reported this".
6. A photo or file isn't copied. If the problem is in a picture, the reporter
   can still add screenshots (up to 3), as before.

## Database (file `database/supabase_report_messages_schema.sql`)

Nothing in it uses DROP or DELETE. Must be applied BEFORE the website that
sends `chat_message_ids` goes live.

1. `reports.chat_message_ids uuid[]` (default empty, at most 50).
2. New table `report_messages` (report_id, message_id, from_reporter, body,
   attachment_type, attachment_name, is_call, edited, sent_at; one copy of a
   message per report). Row level security on; only admins can SELECT; nobody
   can insert, update or delete from the browser.
3. Trigger function `copy_report_messages` (security definer) + trigger
   `reports_copy_messages` (after insert on reports, only when ids were sent):
   refuses unless the report is about a person, and every id is a message in the
   conversation between the reporter and that person; then copies them.

Test: `database/test_report_messages.sql` (rolled back; borrows real accounts so
no user numbers are used up; turns the offline-email trigger of `messages` off
inside its own call so a test message can't email anyone).

## Website

`lib/reportMessages.js` (new: which messages the popup lists and ticks; the label
of a message), `lib/reports.js` (`sendReport` sends the ids), `components/ReportDialog.jsx`
(the list, the privacy line, the database's own words for a refusal),
`views/ChatView.jsx` (header flag passes the chat; "Report Message" in the
right-click menu), `views/AdminReportsView.jsx` (the transcript),
`pages/legal/PrivacyPolicy.jsx` (the sentence).

## Not included

- Opening a message's photo or file for the admin (only its label is kept).
- Reporting a message while a call is going (the call's own Report button is
  unchanged and carries the call, not messages).
- A "this is the message I'm reporting" marker in the admin transcript.

## Current step

Step 4a (database): built, applied to the live project (migration
"report_messages", 2026-10-14) and pushed. Its SQL has been run, so don't run it
again. Tested before applying: the whole schema and
`database/test_report_messages.sql` (33 checks) were sent together in one call
that rolled back, all passed, and nothing was left behind (checked afterwards:
no table, no column, no trigger, the offline-email trigger of `messages` back
on, no test messages, 87 messages and 3 reports as before, the user number
counter still 17 so the next sign-up is still PF-0018). Checked after applying:
row level security on, one rule (admins read), signed-in people can only
SELECT, anon gets "permission denied", `reports.chat_message_ids` resolves
against the live API, and the copy trigger is on.
Not tested: the line a call leaves in a chat (`is_call`; one `call_id is not
null`), and a copy surviving its message being unsent (the copy has no link to
the message, checked, and editing it later changes nothing, checked).
