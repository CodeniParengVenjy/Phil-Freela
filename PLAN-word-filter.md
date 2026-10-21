# Hide curse words: plan and progress

Status (2026-10-21): approved ("build build it"). Step 1 (database) is DONE and
live; steps 2 and 3 are next. To continue in a new Claude session, say: "Read
PLAN-word-filter.md and continue from the current step."

## Why

The user asked that curse words are hidden in any kind of communication, shown as
asterisks (or blurred). Today nothing checks text at all (no filter in the website,
the database or the AI service). The Name policy only stops digits and links, so a
curse word passes as a name.

## What people see

1. Anything typed that holds a blocked word is saved with that word replaced by
   `***` (three stars for every word, so the length is not given away and a
   varchar column can never overflow: every listed word has 3+ letters).
   The other person, the admin, the e-mail to an offline person and the inbox
   preview all get the stars, because the text is changed before it is saved.
   On the website each run of stars is drawn as "bleep tape" (see Design).
2. Whole words only. "computer", "reputation", "class", "assistant" stay as they are.
3. Common tricks are caught: capitals, stretched letters (fuuuck), numbers and
   symbols for letters (sh1t, @ss), plural/-ing/-ed endings.
4. Names and usernames are REFUSED, not starred (a name of "****" is no name):
   "Please don't use bad words in your name." Same sentence in Settings, sign-up,
   Complete Profile and the no-name pop-up.
5. One line in Terms of Service ("Community rules") and a small hint under the chat
   box and the post forms: "Bad words are hidden automatically."

## Design: "bleep tape" (mockup checked 2026-10-21, dark + light, orange + cyan, laptop + phone)

The hidden word is a small strip of censor tape: diagonal stripes in the person's
accent color over a faint frosted blur, with `****` on top (always drawn with four
stars, whatever the saved run of stars is), in a rounded outline.
- It follows the accent color and light mode (it reads `--accent-role`), so a
  freelancer sees orange, a client cyan, or whatever color they picked.
- Inside the accent-colored chat bubble the tape turns white so it still shows.
- Hover (or tap): the stripes slide and the tooltip says "Hidden word". Screen
  readers say "hidden word" instead of "star star star star".
- It pops in with a short "bleep" when it appears, not for people with reduced
  motion on.
- This is the blurry look and the asterisks in one, with no real word anywhere in
  the page (it is only drawn tape, not a blurred word).
- Where the website does not draw it (e-mail, toasts, admin lists), the plain
  `***` still reads fine.
- Mockup: scratchpad `censor-mockup.html` (screenshots `censor-mockup-laptop.png`,
  `censor-mockup-phone.png`), not part of the project.

## Where it is applied (text columns)

Hidden with stars:
- Chat: messages.body, messages.attachment_name (also edits and forwards; the inbox
  preview and the report evidence copy are filled from the already-clean text).
- Posts: services (title, description, skill), job_posts (title, description, skills).
- Portfolio: portfolio_items title, description, tags (NOT the written piece itself).
- Profile: description (bio), skills.
- Working together: job_applications.cover_note, bookings (title, note), projects
  (title, note, submission_message), project_ratings.feedback,
  service_reviews.comment.
- To the admins: reports.details, appeals.message.

Refused: profiles.full_name, profiles.username.

Left alone on purpose (default, can change):
- A freelancer's own written work (portfolio_items.body, slide_texts.body): it is
  their work, and the stolen-work check reads it.
- Text the admins write (announcements, billboards, notes): trusted accounts.
- Voice messages, photos, videos and the inside of uploaded files: a text filter
  cannot read them.

## Database (no new endpoints)

New file `database/supabase_word_filter_schema.sql`, written without drop/delete:
1. Table `blocked_words (word text primary key)`: English + Filipino/Taglish starter
   list for the user to review before it is applied. Rules on: nobody reads or
   writes it from the website (only the database functions and the owner role).
2. `mask_bad_words(text)`: builds one pattern from the list (letters stretched,
   number/symbol look-alikes, optional endings, whole-word edges) and replaces each
   match with `****`. `has_bad_word(text)` answers yes/no for the name rule.
3. One generic trigger function `mask_columns()` (column names passed to the trigger)
   that cleans text and text[] columns, and `refuse_bad_name()` for names.
4. Triggers `before insert or update of <those columns>` on the tables above, so
   nothing else slows down (presence updates do not touch them). They also catch
   the AI service, which writes with the service key.
5. Test `database/test_word_filter.sql` (rolled back, borrowed accounts, no fake
   users): each column hides a word, "computer/reputation/class/assistant" stay,
   stretched/leet spellings are caught, names/usernames are refused, an edit of a
   chat message is cleaned, a normal update of a profile still works.

## Website

The database does the hiding; the website only draws it:
- New `components/CensoredText.jsx`: splits a text on runs of 3+ stars and draws
  each run as the tape (a `<span class="bleep">`); plain text is returned as it is.
  The tape styles go at the end of `dashboard.css` (works in light mode through the
  accent variables; checked in both).
- Used where typed text is shown: ChatView (bubbles, reply preview), InboxView
  (preview), ServiceReviews (comment), CompletedProjects and ProjectDetailsView
  (feedback, notes, submission message), ApplicationsPanel (cover note),
  JobDetailsView, ServiceDetailsView, ServicesView, PostNeedView and FindJobs /
  BrowseServices cards (title, description), PublicProfileView (bio),
  BookingsView (title, note). About 14 files, one small change each. The admin panel
  keeps plain `****`.
- `lib/errors.js` or `lib/profile.js`: turn the name refusal into the plain sentence
  (Settings > Name and Username, Login sign-up, CompleteProfile, MissingNameDialog).
- `TermsOfService.jsx`: Community rules line. Hint under ChatView box, PostNeedView,
  ServicesView forms.
- No change to ChatView sending: the stars arrive through the normal realtime row.

## Steps

1. DONE (database, `database/supabase_word_filter_schema.sql`, test
   `database/test_word_filter.sql`, 51 checks, rolled back, run against live after
   applying; nothing left behind, user numbers untouched): table `blocked_words`
   (90 starter words, closed to the website), `bad_word_pattern()`,
   `mask_bad_words()`, `has_bad_word()`, `mask_columns()` (one trigger function for
   12 tables) and `refuse_bad_name()` (names and usernames). Look-alikes: a @ 4 *,
   e 3 *, i 1 ! *, o 0 *, u v *, s $ 5, t 7 +. The word list has no "hell", "crap",
   "cock", "cum", "leche", "puto", "bobo", "tanga" (normal words or plain insults);
   it does have "dick", so a person named exactly Dick cannot use it as a name.
   The word list is in the SQL file for the user to edit; the live table is edited
   with an insert into blocked_words in the SQL Editor.
   Found while testing: only whole words are matched, and "f0ck" is not caught
   (0 stands for o, not u).
2. Website: `CensoredText` + tape styles, wire it into the screens above, name
   sentences, hint lines and Terms line. Browser check against a fake backend,
   laptop and phone, dark and light, orange and cyan accent.
3. One-time clean-up of rows already saved (a count first; it rewrites live data, so
   it runs only after the user says "run it").
4. LATER, only if asked: Admin page to add/remove words from the list.

## Honest limits (for the defense)

- No filter is perfect: spaced-out letters (f u c k), other languages and new slang
  slip through; the list is easy to extend.
- The real word is not kept, so an admin reading a report sees the stars. The
  messages around it still show what happened.

## Blur of the REAL word (not chosen)

Would need the real text to stay in the database and be sent to every page, so the
word could be copied from the page, and the e-mail/preview would need the same work.
The "bleep tape" gives the blurry look without keeping or sending the word.
