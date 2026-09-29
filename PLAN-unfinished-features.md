# Unfinished Features: plan and progress

Last updated: 2026-09-28. To continue in a new Claude session, say:
"Read PLAN-unfinished-features.md and continue from the current step."

These things show on screen but don't work yet. They are built one step at
a time, from easiest to hardest. The 3 hardest (AI search box, SMS log in,
voice + video call) moved to PLAN-hard-features.md for a separate session.
Each step gets its own detailed plan, approved by the user, before any code.

## Why each one doesn't work (checked 2026-09-27)

- Display Name: Save only changes the name on screen. The database isn't
  updated, so a refresh brings the old name back.
- Upload Profile Picture: the file picker opens, but the chosen file is
  ignored. There's no column or storage bucket for a profile picture.
- Top search box: moved to PLAN-hard-features.md. It will be the entry
  point to the AI Content-based filtering main function.
- Google sign up: the code exists, but Google is OFF in Supabase, and
  `/complete-profile` (where new Google users are sent) was never built.
- Applications & Resume: the job page is a hardcoded demo ("Coffee
  Company"), the resume is never uploaded, and the applicants list is
  hardcoded.
- Inbox: the paperclip, mic, call and video call buttons have no code.
  (The photo/video button works.) Calls moved to PLAN-hard-features.md.
- SMS log in: moved to PLAN-hard-features.md.

## Order: easiest to hardest

1. Display Name (Easy): no new tables; save to the database.
2. Upload Profile Picture (Easy): one new column and one storage bucket.
3. Google sign up (Medium): one new page; most of the work is setting up
   Google and Supabase.
4. Applications & Resume (Medium): new table, private bucket, three pages.
5. Inbox attach a file + voice message (Medium): attaching is easy;
   recording a voice message is the harder half.

The hard session waits for Step 3 before SMS log in (it reuses the
Complete Profile page) and for Step 5 before calls (both change
`ChatView.jsx` and `useDashboardShell.js`).

## Defaults picked (the user can change these)

- Resume: PDF only, up to 5 MB, so "View" always opens in the browser.
- Applying to a job: the freelancer must be verified, the same rule as
  posting a service.

## What the user does outside the code

- Before Step 2: authorize the Supabase connector (`/mcp`) so Claude can
  run each step's SQL and check the live database. Otherwise Claude hands
  over the SQL to paste into the Supabase SQL Editor.
- Step 3: create a Google OAuth client in Google Cloud Console and turn on
  Google in Supabase. Claude guides this one screen at a time.

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

## Current step

Step 1 (Display Name): built and pushed live (2026-09-27). No SQL needed.
Still needs the user to test it on the live site. It also fixes the box
showing "User" when Settings is opened right after a refresh.

Step 1 files: `lib/profile.js` (`saveDisplayName`, `MAX_NAME_LENGTH`),
`views/SettingsView.jsx`, `hooks/useDashboardShell.js` (reads `full_name`
from `profiles`).

Step 2 (Upload Profile Picture): built and pushed live (2026-09-27).
`database/supabase_avatar_schema.sql` has been run on Supabase (migration
"profile_pictures"), so don't run it again. Still needs the user to test it
on the live site. Change from the plan: the column is `avatar_path` (the
file's path, checked to be in the user's own folder), not a full
`avatar_url` link.

Step 3 (Google sign up): code built and pushed live (2026-09-28). No SQL
needed. Google setup done: Google Cloud project "philfreela" (PhilFreela
Web OAuth client), Google turned on in Supabase, Redirect URLs added.

Name fix (user asked): the redirect sign-in makes Google say "to continue
to rpopftzrrhuzjxzwobvl.supabase.co". The Login page now uses Google's own
button (`lib/googleSignIn.js`, Google Identity Services +
`signInWithIdToken` with a nonce), so Google names phil-freela.pages.dev
instead. It needs `https://phil-freela.pages.dev` and
`https://localhost:5173` in the client's "Authorized JavaScript origins";
until Google accepts them, the page falls back to the old redirect button.
Showing the exact name "PhilFreela" would also need Google brand
verification (not done).

Step 3 files: `pages/login/CompleteProfile.jsx` (new, `/complete-profile`),
`App.jsx` (route), `lib/pageTitles.js`, `useDashboardShell.js` (a signed-in
user with no profile is sent to Complete Profile).

Step 4 (Applications & Resume, option A: apply + view resume + message;
hire/accept comes later with Feature 5, Transaction History): built and
pushed live (2026-09-29). `database/supabase_applications_schema.sql` has
been run on Supabase (migration "job_applications"), so don't run it again.
Still needs the user to test it. Change from the plan: each upload gets its
own file name (`<freelancer id>/<job id>-<time>.pdf`) so a retry can't
overwrite a resume that was already sent; the PDF's first bytes are checked
("%PDF-").

Step 4 files: `database/supabase_applications_schema.sql`,
`lib/applications.js`, `views/JobDetailsView.jsx` (real job, route
`job-details/:jobId`), `views/FindJobsView.jsx` (title link + View button),
`views/ProjectsView.jsx` + new `components/ApplicationsPanel.jsx`,
`components/DeleteConfirmDialog.jsx` (optional button text), `App.jsx`,
`lib/pageTitles.js`.

Next: plan Step 5 (Inbox file + voice message). The calls session already
changed `ChatView.jsx` and `useDashboardShell.js`, so build on its version.

Step 2 files: `database/supabase_avatar_schema.sql`, `lib/avatar.js`,
`lib/shrinkImage.js` (optional size), `components/Avatar.jsx`,
`useDashboardShell.js`, both dashboard layouts, `DashboardTopNav.jsx`,
`SettingsView.jsx`, `ProfileView.jsx`, `InboxView.jsx`, `ChatView.jsx`,
`FreelancerPortfolioView.jsx`.
