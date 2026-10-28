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

**Scope:** "Transaction" here means a completed project. Only completed projects count toward ratings, the on-time rate and profile history. Payment is recorded separately: PhilFreela never holds or moves money. The client pays the freelancer directly in the GCash app and records it (amount, GCash reference number and a receipt screenshot as proof); the freelancer checks their own GCash and confirms or says not received. A payment can be recorded on a project, or from a chat (a payment card the freelancer sends); a payment from a chat adds nothing to profile history. Who pays first is not enforced: the client and the freelancer agree the order themselves (the full price after delivery, a down payment and a balance, or a payment per day or month), the Terms say so under "Who pays first", and marking a project Done does not wait for payment. Between clients and freelancers there is still no payment gateway, escrow, commission, refund or invoice. PhilFreela's own fees for its own services are separate: see "How PhilFreela earns" below.

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
| Featured post (an offer or an open job post, in a separate labeled row of at most 3) | 3 / 7 / 14 days: ₱49 / ₱99 / ₱179 (Premium members ₱25 / ₱50 / ₱90, and one free 3-day post every 30 days) | online on Xendit's checkout page (GCash, Maya or QR Ph), and the post goes up by itself once Xendit confirms the payment; when online payment is not open, GCash to PhilFreela's own number with the reference and a receipt, and an admin checks PhilFreela's GCash and approves |
| Premium, for clients and freelancers (it was "Freelancer Pro"; plan `PLAN-premium.md`): a gold Premium badge by their name that everyone sees, half-price Featured posts and one free 3-day Featured post every 30 days, view counts (how many people opened their offers, job posts and profile), chat files up to 50 MB instead of 10 MB, the two-color (gradient) look; freelancers also get 15 offers instead of 3 and their watermark in any color, 4 fonts and 5 sizes | ₱149 for 30 days | online on Xendit's checkout page (GCash, Maya or QR Ph); Premium starts by itself once Xendit confirms the payment; test mode (pretend money) until the business is verified |
| Community Billboard ad (plan `PLAN-community-billboard.md`): a verified client or freelancer sends their own ad, shown in a second strip under the Billboard on the dashboards of the people it is meant for (everyone, only freelancers or only clients): a headline, a short message, an optional picture and an optional button that opens one of their own offers, job posts or their profile; no links, bad words hidden, at most 5 ads running at once | 3 / 7 / 14 days: ₱149 / ₱299 / ₱499 (Premium members half: ₱75 / ₱150 / ₱250) | an admin approves the ad first, or rejects it with a reason; only after that the poster pays online on Xendit's checkout page, and the ad starts by itself once Xendit confirms the payment and runs for the days paid; an admin can take a running ad down with a reason; test mode until the business is verified |

Paid placement never changes the "Recommended for you" order (Feature 1 ranks by credibility): Featured posts sit in their own labeled row. Admins see every fee in Admin > Site > Promotions and the totals on the Overview (test-mode payments are left out). The Billboard itself stays for the super admin only (welcome messages, announcements, sponsors); the members' ads have their own Community Billboard, and Admin > Site > Community Billboard is where any admin approves, rejects or takes down ads.

---

## Open items

These are not yet defined in the paper:

- **Collaborative filtering:** what interaction data it uses and how its results combine with content-based filtering.
- **Ranking weights:** the factors are listed, but there's no formula or weighting.
- **Client verification:** decided on 2026-10-26: clients verify too, and need it to post a project or job (see section 4). The paper's eKYC section still describes freelancers only.
- **eKYC data handling:** how ID images, selfies, and face data are stored and secured, and how long they're kept. Government ID details count as sensitive personal information under RA 10173.
