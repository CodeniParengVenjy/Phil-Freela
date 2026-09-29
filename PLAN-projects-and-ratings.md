# Projects and Ratings: plan and progress

Last updated: 2026-09-29. To continue in a new Claude session, say:
"Read PLAN-projects-and-ratings.md and continue from the current step."

This makes the 6 project screens real. Today Project Details, Submit
Project and Ratings are demo pages (fake "Coffee Company" and "Peter Cruz"),
nothing links to them, and the "Active Projects Tracker" box on the
Projects page is fake. The missing piece is the **project**: the record
made when a client hires a freelancer.

Graded functions this builds:

- Feature 5, Profile transparency and transaction history: a project that
  both sides confirm as done is the "completed transaction" record (no
  money involved).
- Feature 1, Hybrid recommendation system: the ratings and completed
  projects are the data its ranking algorithm needs later.

## The screens

1. Job Details (freelancer): already real. Adds the client's star rating
   and Required Skills.
2. Project, "Started" (freelancer): note, dates, "Attach your files".
3. Project, "Done" (client): the submitted work, "Add your ratings and
   feedback".
4. Ratings (client rates the freelancer): optional feedback + performance
   stars.
5. Ratings (freelancer rates the client): trust stars only.
6. Submit your project (freelancer): upload a file or paste a link.

## How it works

1. The client opens Projects & Resumes and clicks **Hire** on an applicant.
   The client types the note and picks the due date. The project starts
   as "Started".
2. The project shows as a card on both people's Projects page. The card
   opens the Project page (screens 2 and 3).
3. The freelancer clicks "Attach your files" (screen 6) and uploads the
   work or pastes a link. The status becomes "Submitted".
4. The client opens the project, watches or opens the work, then clicks
   **Mark as Done** or **Request changes** (back to "Started"; they
   explain in chat).
5. When it's Done, each side rates the other once: the client uses
   screen 4, the freelancer uses screen 5.
6. Each step sends a notification to the other person.

Statuses: Started, Submitted, Done.

## Defaults picked (the user can change these)

- A project starts only from Hire on a job applicant. Service cards stay
  as they are (portfolio + Message).
- One project per application. A client can hire more than one applicant
  for the same job.
- Deliverable: one file (video, photo, PDF or ZIP, up to 50 MB, the
  Supabase free plan's limit per file) and/or one https link, plus an
  optional message. Submitting again replaces the old file, so storage
  doesn't fill up.
- Ratings can't be edited after they're sent.
- Ratings are visible to every signed-in user (Feature 5 transparency).
- Once hired, the freelancer can't withdraw that application.

## Not included

- Cancelling a project, and closing the job post after a hire.
- Starting a project from a service card or from chat.
- The full transaction history list on profiles (Feature 5's next step).
  This plan shows the average rating only.
- Watermarking deliverables. The client gets the clean file.

## What the user does outside the code

The Supabase connector needs authorizing (`/mcp`) so Claude can run each
step's SQL and check the live database first. Otherwise Claude hands over
the SQL to paste into the Supabase SQL Editor.

## Step 1: Required Skills on job posts (Easy)

Database, new file `database/supabase_projects_schema.sql` (Steps 2 to 4
add to it):

1. `job_posts.skills text[]`, empty by default. Up to 10 skills, each 1 to
   40 characters.

Code:

1. `PostNeedView.jsx`: a "Required skills" box. Type a skill and press
   Enter (or comma) to add it as a chip; x removes it.
2. `JobDetailsView.jsx`: shows the skills as chips under the description.

## Step 2: Hire and the Project page (Medium)

Database:

1. Table `projects`:
   - id
   - application_id: unique; set to empty if the job post is deleted
   - job_post_id: set to empty if the job post is deleted
   - client_id, freelancer_id
   - title: copied from the job post, so the history survives if the job
     post is deleted
   - note: up to 1000 characters
   - status: `started` / `submitted` / `done`
   - started_at, due_date, completed_at
   - submission_path, submission_link, submission_message, submitted_at
     (these are used in Step 3)
2. Rules: only the project's client and freelancer can see it. There are
   no insert or update rules. The browser changes a project only through
   the functions below, which check who is asking and the current status.
3. Function `hire_applicant(application_id, note, due_date)`:
   - The caller must be that job's client and not blocked from posting.
   - The applicant must not be hired already.
   - The due date must be today or later.
   - It makes the project and notifies the freelancer.
4. `job_applications`: the withdraw rule also requires "not hired yet".
5. `user_notifications`: new kinds `project_hired`, `project_submitted`,
   `project_done`, `project_changes`. Claude checks the live rule first,
   since other steps have changed it.

Code:

1. New `lib/projects.js`: `hireApplicant`, `getMyProjects`, `getProject`.
2. New `components/HireDialog.jsx`: note + due date, Hire button.
3. `ApplicationsPanel.jsx`:
   - Client: a Hire button on each applicant, or a "Hired" badge.
   - Freelancer: "Hired" on that application.
4. `ProjectsView.jsx`: the fake tracker becomes **My Projects**, with real
   cards (the other person, title, status, due date). Each card opens its
   project.
5. `ProjectDetailsView.jsx`: real data at `project-details/:projectId`.
   Title, the other person, status, note, dates, and the chat icon (opens
   the chat with them). The freelancer sees "Attach your files" while
   Started.
6. `App.jsx` routes and `lib/pageTitles.js` for the new addresses.
7. `lib/notifications.js`: icons and "Open project" buttons for the new
   kinds.

## Step 3: Submit the work, Mark as Done (Medium)

Database:

1. Private bucket `deliverables`:
   - Types: MP4, WebM, MOV, JPG, PNG, WebP, PDF, ZIP, up to 50 MB.
   - Saved as `<freelancer id>/<project id>-<time>.<ext>`.
   - Only the project's client and freelancer can open it, through a link
     that expires.
2. Function `submit_project(project_id, file_path, link, message)`:
   - Freelancer only, while Started.
   - Needs a file, a link, or both. The file must be in their own folder
     for this project, and the link must start with https://.
   - Sets Submitted and notifies the client.
3. Function `mark_project_done(project_id)`: client only, while Submitted.
   Sets Done and notifies the freelancer.
4. Function `request_project_changes(project_id)`: client only, while
   Submitted. Goes back to Started and notifies the freelancer.

Code:

1. `lib/projects.js`:
   - `checkDeliverable(file)` checks the type, the size, and the file's
     first bytes, like the resume check.
   - `submitProject` uploads the file, then deletes the old one.
   - Also `openDeliverable`, `markProjectDone`, `requestProjectChanges`.
2. `SubmitProjectView.jsx`: real upload at `submit-project/:projectId`
   (screen 6).
3. `ProjectDetailsView.jsx` shows the submitted work: a video player,
   photo, PDF button, or link. The client gets Mark as Done and Request
   changes.

## Step 4: Ratings and Feedback (Medium)

Database:

1. Table `project_ratings`:
   - id, project_id, rater_id, ratee_id
   - stars: 1 to 5
   - feedback: optional, up to 1000 characters
   - created_at
   - One rating per person per project.
2. Rules: rate only as yourself, only when the project is Done, and only
   the other person on it. Every signed-in user can read ratings. There
   are no update or delete rules.
3. Function `rating_summaries(ids)`: each user's average stars and number
   of ratings. It works like `verified_user_ids`, so lists can use it
   later.

Code:

1. `lib/projects.js`: `rateProject`, `getMyRating(projectId)`.
2. `FeedbackView.jsx` at `feedback/:projectId`:
   - The client sees screen 4 (feedback + "Rate the performance").
   - The freelancer sees screen 5 ("Rate the trust and transaction").
3. `ProjectDetailsView.jsx`: when Done, "Add your ratings and feedback",
   or "You rated ★4" after rating.
4. New `lib/ratings.js` + `components/StarRating.jsx` show "★ 4.8 (5)":
   - on Job Details, for the client (screen 1)
   - on the freelancer's public page

## Current step

Steps 1 and 2: built and pushed (2026-09-30). Their SQL has been run on
Supabase (migrations "job_post_skills" and "projects_hire"), so don't run
it again. It was tested in a transaction that was rolled back afterward:
only the job's client can hire, a due date in the past is refused, a
second hire is refused, the browser can't change a project directly,
other users can't see it, the freelancer gets the notification, and a
hired application can't be withdrawn. Still needs the user to test it on
the live site.

Changes from the plan:
- The live notification rule also had `report_resolved` and
  `report_dismissed` (from the reports work); they were kept.
- Hire problems are raised by the database function in plain words, and
  the page shows them as is.
- New `components/ProjectsPanel.jsx` holds the My Projects box, like
  `ApplicationsPanel.jsx`.
- Until Step 3, "Attach your files" shows but is turned off, with a line
  saying to send the work in chat for now. The old demo pages
  `SubmitProjectView.jsx` and `FeedbackView.jsx` are still there, but
  nothing links to them (Steps 3 and 4 replace them).

Steps 1 and 2 files: `database/supabase_projects_schema.sql`,
`lib/projects.js`, `lib/applications.js` (a `project` field on each
application), `lib/notifications.js`, `lib/pageTitles.js`, `App.jsx`
(route `project-details/:projectId`), `components/HireDialog.jsx`,
`components/ProjectsPanel.jsx`, `components/ApplicationsPanel.jsx`,
`views/ProjectsView.jsx`, `views/ProjectDetailsView.jsx`,
`views/JobDetailsView.jsx`, `views/PostNeedView.jsx`.

Next: plan Step 3 in detail (submit the work, Mark as Done).
