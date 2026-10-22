# Hide curse words: plan and progress

Status (2026-10-21): approved ("build build it"). Steps 1 (database), 2 (website)
and 3 (other languages + clean-up of old rows) are DONE and live. Only step 4 (an
admin page to edit the word list) is left, and only if the user asks. To continue in a new Claude session, say: "Read
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
2. DONE (website): `components/CensoredText.jsx` + the `.bleep` tape styles at the
   end of `dashboard.css`, wired into 24 screens (ChatView bubbles, InboxView
   preview, ServiceReviews, CompletedProjects, ProjectDetailsView, ProjectsPanel,
   DueDateCalendar, SubmitProjectView, FeedbackView, ApplicationsPanel,
   JobDetailsView, ServiceDetailsView, BookDialog, FindJobsView, BrowseServicesView,
   ServiceCard, PostNeedView, BookingsView, ProfileView, PublicProfileView,
   SkillsBox, PortfolioSection, PortfolioViewer, SearchResultsView).
   Found while building: the project asks people to confirm their e-mail, so a bad
   name at sign-up would only have been refused at first sign-in, after the account
   existed; and `saveDisplayName` / `saveUsername` showed a generic "Couldn't save"
   for any refusal. So the database got one more small function,
   `bad_word_in_name(full_name, username)` (answers 'name', 'username' or nothing;
   the sign-up form may ask it, the list stays closed), the trigger now uses it, and
   `lib/profile.js` has `checkNameWords` (asked in Login.jsx BEFORE the account is
   made) and shows the database's own sentence in Settings and the no-name pop-up.
   Terms of Service has two new lines; the two post forms have "Bad words are hidden
   automatically." under the description. NOT done: a hint under the chat box (the
   Terms line and the visible tape say it; the box is tight on a phone).
   Not wired on purpose: notifications and toasts (plain `***`), admin pages (plain
   `***`), the edit boxes (they show the saved text).
   Tested in the browser against a fake backend (a copy of the shared fake in the
   session scratchpad, `censor.test.mjs`), laptop and phone, dark and light, default
   and yellow accent: tape on an offer's title, description, skill chip and review
   comment, a public profile (bio, skill, service), the inbox preview, chat bubbles
   (white tape on my own accent bubble, accent tape on the grey one), a service card;
   clean text is untouched; the tape is announced as "hidden word"; no sideways
   scrolling; sign-up stops a bad name or username before any account is made and
   goes on with clean ones; the no-name pop-up shows the database's sentence; Terms
   and both post forms show the new lines. Lint and build clean.
3. DONE (2026-10-21, the user answered "Run it now, but not only that, include every
   other language curse words"):
   a. The word list was widened to other languages first
      (`database/supabase_word_filter_languages.sql`, applied live): 476 entries now
      (393 whole words, 33 stems, 50 exact), covering Spanish, Portuguese, Italian,
      French, German, Dutch, the Nordic languages and Finnish, Polish, Czech / Slovak,
      Serbian / Croatian, Hungarian, Romanian, Turkish, Indonesian / Malay,
      Vietnamese, Hindi / Urdu, Arabic, Chinese, Japanese, Korean, Thai, Greek,
      Hebrew, Russian / Ukrainian and Visayan / Ilocano / Tagalog extras, in Latin
      letters and in their own writing. For that the table got a `mode` column:
      `word` (stands alone, English-style endings allowed), `stem` (a root found
      inside a word and the whole word is hidden: Russian, Arabic, Hindi) and `exact`
      (matched anywhere, for writing with no spaces: Chinese, Japanese, Korean, Thai,
      only specific phrases, never a fragment that sits inside a normal word, so
      姑妈的书 "aunt's book" and 我操心 "I worry" stay). The word rule now allows
      any script (Latin-letter words still need 3 letters). Words left out because
      they are also normal words or names are listed at the top of that file.
      Cleaning a text takes about 15 ms.
   b. The count over every typed-text column found 3 old rows (the earlier service
      row had since been removed): a chat message ("tangina"), the inbox preview that
      copied it, and an appeal ("titi baho pudai mong pink"). They were cleaned to
      `***`; the count is 0 afterwards. Only the user's own test rows were touched.
   c. `database/test_word_filter.sql` now has 91 checks (36 for the other languages,
      including capitals in Russian, roots with prefixes and endings, and lists of
      words, names and Chinese, Thai and Russian text that must NOT change); all pass
      live, rolled back.
4. LATER, only if asked: Admin page to add/remove words from the list.

## Step 5: stricter matching (2026-10-22)

The user tried it and said some words were still not hidden: "any words in any
format such as Fu ck you, bo bo, bobo, gagu". Before the change, none of those were
caught (a probe on the live database showed "Fu ck you", "f u c k", "bo bo",
"bobo", "gagu", "gagoka", "fuckyou", a Cyrillic "с" or full-width letters in "fuck",
and "fûck" all went through). Now (`database/supabase_word_filter_schema.sql`, applied
live as two migrations):
- The text is FOLDED first (`fold_text`, one character for one character): full-width
  letters, accented letters, the Cyrillic and Greek letters that look like Latin ones.
  Matching is done on the folded text, but the stars replace the span in the ORIGINAL
  text. Native-script words (Russian, Arabic, Chinese...) are matched on the original.
- `loose` words (English and Filipino) also catch letters pulled apart: "Fu ck",
  "f u c k", "F.U.C.K", "f_u_c_k", "bo bo", "B.O.B.O". A split is accepted only when
  it leaves 2+ letters on both ends, or when EVERY letter is separated, so
  "put a logo" (puta), "pot a toes" and "haha u lol" (ulol) are never touched. A
  pulled-apart ROOT must stand alone, so "a bit chilly" is not a "bitch".
- New mode `stem` for English and Filipino roots: found inside a longer word and the
  whole word goes ("fuckyou", "motherfuckers", "putanginamo"). New mode `tail` for
  short Filipino insults that take little words glued on ("gagoka", "tangamo",
  "boboka", "gagong"). `allowed_words` lists look-alikes that are fine ("snigger").
- Words added: bobo, bubu, gago, gagu, ulol, ulul, tanga, engot, hangal, pucha,
  putcha, putsa, potek, putang, bilat, yawa, pisti, siraulo, talipandas, lapastangan,
  walanghiya, lecheng, amputa, ampota, ampucha, ... and in English idiot, moron,
  imbecile, stupid, crap, arse, bugger, tosser, feck, scumbag, asswipe, asshat... Still
  left out on purpose (normal words or names): hell, leche flan, puto, gaga (Lady
  Gaga), inutil, tonto, hudas, mangmang.
- Look-alikes now also: `|` for i, and a star can stand for a vowel (f*ck, f**k).
- Count over every typed-text column of the live database with the stricter filter:
  nothing matched (so no false positive on the real data and nothing to clean).
- `database/test_word_filter.sql`: 122 checks, all pass live (rolled back). A cleaning
  call now takes about 50-65 ms (the pattern is 34 KB), fine for a message.
- Known trade-offs: "Dick" (Dick Van Dyke, Moby Dick) and a name such as "Bo Bo" are
  masked or refused, because the user wants bobo and dick covered.

## Honest limits (for the defense)

- No filter is perfect: a word that is not in the list, new slang, a look-alike
  letter we do not know, and a word broken in an odd place (f uck, fu c k) slip
  through; the list is easy to extend. Letters pulled apart evenly or one by one
  ("Fu ck", "f u c k") are caught since step 5.
- The real word is not kept, so an admin reading a report sees the stars. The
  messages around it still show what happened.

## Blur of the REAL word (not chosen)

Would need the real text to stay in the database and be sent to every page, so the
word could be copied from the page, and the e-mail/preview would need the same work.
The "bleep tape" gives the blurry look without keeping or sending the word.
