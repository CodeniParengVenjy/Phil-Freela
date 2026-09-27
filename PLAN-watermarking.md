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
reduced-size previews, the viewer's own @username shown faintly over slides.

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

Step 1: built, not committed yet. Waiting for the user to run
`database/supabase_slides_schema.sql` in the Supabase SQL Editor and test it.
The website's service pages ask for `media_slides`, so that SQL must be run
BEFORE this code is pushed, or Browse Services stops loading on the live site.

Step 1 files: `database/supabase_slides_schema.sql`, `ai-service/main.py`
(`POST /slides`), `client/src/lib/slides.js`, `lib/aiService.js`
(`addSlide`), `lib/shrinkImage.js` (white background), `lib/adminListings.js`,
`components/MediaCarousel.jsx`, `components/SlidePicker.jsx`,
`components/slides.css`, `ServicesView.jsx`, `BrowseServicesView.jsx`,
`ServiceCard.jsx`, `ProjectsView.jsx`, `AdminListingsView.jsx`,
`AdminReportsView.jsx`, `functions/ai/[[path]].js` (offline message).

## Reminders for later steps

- Step 7: REMIND THE USER to decide the video size limit. Until Step 7
  compresses videos, they are saved as uploaded (up to 50 MB each, so only
  about 20 fit in Supabase's free 1 GB). Suggested: 20 MB until Step 7.
  The user said "let's plan it later, remind me when we're in that step."
- Step 7: test how long video watermarking takes on Vercel (1 CPU, 5-minute
  limit) and through the Cloudflare /ai forwarding.
- Step 3: credit Meta for HiDDeN (CC-BY-NC, non-commercial) in the README
  and the paper.
- Step 5: tune the similarity cutoffs with real test files.
- Supabase free plan: 1 GB storage, 5 GB bandwidth a month, and the project
  pauses after 1 week without activity (open it before the defense).
