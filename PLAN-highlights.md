# PLAN: Highlights on freelancer profiles

Last updated: 2026-11-19. To continue in a new Claude session, say:
"Read PLAN-highlights.md and continue from the current step."

The user approved the look in the preview (`previews/highlights-directors-cut/`, Version 11) and
asked for it "in the PhilFreela": a freelancer's highlight, made from their real profile, that
visitors can watch.

Status: the user said "ok" on 2026-11-19 (with the default below: visitors see the real level, only the
owner gets a level switch). **All 3 steps built** on 2026-11-19.

How it was built (small changes from the steps below):
- The music stayed inside `highlightsEngine.js` instead of a separate `highlightsSound.js`: it follows the
  film's state (part, card draw, level) too closely to split cleanly.
- The film runs in a box of its own that it builds when it starts and removes when it stops, so nothing it
  added stays behind (React mounts things twice in development).
- The player is downloaded only when someone opens a highlight (its own 37 KB file), so other pages don't get slower.
- `components/highlights/HighlightsButton.jsx` holds the button and the owner's level switch for both profile pages.
- The site's pages can't be shown in a frame (`_headers`: X-Frame-Options DENY), so the film runs in the page
  itself, with all its styles under `.hl-film` and its animation names starting with `hl-`.
- Tested with a stand-in database (made-up people, the preview's sample files): 25 checks on the public
  profile, your own profile (light mode), a beginner and a phone. Not yet tried by a real person on live data.

## What is there today (checked 2026-11-19)

1. The public profile is `pages/dashboard/views/PublicProfileView.jsx` (one page for everyone,
   `/dashboard/freelancers/:userId`). It has Message and Report buttons, services, track record and portfolio.
2. Everything a highlight needs can already be read:
   - `profile_stats` (RPC): done projects, average stars, number of ratings, member since.
   - `profile_history` (RPC): each Done project's stars and written feedback, at most the 50 newest.
     Blind ratings that are still hidden come back empty.
   - `fetchPortfolio` + `itemSlides` (`lib/portfolio.js`, `lib/slides.js`): watermarked photos,
     videos and documents. Files under review are not shown to visitors.
   - `services` + `service_rating_summaries` (RPC): offers and their stars.
   - `is_verified` (RPC) and `pro_members`: the Verified and Premium badges.
   - `fetchVerifiedLinks`: links with a Verified owner badge.
3. Opening one project big, with the protections and a Report button, already exists:
   `pages/dashboard/components/PortfolioViewer.jsx`.
4. Live data (read-only count): 25 freelancers, and **all 25 would be Beginner** today (top score
   19 / 100). 4 have portfolio projects and 1 has ratings.

## Steps

### Step 1: Load a freelancer's real data (no screen yet)
1. New `client/src/lib/highlights.js` with `loadHighlight(userId)`. It reads, at the same time:
   - the profile: name, @username, picture, cover, description, skills, links, available;
   - Verified, Premium and the verified links;
   - their services with their stars;
   - their portfolio (files under review left out);
   - `profile_stats` and `profile_history` as a freelancer.
2. `levelOf()`: the preview's score out of 100.
   - Points: projects done 35 (full at 40), ratings received 20 (full at 30), share of 4-5★ ratings 25
     (counts fully from 10 ratings), portfolio 10 (full at 20), services 5 (full at 3), verified ID 5.
   - Levels: Beginner under 40, Average 40-64, Intermediate 65-84, Advanced 85 and up.
   - Premium never counts.
3. Words and prices come from what the site already uses:
   - job titles from `lib/welcomeTitles.js`;
   - category names and icons from `lib/categories.js`;
   - prices with `shownPrice` (Settings > My currency).
4. Tables and endpoints: the existing ones only (profiles, services, portfolio_items, media_slides,
   pro_members; RPCs is_verified, service_rating_summaries, profile_stats, profile_history).
   **No new tables, no SQL, nothing to run in Supabase.**
5. Check it read-only on the live data for 2-3 freelancers: the numbers match their profile pages.

### Step 2: The player
1. New folder `client/src/components/highlights/`:
   - `HighlightsPlayer.jsx`: opens full screen over the page and starts. On close (X or Escape) it
     stops the music and the videos.
   - `highlightsEngine.js`: the preview's parts (card draw, profile, services, project wall, video
     reel, ratings, feedback, ending) and the 5-second chapter cards, built from the loaded data.
   - `highlightsSound.js`: the music and sound effects (Web Audio, made live, no sound files).
   - `highlights.css`: the preview's styles, all inside one `.hl-film` box, so nothing else on the
     site changes.
2. Real files: their watermarked photos and videos.
   - The clean @name mark goes only on files without their own watermark, the same rule as the
     slideshows today.
   - Documents show only their first page or first lines.
3. Clicking a project opens the existing PortfolioViewer: the same protections, and Report for visitors.
4. Parts with nothing to show are left out, as in the preview.

### Step 3: On the profile
1. `PublicProfileView.jsx`: a "Watch highlights" button next to Message on a freelancer's profile.
2. On your own profile the button reads "Preview my highlights", and a level switch shows that
   only you see (see "To confirm").
3. `ProfileView.jsx`: the same "Preview my highlights" button.
4. Test in a real browser: the local site against the live data, read-only. Cover:
   - computer and phone;
   - light and dark mode for the button;
   - sound on and off;
   - a freelancer with nothing yet, and one with photos.
5. Each step is committed and pushed, then checked on the live site.

## Defaults chosen (the user can change these)

1. Only freelancers get highlights (no button on client profiles).
2. It opens with sound on, with a mute button inside.
3. Ratings and feedback use only visible project ratings, so the blind-rating rules apply. It uses
   the 50 newest, and feedback shows first names only.
4. Files under review never appear.
5. The level is worked out in the browser from numbers the site already shows. Visitors see only
   the card, not the score breakdown.
6. The sample freelancers, the poster page and the style buttons stay in the preview folder.
7. The Legendary message stays "You found a better person."

## To confirm

Every real freelancer is Beginner today. Default: visitors always see the real level, and only the
owner gets a switch on their own profile to preview the other levels (useful for the defense demo).
The alternative is a demo freelancer with enough real-looking data to reach gold. That changes live
data, so it would need its own go.
