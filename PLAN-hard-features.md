# Hard Features: plan and progress

Last updated: 2026-09-28. To work on these in a separate Claude session, say:
"Read PLAN-hard-features.md and continue from the current step."

These are the 3 hardest unfinished features, split out of
PLAN-unfinished-features.md so a separate session can build them while that
session builds the medium ones (Google sign up, Applications & Resume, Inbox
file + voice message). Each step gets its own detailed plan, approved by the
user, before any code.

## Working next to the other sessions

- Other Claude sessions work in this same folder at the same time
  (PLAN-unfinished-features.md, and the watermarking work in
  PLAN-watermarking.md). Commit only this session's own changes, even inside
  a file another session also changed.
- Push right after committing, but only once any SQL the new code needs has
  been run on Supabase (the live site updates within minutes).
- Two steps change the same files as the medium session, so they wait:
  - SMS log in waits until Google sign up is done (it reuses the Complete
    Profile page, and both change the login pages and `App.jsx`).
  - Voice + video call waits until Inbox file + voice message is done (both
    change `ChatView.jsx` and `useDashboardShell.js`).
- The AI search box can start right away. It shares the AI service
  (`ai-service/main.py`) with the watermarking session, so commit only its
  own lines there too.

## Order

1. AI search box: Content-based filtering (Hard). Can start now.
2. SMS log in (Hard). After Google sign up is done.
3. Voice call + video call (Hardest). After Inbox file + voice message is
   done.

## Step 1: AI search box, Content-based filtering (Hard)

Why: the top search box ("Search profiles, jobs, inbox...") is only an input
today; nothing reads what you type. The user said it belongs to PhilFreela's
main function "AI Content-based filtering", so it's an AI feature, not a
plain keyword search.

The idea (a detailed plan is still needed before any code):

- A pretrained model (`all-MiniLM-L6-v2`, run as ONNX in the Python AI
  service on Vercel) turns each service's and job post's text (title,
  category, description, skills) into a list of numbers that captures its
  meaning.
- Those numbers are stored in Supabase with pgvector.
- A search turns the typed words into numbers the same way and finds the
  closest services and jobs by meaning. Example: "logo" also finds "brand
  identity design".
- The same system can later power "Recommended for you" and feed the
  Ranking algorithm and the Hybrid recommendation system (main functions 4
  and 6).
- The watermarking plan also uses pgvector (its Step 5) and
  `all-MiniLM-L6-v2` (its Step 6), so check what already exists and share
  it instead of adding a second copy.

Detailed plan (written 2026-09-28, NOT approved yet: the user said "AI
search box later", so show it again and get an OK before any code). Checked
that day: pgvector 0.8.2 is available on Supabase but not turned on; the
watermarking session hadn't added pgvector or MiniLM yet; the live site had
only 2 services and 1 job post.

What the user sees:

1. Top search box, Enter: opens `/dashboard/search?q=...` with Services and
   Jobs sections, best match first (clients see Services first, freelancers
   Jobs first). Each result: title, category, price/budget, owner +
   Verified check, Message button, "Strong match" / "Related" label.
2. The results page has its own box; on phones (top box hidden) a search
   icon in the top bar opens it.

How it works:

1. MiniLM (8-bit ONNX, about 23 MB) turns each post's text (title,
   category name, skill, description) into 384 numbers, stored with
   pgvector. A search does the same to the typed words; Supabase returns
   the closest posts (cosine similarity) above a cut-off.
2. Before each search the AI service embeds new or changed posts (found by
   a fingerprint of their text), so the posting pages don't change and old
   posts are covered on the first search.
3. The AI service returns only ids and scores; the browser loads the posts
   under the normal database rules, so hidden posts (suspended, unverified)
   drop out.

Database, new file `database/supabase_search_schema.sql`:

1. `create extension vector` (shared with watermarking Step 5).
2. Table `listing_embeddings`: id, `service_id` or `job_post_id` (exactly
   one, deleted with the post), `embedding vector(384)`, `text_hash`,
   `updated_at`. RLS on, no policies (AI service only, like
   `watermark_codes`).
3. `listings_to_embed(max_rows)` and `match_listings(query_embedding,
   match_count, min_score)`: service role only.

AI service:

1. New `text_embedder.py` (MiniLM, shared with watermarking Step 6).
2. New `listing_search.py` (post text with category names, catch-up,
   match).
3. `main.py`: only `POST /search`, login required, `{ "query": "..." }`
   (2-200 characters) -> `{ "results": [{ "type", "id", "score" }] }`,
   up to 30.
4. `get_models.py` downloads the model + tokenizer (SHA-256 checked);
   `requirements.txt` adds `tokenizers`.

Website: `lib/aiService.js` (`searchListings`), new
`views/SearchResultsView.jsx`, `DashboardTopNav.jsx` (Enter opens results,
placeholder "Search services and jobs...", phone icon), `App.jsx` route,
`lib/pageTitles.js`.

Tests: about 40 made-up posts and 20 searches with known right answers
(top-3 hit rate, sets the cut-off); 8-bit vs full model give the same
order; search time on the live site, including after Vercel sleeps.

Not in this step: people or inbox search, "Recommended for you", Ranking,
Hybrid recommender.

## Step 2: SMS log in (Hard)

User: make a Twilio trial account, then in Supabase turn on the Phone
provider and paste the Twilio Account SID, Auth Token and Message Service
SID. The trial can only text phone numbers verified in Twilio first, and
its texts start with "Sent from your Twilio trial account".

How it works:

- Login page, "Continue with phone": type a PH mobile number, get a
  6-digit code by SMS, type it in, signed in.
- A new number goes to the Complete Profile page (built with Google sign
  up).
- Email accounts can add a phone number in Settings, Account Security
  (confirmed with a code), then log in by SMS too.

Code:

1. New `pages/login/PhoneLogin.jsx`: send the code, check the code, resend
   after 60 seconds.
2. `lib/validators.js`: PH mobile number check, converted to +63 format.
3. `SettingsView.jsx`, Account Security: add and confirm a phone number.

Database: none (Supabase keeps the phone on the login account).

## Step 3: Voice call + video call (Hardest)

Detailed plan approved by the user on 2026-09-28 ("go"). Built before Inbox
file + voice message, because the medium session hadn't started that step
yet (nobody else was editing `ChatView.jsx` or `useDashboardShell.js`);
that step builds on top of the call code.

What the user sees:

1. The phone and camera buttons in the chat header start a voice or video
   call ("Calling...", Cancel).
2. The other person gets a ringing pop-up on any dashboard page (Accept,
   Decline, a ring sound made by the browser). Two open tabs both ring;
   answering in one closes the other.
3. No answer after 30 seconds: missed call, and a "Missed voice call from
   ..." pop-up.
4. During the call: the other person's video big, your own small in a
   corner (voice calls show profile pictures), a timer, Mute, Camera
   on/off, Hang up. The call keeps going while moving around the
   dashboard, including its home page.
5. The chat and the Inbox preview show "Video call, 3:12", "Missed voice
   call" or "Declined video call".
6. Suspended from messaging (or banned): can't start or answer calls.

How it works (for the defense): WebRTC connects the two browsers directly,
so voice and video never pass through our server; free Google STUN servers
help each browser find its public address. The connection details travel
in the call's own row in Supabase (only the two people can read it) and
reach the other browser instantly through Realtime. They contain IP
addresses, so they're deleted when the call ends. (Change from the first
idea: no separate private channel.)

Database, new file `database/supabase_calls_schema.sql`:

1. Table `calls`: id, conversation_id, caller_id, callee_id, kind (voice,
   video), status (ringing, accepted, declined, missed, ended), offer,
   answer, created_at, answered_at, last_active_at, ended_at. Only the two
   people can see it; nobody can change it directly.
2. Functions: `start_call` (in the conversation, neither person blocked
   from messaging, neither already in a call), `answer_call` (the person
   called, while it rings), `end_call` (either person: ringing -> missed
   for the caller, declined for the person called; answered -> ended),
   `keep_call_alive` (both browsers every 20 seconds during a call).
3. `messages.call_id` + a trigger that adds the chat line when a call
   finishes.
4. Realtime on `calls`.
5. pg_cron every minute (`finish_stale_calls`): still ringing after 45
   seconds -> missed; answered but no keep-alive for 75 seconds (both
   browsers closed) -> ended at the last keep-alive, so the length stays
   right.

Code: new `lib/calls.js` (the call itself, kept outside the page so moving
between dashboard pages doesn't drop it), new
`components/CallDialog.jsx` + `calls.css`, `useDashboardShell.js` (incoming
calls, missed-call pop-up, end the call on sign out),
`DashboardOverlays.jsx` (shows the dialog), `ChatView.jsx` (buttons, call
lines).

Optional for the user: a free TURN account (Metered) helps calls connect on
strict networks such as some school Wi-Fi.

Limits: one-to-one only; both people keep the page open (no phone
notifications); on strict networks a call may fail to connect without a
TURN server; a phone browser may drop the call when the screen locks.

## Current step

Step 3 (Voice + video call): built and pushed live (2026-09-28).
`database/supabase_calls_schema.sql` has been run on Supabase (migration
"voice_video_calls"), so don't run it again. Still needs the user to test
it on two real devices (a phone on mobile data and the laptop on Wi-Fi, the
hardest case for connecting).

Tests (2026-09-28, local site against the live database, 3 temporary
accounts deleted afterwards): database rules 33/33 (privacy, busy,
suspended, decline, missed, the every-minute clean-up job); two browser
windows with Chrome's fake camera 35/35 (video both ways, mute, camera,
small window, moving to the home page mid-call, hang up, decline, no
answer + missed-call pop-up, two tabs ringing, busy, reload while ringing,
caller closing the tab, suspended user has no call buttons).

Changes from the approved plan: `keep_call_alive` + `last_active_at` (so a
call whose browsers both closed still ends at the right time); `end_call`
also declines (no separate decline function); closing or reloading the tab
ends a call you started or joined, but not one that's only ringing (it may
ring in another tab); an optional TURN server can be added later with
VITE_TURN_URL, VITE_TURN_USERNAME and VITE_TURN_CREDENTIAL in Cloudflare.

Fixes asked for by the user after the first version (2026-09-28, pushed;
migration "voice_video_calls_fixes" applied, it's the last section of
`supabase_calls_schema.sql`):
1. The other person's camera off: you see their picture and "Camera off"
   instead of a black screen (a small data channel between the browsers).
2. Finished and declined calls no longer count as unread in the Inbox
   badge (`get_unread_message_count`); missed calls still do.
3. Suspended from messaging (or banned) during a call: the call ends at
   once for both (trigger `user_suspensions_end_calls`).
4. Leaving the dashboard during a call ends it (3 seconds after the last
   dashboard layout closes), instead of the voice going on with no window.
Tests after the fixes: database rules 33/33, browser 46/46.

Step 3 files: `database/supabase_calls_schema.sql`, `client/src/lib/calls.js`,
`pages/dashboard/components/CallDialog.jsx`, `components/calls.css`,
`components/DashboardOverlays.jsx`, `hooks/useDashboardShell.js`,
`views/ChatView.jsx`.

For the medium session's Inbox file + voice message step: `ChatView.jsx`
now has the call buttons and call lines (`messages.call_id`, no right-click
menu on them), and `useDashboardShell.js` has the calls listener and a
call-line branch in the new-message pop-up. Build on top of those.

Step 1's detailed plan is written (above) but the user postponed it on
2026-09-28 ("AI search box later"). Step 2 (SMS log in) can start: Google
sign up's Complete Profile page was pushed on 2026-09-28 (commit 68428d0).
