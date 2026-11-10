# PhilFreela — System Functions (everything except watermarking)

Web-based freelancing platform for Filipino freelancers and clients (capstone project). This file summarizes the platform's core functions: what each does, how it works, and the technology behind it.

## Notes for Claude

- Use this file as the source of truth for PhilFreela's features.
- Items under **Open items** are not yet defined. Flag them and ask instead of assuming details.
- **Feature 3 (Portfolio Protection & Authenticity: ViT, HiDDeN, Extraction API) is left out on purpose.** Another Claude session is building it; see `PLAN-watermarking.md`. Don't change its files without asking the user first: `ai-service/watermark_video.py`, `hidden_watermark.py`, `visible_watermark.py`, `text_watermark.py`, `text_embedder.py`, `similarity.py`, the slides, portfolio, watermark and ownership endpoints in `ai-service/main.py`, `client/src/lib/slides.js`, `lib/portfolio.js`, `lib/watermarkSettings.js`, the Check Ownership, portfolio, slideshow and Flagged Content components, and `database/supabase_{slides,portfolio,watermark,ownership,copy_check,documents,video}_schema.sql`.
- Both sessions work in the same folder. Commit only your own changes.
- The feature numbers below match the paper, so number 3 is skipped.

## Tech stack

The paper lists HTML/CSS/JavaScript + Bootstrap 5, PHP, MySQL, Python AI modules, and XAMPP. The app as actually built:

| Layer | Technology |
|---|---|
| Frontend | React 19 + Vite, Bootstrap 5 (`client/`), live on Cloudflare Pages (phil-freela.pages.dev) |
| Backend and database | Supabase (Postgres, Auth, Storage, row-level security; pgvector is enabled) |
| AI modules | Python FastAPI service (`ai-service/`), live on Vercel's free plan; the website reaches it at `/ai` |
| Online payment (PhilFreela's own fees only: Premium, Featured posts, Community Billboard ads and sponsors' billboard links) | Xendit Payment Sessions (GCash, Maya, QR Ph) through two Supabase Edge Functions (`supabase/functions/pro-checkout`, `xendit-webhook`); test mode until the business is verified |

## Feature summary

| # | Feature | Core technology | Problem it addresses |
|---|---|---|---|
| 1 | Hybrid recommendation system | Content-based filtering, collaborative filtering, ranking algorithm | Relevant matches for both new and experienced users |
| 2 | AI moodboard matching | CLIP embeddings + cosine similarity | Time spent manually browsing portfolios |
| 4 | eKYC user verification | OCR, FaceNet, liveness detection | Fake accounts and identity fraud |
| 5 | Profile transparency & transaction history | Completed-transaction records, public profiles | Uncertainty when hiring or accepting clients |
| 6 | Data privacy compliance | RA 10173 (Data Privacy Act of 2012) | Protection of user data and legal compliance |

---

## 1. Hybrid Recommendation System

**Purpose:** Recommend relevant jobs to freelancers and relevant freelancers to clients. Combining three methods balances simplicity, effectiveness, and scalability for a developing platform.

| Component | What it does | Data used |
|---|---|---|
| Content-based filtering | Matches freelancer profiles with job postings. Needs no activity history, so new users get recommendations once their profile is complete. | Skills, experience, categories, keywords |
| Collaborative filtering | Improves personalization. | Not specified (see Open items) |
| Ranking / scoring algorithm | Orders matching freelancers by credibility and performance so the most reliable and qualified appear first. | Ratings, completed projects, response time, relevance score |

**Data you can use (added by the watermarking session, 2026-09-29):**
portfolio projects (`portfolio_items`) now have a `category` (the same
values as services, `client/src/lib/categories.js`) and `tags` (up to 5
keywords like "Photoshop" or "Logo"), which fit content-based filtering. The
text model `ai-service/text_embedder.py` (all-MiniLM-L6-v2) is shared.

**Flow**

1. Content-based and collaborative filtering generate candidate matches.
2. The ranking algorithm scores and orders them.
3. The top-ranked results are shown to the user.

## 2. AI Moodboard Matching

**Purpose:** Help clients find freelancers whose portfolio style matches the look they want.

**Flow**

1. The client uploads a moodboard, reference image, or visual sample.
2. The system analyzes its visual characteristics: overall style, color palette, composition, and typography.
3. CLIP converts the reference image and freelancer portfolio images into visual embeddings.
4. Cosine similarity measures how close each portfolio embedding is to the reference.
5. Freelancers are ranked by match score and recommended to the client.

**Input → Output:** reference image → ranked list of freelancers with match scores

## 4. eKYC User Verification

**Purpose:** Confirm that freelancers and clients are real people registering under their own identity.

**Who must verify (decided 2026-10-26):** both roles. A freelancer needs an approved ID to post a service, apply to a job or ask for payment; a client needs one to post a project or job. Without it, people can still browse, message, and (clients) book services. The rule is in the database, not only on the page (`database/supabase_client_verify_schema.sql` for clients). New accounts are guided through it by the opening tour (`PLAN-full-tour.md`).

**Flow (during freelancer registration)**

1. The freelancer uploads a valid government-issued ID.
2. The freelancer captures a live selfie with the device camera.
3. **OCR** extracts the name and identification details from the ID.
4. **FaceNet** compares the face on the ID with the selfie to confirm they're the same person.
5. **Liveness detection** confirms the selfie comes from a real person, not a photo, screenshot, or manipulated image.
6. If all checks pass, the profile receives a verification badge.

Progress so far is in `HANDOFF-identity-verification.md`.

## 5. Profile Transparency & Transaction History

**Purpose:** Build trust by letting users see the track record of the people they've worked with.

**Flow**

1. A project is finalized and confirmed by both the freelancer and the client.
2. A record of the completed transaction is stored in both users' account history.
3. Each user can open the other's public profile from that record.

**Visible profile info:** verification status, ratings, completed transactions, overall platform activity

**Benefit:** Clients make better-informed hiring decisions, and freelancers can judge the reliability of prospective clients.

**Scope:** "Transaction" here means a completed project. Only completed projects count toward ratings, the on-time rate and profile history. **Rate after payment** (2026-11-08, `PLAN-rating-after-payment.md`, `database/supabase_rating_after_payment_schema.sql`): the client rates the freelancer, and the offer they booked, only once the project is Done **and** paid (the freelancer confirmed the payment, and an agreed one-time price is fully paid: the same moment the original file unlocks), within 14 days of whichever came later; the freelancer rates the client once the project is Done, paid or not, so a client who never pays can still be rated. Payment is recorded separately: PhilFreela never holds or moves money. The client pays the freelancer directly in the GCash app and records it with a screenshot of the GCash receipt (and the tip part, if any); the freelancer checks their own GCash and answers Confirm received, **Received less** (types what really arrived) or Not received. **Short payments and tips** (2026-11-08, `PLAN-short-payment.md`, `database/supabase_short_payment_schema.sql`): a one-time project with an agreed price keeps a balance that both people see (paid, left, waiting for the freelancer's answer, tips); only what the freelancer confirmed counts, and when less arrived, the tip is the first part missing. The client can't record more than is left (the extra goes in the Tip box), a tip can be added only with the payment that pays everything left (or alone once it is fully paid), and the client is reminded if the project is marked Done with money unpaid. PhilFreela still never sees GCash: the freelancer's answer is the check, and a short payment can be sent with a report. **AI receipt check** (2026-11-08, `PLAN-receipt-ai.md`, `ai-service/receipt_check.py`, `database/supabase_receipt_check_schema.sql`): nobody types the amount or the reference number any more. The AI service reads the receipt screenshot with the same pretrained text reader as the resume check (PaddleOCR PP-OCRv3, through OpenCV's text finder), takes the amount sent, the 13-digit reference number, the date and time, the initials GCash printed and the last digits of the number paid, and judges it with plain rules: **blocked** (not a GCash receipt, the reference or the very same file already used, two different amounts on it, dated in the future or before the project or request, or sent to someone else: both the initials and the number differ from the freelancer's saved GCash), **check carefully** (only the initials or only the number differs, saved by an editing app, wider than tall, the same amount at the same minute as another payment to this freelancer, a different amount from what a chat request asked for), or **unreadable** (asks for a clear, full screenshot). The AI keeps a clean copy of a receipt that can be sent and writes what it read into `receipt_checks`; `record_receipt_payment()` / `record_chat_receipt_payment()` take the amount, reference and picture from that row (the browser sends only the check's id and the tip) and then call the short-payment `record_payment()`, so the balance and tip rules still apply. The freelancer, and an admin looking at a reported payment, see the date and initials on the receipt and "no signs of a fake" or "look at it carefully" with the reasons. The AI cannot see GCash and a careful fake can pass, so the freelancer's own check stays the real one. Tested on made-up receipts only (`ai-service/test_receipt_check.py`, `receipt_samples.py`); a real GCash screenshot still has to be tried. A payment can be recorded on a project, or from a chat (a payment card the freelancer sends); a payment from a chat adds nothing to profile history. Who pays first is not enforced: the client and the freelancer agree the order themselves (the full price after delivery, a down payment and a balance, or a payment per day or month), the Terms say so under "Who pays first", and marking a project Done does not wait for payment. **Pay to unlock** (2026-11-07, `PLAN-transaction-tracking.md` Step F): a file the freelancer uploads to a project stays locked until it is paid: on a one-time project with an agreed price, until what the freelancer confirmed covers the whole price (changed 2026-11-08, the user's choice "fully paid"); with no agreed price, or a price per day or month, until the freelancer confirms any payment. Until then the client sees only a watermarked preview that the AI service makes from the real file (`ai-service/deliverable_preview.py`: a video's first 3 minutes at 720p, a picture at 1200 px, or a PDF's first 3 pages as one picture, with "PREVIEW · @username" repeated across it), in a player with no Download; the database's storage rule refuses the client the original (`database/supabase_deliverable_lock_schema.sql`), and a trigger unlocks the project the moment the payment that completes it is confirmed. ZIP and Blender files show only their name; a pasted link is shown as it is. PhilFreela holds back the file, never the money. **PDF receipt** (2026-11-10, `PLAN-payment-receipt.md`, `client/src/lib/receiptPdf.js`, `ReceiptReady.jsx`): once the freelancer answers Confirm received or Received less, a "Receipt PF-XXXXXXXX is ready" box appears under the payment (project page and chat card) for both people, and Download PDF makes a one-page A4 receipt in the browser with jsPDF (loaded only on that tap): receipt number (PF- + the first 8 characters of the payment id), who paid and who was paid, the project or chat note, the amount, tip and what arrived, the project balance right after that payment (agreed one-time price only), the GCash reference, the dates, and a line that it is an acknowledgement receipt, not an Official Receipt (BIR). No database change; amounts are written "PHP" because the built-in PDF font has no peso sign. Between clients and freelancers there is still no payment gateway, escrow, commission, refund or invoice. PhilFreela's own fees for its own services are separate: see "How PhilFreela earns" below.

## 6. Data Privacy Compliance (RA 10173)

**Purpose:** Keep PhilFreela aligned with the Philippine Data Privacy Act of 2012.

**Personal data collected:** names, contact information, identification documents, account credentials

| Principle | How it's applied |
|---|---|
| Legitimate purpose | Data is processed only for platform purposes such as user verification and account management |
| Consent and transparency | Consent is obtained before collection, and users are told how their data is used, stored, and protected |
| Data minimization | Only data needed for platform operations and verification is collected |
| Limited sharing | No sharing with third parties without consent, unless required by law or legal authorities |
| User rights | Users can review, update, or request removal of their personal information |

## How PhilFreela earns (not one of the paper's numbered features)

Added 2026-10-25/26 (plan: `PLAN-monetization.md`). PhilFreela never takes a cut of the money between clients and freelancers; it earns only from things it sells itself.

| What | Price | How it is paid |
|---|---|---|
| Sponsored billboard on the dashboards | agreed with the sponsor | paid to PhilFreela directly; a super admin posts the banner with its dates, marked "Sponsored by ...", and records the amount |
| Featured post (an offer or an open job post, in a separate labeled row of at most 3) | 3 / 7 / 14 days: ₱49 / ₱99 / ₱179 (Premium members ₱25 / ₱50 / ₱90, and one free 3-day post every 30 days) | online on Xendit's checkout page (GCash, Maya or QR Ph), and the post goes up by itself once Xendit confirms the payment; when online payment is not open, a Featured post cannot be bought until it is |
| Premium, for clients and freelancers (it was "Freelancer Pro"; plan `PLAN-premium.md`): a gold Premium badge by their name that everyone sees, half-price Featured posts and one free 3-day Featured post every 30 days, view counts (how many people opened their offers, job posts and profile), chat files up to 50 MB instead of 10 MB, the two-color (gradient) look; freelancers also get 15 offers instead of 3 and their watermark in any color, 4 fonts and 5 sizes | ₱149 for 30 days | online on Xendit's checkout page (GCash, Maya or QR Ph); Premium starts by itself once Xendit confirms the payment; test mode (pretend money) until the business is verified |
| Community Billboard ad (plan `PLAN-community-billboard.md`): a verified client or freelancer sends their own ad, shown in a second strip under the Billboard on the dashboards of the people it is meant for (everyone, only freelancers or only clients): a headline, a short message, an optional picture and an optional button that opens one of their own offers, job posts or their profile; no links, bad words hidden, at most 5 ads running at once | 3 / 7 / 14 days: ₱149 / ₱299 / ₱499 (Premium members half: ₱75 / ₱150 / ₱250) | an admin approves the ad first, or rejects it with a reason; only after that the poster pays online on Xendit's checkout page, and the ad starts by itself once Xendit confirms the payment and runs for the days paid; an admin can take a running ad down with a reason; test mode until the business is verified |

Paid placement never changes the "Recommended for you" order (Feature 1 ranks by credibility): Featured posts sit in their own labeled row. Admins see every fee in Admin > Site > Promotions and the totals on the Overview (test-mode payments are left out). The Billboard itself stays for the super admin only (welcome messages, announcements, sponsors); the members' ads have their own Community Billboard, and Admin > Site > Community Billboard is where any admin approves, rejects or takes down ads.

**Receipts for these purchases** (2026-11-10, `PLAN-payment-receipt.md` Step 4, `client/src/lib/purchases.js`, `PurchasesList.jsx`): Settings > Purchases (clients and freelancers) lists every Premium, Featured post and Community Billboard ad the person paid for online (`online_checkouts` with status paid, plus the run dates and Xendit payment id from `promotions`; the database already lets each person read only their own), newest first, with a "Test" badge for Xendit test mode and a Receipt (PDF) button. The Premium page's "Payment received" card has a Download receipt button too, and the Featured and ad messages point to Settings, Purchases. The PDF (same jsPDF receipt maker as the GCash receipt) has a `PFO-` number, Bought by / Sold by PhilFreela, what was bought and when it runs, the Xendit payment id and dates, a "TEST PAYMENT" band and stamp for test-mode payments, and says it is an acknowledgement receipt, not a BIR-registered invoice or Official Receipt. Unpaid checkouts and free Featured posts are not listed. No database change.

## Delays: late work, late payment, unanswered payment, unreviewed work (not one of the paper's numbered features)

Added 2026-11-10/11 (plan: `PLAN-delays.md`). A delay on its own is **not a violation**: it breaks an agreement between two people, so it is handled in three levels. 1. **Reminders**: the daily job `send_daily_notices()` runs at 8:00 AM Philippine time and notifies the people involved (and emails an offline user); a sent log (`scheduled_notices`) keeps each notice to once. 2. **An automatic limit between those two people only.** 3. **An admin penalty, only through a report and only when the delay is bad faith**: taking delivered work and never paying, or taking a payment and never delivering, are "Scam / Fraud" in the penalty chart (30 days, or a ban). There is no "late" category, no automatic site-wide suspension, and no late fee (PhilFreela never holds the money, so it cannot collect one). Steps 1 to 4 of the plan (the payment due date, the hiring limit, the unanswered payment and the unreviewed work, in the last three rows) were each applied to the live database by reading the live function and adding only their own lines, and each test was run on live inside a transaction that rolls back (26, 38, 20 and 21 checks); the website parts were checked in a browser against a pretend backend.

| Delay | The rule | Files |
|---|---|---|
| Work not sent by the due date (freelancer) | Reminders 3 days before, the day before, on the due day, when late and a week late, to both people (`PLAN-notifications.md`). A freelancer who was late can't apply to that client's job posts until the client taps "Allow to apply again"; the profile's on-time share counts only the first sending | `database/supabase_notifications_more_schema.sql`, `database/supabase_late_block_schema.sql`, `client/src/lib/lateBlock.js` |
| Payment not made (client) | Step 1: a one-time project with an agreed price is due **7 days after it is marked Done** (Philippine days). The client is reminded 3 days before and on the last day, and both people are told when it is late (1 to 6 days) and again at 7 days or more. Money the freelancer hasn't answered yet counts as paid, so the freelancer's silence never makes a client late; "Not received" counts as unpaid. The project page says "Pay the rest by ..." with a red pill when late, and My Projects shows the pill. Step 2: while it is late the client **can't hire or book that freelancer again** until it is paid in full or the freelancer taps "Allow to hire again" (the database refuses it, `block_if_client_owes()` inside `hire_applicant()` and `create_booking()`, and the Hire and Book popups explain why); other freelancers are not affected | `database/supabase_payment_due_schema.sql`, `database/supabase_unpaid_client_block_schema.sql`, `client/src/lib/payments.js` (`payDueInfo`), `lib/payBlock.js`, `PayDueBadge.jsx`, `PayBlockNotice.jsx`, `OwesNotice.jsx` |
| Payment recorded but not answered (freelancer) | Step 3: a payment still waiting for the freelancer's answer reminds the freelancer after 2 and after 5 days; after 7 days both people are told and the client sees "hasn't answered for N days" with Message and Report buttons (the report takes the payment, its amount, reference and receipt along). PhilFreela never confirms a payment for the freelancer, because it can't see GCash. Works for a payment on a project and one in a chat | `database/supabase_payment_waiting_schema.sql`, `client/src/lib/payments.js` (`waitingDays`), `PaymentsSection.jsx`, `PaymentCard.jsx` |
| Work not reviewed (client) | Step 4: after the freelancer sends the work, the client has **7 days** (from the latest sending; sending again after "Ask for changes" starts over) to mark it done or ask for changes. The client is warned on day 6, and on day 7, only after that warning, the work is **accepted automatically**: the project becomes Done, both people are told, and the payment days of Step 1 start. Nothing moves money, and the original file stays locked until it is paid | `database/supabase_auto_accept_schema.sql`, `client/src/lib/reviewClock.js`, `ReviewNotice.jsx` |
| Asking for more time (before the date) | Added 2026-11-11 (`PLAN-delay-requests.md`). The one who owes can ask first instead of just being late: the freelancer asks for more time to **send the work** (the client answers), the client asks for more time to **pay** (the freelancer answers), from a button on the project page. Limits: up to 7 more days each time, 2 requests per project for each kind whatever the answer (cancelled ones count too), only on or before the date, one waiting at a time, a reason of 3 to 300 characters through the word filter. The other person gets a notice (and an email when offline) and accepts or declines; both are told the answer. Accepting moves the project's due date, or sets a later payment day (`projects.payment_due_override`, read first by `payment_due_date()`) that the payment reminders, the late pill and the hiring limit then follow. No answer leaves the old date and the reminders keep going. A request is not a violation and costs nothing. Tested on live inside a transaction that rolls back (69 checks) and in a browser against a pretend backend (62 checks) | `database/supabase_delay_requests_schema.sql` (table `delay_requests`, `request_delay()`, `answer_delay()`, `cancel_delay_request()`), `client/src/lib/delayRequests.js`, `DelayRequestCard.jsx`, `DelayRequestDialog.jsx` |
| Work never sent, the client gives up (End project) | Added 2026-11-11 (`PLAN-end-project.md`). The client of a project that is Started, was **never sent** (not even once) and is **more than 7 days late** can press End project, after the freelancer had the "7 days late" notice (the function checks the sent log) and with no request for more time waiting. The project becomes **Ended** (new status, `ended_at`), both people get a notice (bell, number and, when offline, Gmail), and the job post's place opens again: `job_state()`, `notify_job_filled()` and the admin "hired" counts leave ended projects out, so the client can hire someone else. It moves no money (PhilFreela never holds money; the window tells a client who paid to report Scam / Fraud), gives no rating, changes no profile number and is not a penalty; the freelancer's block on that client's other job posts stays (`missed_deadline()`). Only the client can end it; a freelancer "Withdraw", an automatic ending and a reason box are not built. Tested on live inside a transaction that rolls back (42 checks) and in a browser against a pretend backend | `database/supabase_end_project_schema.sql` (`end_project()`), `client/src/lib/projects.js` (`endInfo`, `endProject`), `EndProjectCard.jsx`, `EndProjectDialog.jsx` |

The Terms say all of this in plain words under "Due dates and late work", "Who pays first" and "Delays and reports". The number of days (7 after Done, 2 and 5 and 7 for a waiting payment, 6 and 7 for unreviewed work) lives in the database job and, for what the pages show, in one constant each in `client/src/lib/payments.js` and `reviewClock.js`.

---

## Open items

These are not yet defined in the paper:

- **Collaborative filtering:** what interaction data it uses and how its results combine with content-based filtering.
- **Ranking weights:** the factors are listed, but there's no formula or weighting.
- **Client verification:** decided on 2026-10-26: clients verify too, and need it to post a project or job (see section 4). The paper's eKYC section still describes freelancers only.
- **eKYC data handling:** how ID images, selfies, and face data are stored and secured, and how long they're kept. Government ID details count as sensitive personal information under RA 10173.
