# Plan: watermark on/off switch + the freelancer's own watermark picture

Asked 2026-11-15: "I want the watermarking system switchable to on/off, and
freelancers can insert their own watermarks that can be removeable bg or not."

Status (2026-11-15): the user picked A1 + B1 and "just the part in the
Settings". BUILT: Step 1 item 1 (the On/Off card) and Step 2 (own picture).
NOT built, on purpose: Step 1 items 2-4 (upload-box buttons, admin badge) and
Step 3. Migration `own_watermark` applied after a rolled-back trial (12/12,
database/test_own_watermark.sql).

## What is there today (facts from the code)

- Settings > Watermark Settings already has a switch, "Show a visible watermark
  on my photos" (`watermark_settings.visible_enabled`). Photos, videos and PDF
  pages follow it. The document footer has its own switch.
- A change only reaches files uploaded AFTER it. The watermark is drawn into
  the saved file and the clean original is not kept, so switching it off does
  not remove it from photos already uploaded.
- Every photo and video also gets the invisible code (HiDDeN). It has no
  switch: it proves who owns the work and the copy check uses it.
- Offers have a per-file "Protected / Promo" button (`media_slides.promo`):
  Promo = no visible watermark. Portfolio uploads have no per-file switch.
- The watermark is text only: @username, full name or own text, with the
  PhilFreela logo in front (optional).
- Unpaid deliverables get their own @username watermark (pay-to-unlock). That
  is a lock, not a style, and this plan does not touch it.

## Step 1: the switch, made clear (website only, no database change)

What the freelancer sees:
1. Settings > Watermark Settings starts with a big "Watermark: On / Off" card.
   One line says what it covers (photos, videos, PDF pages) and that the
   invisible ownership code always stays.
2. Every upload box has a per-file "Watermark on / off" button, the portfolio
   upload too (today only offers). Off is for an ad, or a file that already has
   the freelancer's own watermark (the panel's question "What if the images
   already have a watermark?"). It is the old Promo button with a clearer name;
   the database column `promo` stays.
3. When the main switch is off, the upload boxes say "Your watermark is off"
   with a link to the setting.
4. Admin Flagged Content: the "Marked as Promo" badge becomes "Watermark off".

Files: `components/WatermarkSettingsForm.jsx`, `components/SlidePicker.jsx`,
`components/PortfolioUploadDialog.jsx`, `views/ServicesView.jsx`,
`admin/views/AdminFlaggedView.jsx`, `lib/slides.js` (comments).
Tables / endpoints: none new (`lib/aiService.js` already sends `promo`).

## Step 2: the freelancer's own watermark picture

What the freelancer sees (Settings > Watermark Settings):
1. "What it shows": Text | My picture | My picture + text.
2. An upload box for the picture (a logo or signature): PNG, JPG or WebP, up
   to 10 MB picked, shrunk to 600 px and saved as PNG (2 MB bucket limit).
3. A "Remove background" switch with the live preview beside it. On: the plain
   background turns see-through. Off: the picture is used as it is. It can be
   flipped any time, because the original picture is kept too.
4. Position, size, opacity and Tiled work the same as for text. Color and font
   change the text only. The picture takes the PhilFreela logo's place, so the
   "Show the PhilFreela logo" box hides while a picture is used.
5. PDF pages keep only the small faint text (a picture across every page would
   make it hard to read). With "My picture" alone, PDF pages show the @username.

How "Remove background" works (in the browser, no AI model): it looks at the
colors along the picture's edges, takes the most common one as the background
(for example white paper), and makes every pixel close to that color
see-through, with soft edges (a pixel a little further away becomes partly
see-through). It covers the holes inside letters too, which a fill from the
edges would miss. This suits logos and signatures on a plain
background. If the edges have no single color (a photo), it says: "This
picture's background isn't one plain color. Use a PNG with a see-through
background, or turn Remove background off."

Database (migration `own_watermark`, tried first in a rolled-back SQL test):
- `watermark_settings` gets:
  - `mark_kind text not null default 'text'`, one of 'text', 'picture',
    'picture_text';
  - `picture_path text` (must start with the freelancer's own id + '/');
  - `picture_bg_removed boolean not null default false`;
  - a check: 'picture' and 'picture_text' need a `picture_path`.
- Private storage bucket `watermark-pictures` (2 MB, PNG/JPEG/WebP only).
  Rules: a freelancer can add, replace, read and delete files only in their
  own folder `<their id>/`. The AI service reads with its service key.
  Two files per freelancer: `original.<ext>` (as picked) and `mark.png`
  (finished, with or without the background).
- Only if choice B2 (Premium only): the existing Premium check on
  `watermark_settings` also refuses 'picture' and 'picture_text' without
  Premium.

Website files:
- new `lib/watermarkPicture.js`: shrink the picture, remove the background,
  upload both files, get a short-lived link for the preview.
- `lib/watermarkSettings.js` (the new fields), `lib/watermarkPreview.js` (draws
  the picture), `components/WatermarkSettingsForm.jsx` (the new rows).
- `legal/TermsAndPrivacy.jsx`: one line, "A watermark picture must be your own
  logo or signature. Someone else's brand is removed after a report."

AI service files (Vercel, deployed separately from the website):
- `main.py` `watermark_style()`: also reads `mark_kind` and `picture_path`, and
  downloads `mark.png` with the service key.
- `visible_watermark.py` `_draw_mark()`: puts the picture where the PhilFreela
  logo goes, or alone. Photos and videos get it on their own, because they
  already use this function. If the picture is missing or broken, the text is
  drawn instead, so an upload never fails because of it.
- `test_visible_watermark.py`: tests for picture, picture + text and a broken
  picture.

## Step 3 (only if choice A2): the switch also changes photos already uploaded

1. From now on the AI service also keeps a clean copy of each photo (no
   visible watermark, no code) in a new private bucket `slide-originals` that
   no user can read.
2. After saving new watermark settings, a button "Apply to my photos too"
   redraws the freelancer's photos from their clean copies, with the same
   invisible code (from `watermark_codes`) and new copy-check numbers.
3. Photos uploaded before this step, and videos, stay as they are: older photos
   have no clean copy, and redoing a video takes about 20 seconds per minute.

Database: `media_slides.original_path text`, bucket `slide-originals`.
AI service: `main.py` keeps the copy on upload; new route
`POST /watermark/reapply` (only the owner's own photos).
Cost: about twice the storage for new photos.

## What was checked (2026-11-15)

- Database: 12/12 in the rolled-back trial (own folder only, mark.png only,
  picture kinds need a path, private PNG-only bucket, others can't open it).
- AI service: test_visible_watermark.py 44/44 (16 new: picture alone, picture
  + text, broken or huge picture falls back, PDF pages text only), plus a
  pretend-database check of watermark_style() 10/10, test_document_preview.py
  30/30, test_deliverable_preview.py 32/32.
- Website: 43/43 browser checks with a pretend backend (pick, remove
  background, a photo that can't be cleared, save = 2 uploads + old files
  removed, remove picture, switch off, a saved picture loads), dark + light,
  desktop + phone, no sideways scrolling.
- Not tried by a real person yet: a real upload on the live site with a
  picture watermark (first run on Vercel).

## The two choices (the user's): A1 and B1 were picked

- A. When a freelancer switches the watermark off or changes it:
  - A1: only new uploads change (Steps 1 and 2).
  - A2: photos uploaded from now on change too (adds Step 3).
- B. The own watermark picture is for:
  - B1: every freelancer.
  - B2: Premium only (added to Premium perk 9, "Custom watermark").

## Defaults chosen

- The invisible code stays on for everyone, no switch: it proves ownership and
  does not change how the work looks.
- The pay-to-unlock watermark on unpaid deliverables is not affected.
- Background removal runs in the browser with the simple color method, no AI
  model. (The AI way, a ready-made background model in the AI service, also
  works on photos but adds a model to a service that is near Vercel's size
  limit.)
- The `promo` column keeps its name; only the button's words change.

## Testing

- Database: rolled-back SQL trial on the live database, then the migration
  after the user's typed go.
- AI service: `test_visible_watermark.py`.
- Website: build + browser checks with a pretend backend, light and dark
  themes, phone width.
