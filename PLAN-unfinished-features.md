# Unfinished Features: plan and progress

Last updated: 2026-09-27. To continue in a new Claude session, say:
"Read PLAN-unfinished-features.md and continue from the current step."

These things show on screen but don't work yet. They are built one step at
a time, from easiest to hardest. Each step gets its own detailed plan,
approved by the user, before any code.

## Why each one doesn't work (checked 2026-09-27)

- Display Name: Save only changes the name on screen. The database isn't
  updated, so a refresh brings the old name back.
- Upload Profile Picture: the file picker opens, but the chosen file is
  ignored. There's no column or storage bucket for a profile picture.
- Top search box: moved out of this list. It will be the entry point to
  the AI Content-based filtering main function, which gets its own plan.
- Google sign up: the code exists, but Google is OFF in Supabase, and
  `/complete-profile` (where new Google users are sent) was never built.
- Applications & Resume: the job page is a hardcoded demo ("Coffee
  Company"), the resume is never uploaded, and the applicants list is
  hardcoded.
- Inbox: the paperclip, mic, call and video call buttons have no code.
  (The photo/video button works.)
- SMS log in: not built, phone login is OFF in Supabase, and it needs an
  SMS provider.

## Order: easiest to hardest

1. Display Name (Easy): no new tables; save to the database.
2. Upload Profile Picture (Easy): one new column and one storage bucket.
3. Google sign up (Medium): one new page; most of the work is setting up
   Google and Supabase.
4. Applications & Resume (Medium): new table, private bucket, three pages.
5. Inbox attach a file + voice message (Medium): attaching is easy;
   recording a voice message is the harder half.
6. SMS log in (Hard): Twilio setup, codes by SMS, adding a phone number to
   existing accounts.
7. Voice call + video call (Hardest): WebRTC, ringing on every page, new
   table and live channel.

Step 6 reuses the Complete Profile page from Step 3.

## Defaults picked (the user can change these)

- Resume: PDF only, up to 5 MB, so "View" always opens in the browser.
- Applying to a job: the freelancer must be verified, the same rule as
  posting a service.
- SMS provider: Twilio free trial.
- Calls: built into the app with WebRTC (free), not an outside service.

## What the user does outside the code

- Before Step 2: authorize the Supabase connector (`/mcp`) so Claude can
  run each step's SQL and check the live database. Otherwise Claude hands
  over the SQL to paste into the Supabase SQL Editor.
- Step 3: create a Google OAuth client in Google Cloud Console and turn on
  Google in Supabase. Claude guides this one screen at a time.
- Step 6: make a free Twilio trial account and verify the phone numbers
  used for testing (the trial can only text verified numbers).
- Step 7: nothing required. A free TURN account (Metered) is optional; it
  helps calls connect on strict networks such as some school Wi-Fi.

## Step 1: Display Name (Easy)

Database: none. `profiles.full_name` already exists.

Code:

1. `lib/profile.js`: new `saveDisplayName(userId, name)` that updates
   `profiles.full_name` and the login's `user_metadata.full_name`.
2. `SettingsView.jsx`: Save Changes calls it. The name must be 2 to 60
   characters. Errors show in a toast.
3. `useDashboardShell.js`: reads `full_name` from `profiles` on load, so
   the new name stays after a refresh and shows in the top nav and
   Profile page.

Note: `SettingsView.jsx` also has another session's uncommitted watermark
changes. Commit only this step's lines.

## Step 2: Upload Profile Picture (Easy)

Database, new file `database/supabase_avatar_schema.sql`:

1. `profiles.avatar_url text` (empty = no picture).
2. Public bucket `avatars`: JPG, PNG, WebP, GIF, up to 5 MB.
3. Storage rules: signed-in users can view pictures; a user can upload,
   replace and delete only inside their own folder `{user_id}/`.

Code:

1. New `client/src/lib/avatar.js`:
   - `validateAvatar(file)`: checks the type and size.
   - `uploadAvatar(userId, file)`: uploads, saves the link in
     `profiles.avatar_url`, then deletes the old picture.
2. New `client/src/components/Avatar.jsx`: shows the picture, or the first
   letter of the name when there's none. Used everywhere below.
3. `SettingsView.jsx`: preview right after picking a picture; Save Changes
   uploads it.
4. `useDashboardShell.js`: reads `avatar_url` on load and shares
   `avatarUrl`.
5. The picture shows in the top nav (`DashboardTopNav.jsx`), the Profile
   page (`ProfileView.jsx`), the Inbox list (`InboxView.jsx`) and the chat
   header (`ChatView.jsx`).

## Step 3: Google sign up (Medium)

User, guided by Claude:

1. Google Cloud Console: create an OAuth client (Web) with this redirect:
   `https://rpopftzrrhuzjxzwobvl.supabase.co/auth/v1/callback`
2. Supabase, Authentication, Sign In / Providers, Google: paste the Client
   ID and Secret, turn it on.
3. Supabase, Authentication, URL Configuration: add
   `https://phil-freela.pages.dev/login` and `http://localhost:5173/login`.

Code:

1. New `pages/login/CompleteProfile.jsx` at `/complete-profile`: full name
   (filled in from Google), username, gender, and Freelancer or Client.
   Saves the `profiles` row, then opens the right dashboard. No session
   goes to /login; an existing profile goes to its dashboard.
2. Its route in `App.jsx` and tab title in `lib/pageTitles.js`.

Database: none.

## Step 4: Applications & Resume (Medium)

How it works:

- Freelancer: Find Jobs, open a job, "Send your resume", pick a PDF, add
  an optional note, Send. One application per job. The Projects page lists
  "My Applications".
- Client: Projects & Resumes lists the real applicants for their jobs,
  with View (opens the PDF in a new tab) and Message.

Database, new file `database/supabase_applications_schema.sql`:

1. Table `job_applications`: id, job_post_id (the job), freelancer_id,
   resume_path, cover_note (up to 1000 characters), created_at. A
   freelancer can apply to a job only once.
2. Rules: only a verified freelancer who isn't blocked from posting can
   apply; the freelancer sees and can withdraw their own applications; the
   client sees applications to their own jobs.
3. Private bucket `resumes`: PDF only, up to 5 MB, saved as
   `{freelancer_id}/{job_post_id}.pdf`. The freelancer and that job's client
   can open it. Opening uses a link that expires after 60 seconds.

Code:

1. New `lib/applications.js`: `applyToJob`, `getMyApplications`,
   `getApplicantsForMyJobs`, `openResume`, `withdrawApplication`.
2. `JobDetailsView.jsx`: loads the real job from
   `/dashboard/job-details/:jobId` (route change in `App.jsx`). The Coffee
   Company text is removed. Shows "Applied" if already sent.
3. `FindJobsView.jsx`: each job card opens its job page.
4. `ProjectsView.jsx`: the hardcoded list is replaced by the real one.

Not included: accept/decline buttons and "new applicant" notifications.
The "Active Projects Tracker" box stays as it is.

## Step 5: Inbox attach a file + voice message (Medium)

How it works:

- Paperclip: PDF, DOCX, XLSX, PPTX or TXT, up to 10 MB. It shows in the
  chat as a card (icon, name, size) that downloads when clicked.
- Mic: tap to record, tap again to stop (2 minutes max), listen back, then
  Send or Discard. It plays in the chat with an audio player.

Database, new file `database/supabase_chat_files_schema.sql`:

1. `messages.attachment_name text` (the original file name).
2. `attachment_type` also allows `file` and `audio`. Claude checks the
   live rule first, because the photo/video columns were added through
   migrations and aren't in the SQL files.
3. `chat-attachments` bucket also accepts those document and audio types.
4. Inbox preview shows "Sent a file" / "Sent a voice message".

Code:

1. New `lib/chatFiles.js`: type and size checks, and one upload helper
   shared by photos, files and voice messages.
2. New `components/VoiceRecorder.jsx`: records with the browser's
   MediaRecorder (asks for microphone permission).
3. `ChatView.jsx`: wires the paperclip and mic; shows file cards and audio
   players.
4. `useDashboardShell.js`: the pop-up says "sent a file" / "sent a voice
   message".

## Step 6: SMS log in (Hard)

User: make a Twilio trial account, then in Supabase turn on the Phone
provider and paste the Twilio Account SID, Auth Token and Message Service
SID. Trial texts start with "Sent from your Twilio trial account".

How it works:

- Login page, "Continue with phone": type a PH mobile number, get a
  6-digit code by SMS, type it in, signed in.
- A new number goes to the Complete Profile page from Step 3.
- Email accounts can add a phone number in Settings, Account Security
  (confirmed with a code), then log in by SMS too.

Code:

1. New `pages/login/PhoneLogin.jsx`: send the code, check the code, resend
   after 60 seconds.
2. `lib/validators.js`: PH mobile number check, converted to +63 format.
3. `SettingsView.jsx`, Account Security: add and confirm a phone number.

Database: none (Supabase keeps the phone on the login account).

## Step 7: Voice call + video call (Hardest)

How it works (for the defense): WebRTC connects the two browsers directly,
so the voice and video don't pass through our server. Supabase only
carries the short "calling / answer / connection details" messages. Free
Google STUN servers help the two browsers find each other.

- The call buttons in the chat header start a voice or video call.
- The other person gets a ringing pop-up on any dashboard page, with Accept
  and Decline. After 30 seconds with no answer, it becomes a missed call.
- During the call: mute, camera on/off, hang up, and a timer.
- The chat shows a line such as "Video call, 3:12" or "Missed voice call".
- Someone suspended from messaging can't call.

Database, new file `database/supabase_calls_schema.sql`:

1. Table `calls`: id, conversation_id, caller_id, callee_id, kind (voice
   or video), status (ringing, accepted, declined, missed, ended),
   created_at, answered_at, ended_at. Only the two people in the
   conversation can see or change it.
2. Realtime on `calls` for the ringing pop-up, and a rule so only those
   two can join the call's private channel.

Code:

1. New `lib/calls.js`: start, answer and end a call; WebRTC setup.
2. New `components/CallDialog.jsx`: ringing screen and in-call screen.
3. `useDashboardShell.js` and `DashboardOverlays.jsx`: listen for incoming
   calls on every page.
4. `ChatView.jsx`: wires the two buttons and shows the call lines.

Limits: one-to-one only; both people keep the page open; on strict
networks a call may fail to connect without a TURN server.

## Current step

Step 1 (Display Name): built and pushed live (2026-09-27). No SQL needed.
Still needs the user to test it on the live site. It also fixes the box
showing "User" when Settings is opened right after a refresh.

Step 1 files: `lib/profile.js` (`saveDisplayName`, `MAX_NAME_LENGTH`),
`views/SettingsView.jsx`, `hooks/useDashboardShell.js` (reads `full_name`
from `profiles`).

Next: plan Step 2 (Upload Profile Picture) in detail. It needs SQL, so the
Supabase connector should be authorized first (or the user pastes the SQL).
