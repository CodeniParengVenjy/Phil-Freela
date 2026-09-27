# Watermarking System: plan and progress

Last updated: 2026-09-27. To continue in a new Claude session, say:
"Read PLAN-watermarking.md and continue from the current step."

Each step gets its own detailed plan, approved by the user, before any code.

## What it is

Service posts and portfolio projects can have up to 10 slides (images and
videos mixed), shown as a slideshow. Portfolio documents (writing) are single
items. Every upload is protected automatically:

1. Visible watermark: the freelancer's own style (Settings > Watermark
   Settings). On by default, can be turned off.
2. Hidden watermark: always on. HiDDeN (Meta's pretrained 48-bit model, as
   ONNX) for images and every video frame; invisible zero-width characters
   for documents. Each slide/document gets its own code.
3. Copy check: always on. ViT (`facebook/dino-vits16`) for images and 5
   video frames; `all-MiniLM-L6-v2` for document paragraphs. A match with
   another freelancer's work hides that slide/document until an admin
   reviews it.

A Check Ownership page reads the hidden code and shows the owner.
Screenshot deterrents: no download / right-click / drag / picture-in-picture,
reduced-size previews, and the UPLOADER's @username shown faintly over slides
(the user corrected this: it must be the uploader's name, not the viewer's).
This is a page overlay (MediaCarousel `ownerName`); from Step 3 the visible
watermark is also drawn into the saved image itself.

All models run as ONNX with onnxruntime, because the AI service runs on
Vercel's free plan (500 MB bundle, 4.5 MB per request, 5 minutes, 1 CPU).

## Files and limits

- Image slide: JPG, PNG, WEBP, up to 10 MB (shrunk in the browser first).
- Video slide: MP4, WEBM (MOV in Step 7), up to 30 seconds, 50 MB.
- Document: pasted text, TXT, DOCX, PDF (text only), up to 5 MB.
- 10 slides per post; 50 items and 5 videos per freelancer in total.

## Steps

1. Slides system for services: `media_slides`, `slide-media` and
   `slide-uploads` buckets, `POST /slides` (no AI yet), SlidePicker,
   MediaCarousel, slideshows on Post a Service and Browse Services.
2. Portfolio projects: `portfolio_items`, real Portfolio section on the
   Profile page, public portfolio page, viewer-name overlay.
3. Watermark Settings + visible watermark + HiDDeN on images.
4. Check Ownership page (images).
5. ViT copy check + admin Flagged Content page (pgvector).
6. Documents: invisible characters, footer, MiniLM copy check, extraction.
7. Video watermarking: MOV support, convert to 720p MP4, HiDDeN per frame.

## Current step

Step 1: built and pushed live (2026-09-27, together with the admin Ban /
suspension end date change). `database/supabase_slides_schema.sql` has
already been run on Supabase (migration "service_slideshows"), so don't run
it again. Still needs the user to test it on the live site.

Step 1 files: `database/supabase_slides_schema.sql`, `ai-service/main.py`
(`POST /slides`), `client/src/lib/slides.js`, `lib/aiService.js`
(`addSlide`), `lib/shrinkImage.js` (white background), `lib/adminListings.js`,
`components/MediaCarousel.jsx`, `components/SlidePicker.jsx`,
`components/slides.css`, `ServicesView.jsx`, `BrowseServicesView.jsx`,
`ServiceCard.jsx`, `ProjectsView.jsx`, `AdminListingsView.jsx`,
`AdminReportsView.jsx`, `functions/ai/[[path]].js` (offline message).

Step 2: built and pushed live (2026-09-27, commit 444a7e3).
`database/supabase_portfolio_schema.sql` has been run on Supabase (migration
"portfolio_projects"), so don't run it again. Still needs the user to test it
on the live site. Next: plan Step 3.

Step 2 files: `database/supabase_portfolio_schema.sql`, `ai-service/main.py`
(`POST /slides` also takes `portfolio_item_id`), `lib/slides.js`
(`itemSlides`, `removeItemFiles`, `addPickedFiles`, `uploadSlides`),
`lib/portfolio.js`, `lib/aiService.js`, `lib/pageTitles.js`, `App.jsx`,
`components/PortfolioSection.jsx`, `PortfolioViewer.jsx`,
`PortfolioUploadDialog.jsx`, `portfolio.css`, `MediaCarousel.jsx` +
`slides.css` (viewer-name overlay), `useDashboardShell.js` + both dashboard
layouts (`username`), `ProfileView.jsx`, `FreelancerPortfolioView.jsx`,
`BrowseServicesView.jsx`, `ServicesView.jsx`, and the `serviceSlides` ->
`itemSlides` rename in `ServiceCard.jsx`, `ProjectsView.jsx`,
`AdminListingsView.jsx`, `lib/adminListings.js`.

Step 3: built and pushed live (2026-09-27). `database/supabase_watermark_schema.sql`
has been run on Supabase (migration "photo_watermarks"), so don't run it again.
Still needs the user to test it on the live site (and how long a photo upload
takes on Vercel). Next: plan Step 4 (Check Ownership).

What Step 3 does (photos only; videos in Step 7):
- Settings > Watermark Settings (freelancers): on/off, text (@username, full
  name, custom), position (corners, center, tiled), opacity 10-80%, size,
  color, PhilFreela logo, live preview (`lib/watermarkPreview.js`, same
  layout as `ai-service/visible_watermark.py`). Stored in `watermark_settings`.
- Promo switch (user's request): in Post a Service each picked file is
  "Protected" (default) or "Promo" (an ad, like "Are you looking for a video
  editor?"). Promo = no visible watermark and no name overlay, but it still
  gets the invisible code and (Step 5) the copy check. Portfolio has no
  switch: always protected. Stored as `media_slides.promo`.
- Invisible code: random 48 bits per photo, HiDDeN (Meta's pretrained model,
  `ai-service/export_hidden.py` -> `models/hidden_encoder.onnx` +
  `hidden_decoder.onnx`, run with onnxruntime; JND masking in OpenCV).
  The photo is shrunk to 256x256 for the model and the pattern is stretched
  back (cubic). Adaptive strength: tries JND x1.5, x2.5, x4.0 and keeps the
  faintest one where the saved JPEG reads back with <= 4 wrong bits and a
  JPEG-70 copy with <= 6. Very plain pictures (flat color, very smooth
  graphics) can't hold it: they are saved without a code (not rejected).
  Codes live in the private `watermark_codes` table (no policies: only the AI
  service reads it). `media_slides.watermarked` = has a code; the page
  overlay with the uploader's name only shows on unwatermarked, non-promo slides.
- Checked on the way: Meta's checkpoint was trained with scaling_w 0.3 and no
  JND; their demo adds JND x1.5 afterwards. JND at x1.5 alone was too weak on
  smooth photos, hence the adaptive strength.

Step 3 test results (29 test pictures: Windows wallpapers, 2 site photos, 3
posters; `ai-service` local run):
- 25 of 29 got an invisible code; 4 were too plain (flat blue, smooth CGI).
- Invisibility: PSNR average 35.2 dB, lowest 32.0 dB. Time: about 1.8 s per
  photo on the laptop (expect several times slower on Vercel's 1 CPU).

| Change to the photo | Bits read correctly (avg of 48) | Owner still found (<= 6 wrong bits) |
|---|---|---|
| Saved photo (JPEG 90) | 46.4 | 25 of 25 |
| Re-saved as JPEG 70 | 45.5 | 25 of 25 |
| Re-saved as JPEG 50 | 45.0 | 24 of 25 |
| Resized to 50% | 45.7 | 24 of 25 |
| Screenshot-like (80% size) | 46.1 | 24 of 25 |
| Brightness +20% | 46.4 | 24 of 25 |
| Cropped 10% off the edges | 41.6 | 14 of 25 |

Step 3 files: `database/supabase_watermark_schema.sql`, `ai-service/main.py`
(`watermark_photo`, `POST /slides` takes `promo`), `hidden_watermark.py`,
`visible_watermark.py`, `export_hidden.py`, `models/hidden_*.onnx`, `assets/`
(Plus Jakarta Sans Bold + OFL, PhilFreela logo), `requirements.txt`
(onnxruntime), `vercel.json` (120 s, includes assets), `README.md`,
`client/src/lib/watermarkSettings.js`, `lib/watermarkPreview.js`,
`lib/slides.js`, `lib/aiService.js`, `components/WatermarkSettingsForm.jsx`,
`SlidePicker.jsx`, `slides.css`, `MediaCarousel.jsx`, `SettingsView.jsx`,
`ServicesView.jsx`.

## Reminders for later steps

- Step 4 (Check Ownership): accept a match with up to 6 wrong bits, and only
  if the best match is clearly better than the next one. Cropping is the
  weak spot (14 of 25): try reading a few slightly shrunk/shifted copies.

- Step 7: REMIND THE USER to decide the video size limit. Until Step 7
  compresses videos, they are saved as uploaded (up to 50 MB each, so only
  about 20 fit in Supabase's free 1 GB). Suggested: 20 MB until Step 7.
  The user said "let's plan it later, remind me when we're in that step."
- Step 7: test how long video watermarking takes on Vercel (1 CPU, 5-minute
  limit) and through the Cloudflare /ai forwarding.
- Paper: credit Meta for HiDDeN (CC-BY-NC, non-commercial). The README
  already does.
- Step 5: tune the similarity cutoffs with real test files.
- Supabase free plan: 1 GB storage, 5 GB bandwidth a month, and the project
  pauses after 1 week without activity (open it before the defense).
