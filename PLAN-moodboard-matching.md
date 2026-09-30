# AI Moodboard Matching: plan and progress

Last updated: 2026-09-30. To continue in a new Claude session, say:
"Read PLAN-moodboard-matching.md and continue from the current step."

Feature 2 in PhilFreela-System-Functions.md: a client uploads a reference
image (moodboard, sample, screenshot of a style they like) and gets a ranked
list of freelancers whose portfolio work looks closest to it.

Plan approved by the user on 2026-09-30 ("build").

## What the client sees

1. A new sidebar link, "Moodboard Match" (clients only): upload a reference
   image.
2. A ranked list of freelancers whose portfolio work is visually closest to
   it: their best-matching image, a match score, name + Verified check,
   Message button.
3. "No close matches" with a tip to try another reference image, if nothing
   scores high enough.

## How it works (for the defense)

1. CLIP (OpenAI, MIT license; only the pretrained vision half is used, no
   text side, since this is image-to-image) turns a picture into 512
   numbers describing its visual style (color, composition, mood),
   regardless of subject. Nothing is trained.
2. Every active image slide from verified freelancers (services and
   portfolio projects) gets these numbers once, stored in pgvector, and
   reused (lazy "compute once", same pattern as the search box).
3. The uploaded reference image gets the same numbers; Supabase finds the
   closest slides by cosine similarity.
4. Freelancers are ranked by their single best-matching image, not an
   average, since one strong match matters more than the rest of the
   portfolio.
5. Hidden work (unverified freelancers, flagged slides) never gets numbers,
   so it can't be recommended.

Model check (2026-09-30, before building): Xenova's quantized ONNX export
of openai/clip-vit-base-patch32's vision half (89 MB,
`onnx/vision_model_quantized.onnx`, outputs `image_embeds` already
projected to CLIP's 512-dim space, so no extra projection code is needed).
Sanity test: 28 Windows wallpaper images across 8 visual "themes" -- the 12
images in 4 clearly distinct theme folders (A-D) each found their true
closest match within their own folder (12/12), with same-theme similarity
noticeably higher (mean 0.89) than different-theme (mean 0.78, ignoring one
pair that was a byte-identical duplicate file scoring 1.0).

## Database: new file `database/supabase_moodboard_schema.sql`

1. Table `style_embeddings`: `slide_id`, `freelancer_id`,
   `embedding vector(512)`, `created_at`. RLS on, no policies (service role
   only, same pattern as `listing_embeddings`).
2. `slides_to_embed(max_rows)`: active image slides from verified
   freelancers with no numbers yet.
3. `closest_styles(query, how_many)`: the closest slides, one row per
   freelancer (their single best match), with freelancer id, slide id,
   similarity.

## AI service

1. New `ai-service/moodboard.py`: loads the CLIP vision model, embeds the
   reference image and slide images, catches up missing numbers.
2. `get_models.py`: downloads `vision_model_quantized.onnx`, SHA-256
   checked.
3. `main.py`: `POST /moodboard/match` (an uploaded image, JPEG/PNG/WEBP, up
   to 5 MB, login required) -> freelancer ids with scores.

## Website

1. `lib/aiService.js`: `matchMoodboard(image)`.
2. New `views/MoodboardMatchView.jsx`: upload box, results list (reuses
   `slideUrl` from `lib/slides.js`, `VerifiedBadge`, `openChat`).
3. `ClientDashboardLayout.jsx` (one sidebar link, clients only), `App.jsx`
   (route), `lib/pageTitles.js` (title).

## Tests

1. Made-up freelancer accounts with portfolio images in a few visual
   styles, then reference images with known right answers (top-N hit
   rate), to set the cut-off.
2. Live site has very few real portfolio images today, so results will be
   thin until freelancers upload more (or demo data is added for the
   defense).

## Current step

Built and pushed live (2026-09-30). Migration "moodboard_matching" has been
run, so don't run `supabase_moodboard_schema.sql` again.

Changes from the plan while building:
- No hard "excluded below this score" floor after all: CLIP's cosine
  similarity runs high for any two ordinary pictures, so a low floor
  (`MIN_SCORE = 0.50`) barely excludes anything; the ranking itself is what
  actually tells related work from unrelated. A higher floor
  (`STRONG_SCORE = 0.90`) is shown as a green "Strong match" badge instead,
  the rest as "Related style" -- the same visual language as the search
  box's "Strong match" / "Related".
- Test images had to be pre-shrunk to a realistic upload size (1200px,
  matching the app's own limit) before the browser test's portfolio
  pictures would load quickly; the raw 4K test source files loaded slowly
  enough that a first screenshot showed blank cards (a test artifact, not a
  product bug -- real uploads are already resized on the way in).

Tests (2026-09-30, against the live database, 4 verified + 1 unverified
made-up freelancer, 1 client, all deleted afterward):
- Endpoint, 17/17: 4 reference images (one per visual "theme") each found
  the correct freelancer as the top match, with a clear score gap to the
  next-best (0.03-0.18); the unverified freelancer's work never appeared
  and never got numbers; numbers are computed once and reused (a repeat
  search took under 2 seconds); logged-out and non-image uploads refused.
- Browser, 11/11 (desktop + phone): sidebar link (clients only, confirmed
  absent for a freelancer account), upload, loading state, ranked cards
  with the right badges, "View portfolio" and "Message" both work.

Files: `database/supabase_moodboard_schema.sql`, `ai-service/moodboard.py`,
`get_models.py` (+model, `.gitignore`), `main.py` (`POST /moodboard/match`
+ 1 import), `client/src/lib/aiService.js` (`matchMoodboard`),
`views/MoodboardMatchView.jsx`, `ClientDashboardLayout.jsx` (sidebar link),
`App.jsx` (route), `lib/pageTitles.js`.

Still needs: the user to try it on the live site once a few more
freelancers have real portfolio pictures (today there's only one).
