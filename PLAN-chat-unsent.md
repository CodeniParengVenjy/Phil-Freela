# Unsent messages in chat: plan and progress

Status (2026-10-21): built, applied to the live database and pushed. To continue in
a new Claude session, say: "Read PLAN-chat-unsent.md and continue from the current
step."

## Why

The user asked: when a message is unsent, don't only delete it, mark it as unsent
("<user> unsent the message"), like Messenger. Before, Unsend removed the whole row
and the chat showed nothing where the message had been.

## What people see

1. Right-click my message > Unsend. The popup says its text or file is removed for
   everyone and they will see that I unsent a message (red button "Unsend").
2. The message becomes an empty outlined bubble at its own place and time, on its
   sender's side like the message it was (right for mine, left for theirs), grey
   italics with its time: "You unsent a message" for me, "Maria unsent a message"
   for the other person. (First built as a small centered line; the user asked for
   "a chat message way" after seeing it live, so it became a bubble.) The bubble has
   no right-click menu, and the text, photo, video, voice message or file is really
   gone (the database empties it; the stored file is removed as before).
3. The other person sees it change live (the chat already listens for message
   updates).
4. The Inbox preview says "Message unsent" when the newest message is unsent.
5. The unread number on the Inbox doesn't count unsent messages.
6. The Report popup doesn't list unsent messages (nothing is left in them to send).
   Reports already made keep their copies, as before.

## How it works (defaults I chose)

- Anyone can unsend their own message at any time, as before; a call line can't be
  unsent. It still works for someone suspended from messaging (they could remove
  their messages before too), which is why the button calls a database function
  and not a plain update.
- Unsend is an update, not a delete: `messages.unsent_at` is set and a trigger
  (`messages_edit_guard`) empties body, edited_at and the attachment columns. Once
  unsent nothing can be edited or brought back.
- "Remove for you" (hide a message only on my side) was offered and NOT built.

## Database (file `database/supabase_chat_unsent_schema.sql`)

Applied to the live project as migration "chat_unsent_messages" (2026-10-21), so
don't run it again. It has one DROP CONSTRAINT (the old "text or attachment" rule,
put back in the next line with `unsent_at` allowed).

1. `messages.unsent_at`; check `messages_body_or_attachment_check` now also accepts
   `unsent_at`; new check `messages_unsent_is_empty_check` (unsent means empty).
2. `messages_edit_guard` (replaced): unsending empties the content and uses the
   database's own time; an unsent message can't change (delivered_at still can).
3. `unsend_message(target_message_id)`: only the sender, never a call line, quiet if
   already unsent; security definer; signed-in people only (anon can't call it).
4. Trigger `messages_unsent_touch_conversation` (function `handle_message_unsent`)
   sets the Inbox preview to "Message unsent" when the newest message is unsent;
   `handle_message_deleted` has the same label.
5. `get_unread_message_count` skips unsent messages.

Test: `database/test_chat_unsent.sql` (rolled back; borrows an existing chat, so no
user numbers are used up). 19 checks passed on 2026-10-21 (sent together with the
schema in one call that rolled back; afterwards nothing was left behind, 86 messages
as before, user number counter 35, the offline-email trigger back on).

## Website

`views/ChatView.jsx` (asks for `unsent_at`; Unsend calls `unsend_message` and shows
the line at once; the line; the popup's words; the Sent/Delivered label skips unsent
messages), `lib/reportMessages.js` (the Report popup skips unsent messages).

Tested in the browser against a fake backend, desktop and phone, dark and light: 60
checks (the bubble for both people, on the sender's side, no menu on it, the popup's words, Cancel, a
refusal from the database keeps the message, text/file/photo unsent with the stored
file removed, the lines survive a reload, the Sent label moves to my newest message
that is still there, the Report popup skips unsent, no sideways scroll, no page
errors). Lint and build clean.

Not tested: the live site with a real unsend (the database function was tested in
SQL, the website against a fake that follows it), and the live push of an unsend to
the other person's open chat (the fake can't send live updates; the chat's existing
UPDATE listener replaces the row).

## Not included

- "Remove for you" (see above).
- `typical_reply_minutes` (the reply-time statistic) still counts an unsent message
  as a question; left alone as a rare edge.
