# Real Profiles: plan and progress

Last updated: 2026-10-03. To continue in a new Claude session, say:
"Read PLAN-real-profiles.md and continue from the current step."

Feature 5 in PhilFreela-System-Functions.md, second half: Profile
transparency and transaction history. The first half (projects, ratings, the
"★ 4.8 (5)" badge) is built. The paper says: "Visible profile info:
verification status, ratings, completed transactions, overall platform
activity", and "Each user can open the other's public profile from that
record". "Transaction" means a completed project; no money is involved.

It also gives Feature 1 (Hybrid recommendation system) the numbers its
ranking is missing. See "Not included" for what is left for later.

## What is fake or missing today (checked 2026-10-03)

1. The Performance box on the Profile page is typed in by hand: Completed
   Orders 67, On-time Delivery 99%, Response Time 1 hour, Member Since
   August 2026 (`ProfileView.jsx`). It is the same for every user.
2. The Skills box on the Profile page shows the same four skills for every
   user ("Critical Thinker", "Web Developer", "Creativity", "Video
   Editing"), and "+ Add Skill" is not saved (it is lost on refresh).
3. Only freelancers have a public page. Clients don't, so a freelancer can't
   check a client before applying or accepting a booking.
4. No profile lists completed projects.
5. `profiles.created_at` can't be trusted for "Member since": a signed-in
   user is allowed to update every column of their own profile row, including
   that date (tested 2026-10-03 in a transaction that was rolled back: the
   date changed from 2026 to 2020). The login system's own account date
   (`auth.users.created_at`) can't be edited, so "Member since" uses that.

## What the user will see

1. Your Profile and a freelancer's public page: a real **Performance** box
   and a **Completed projects** list.
2. A new public page for clients, with the same two parts.
3. Your Skills are real: saved, shown on your Profile and on your public
   page.

## The numbers (the formulas, for the defense)

Every number is worked out from real records, and only counts projects the
client marked Done. They are role-specific: a freelancer's page counts
projects where that person was the freelancer; a client's page counts the
ones where they were the client.

1. Completed projects: how many were marked Done.
2. On-time delivery (freelancers only): the share of those whose final
   submission came in on or before the due date (Philippine date). It shows
   "3 of 4" next to the percentage. Until there is one completed project it
   shows "—".
3. Average rating: the average stars the person received on those projects,
   and how many ratings. A freelancer receives the client's performance
   stars; a client receives the freelancer's trust stars.
4. Response time: the same measure "Recommended for you" already uses: how
   long the person usually waits before replying in a chat (the median of
   the last 30 days; a message still unanswered after a day counts as a very
   long wait). It shows "about 25 min", "about 3 h", "about 2 days", "More
   than a day", or "No chats yet".
5. Services posted (freelancers) or Job posts (clients): how many listings
   they have.
6. Member since: the month and year the account was made.

The Completed projects list shows, for each project: its title, when it was
finished, the other person (picture, name, a link to their page) and the
stars and feedback this person got for it ("Not rated yet" if none). It
never shows the project's note, due date, files or links.

## Defaults picked (the user can change these)

- Every signed-in user can see anyone's numbers and completed-project list.
  That is what the paper asks for (people judge reliability before working
  together). The Terms and Privacy pages get one sentence about it.
- The list shows the title and the other person's name. Titles come from job
  posts and services, which are already public.
- Own rows are the exception: on your own page each row also has "Open
  project" (you are on that project, so you can open it).
- 5 projects show at first, with "Show all" for up to 20.
- A link to a person goes to the page that matches their role today (client
  page or freelancer page).
- No money anywhere: "completed" only means the client marked it Done.

## Not included

- Changing the recommendation ranking. That is the next plan: add ratings,
  completed projects, on-time delivery and the booking reply speed to
  `WEIGHTS` and `ranking_signals`. `ranking_signals` can then call the new
  `typical_reply_minutes`, so the profile and the ranking always agree.
- Using the new skills in recommendations (a later step; the paper lists
  skills as data for content-based filtering).
- Badges such as "Top Rated", hiding or editing history, reviews of clients'
  job posts, a list of a client's job posts on their page.
- The "Email Authenticated" line under Verifications is always shown for
  everyone. It is left alone.
- Known limit, good to know for the defense: two accounts working together
  could inflate each other's record. Identity verification (eKYC) makes
  that harder; the plan doesn't try to detect it.

## What the user does outside the code

Nothing for the database: the Supabase connector works, so Claude runs each
step's SQL and checks the live database first. After each push, the user
tests on the live site (phil-freela.pages.dev).

## Step 1: Database (Medium)

New file `database/supabase_profiles_schema.sql` (Step 4 adds to it).

Three functions. They run with extra privilege because other people's
projects and chats are private: the browser can't read them, so the
function only returns what is safe to show. Signed-in users only. The role
must be `freelancer` or `client` (otherwise a plain error).

1. `typical_reply_minutes(target)`: the median wait before `target` replies
   in a chat, over the last 30 days (call lines are left out; a message
   unanswered for over a day counts as 100000 minutes). It is the same logic
   as `ranking_signals` in `supabase_recommendations_schema.sql`, for one
   user. Empty when there are no chats.
2. `profile_stats(target, as_role)` returns one row: `completed_count`,
   `on_time_count` (empty for clients), `avg_stars`, `rating_count`,
   `reply_minutes`, `listing_count`, `member_since` (from
   `auth.users.created_at`).
3. `profile_history(target, as_role, max_rows)` returns the completed
   projects, newest first (at most 20 by default, never more than 50):
   `project_id` (only when the caller is on that project, otherwise empty),
   `title`, `completed_at`, `other_id`, `other_name`, `other_username`,
   `other_avatar_path`, `other_account_type`, `stars`, `feedback`.

Tests (SQL in a transaction that is rolled back afterward; no DELETE
statements, which the database tool refuses without someone to confirm):

1. Made-up people and projects: done on time, done late, still started,
   submitted but not done, and one done project for someone else.
2. The numbers: completed, on-time (and empty for a client), the average and
   count of stars, services or job posts, the freelancer role and the client
   role give different answers for the same person.
3. "Member since" is the login account's date, and does not change when the
   user edits their own `profiles.created_at`.
4. History: newest first, only Done projects, the other person's details,
   `stars` and `feedback`, `project_id` empty for a stranger and filled for
   both people on the project, no note or file anywhere in the result, the
   row limit is clamped.
5. Response time: known message times in one chat give the expected median,
   and an old unanswered message counts as a very long wait.
6. A wrong role is refused, and signed-out visitors can't call any of them.

## Step 2: The real Performance box and Completed projects (Medium)

Code:

1. New `lib/profileStats.js`: `fetchProfileStats(userId, role)`,
   `fetchProfileHistory(userId, role)`, `formatReplyTime(minutes)`,
   `formatMemberSince(date)`, and `profilePath(person)` (the client page or
   the freelancer page, from `other_account_type`).
2. New `components/PerformanceBox.jsx`: the rows above, with "Loading..." and
   "Couldn't load" states. It is the same look as the box it replaces.
3. New `components/CompletedProjects.jsx`: the list, "Show all", "Open
   project" on your own rows, "No completed projects yet." when empty.
4. `ProfileView.jsx`: the fake box becomes `PerformanceBox` for the current
   role, and the list goes under Skills (or the description, for clients).
5. `FreelancerPortfolioView.jsx`: both parts, as a freelancer.
6. `pages/legal/TermsOfService.jsx` and `PrivacyPolicy.jsx`: one sentence
   each, saying that completed projects (title, finish date, who it was
   with, ratings) and reply speed show on the public profile.

Tests: the browser (Playwright with the fake backend, as in Booking), laptop
and phone: the real numbers appear, empty states read well, the list expands,
own rows have "Open project" and a stranger's don't, links go to the right
page. The two new functions are also asked on the live API with the public
key: "permission denied" means the name and the arguments match; "could not
find the function" means they don't.

## Step 3: A public page for clients (Medium)

Code:

1. New `views/ClientProfileView.jsx` at `/dashboard/clients/:clientId`
   (route in `App.jsx`, tab title in `lib/pageTitles.js`): picture, name,
   Verified check (or "Not verified"), @username • Client, the stars badge,
   Message and Report buttons (not on your own page), the description,
   `PerformanceBox` and `CompletedProjects` as a client. A person who isn't
   a client gets "This client wasn't found.", like the freelancer page.
2. A client's name links to that page: `FindJobsView.jsx` (job cards),
   `JobDetailsView.jsx` ("Posted by"), `ProjectDetailsView.jsx` ("Client:",
   when you are the freelancer), `BookingsView.jsx` (a freelancer's
   requests), `ApplicationsPanel.jsx` (a freelancer's "My Applications"), and
   the history rows.

Tests: the browser, laptop and phone: the page for a client, "not found" for
a freelancer's id, every link above opens the right page, and Message and
Report work as on the freelancer page.

## Step 4: Real Skills (Easy)

Database (added to `database/supabase_profiles_schema.sql`):

1. `profiles.skills text[]`, empty by default, with the same rule job posts
   use (`is_valid_skill_list`: up to 10 skills, each 1 to 40 characters).
   Users can already update their own profile row, so nothing else is
   needed (checked 2026-10-03).

Code:

1. `lib/profile.js`: `fetchSkills(userId)` and `saveSkills(userId, skills)`,
   like the description.
2. `ProfileView.jsx`: the hardcoded list and `window.prompt` go. Freelancers
   see their saved skills as chips, with a typed input like "Required
   skills" in Post a Project (Enter or a comma adds one, x removes one), saved
   right away. Clients don't get a Skills box.
3. `FreelancerPortfolioView.jsx`: shows the skills (read-only).
4. `lib/privacy.js`: `skills` joins the profile part of "Download your
   data".

Tests: SQL (a good list, 11 skills, a blank skill and a 41-character skill
are refused; a user can change only their own); the browser (add, remove,
refresh keeps them, a public page shows them, clients have no box).

## Current step

Plan approved by the user on 2026-10-03 ("ok", then "continue"), so all four
steps are built one after another, each pushed when done.

Step 1 (Database): built and pushed (2026-10-03). Its SQL has been run on
Supabase (migration "profile_stats_and_history"), so don't run it again.
Tested in transactions that were rolled back afterward (nothing left behind,
checked afterward): the freelancer's numbers (3 completed, not counting the
started and the submitted ones; 2 on time, the poster was late; average 4.0
from 2 ratings, the unrated project ignored; 2 services), the same person as
a client counts nothing (roles are separate), the client's numbers (2
completed, no on-time number, 4.5 from the trust stars, 2 job posts),
another freelancer and another client counted on their own, a brand-new
account gives zeros and empty values; response time (30 minutes: replies
that took 10 and 30 minutes, an old unanswered message counts as a very long
wait, a newer one isn't counted yet; 110 for the client; empty with no
chats); "member since" is the login account's date and doesn't move when the
user edits their own `profiles.created_at`; the list is newest first, has
only Done projects, the other person's details, stars and feedback, an empty
`project_id` for strangers and for projects you weren't on, all of them on
your own page, no column for a note, due date, file or link; the row limit
is raised to 1 and capped; a wrong or empty role is refused; the helper
can't be called from the browser; signed-out visitors can't call anything.
Still needs the user to test it through the pages (Step 2 and later).

Notes for the next steps: the made-up test accounts need an explicit
`created_at` (the login system sets it itself, a plain insert leaves it
empty). The two public functions are granted to signed-in users;
`typical_reply_minutes` only to the AI service's role (the later ranking
plan can call it).

Step 1 file: `database/supabase_profiles_schema.sql`.
