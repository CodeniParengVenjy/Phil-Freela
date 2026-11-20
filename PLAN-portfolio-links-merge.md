# PLAN: Portfolio Links move into the Portfolio highlight, and there is no 3-link limit (2026-11-20)

The user looked at the Profile page and said the Portfolio Links "aren't separate from the portfolio highlights", asked
to merge them, and asked how a freelancer showcases their website. After a plan in chat they answered: "Same card +
website in the film" and "no limit", then "ok".

## What was there

- Own Profile: a Portfolio Links card of its own (Skills, Portfolio Links, Social Accounts, ... the Portfolio highlight
  card far below).
- A visitor's page: a separate Portfolio Links card above Services, the highlight card at the bottom.
- The highlight film: its Profile chapter showed the links as plain text (not clickable).
- The rule: at most 3 links (database check + `MAX_PORTFOLIO_LINKS` in lib/profile.js); the film showed 4.

## The plan (5 steps)

1. Database (migration `portfolio_links_no_limit`): `portfolio_links_ok()` allows up to 50 links instead of 3
   (https only and 200 characters each stay). 50 is a quiet ceiling so nobody can stuff one row with thousands; the
   website never shows it unless someone reaches it.
2. Own Profile: the links box moves inside the Portfolio highlight card, under the poster ("Websites & links",
   + Add Link, Verify, badge, all as before). The separate card is removed.
3. A visitor's page: the same links sit inside the Portfolio card, under the poster, as pills that open in a new tab
   with the Verified owner badge and the "PhilFreela doesn't check what's on them" note. They show even when the
   freelancer has no projects yet. The separate card is removed.
4. The film: in the Profile chapter every link is a real `<a>` card (name, Verified owner badge, "Visit website"),
   opens in a new tab; a click on an `<a>` already does not move the film on. A computer shows the first 3, a phone 2,
   then "+N more on the profile".
5. Texts and tests: "Add up to 3 links" wording gone, rolled-back SQL test, mocked-network browser test (own Profile,
   visitor page, film; dark and light; phone, tablet, computer).

## Defaults chosen

- Quiet ceiling of 50 links (see step 1).
- The AI service keeps its 10 codes per person (only own-website links get a code).
- Social Accounts stay separate (the round logo buttons under the name).

## Status

- Approved 2026-11-20 ("ok").
- Step 1 database: LIVE (migration `portfolio_links_no_limit`, rolled-back trial 12/12 PASS first; be35731).
- Steps 2-5 website: built and tested on this laptop with a fake database. Pages test 33/33 (own Profile, visitor page,
  client, 50-link ceiling, phone, light theme); film test 21 checks in all six looks on a computer and in Director's
  Cut, Paper and Retro on a phone.
- Phone tweaks made after the first run: a phone card has no "Visit website" words (a small arrow instead), "+N more
  links" shares the row of the second card, and the film's link rows are a little closer together. Known limit: Retro on
  a phone with a very long profile (5 skills, a long description, 9 accounts) was already cut off at the top before
  (picture top -76 px), now -98 px; every other look is where it was or better.
- Not tried yet by a real person: adding real links and opening them from someone else's profile.
