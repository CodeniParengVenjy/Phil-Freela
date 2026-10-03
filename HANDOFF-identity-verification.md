# Identity Verification (eKYC): where we are

Last updated: 2026-09-27. To continue in a new Claude session, say:
"Read HANDOFF-identity-verification.md and continue from 'What's left'."

## Done (pushed to GitHub, live on phil-freela.pages.dev)

The whole feature is finished, tested, and online 24/7. The user's laptop is
NOT needed anymore.

1. Database (Supabase): `identity_verifications`, `verification_links`, private
   `verification-docs` bucket, `is_verified()`. SQL is at the end of
   `database/supabase_admin_schema.sql`.
2. AI service (`ai-service/`, Python FastAPI): instant ID checks, face match,
   liveness check from the face scan. Uses OpenCV's pretrained YuNet (finds
   faces) + SFace (compares faces); nothing trained. Switched from
   DeepFace/ArcFace/TensorFlow in commit 5647753 because that was too heavy
   for free hosting.
3. Verify Identity page: Settings > Profile Settings > "Verify now".
   Step-by-step: ID type > front > back (not for passports) > live face scan
   (look straight, turn left, turn right, auto-capture) > review > submit.
4. Phone option: QR code (one-time link, 10 minutes) or the phone's own
   cameras. On a computer with a webcam, the QR shows beside Step 1.
5. Admin > Verifications: photos, AI summary card (green/yellow/red
   suggestion), approve / reject with a required reason. Profile shows the
   real "Identity Verified" badge.
6. Forgot Password emails fixed (Supabase Site URL = https://phil-freela.pages.dev).
7. Verified check next to names (commit df9a8ed): blue check on Browse
   Services, Find Jobs, Inbox, Chat, the top bar and Admin > Users
   (`client/src/components/VerifiedBadge.jsx`, `lib/useVerifiedIds.js`,
   database function `verified_user_ids(ids)`). Clients who aren't verified
   show a grey "Not verified" label on Find Jobs.
8. Only verified freelancers can post services (database rule + a "Verify
   now" card on the Services page). Services from unverified freelancers are
   hidden from others until they verify. Clients can post jobs without verifying.
9. The face scanner (about 7 MB) starts downloading when the form opens, so
   Step 4 opens right away (commit 8a0f5cd).
10. Selfies and random photos are refused as ID photos (commit 4e5743b):
   OpenCV's pretrained PP-OCR text detector (`models/text_detection_en_ppocrv3_2023may.onnx`,
   2.3 MB) counts lines of printed text. Front needs 8+, back 5+ (sample IDs
   had 11 to 15, 63 selfies 0 to 6). Runs last in `photo_checks.py`, so blurry
   or far-away IDs still get their own messages. The admin's AI card points
   PhilSys IDs to the PSA's PhilSys Check (verify.philsys.gov.ph). Tested
   29/29 on Vercel. Test ID cards (fake names) are made by the scratchpad
   script make_sample_ids.py; the old tests' "ID" was a plain portrait.
   Limit: it tells an ID card from a photo, not a real ID from a fake one.
11. On phones, the ID steps also offer "Upload from your photos" (gallery or
   files) and "Choose another" (commit 228416e, `WizardPhotoStep.jsx`: two
   hidden inputs, one with capture="environment" for the camera). Same checks
   apply; the face scan stays live only.
12. Full head turns (commit 088c834): the scan reads the head angle in degrees
   from MediaPipe's face rotation (`headYaw` in faceTracker.js; the old
   "turn" number topped out near 40 degrees and captured at about 20). Full
   turn = 45+ degrees held 4 frames, with a "Turned: %" bar. On the way, a
   halfway photo (15+ degrees) is kept per turn and sent as
   selfie_left_half / selfie_right_half; the AI uses them for the same-person
   check (SFace can't compare full side views: that caused the tester's false
   "Liveness failed") and doesn't save them. Old 3-photo submits still work.
   Tested: 33/33 on Vercel; computer browser flow passed with the fake camera
   (the test multiplies its angle x6). Still to confirm with a real person.
13. AI auto-reject (commit 23e8c0e): database job `auto-reject-unreviewed-verifications`
   (pg_cron, every 15 min) runs `auto_reject_unreviewed_verifications()`:
   pending > 3 hours with face_match = false or liveness_passed = false ->
   rejected, decided_by_ai = true, reason in admin_note (the existing trigger
   notifies the user). Approvals always stay with an admin. Admin page: a
   countdown on "Likely reject" requests and a "by the AI" label.
14. PhilSys QR check (`ai-service/id_qr.py`, same commit): OpenCV reads the QR
   (card back / ePhilID front), compares its name with the profile name ->
   id_qr_status match / mismatch / unreadable / not_found + id_qr_name. Only a
   flag: the PSA's signature key isn't public (given to approved "relying
   parties"); the admin card still links PhilSys Check.
15. Duplicate faces (same commit): face_embedding (128 SFace numbers) saved
   per verification; a new one within distance 0.5 of another account's
   pending/approved one sets duplicate_of. Consent text mentions it.
   Mismatch / duplicate -> AI suggests "Check carefully". PRC IDs get a link
   to verification.prc.gov.ph. Tested 15/15 on Vercel, admin page 11/11.

Fake-ID research (2026-09-29): the PhilID QR is JSON signed by the PSA with
EdDSA, but the public key goes to approved organizations (PSA eVerify /
everify.gov.ph onboarding); the plastic card's QR has no photo (a real QR
can be copied onto a fake card), the ePhilID's QR includes the photo. LTO and
UMID have no public check; PRC has a free public one; passports only have
MRZ check digits. Auto-approve was left out on purpose; if the user gets the
PSA key (they could email PSA for the capstone), ePhilID + signature + photo
match could be auto-approved safely.

## How it's hosted

- Website: Cloudflare Pages (phil-freela.pages.dev), auto-deploys from GitHub.
- AI service: Vercel, free Hobby plan, project `philfreela-ai`
  (https://philfreela-ai.vercel.app), auto-deploys from GitHub (root
  directory `ai-service`). Runs in Tokyo (hnd1), next to Supabase.
  Vercel environment variables: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
  ALLOWED_ORIGINS. The 37 MB SFace file isn't in GitHub: `get_models.py`
  downloads it while Vercel builds (checks its SHA-256).
- Flow: browser -> phil-freela.pages.dev/ai/... -> Cloudflare Pages Function
  (`client/functions/ai/[[path]].js`) -> Vercel. Cloudflare setting (Production):
  `VITE_AI_SERVICE_URL` = https://philfreela-ai.vercel.app (the function also
  accepts the tidier name `AI_SERVICE_URL`; renaming needs a Retry deployment).
- Laptop version (`npm run dev` in client): /ai goes to `AI_SERVICE_URL` in
  `client/.env` (set to the Vercel address), so no Python needs to run locally.
- ngrok and start-ai.bat were removed (commit d1fc7bb). The user can
  uninstall ngrok (Microsoft Store) if they want.

Tests (all passed on 2026-09-27): AI endpoints 26/26 (local and on Vercel),
full browser flow 21/21, admin review 22/22, live site 5/5.

## What's left

### Liveness false alarm: FIXED by item 12 (halfway photos); confirm with a real scan
A real tester's scan (clearly the same person) got "Liveness: Failed / Likely
reject". SFace sees big head turns (about 45 degrees) as "less alike" than
ArcFace did, and the turned frames are compared with the same 0.637 cut-off.
The public sample photos have no big turns, so they can't set a fair cut-off,
and simply loosening it lets different people through (6% at 0.75).
Needed: real turned-face photos (the user's own scan, or the tester's with
her OK; analyze locally, delete copies after). Likely fix: ask for a slightly
smaller head turn in FaceScan.jsx (MIN_TURN) and give the turned frames their
own measured cut-off in face_check.py. Until then, the admin can still approve.

### Before the defense
- Swap the Supabase service_role key (it was pasted in a chat and shown in a
  screenshot). Changing it also changes the website's anon key, so it's its
  own small step: update `client/.env`, `ai-service/.env`, Cloudflare
  (VITE_SUPABASE_ANON_KEY) and Vercel (SUPABASE_SERVICE_ROLE_KEY), then redeploy both.
- Open the site once before presenting: if nobody used the AI for a while,
  the first check takes a few extra seconds.

## Running it on the laptop

    cd client
    npm run dev

Open https://localhost:5173 (click Advanced > Proceed on the practice
certificate warning). Admin: https://localhost:5173/admin/login.
To work on the AI service itself locally, see ai-service/README.md.

Phone testing on the laptop version needs the phone on the same Wi-Fi, and
`VITE_PUBLIC_APP_URL` in `client/.env` must be this laptop's current Wi-Fi
address (run `ipconfig`, use the Wi-Fi "IPv4 Address", keep `https://` and
`:5173`), then restart `npm run dev`. The live site doesn't have this problem.

## Good to know for the defense
- "The AI runs on a free cloud host (Vercel), using pretrained OpenCV models:
  YuNet finds the face, SFace turns it into 128 numbers, and we compare them."
- The AI matches faces and checks liveness (head turns). It can't tell whether
  an ID is fake: the admin decides.
- The user never sees the AI result, so nobody can keep retrying until they
  fool it.
- Face match cutoff: SFace distance 0.637 or lower = same person (OpenCV's
  recommended value); 0.50 or lower = strong match. On sample photos: same
  person 0.49 or lower, different people 0.64 or higher (0 mistakes on 1,445 pairs).
