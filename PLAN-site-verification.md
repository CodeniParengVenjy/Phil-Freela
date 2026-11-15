# PLAN: Verified owner badge for a freelancer's own website (2026-11-15)

The user asked: "what if putting in a portfolio, is their own created website?", then "how to secure that? like proof
of their own website?", then "so can you do that?".

Today a freelancer can already paste their own website in Profile > Portfolio Links (panel revision item 6), but
PhilFreela can't tell whether the site is really theirs. This plan adds a way to prove it.

Status: approved 2026-11-15 ("apply it ok", which also covered the database change).
- Step 1 database: LIVE (migration `site_verifications`, rolled-back trial 16/16 PASS first).
- Step 2 AI service: `ai-service/site_check.py` + `test_site_check.py` (62/62 offline, 3/3 on real websites).
- Step 3 website: Verify button, `SiteVerifyDialog.jsx`, badge on the public list, Terms line (browser test 62/62:
  computer, phone, phone in light mode, and an AI service that isn't updated yet).
- Not tried yet by a real person: a real freelancer verifying a real website on the live site.

## The idea, in plain words

PhilFreela gives the freelancer a one-of-a-kind code for one link, for example:

    <meta name="philfreela-verification" content="pf-7k3q9x2m">

The freelancer puts that line inside the `<head>` of the page at that link (visitors don't see it) and clicks
Check now. PhilFreela visits the page. If the code is there, the link gets a "Verified owner" badge on the public
profile. Only someone who controls a website can change what's on it, so only the owner can pass. Google Search
Console checks website owners the same way.

What it proves: the freelancer controls the site. What it doesn't prove: that they designed it (see "Limits").

## Defaults chosen

- One way to prove it: the code line in the page's `<head>`. No file upload and no DNS record (two more ways to
  explain, and free hosts like Vercel or GitHub Pages don't allow DNS records).
- Own websites only. Links on shared sites (Behance, GitHub profile pages, Google Drive and Docs, Dribbble, LinkedIn,
  YouTube, Vimeo, Instagram, Facebook, Google Sites) get no Verify button, because nobody can add a code to those
  pages.
  `juan.github.io`, `juan.vercel.app` and `juan.netlify.app` count as own websites.
- The badge lasts 90 days, then the freelancer clicks "Check again". The freelancer keeps the line on the site.
- One check per link every 30 seconds, and at most 10 codes per person.
- Badge text: "Verified owner", with the date it was checked.

## Steps

### Step 1. Database (migration `site_verifications`). Needs the user's go.
1. New table `site_verifications`:
   - `id uuid` primary key, `freelancer_id uuid` (the profile, removed with it), `link text` (the saved link),
     `code text` (unique, `pf-` + 10 letters/digits), `verified_at timestamptz` (empty = not verified yet),
     `checked_at timestamptz` (last try, for the 30-second limit), `created_at`.
   - One row per person per link (`unique (freelancer_id, link)`).
2. Row level security on: a freelancer can read only their own rows. No insert or update rules for users, so only
   the AI service (which has the service key) can write a code or mark a link verified. Nobody can turn the badge
   on from the browser.
3. Function `verified_portfolio_links(p_user uuid)`: returns only that person's links verified in the last 90 days
   that are still in their Portfolio Links (link + date, never the code). Anyone viewing a profile can call it.
4. Tried first in a rolled-back trial on the live database; test file `database/test_site_verifications.sql`.

### Step 2. AI service
1. New `ai-service/site_check.py`, the part that visits the site safely:
   - https links only.
   - Refuses addresses inside a network (localhost, 192.168.x.x, 10.x.x.x, cloud-internal addresses): every address
     the site name points to must be a public internet address.
   - Gives up after 5 seconds and reads at most the first 512 KB of the page.
   - Follows at most 3 redirects, and only within the same site (`juan.dev` to `www.juan.dev` is fine; a redirect to
     another site fails, so a link on a big site that forwards elsewhere can't borrow someone else's badge).
   - Looks only for `<meta name="philfreela-verification" content="...">` in the page's HTML (Python's built-in
     HTML reader). A code typed into a comment box on someone else's page doesn't count.
   - Uses `httpx`, which is already installed with the `supabase` package. No new package.
2. `ai-service/main.py`, two new endpoints (both need a login):
   - `POST /sites/code` with `{ "link": "https://juan.dev" }` returns `{ "code": "pf-7k3q9x2m", "verified_at": null }`.
     The link must be one of the caller's saved Portfolio Links and not on a shared site. Makes the code (Python
     `secrets`) the first time, then returns the same one.
   - `POST /sites/check` with `{ "link": ... }` returns `{ "verified": true, "verified_at": "..." }` or
     `{ "verified": false, "message": "We couldn't find the code on juan.dev. ..." }`. Saves `checked_at` every time
     and `verified_at` when the code is found.
3. `ai-service/test_site_check.py`: a small local web server with test pages (code there, missing, wrong code, code
   only in the page text, redirect to another site, private address, http).

### Step 3. Website
1. `client/src/lib/aiService.js`: `getSiteCode(link)` and `checkSite(link)`.
2. `client/src/lib/profile.js`: `canVerifyLink(link)` (own website or not, using the shared-site list next to the
   link icons), `fetchSiteVerifications(userId)` (own rows) and `fetchVerifiedLinks(userId)` (the function above).
3. `client/src/pages/dashboard/components/PortfolioLinks.jsx`:
   - The freelancer's own box: each own-website link gets a "Verify" button, then "Verified" (green) or
     "Check again" after 90 days.
   - Verify opens a pop-up with 3 steps: copy the line (Copy button), paste it inside `<head>` of that page and
     publish, click Check now. Clear messages when it fails (site can't be reached, code not found, wait 30 seconds,
     the AI service isn't updated yet).
   - The public list: a check-mark badge "Verified owner" with "Checked Nov 15, 2026".
4. `client/src/pages/dashboard/views/PublicProfileView.jsx`: loads the verified links and passes them to the list.
5. `client/src/pages/legal/TermsAndPrivacy.jsx`, the portfolio links line gets: "A Verified owner mark means the
   freelancer proved they control that website by putting a PhilFreela code on it, and PhilFreela visits that one
   page when they click Check now. It doesn't prove who designed the site."

## How it will be tested
- Database: rolled-back trial (only the owner reads the code, nobody can mark a link verified from the browser,
  the function hides old, unverified and removed links).
- AI service: the local test pages above, plus the route tests with a pretend database.
- Website: the scratchpad test bench (pretend Supabase and AI service), phone and computer widths, light and dark.
- Real try after it's live: verify a real website. PhilFreela's own site works for this: add
  `https://phil-freela.pages.dev` as a portfolio link and put its code in `client/index.html`.

## Limits (for the panel)
- It proves control of the site, not who designed it. A bought template can be verified too. Clients still judge
  the work itself, and stolen work can be reported.
- Sites built for clients usually belong to the client, so the freelancer can't add the code: those stay plain
  links unless the client adds the code for a moment.
- Some free website builders (Google Sites, some Wix plans) don't let people edit the `<head>`, so those can't be
  verified. Sites that add the line with JavaScript after loading fail too: it must be in the page's HTML file.
- Answer for the panel: "Verified owner means the freelancer proved they control that website, the same way Google
  checks website owners. It doesn't prove they designed it."
