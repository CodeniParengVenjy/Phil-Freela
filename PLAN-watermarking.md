# Watermarking System: plan and progress

Last updated: 2026-10-07. To continue in a new Claude session, say:
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
   for documents (and, from step 11, HiDDeN in a PDF's page pictures). Each
   slide/document gets its own code.
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
- Video slide: MP4, MOV, WEBM, up to 30 seconds, 50 MB (saved as a 720p MP4).
- Document: pasted text, TXT, DOCX, PDF, up to 4 MB and 20,000 characters.
  Kept as text; a PDF's first 5 pages are also kept as pictures (step 11).
  A PDF with no readable text (a scan) is refused.
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
8. Documents (PDF, DOCX, TXT) in Post a Service slideshows.
9. Ownership check when posting photos and videos (reads the hidden code first).
10. Portfolio: one upload for every kind of file, "Original" badge, category and tags.
11. PDF pages as watermarked pictures (Portfolio and Post a Service).

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

Step 4 (Check Ownership = the paper's "Extraction API"): built 2026-09-28
(the user said "plan, and if I don't respond in 2 minutes, go for it").
Pushed live (commit 9f68d3f). Database: migrations "check_ownership" and
"check_ownership_owner_required" are both applied, so don't run
`supabase_ownership_schema.sql` again. Still needs the user to test it live
(no photo had been watermarked on the live site yet when Step 4 shipped).
Next: Step 5 (see below).

What Step 4 does:
- Page /dashboard/check-ownership (sidebar "Check Ownership", freelancers and
  clients): upload a picture found elsewhere; `POST /watermarks/extract`
  reads the code and shows the owner (name, @username, Verified badge), the
  service/project it came from, the date, "N of 48 bits matched", the
  original next to the upload, and a link to their portfolio.
- Codes keep their owner (`watermark_codes.freelancer_id`) and survive the
  post being deleted (slide link set to null), so reposts stay traceable.
- Matching: database function `closest_watermark_codes` (XOR + bit count;
  only the service role may run it). A match needs <= 6 wrong bits on the
  picture as it is, or <= 5 on one of 9 "un-crop" guesses
  (`UNCROP_GUESSES` in hidden_watermark.py: the picture is put back in a
  bigger frame with its edge colors, as if cropped edges were still there),
  and must beat the next closest code by >= 4 bits.

Step 4 test results:
- Crop recovery (26 watermarked pictures, found before -> with guesses):
  5% off every side 9 -> 13, 10% off every side 0 -> 9, bottom 10% 20 -> 23,
  bottom 20% 11 -> 18, right 15% 21 -> 24, uneven crop 5 -> 13.
- False alarms: 35 unwatermarked pictures x 10 readings each vs 1,000 stored
  codes = 0 false matches (closest was 8-9 wrong bits; a match needs <= 5-6).
- Endpoint (fake database, 300 other codes): found in a downloaded copy
  (47/48 bits), a 50% resize (43), a copy with the bottom 12% cropped off
  (42), still found after the post was deleted, "your own work" for the
  owner, not found for the unwatermarked original or a plain picture.

Step 4 files: `database/supabase_ownership_schema.sql`, `ai-service/main.py`
(`/watermarks/extract`, owner saved with codes), `hidden_watermark.py`
(`read_uncropped_codes`), `client/src/lib/aiService.js` (`checkOwnership`),
`views/CheckOwnershipView.jsx`, `App.jsx`, `lib/pageTitles.js`, both
dashboard layouts (sidebar link).

Step 5 (ViT copy check + admin Flagged Content): built and pushed live
2026-09-28 (the user said "go"). Database: migration "copy_check" is applied
(pgvector 0.8.2 turned on in the `extensions` schema; the AI search plan in
PLAN-hard-features.md should reuse it). Don't run
`supabase_copy_check_schema.sql` again. Still needs a live test.

What Step 5 does (photos only; video frames come with Step 7):
- Model: Meta's DINO ViT-S/16 (facebook/dino-vits16, Apache 2.0), the 8-bit
  ONNX from Xenova/dino-vits16, downloaded by `get_models.py` (23 MB, SHA-256
  checked). 384 numbers per picture (CLS token), cosine similarity.
  8-bit gave the same results as the full model, 9x faster (70 vs 624 ms).
- Each photo stores two fingerprints in the private `slide_embeddings`:
  as uploaded and as shown (with the owner's visible watermark), because a
  thief usually screenshots the shown version.
- A new photo scoring >= 0.88 (`COPY_CUTOFF` in main.py) against another
  freelancer's ACTIVE photo is saved with status 'flagged' (+
  matched_slide_id, match_score): hidden from everyone but the uploader and
  admins. Flagged photos are left out of later comparisons, so a flagged copy
  can't get the real owner's next upload flagged too (bug found in testing).
- Uploader: "Under review" tag on the slide + a message after uploading.
- Admin > Flagged Content (/admin/flagged, sidebar count badge): the flagged
  photo next to its match, both owners and dates, "N% similar", Promo tag;
  "Looks fine, show it" (status active) or "Remove the copy" (delete).
- PostgREST note: the self-link is written `media_slides!matched_slide_id`;
  the constraint-name hint does NOT work for a table linked to itself.

Step 5 test results (30 test pictures; wallpapers grouped by design):
| A thief uploads... | Lowest similarity | Average |
|---|---|---|
| a screenshot of the watermarked photo | 0.968 | 0.997 |
| the watermarked photo with its watermark cropped off | 0.900 | 0.971 |
| the original, JPEG 50 | 0.951 | 0.989 |
| the original, resized 50% | 0.905 | 0.995 |
| the original, cropped 10% on all sides | 0.932 | 0.976 |
| the original, bottom 20% cropped | 0.903 | 0.967 |
| the original, brightness +20% | 0.977 | 0.994 |
| the original, mirrored | 0.987 | 0.995 |
| the original, grayscale | 0.861 | 0.925 |
| the original + their own big tiled watermark | 0.550 | 0.821 |
- At the 0.88 cutoff: 279 of 300 copies flagged (misses: some grayscale
  copies, and copies under a big tiled watermark of the thief's own).
- Different designs: 389 pairs, average 0.34; only 1 above the cutoff: two
  posters from the same layout with different words and colors (0.951). The
  ViT judges look and layout, not words, so same-template posters may be
  flagged; the admin clears them in one click.
- Same design in another color / Windows lock-screen crops: 16 of 46 flagged
  (recolors of someone's design are fair to send to an admin).
- Endpoint (fake database, two freelancers): screenshot of the shown photo
  0.98, cropped original 0.98, "Promo" disguise 0.98 all flagged; a different
  picture and the owner's own re-upload stay active.

Step 5 files: `database/supabase_copy_check_schema.sql`, `ai-service/similarity.py`,
`main.py` (`copy_check`, embeddings saved, `watermark_photo` returns them),
`get_models.py`, `.gitignore`, `client/src/lib/slides.js` (`status`,
`underReview`, `underReviewMessage`), `MediaCarousel.jsx` + `slides.css`
(tag), `ServicesView.jsx`, `PortfolioSection.jsx`,
`admin/views/AdminFlaggedView.jsx`, `admin/layout/AdminLayout.jsx`,
`App.jsx`, `lib/pageTitles.js`.

Step 6 (Documents / writing): built and pushed live 2026-09-28 (the user
said "go"). Database: migration "portfolio_documents" is applied, so don't
run `supabase_documents_schema.sql` again. Still needs a live test.

What Step 6 does:
- Add to Portfolio > "Writing": pasted text or TXT/DOCX/PDF (text only, up
  to 4 MB and 20,000 characters). Created only by the AI service
  (`POST /portfolio/documents`); the database refuses documents from browsers.
- Invisible code (`text_watermark.py`): a random 48-bit code written with
  zero-width characters (U+200B = 0, U+200C = 1) between two word joiners
  (U+2060), after the first word of EVERY sentence, so copying any sentence
  carries it. Stored in `watermark_codes.portfolio_item_id`.
- Footer "© <name> · PhilFreela" (same name choice as the photo watermark),
  switch "document_footer" in Watermark Settings (default on).
- Copy check: all-MiniLM-L6-v2 (8-bit ONNX, `text_embedder.py`, shared with
  the planned AI search) on pieces of 40-150 words (`document_embeddings`);
  flagged if a piece is >= 0.80 similar (`TEXT_COPY_CUTOFF`) to another
  freelancer's active document, or if the text still carries another
  freelancer's hidden code (score 1.0). Flagged documents: "Under review" for
  the owner, listed with photos on Admin > Flagged Content.
- Check Ownership > Text tab (`POST /watermarks/extract-text`): the hidden
  code first; if it was removed, the closest document by meaning (>= 0.80).
- The 50-item limit per freelancer now counts documents too.

Step 6 test results:
- Text model check: "A man is eating food." vs "... a piece of bread." =
  0.755, matching the model's published value.
- Cutoff (6 topics x original / light edit / full rewording / different text
  on the same topic): light edits 0.96-0.99, full rewordings 0.59-0.72, same
  topic different text 0.22-0.57, different topics <= 0.40. At 0.80: all
  light edits flagged, nothing else. Full rewordings count as new writing.
- Invisible code: text looks identical; 40 of 40 copies of any ~120 visible
  characters (about a sentence) carried it; survives a Word (DOCX) round
  trip, extra spaces and Windows line endings; removing hidden characters
  removes it (then the similarity fallback finds the source).
- Endpoint (fake database): paste of another's document flagged (1.0);
  retyped with some words changed flagged (0.97); different writing and the
  owner's own re-upload stay active; DOCX/TXT work; broken PDF, too few
  words and client accounts refused; Check Ownership finds one copied
  sentence by its code and retyped text by similarity (0.97), and nothing
  for unrelated text.

Step 6 files: `database/supabase_documents_schema.sql`, `ai-service/text_watermark.py`,
`text_embedder.py`, `main.py` (documents + extract-text, shared 50-item
limit), `requirements.txt` (tokenizers, python-docx, pypdf), `get_models.py`,
`.gitignore`, `client/src/lib/aiService.js` (`addDocument`,
`checkTextOwnership`), `lib/portfolio.js`, `lib/watermarkSettings.js`,
`components/PortfolioUploadDialog.jsx`, `PortfolioSection.jsx`,
`PortfolioViewer.jsx`, `portfolio.css`, `WatermarkSettingsForm.jsx`,
`TextOwnershipCheck.jsx`, `views/CheckOwnershipView.jsx`,
`admin/views/AdminFlaggedView.jsx`, `admin/layout/AdminLayout.jsx`.

Step 7 (Video watermarking): built and pushed live 2026-09-28 (the user said
"ok" to the plan and chose limit A: 30 seconds, 50 MB). Database: migration
"video_watermarks" is applied, so don't run `supabase_video_schema.sql`
again. Still needs a live test (and how long an upload takes on Vercel).

What Step 7 does:
- Every video (MP4, MOV from iPhones, WEBM) is turned into a 720p MP4 (H.264
  CRF 23, at most 30 fps, sound kept) by FFmpeg through `imageio-ffmpeg`
  (`watermark_video.py`). The browser still puts it in `slide-uploads` first.
- Visible watermark: drawn once (`watermark_layer`) and blended into every
  frame; none on promos.
- Invisible code: HiDDeN pattern worked out on one key frame every 2 seconds
  and added to the frames until the next one (Meta's JND, strength 3.0).
  Self-check: 4 frames of the finished MP4 read together (<= 4 wrong bits),
  otherwise saved without a code, like a very plain photo.
- Copy check: ViT numbers of 5 key frames, as uploaded and as shown
  (`uploaded_frame1..5`, `shown_frame1..5`); the closest match of any frame counts.
- Check Ownership > Video tab (`POST /watermarks/extract-video`): 16 frames
  read together (their decoder scores added up bit by bit).
- `vercel.json`: maxDuration 300 seconds.
- Deploy fix (commit 0527158): imageio-ffmpeg's Linux package includes the
  whole FFmpeg program (80 MB), which made the service about 537 MB, over
  Vercel's 500 MB limit, so the first deploy failed. On Linux the package is
  now installed without it, `get_models.py` adds FFmpeg xz-compressed (21 MB,
  fingerprint checked), and `watermark_video.py` unpacks it to the temporary
  folder the first time a video comes in (about 3 seconds). Live since then.

Step 7 test results (30-second 1080p test video with sound, dark 3D render):
- Speed on ONE CPU core (like Vercel): whole upload about 25 seconds
  (length check 1.5 s, watermarking 18-20 s, self-check 2.6 s, copy check
  0.7 s); first version took 94 s. Output 4.8-5.5 MB.
- Strength: at 2.5, re-compressed copies lost 7-11 bits (no match). At 3.0
  (5 runs): own file 0-3 wrong bits, re-compressed (CRF 32) 2-7, 480p 1-6,
  360p 6-9 (usually no match), 3 seconds cut out 0-4. A new pattern every
  second instead of every 2 wasn't better.
- Tried and dropped: leaving out the JND's extra room in dark areas (to avoid
  a faint green tint and rings on very dark, smooth backgrounds) made the
  code much weaker, because moving objects then carry it and the reused
  pattern stops fitting them; same for a JND per frame and a pattern from a
  grey picture. So very dark, smooth videos can show faint rings when paused
  (the same as photos).
- Endpoints (fake database): MP4 with sound, promo (no "shown" frames), MOV,
  WEBM without sound, tall phone video (720x1280) all saved; someone else's
  re-compressed copy flagged by the copy check (0.99) and found by Check
  Ownership (45 of 48 bits, the right owner and service); the original,
  never-watermarked clip not found; someone else's upload refused; junk refused.

Step 7 files: `database/supabase_video_schema.sql`, `ai-service/watermark_video.py`,
`hidden_watermark.py` (`code_change`, `read_code_from_frames`),
`visible_watermark.py` (`watermark_layer`), `main.py` (video uploads,
extract-video, copy check over several frames), `requirements.txt`,
`vercel.json`, `README.md`, `client/src/lib/slides.js` (MOV, `stageVideo`),
`lib/aiService.js` (`checkVideoOwnership`),
`components/VideoOwnershipCheck.jsx`, `views/CheckOwnershipView.jsx`.

Step 8 (Documents in Post a Service): built and pushed 2026-09-29 (a
classmate couldn't post a PDF in a service; the user chose "Post a Service
too" and said "continue"). Database: migration "service_documents" is
applied, so don't run `supabase_service_documents_schema.sql` again. Still
needs a live test.

What Step 8 does:
- Post a Service's picker also takes PDF, DOCX and TXT (up to 4 MB), next to
  photos and videos (same 10 per service / 50 per freelancer limits).
  Portfolio projects still take photos and videos only (they have "Writing").
- `POST /slides` with `document`: the same as portfolio writing (only the
  text, the footer, the invisible code, the text copy check), saved as a
  UTF-8 `.txt` in slide-media (media_type "document"). The helpers
  `check_copied_writing` and `watermark_writing` are shared with
  `POST /portfolio/documents`.
- Slideshow: a document slide shows the start of its text and a "Read
  document" button that opens the whole text (`MediaCarousel.jsx`).
- Copy check works across both kinds: `document_embeddings` rows belong to a
  portfolio document or a document slide; `closest_document_pieces` also
  returns `slide_id`. Matches across the two tables are stored in
  `media_slides.matched_item_id` / `portfolio_items.matched_slide_id`, which
  have NO foreign key on purpose (a second link between the two tables would
  make the website's slides-of-a-project lookups ambiguous).
- Check Ownership > Text also finds service documents ("From their service ...").
- Admin > Flagged Content now shows every kind of slide: photos, videos (a
  Step 7 bug: flagged videos showed as a broken picture) and document text,
  plus matches between service and portfolio documents.

Step 8 test results (fake database): DOCX, PDF and TXT saved with the footer
and the code (code and text pieces linked to the slide); someone else's copy
flagged by its code (1.0) and retyped with words changed by meaning (0.995);
a portfolio essay posted in someone else's service and a service document
copied into someone else's portfolio both flagged with the right original;
different writing stays up; Check Ownership finds a copied sentence by code
and retyped text by meaning, pointing to the service; too short, scanned PDF,
binary junk, two files at once, and someone else's service refused. The Step
6 document tests and Step 7 video tests still pass.

Step 8 files: `database/supabase_service_documents_schema.sql`,
`ai-service/main.py`, `client/src/lib/slides.js`, `lib/aiService.js`,
`components/SlidePicker.jsx`, `MediaCarousel.jsx`, `slides.css`,
`ServiceCard.jsx`, `TextOwnershipCheck.jsx`, `views/ServicesView.jsx`,
`admin/views/AdminFlaggedView.jsx`.

Step 9 (Ownership check when posting): built and pushed 2026-09-29 (the
user chose "Also check on posting" and said "continue"). No database change.
Still needs a live test.

What Step 9 does (the paper's flow: the Extraction API also runs on upload):
- Before a photo gets our watermark, `POST /slides` reads the hidden code it
  may already carry (`read_code`); for a video, from 5 frames as uploaded
  (`read_code_from_frames`). If it matches another freelancer's saved code
  (the same rule as Check Ownership: <= 6 wrong bits and a clear gap to the
  next code), the slide is flagged with score 1.0 ("Carries the other
  freelancer's hidden code" on Admin > Flagged Content) and linked to the
  original slide. Otherwise the ViT copy check runs as before.
- Re-posting your own work is fine (your own code). Documents already did
  this since Step 6 (and in services since Step 8).
- The Check Ownership menu page stays, for files found outside PhilFreela.
- Cost: one extra decoder run per photo, five per video.

Step 9 test results (fake database): someone else posting the owner's
downloaded photo (re-saved as JPEG 80) and the same shrunk to 75% as a promo:
both flagged by the code (1.0) and linked to the owner's photo; the owner's
downloaded video posted by someone else: flagged by the code (1.0); the owner
re-posting their own photo and video: active; a different photo: active.

Step 9 files: `ai-service/main.py` (`someone_elses_code`, `add_slide`,
`watermark_video_upload`).

Step 10 (A better portfolio): built and pushed 2026-09-29 (the user picked
ideas 1-3 and the clearer upload message, then said "build"). Database:
migration "portfolio_tags" is applied, so don't run
`supabase_portfolio_tags_schema.sql` again. Still needs a live test.

What Step 10 does:
- "Add to Portfolio" is one form: title, description, category (the service
  categories), up to 5 tags, and up to 10 files: photos, videos and
  documents, like Post a Service. Pasted writing becomes a document file at
  the end. The old Photos & videos / Writing tabs are gone; older writing
  items still show and open as before (`POST /portfolio/documents` stays).
- "Original" badge (`components/OriginalBadge.jsx`, rule `isOriginalWork` in
  `lib/slides.js`): every file is active (not waiting for an admin) and
  carries PhilFreela's hidden code. Shown on portfolio cards, in the viewer
  (with the explanation) and on Browse Services cards. It only claims
  "not a copy of other freelancers' work here".
- Category chips filter the portfolio (once it has 2+ categories); cards show
  the category, the viewer the tags. Old projects have none (no Edit yet).
- The `/slides` reply has `held_because`: "watermark" (it carries another
  freelancer's hidden code, step 9) or "similar"; the upload message says
  which. Similarity scores are capped at 0.9999, so 1.0 always means "found
  by the hidden code" (before, an exact copy could round to 1.0).

Step 10 test results: fake database: the owner's photo and pasted writing in
a portfolio project saved; someone else's downloaded photo and copied writing
held with held_because "watermark"; the same picture without the code
(0.9986) and the writing retyped without the code (0.9849) held as "similar",
both below 1.0. Screenshots (the real components with made-up data): the
grid with category chips and badges, a document-only project as a text
cover, the viewer with badge, tags and explanation, and the form (tags split
on commas, also when pasted; found and fixed: a pasted "Logo," kept its comma).

Step 10 files: `database/supabase_portfolio_tags_schema.sql`,
`ai-service/main.py`, `client/src/components/OriginalBadge.jsx`,
`lib/slides.js`, `lib/portfolio.js`, `components/PortfolioUploadDialog.jsx`,
`PortfolioSection.jsx`, `PortfolioViewer.jsx`, `portfolio.css`,
`views/BrowseServicesView.jsx`, `views/ServicesView.jsx`.

Step 11 (PDF pages as watermarked pictures): built and pushed 2026-10-07
(the user asked "concerns with upload docs file, how can we watermark
those??", picked Portfolio and Post a Service, and said "gooo" to the plan).
Database: migration "document_pages" is applied, so don't run
`supabase_document_pages_schema.sql` again. Still needs a live test (and how
long a 5-page PDF takes on Vercel).

What Step 11 does:
- Before, a PDF was kept as text only, so its layout, fonts and pictures
  were lost. Now `POST /slides` also turns a PDF's first 5 pages into
  pictures (PDFium through `pypdfium2`, longer side 1200 px), saved next to
  the text file as `<slide id>-p1.jpg` ... `-p5.jpg` in slide-media;
  `media_slides.page_count` says how many. The PDF file itself is never kept
  or handed out. DOCX and TXT stay text-only (Vercel has no Word to draw
  their pages), and so does a PDF whose pages can't be drawn.
- Visible watermark on pages (`document_pages.py`, `page_style`): the
  freelancer's own words and on/off switch, but always small, 15% strong and
  repeated across the whole page, dark on light paper and white on a dark
  page. Their photo style (white, one corner by default) would be invisible
  on white paper and easy to crop off.
- Hidden code on pages: the SAME 48-bit code as the document's text (one
  `watermark_codes` row per slide, as before), hidden with HiDDeN. So a
  screenshot of a page is found by Check Ownership > Picture (which shows
  page 1 as the original), and held when someone else posts it as a photo
  (step 9). Pages try one more pattern strength than photos (5.5).
- No picture copy check (ViT) on pages, on purpose: the ViT judges look, not
  words, so two different text documents on white paper would be flagged as
  copies. The text copy check and the hidden text code stay as they were.
- Website: a PDF's slide shows page 1 (a click or "Read document" opens the
  reader on its pages, with a Pages / Text switch); page 1 is the cover on
  portfolio cards and service rows; deleting a service, project or flagged
  copy also deletes the page pictures. Admin > Flagged Content shows a
  screenshot of a page next to the PDF's first page. Settings > Watermark
  Settings has a line explaining the page look.
- Fixed on the way: a sideways swipe inside the document reader on a phone
  reached the slideshow behind it, changed the slide and closed the reader.

Step 11 test results:
- Pages holding the hidden code (13 pages of the 3 project PDFs, 4 random
  codes each): 50 of 52 at the photo strengths, 52 of 52 with the extra one.
  Most need x2.5 or x4.0, which leaves a faint colour tint on white paper
  (PSNR 30-35 dB). The plan said the code stays on pages despite the tint,
  and the user approved the plan.
- Where the code held (13 pages): owner still found after JPEG 70 on 13,
  JPEG 50 on 11, half size on 13, a screenshot-like copy (80% size, JPEG 85)
  on 12.
- About 4 seconds and 240 KB per page on the laptop (several times slower on
  Vercel's 1 CPU). `pypdfium2` adds about 8 MB to the service.
- Endpoint (fake database, 28 checks): a 3-page PDF in a service and a PDF
  in a portfolio project saved with their pages; a 7-page PDF keeps 5; DOCX,
  TXT and an undrawable PDF saved as text only; a failed page upload or
  failed save leaves no files behind; a screenshot of a page finds the owner
  and the service (45 of 48 bits) and is held when someone else posts it as
  a photo; someone else's copy of the PDF is still held by the text check.
- Website (the real components with made-up data in a browser, 28 checks):
  slide, reader, Pages / Text, card covers, deleting, and the admin page.

Step 11 files: `database/supabase_document_pages_schema.sql`,
`ai-service/document_pages.py`, `main.py` (`page_path`, `watermarked_pages`,
`add_slide`, `describe_match`), `hidden_watermark.py` (`protect_photo`
takes `strengths`), `requirements.txt`, `README.md`,
`client/src/lib/slides.js` (`slidePagePaths`, `pages`), `MediaCarousel.jsx`,
`slides.css`, `PortfolioSection.jsx`, `portfolio.css`, `ServiceCard.jsx`,
`WatermarkSettingsForm.jsx`, `admin/views/AdminFlaggedView.jsx`.

## Reminders for later steps

- Step 11, possible next: accept PDFs with no readable text (scans, designs
  exported as pictures), checked like photos with the ViT; today they are
  refused. And the same page pictures as the client's preview of a PDF
  deliverable (left out on purpose so far: PLAN-projects-and-ratings.md).


- LATER (user said "later", 2026-09-28), two plagiarism gaps:
  1. Flagged Content: add "Keep this one, remove the other" for when the
     flagged upload is the real original (the thief posted first). Today the
     admin can only remove the flagged item.
  2. Report button: add a "Stolen work / plagiarism" reason, for work stolen
     from outside PhilFreela, which the copy check can't see.

- Step 7: test how long a video upload takes on Vercel and through the
  Cloudflare /ai forwarding (about 25 s on one laptop core).
- Paper: credit Meta for HiDDeN (CC-BY-NC, non-commercial). The README
  already does.
- Step 5: tune the similarity cutoffs with real test files.
- Supabase free plan: 1 GB storage, 5 GB bandwidth a month, and the project
  pauses after 1 week without activity (open it before the defense).
