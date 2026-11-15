# PLAN: Panel revisions list (2026-11-15)

The panel's handwritten revisions list (12 items), as read on 2026-11-15:

1. Government Requirements - Seal Badge
2. Filipino freelancers and clients, or Filipino freelancers only?
3. How can you verify that the freelancer is not an agency?
4. Appeal Process
5. Creative field only?
6. Upload a portfolio link
7. Revisions - set the number of revisions, or customize Terms & Conditions
8. Grounds for suspension or banning of accounts
9. Hiring Process
10. Freelancer - Client Ratio
11. Client Testimony
12. COS (read as Contract of Service)

The user answered "ok" to the suggestions table, so the suggestions below are the plan.
Status: WAITING for the user's OK on this plan.

## What is already there (checked 2026-11-15)

- Appeals (item 4): a suspended or banned user appeals once per penalty, an admin answers (`lib/appeals.js`, `pages/appeal/AppealPage.jsx`, table `appeals`).
- Penalty chart (item 8): `lib/violations.js` (Spam 3 days, Inappropriate content 7, Harassment 14, Stolen work 14, Scam / Fraud 30, Other = admin picks). The Terms mention suspensions only in scattered lines.
- One person, one account (item 3): ID + face scan, and the AI service already flags the same face on another account (`identity_verifications.duplicate_of`, `ai-service/main.py`, shown to the admin).
- Hiring (item 9): post -> applicants ranked by AI -> hire -> deliver -> pay -> rate, all live.
- Freelancer and client counts (item 10): the admin Overview already counts both (live: 24 freelancers, 19 clients).
- Missing: portfolio links, number of revisions, testimonials, a Contract of Service, any rule about agencies.

## Defaults chosen

- Item 2: freelancers must be Filipino (any Philippine ID, or a Philippine passport); clients may be from anywhere (any passport works). The homepage already says "global clients"; the Terms get fixed to match.
- Item 5: keep all 18 categories. Answer for the panel: "creative and digital work first, but not only".
- Item 1: read as the National Privacy Commission's Seal of Registration (and the other permits a real platform needs). Paper text only. Nothing goes on the site, because PhilFreela doesn't have the seal yet.
- Item 12: COS = Contract of Service, a PDF made from the project's details.
- A ban is for serious or repeated cases: a proven scam, or breaking a rule again after a suspension (admin decides).
- An "Agency / shared account" report: 14 days, posting blocked.
- Revisions: 0, 1, 2, 3, 4, 5 or Unlimited. This is shown and written in the contract, but the site doesn't count it automatically.
- Testimonials: only from clients who tick "show this on the homepage". Only the client's first name is shown.

## Steps

### Step 1. Terms of Service text (items 2, 3, 4, 8). No database change.
- `client/src/pages/legal/TermsAndPrivacy.jsx`:
  - "Who can join": freelancers are Filipino (Philippine ID or Philippine passport); clients can be from anywhere (Philippine ID or any passport). Also fix the two "Filipino freelancers and clients" lines.
  - "One person per account": no agencies, teams or shared accounts. The person who verified is the one who does the work. Explain how it's checked (ID + face scan, same face on two accounts flagged, reports).
  - "Grounds for suspension or ban": the penalty chart as a list (reason, days, what it blocks), plus when a ban happens.
  - "How appeals work": appeal once per penalty, in a message box, the penalty stays while the admin reviews it, the answer arrives as a notification.

### Step 2. Agency check (item 3). Small database change.
- `client/src/pages/dashboard/views/VerifyIdentityView.jsx`: a required tick box before sending: "I'm one person working for myself, not an agency or a team sharing this account."
- New report reason "Agency / shared account": `client/src/lib/reports.js` and `client/src/lib/violations.js` (14 days, posting blocked).
- Freelancers who pick Passport must have a Philippine one (the passport's code lines say PHL): `ai-service/passport_mrz.py`, `ai-service/main.py`, and a clear message on the page. Clients can use any passport.
- Database (migration `agency_reason`): add `'agency'` to the CHECK on `reports.reason` and on `user_suspensions.violation`.

### Step 3. Portfolio links (item 6). Small database change.
- Database (migration `portfolio_links`): `profiles.portfolio_links text[] not null default '{}'`, CHECK at most 3, each must start with `https://` and be at most 200 characters.
- `client/src/lib/profile.js`: save + check the links.
- `client/src/pages/dashboard/views/ProfileView.jsx`: freelancers get 3 link boxes (Behance, GitHub, Google Drive, own site...).
- `client/src/pages/dashboard/views/PublicProfileView.jsx`: links show as chips that open in a new tab (`rel="noopener noreferrer nofollow"`).

### Step 4. Revisions and own terms on services (item 7). Small database change.
- Database (migration `service_revisions`):
  - `services.revisions text`, CHECK in ('0','1','2','3','4','5','unlimited'); old services stay empty (= "not stated").
  - `services.extra_terms text`, CHECK at most 500 characters.
  - The same two columns on `bookings`, copied from the service by a small BEFORE INSERT trigger when a client books. That way a later edit of the service doesn't change an agreement already made, and `create_booking` stays untouched.
- `client/src/pages/dashboard/views/ServicesView.jsx`: "Revisions included" picker + "Your terms (optional)" box when posting or editing a service.
- `client/src/pages/dashboard/views/ServiceDetailsView.jsx`: the offer page shows both before Book.

### Step 5. Homepage: "How hiring works" + client testimonials (items 9, 11). Small database change.
- `client/src/pages/homepage/Homepage.jsx` + `homepage.css`: a 6-step strip: Post a job -> AI ranks applicants -> Hire -> Work and chat -> Pay by GCash and confirm -> Rate each other.
- Database (migration `homepage_testimonials`):
  - `project_ratings.show_on_homepage boolean not null default false`.
  - Function `homepage_testimonials()` (security definer, callable without signing in): up to 6 recent 4-5 star ratings by clients that are ticked, at least 20 characters long, from accounts that aren't banned or archived. It returns the first name, stars and text only.
- `client/src/pages/dashboard/views/FeedbackView.jsx` + `client/src/lib/projects.js`: for clients, a tick box "Let PhilFreela show this on the homepage (first name only)".
- The section stays hidden until there is at least one testimonial.

### Step 6. Freelancer-to-client ratio (item 10). No database change.
- `client/src/pages/admin/views/AdminOverviewView.jsx`: the Users card adds "Freelancers to clients: 1.3 : 1", computed from the counts it already loads.

### Step 7. Contract of Service PDF (item 12). No database change.
- New `client/src/lib/contractPdf.js` (jsPDF, same way as `lib/receiptPdf.js`): both names and user numbers, title, work description, agreed price and currency, start and due dates, revisions and the freelancer's own terms (from the booking), PhilFreela's rules in short (late work, payment, files unlock when fully paid), and the date the price was agreed.
- `client/src/pages/dashboard/views/ProjectDetailsView.jsx`: a "Contract (PDF)" button for both people once the price is agreed.

## Paper only (no website change)
- Item 1 paragraph: the registrations a real platform needs (business name with DTI or SEC, BIR, mayor's permit, NPC registration of the Data Protection Officer). PhilFreela will show the NPC Seal of Registration only after it's issued.
- Item 5 answer, and flowcharts for the hiring and appeal processes (in `PhilFreela-Diagrams/`, if wanted).

## Testing
- Each database change: tried first in a rolled-back SQL test on the live database.
- Each page: build + Playwright on the laptop (light and dark themes, phone width) before commit and push.
