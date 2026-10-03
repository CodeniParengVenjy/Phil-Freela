z# PhilFreela — System Functions (everything except watermarking)

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

**Purpose:** Confirm that freelancers are real people registering under their own identity.

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

**Scope:** "Transaction" here means a completed project. The project has no payment or money features.

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

---

## Open items

These are not yet defined in the paper:

- **Collaborative filtering:** what interaction data it uses and how its results combine with content-based filtering.
- **Ranking weights:** the factors are listed, but there's no formula or weighting.
- **Client verification:** eKYC is described for freelancers only, but profile transparency shows clients' verification status too.
- **eKYC data handling:** how ID images, selfies, and face data are stored and secured, and how long they're kept. Government ID details count as sensitive personal information under RA 10173.
