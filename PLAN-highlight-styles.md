# PLAN: Highlight styles on the site (Premium)

Last updated: 2026-11-20. To continue in a new Claude session, say:
"Read PLAN-highlight-styles.md and continue from the current step."

Status: the user said "ok" on 2026-11-20. **Step 1 is DONE:** after the user typed "apply it", `database/supabase_highlight_style_schema.sql` was applied to the live database (migration `highlight_style`, version 20261120032743). `database/test_highlight_style.sql` passed 7 of 7 before and after (rolled back each time). **Step 2 is DONE**
(the styles inside the player, 2026-11-20). **Step 3 is DONE** (the style choice on your own profile, 2026-11-20).
**Next: Step 4.**

## What the user asked

Build the five styles from the preview (`previews/highlights-styles/`) into the site's highlights: Papercut, Retro,
Cartoony, Kinetic type and Comic book.
- **Premium only.** The Director's Cut stays for every freelancer.
- **No color choice.** Every style uses PhilFreela orange.
- **Matched by level**, like the preview.
- **The Premium page already lists the perk** (commit c9ce9cf, live).

## What is there today (checked 2026-11-20)

1. **The site's player** is in `client/src/components/highlights/`:
   - `highlightsEngine.js` (1,708 lines, the Director's Cut) and `highlights.css` (all its styles under `.hl-film`);
   - `HighlightsPlayer.jsx` and `highlightsMarkup.js`.
   - It is downloaded only when someone opens a highlight.
2. **The data.** `lib/highlights.js` `loadHighlight()` reads `profiles` (no style yet) and `pro_members` (it already
   knows whether the freelancer is Premium).
3. **The owner's controls.** On your own profile, the Portfolio poster (`HighlightsPoster.jsx`) has
   "Preview my highlights" and the level switch (`LevelSwitch` in `HighlightsButton.jsx`).
4. **Premium rules in the database** follow one pattern, as with the two-color look (`premium_gradient_only`):
   - A trigger refuses a NEW Premium-only choice from someone without Premium.
   - A saved choice stays when Premium ends, and the site shows the free version until Premium is back.
   - `is_pro(user)` already exists.
5. **Fonts.** The site loads 3 Google Fonts in `index.html`. The styles need 9 more, so each style loads only its own
   fonts when one of its highlights opens.
6. **The preview has all five styles working.** It has the style kit (`styles.js`), one file per style (`st-*.js` /
   `st-*.css`) and the hooks in the film. Checked there: every part plays with no errors on a computer and a phone,
   and the music loudness was measured for each level.

## Steps

### Step 1: Save the chosen style (database)
1. Add a new column `profiles.highlight_style`.
   - Type: text, default `'cinema'` (the Director's Cut).
   - Allowed values: `cinema`, `paper`, `retro`, `toon`, `kinetic` or `comic`.
2. Add the trigger `profiles_premium_highlight_style` (function `premium_highlight_style_only`).
   - A new choice other than the Director's Cut needs Premium (`is_pro`).
   - A saved choice stays when Premium ends.
3. Files:
   - `database/supabase_highlight_style_schema.sql`;
   - `database/test_highlight_style.sql` (checks that are rolled back).
4. Tables: `profiles`. Endpoints: none new.
   - The page saves through the existing "update your own profile" rule, and the trigger guards it.
5. Tried first with the rolled-back checks on the live database (PGlite isn't installed here).
   - **Applied 2026-11-20** after the user's typed go. The checks passed 7 of 7 again afterwards.
   - Visitors (`anon`) and signed-in users can read the column.

### Step 2: The styles inside the player (no new button yet)
1. Add a new folder `client/src/components/highlights/styles/`:
   - `kit.js`: the music sequencer and the drawing helpers;
   - `paper.js`, `retro.js`, `toon.js`, `kinetic.js` and `comic.js`, each with its own CSS.
   - They are ported from the preview. All their CSS stays under `.hl-film`, and their animation names start with
     `hl-`, so nothing else on the site changes.
2. `highlightsEngine.js`: add the same hooks as the preview:
   - the stop-motion frame rate for Papercut;
   - each style's backgrounds, effects, changes between parts, sound effects, music and pops.
   - The Director's Cut stays exactly as it is now.
3. `HighlightsPlayer.jsx`: the film opens in the freelancer's style.
   - Only that style's file and fonts are downloaded, so the rest of the site stays as fast.
4. `lib/highlights.js`: also read `highlight_style`.
   - A style plays only while the freelancer is Premium; otherwise it is the Director's Cut.
5. Retro's pixel pictures are redrawn through a canvas.
   - Pictures from storage are asked for with permission (`crossOrigin`).
   - A picture that can't be redrawn shows as it is, with the scan lines.
6. Documents get each style's look too (the user asked, 2026-11-20). A PDF or Word file shows its first page; typed
   writing shows a page with its title and first lines.
   - Papercut: a lined paper note.
   - Retro: a pixel dialog box. Document pages are NOT pixelated, so the words stay readable.
   - Cartoony: a notebook page with a thick outline.
   - Kinetic type: the title in big type.
   - Comic book: a caption page.
7. Tests with the stand-in database:
   - each style plays every part with no errors, on a computer and a phone;
   - the Director's Cut's 71 checks still pass;
   - a freelancer without Premium gets the Director's Cut;
   - a document project shows in every style.

**How it was built (2026-11-20):**
- The five style files and their CSS were converted from the preview by a script (`.film` became
  `.hl-film.hl-st`, and every animation name got `hl-`).
  - From now on, the site's files in `components/highlights/styles/` are the ones to change; the preview is the
    reference.
  - The document looks (item 6) were added on the site only.
- `styles/index.js` lists the six styles and loads one style's file and fonts. `styles/kit.js` is the preview's
  `styles.js` without the launch page's "Hear it".
- The colour theming of the preview is not needed (there is no colour choice), so the Director's Cut keeps its
  exact colours. The styles get fixed orange `--th` variables in `highlights.css`.
- Found while testing: Comic book's CSS made the card art, the end banner and the video reel `position: relative`,
  which hid them. Fixed on the site and in the preview copy.
- Also found while testing (an old Director's Cut problem): in the two-panel layout (two projects or fewer), the
  counters at the top covered a typed document's title and first lines. Fix:
  - A document's page is now a card in the middle of the panel, in every style, clear of the counters and the
    caption.
  - On a phone the counters hide when a panel is a document (the ending card shows the same numbers).
- Test results (stand-in database, nothing live):
  - Full run: 163 checks (every style at every level on a computer, every style on a phone, documents, the
    Premium rule, a style file that fails to load, and Retro without permission to read pictures).
  - Documents again after the card change: 38 of 38.
  - The Director's Cut's own checks: 71 of 71.

### Step 3: Picking the style on your own profile
1. Add a "Highlight style" choice under the poster, next to the level switch (only the owner sees it).
   - It has six choices.
   - Without Premium, the five Premium ones show a lock and "Get Premium" (goes to `/dashboard/pro`).
2. The owner can preview any style; only they see it.
   - Saving a Premium style needs Premium. The page checks it, and so does the database.
3. Files:
   - `HighlightsPoster.jsx` and `HighlightsButton.jsx` (the choice next to `LevelSwitch`);
   - `highlights-poster.css`;
   - `lib/highlights.js` (`saveHighlightStyle`).
4. Checked in light and dark mode, with a light accent color, and on a phone.

**How it was built (2026-11-20):**
- `StyleChooser.jsx` is a "Style: <name>" button under the poster.
  - It opens a pop-up with six cards (the preview's small pictures, the look, the music, Preview, and Use this
    style).
  - Without Premium, the five Premium cards are grey with a lock, and their button is Get Premium.
  - When Premium has ended, a note says the saved style is kept and visitors see the Director's Cut.
- Preview plays your own highlight in that style. The film's top bar says "· Preview" when visitors would see
  something else.
- `lib/highlights.js` has `fetchHighlightStyle` and `saveHighlightStyle`. The database's refusal comes back as a
  plain sentence.
- Tests (stand-in database): 26 of 26 on your own profile.
  - They cover: with Premium; without Premium; after Premium ended; light mode with a pale accent (through the
    site's own `applyAppearance`); a phone.

### Step 4: Words
1. The tour's Portfolio step mentions the styles (`welcomeGuide.js`).
2. This plan's status is updated.

Each step is committed and pushed, then checked on the live site.

## 3D models (asked 2026-11-20, not part of this plan)

The portfolio takes no 3D files today (only photos, videos and PDF, Word or text documents). It needs a plan of its own,
after this one: PLAN-3d-portfolio.md, waiting for the user. The idea:
- Accept .glb files (the one-file 3D format that Blender, SketchUp and others export).
- When a freelancer uploads one, their browser turns it into a 360-degree spin (about 36 pictures) and a cover picture.
- Visitors only ever get those pictures (drag to turn it, @name mark on it), never the 3D file. This is the same idea as
  documents showing only their first page.
- In the highlight, a 3D project turns slowly on its tile, and View project lets the visitor drag it around, in every style.

## Defaults chosen (the user can change these)

1. The owner can preview a locked style (a taste of Premium). Saving it needs Premium.
2. When Premium ends, the saved style is kept, but visitors see the Director's Cut until Premium is back. This is the
   same as the two-color look.
3. Visitors can't switch styles. They see the freelancer's choice.
4. Clients don't get highlights (unchanged).
5. A style's fonts come from Google Fonts, only when a highlight in that style opens.
