# Plan: Freelancer Pro becomes Premium, for clients too, and paying online

Request (2026-10-27): the badge should be seen by the person and by everyone;
more perks; rename "Freelancer Pro" to Premium for both clients and
freelancers; at least 3 perks that are really usable on the site. Then: more
perks (picked: profile views; the gradient look and a custom watermark as
Premium perks), and boosting (Featured) and sponsored billboards paid through
Xendit too ("Both").

## What is there now

- Freelancer Pro, freelancers only, ₱149 for 30 days, paid online (Xendit,
  test mode: GCash, Maya, QR Ph). Perks: up to 15 offers instead of 3, a gold
  Pro badge, half-price Featured posts.
- The badge shows only to other people (Browse Services cards, the offer
  page, the public profile), not on the person's own pages.
- The database refuses Pro for clients (start_online_checkout,
  request_promotion).
- Featured (boosting): GCash to PhilFreela + 13-digit reference + receipt +
  an admin checks by hand. No PhilFreela GCash number is saved on the live
  database, so nobody can boost yet (0 requests).
- Sponsored billboard: no payment on the site; the super admin types the
  sponsor, amount and payment reference.
- Gradient theme (Settings > Appearance, two colors): free for everyone;
  4 people use one.
- Watermark (Settings > Watermark Settings, freelancers): 3 colors (white,
  black, orange), 3 sizes, one font (the site's own); drawn on photos by the
  AI service (visible_watermark.py). Videos only get the hidden mark.
- Another session is moving Pro to its own page right now (/dashboard/pro,
  ProView.jsx, ProPlans.jsx, the menu item, pro-checkout,
  supabase_online_pro_schema.sql), not committed yet. This plan starts after
  that is committed and builds on it.

## Premium: the perks (₱149 for 30 days, both roles)

Kept:
1. Gold Premium badge by your name: now also on your own pages, for clients too.
2. Freelancers: up to 15 offers instead of 3.
3. Half-price Featured posts (offers and job posts).

New:
4. One free Featured post every 30 days (3 days; an offer or a job post).
5. Views on your posts: how many people opened each offer or job post.
6. Profile views: how many people opened your profile in the last 30 days.
   (Counts only, never who. Free accounts see a hint instead of the number.)
7. Bigger chat files: 50 MB per file instead of 10 MB.
8. Gradient look (two-color theme in Appearance): Premium only. Free keeps
   one accent color. The 4 people who use a gradient keep it saved; it shows
   again whenever they have Premium.
9. Custom watermark (freelancers): any color (a color picker), 4 fonts, and
   extra-small / extra-large sizes. Free keeps today's 3 colors, 3 sizes and
   the site's font. Only new uploads change.

## Paying online (Xendit) for boosting and billboards

- Featured: Feature > pick 3, 7 or 14 days > Xendit's page > Featured at once
  (half price for Premium). No receipt, no admin check, no PhilFreela GCash
  number needed. The same checkout and webhook as Premium, one more kind.
- Sponsored billboard: the super admin fills in the billboard and the price;
  the site makes a Xendit payment link to send to the sponsor (no PhilFreela
  account needed). It shows from its start date once Xendit says it is paid;
  until then it is marked "Waiting for payment". The admin's Promotions page
  and Earnings count it.
- Xendit is in test mode: real money needs Xendit's business verification.

## Steps (each one tried, tested, committed and pushed)

1. Database: Premium for both roles; free Featured (use_free_feature); views
   (one table for post and profile views, counts given only to Premium
   owners); chat files 50 MB with a rule refusing over 10 MB without Premium;
   gradient and the new watermark choices refused without Premium; online
   checkout for Featured and for billboard links. Tried on the live database
   first, rolled back, then applied.
2. Server: the checkout function and the Xendit webhook handle Featured and
   billboard payments (same safety: every payment checked with Xendit before
   anything is given).
3. Website: Premium name everywhere; the Premium page and menu item for
   clients too; the badge wherever a name shows; Featured paid on Xendit's
   page; the admin's billboard payment link.
4. Website + AI service: the perks on their pages (free Featured button, view
   counts, profile views, 50 MB in chat, gradient in Appearance, watermark
   colors / fonts / sizes and their preview; the AI service draws them).
5. The tour's notes, the System Functions file and the Terms say Premium.

No change to "Recommended for you": paying never moves anyone up the AI's
ranking (Featured posts stay in their own labelled row).

## Progress

- Step 1 (database): live 2026-10-27 as migrations premium_1_payments,
  premium_2_views_chat_watermark and premium_3_billboard_payments
  (database/supabase_premium_schema.sql), after a rolled-back trial on the
  live database with database/test_premium.sql: 36 checks, 0 failed,
  nothing left behind. The gradient rule is its own file
  (supabase_premium_gradient_schema.sql) and goes live with the website step
  that shows the gradient as Premium; until then the old Appearance page
  keeps working for everyone. The older GCash request_promotion was left as
  it is (the website no longer uses it for Premium).
- Step 2 (server): written and tested (pro-checkout: Featured posts and the
  super admin's billboard links; xendit-webhook: billboard links too), NOT
  deployed yet: deploying Edge Functions was refused by Claude Code's
  permission check, so it waits for the user (deploy both, with
  --no-verify-jwt as before). Until then the website must not send Featured
  payments to Xendit: the old pro-checkout ignores the post and would open a
  Premium page instead.
- Steps 3 and 4 (website), first part, 2026-10-27: Premium in every word the
  person sees (page, menu, badge, prices, notifications, admin pages, Terms);
  the Premium page and menu item for clients too; the badge by the person's own
  name (menu card, top bar, My Profile) and by other people's (public
  profiles of both roles, job rows, the job page); opening an offer, a job post
  or someone's profile counts a view; Premium sees "N views" on My Services and
  profile views on My Profile and the Premium page; "Feature free" on My
  Services; chat documents up to 50 MB with Premium; the gradient in Appearance
  locked without Premium (a second color saved earlier is kept, not shown).
  The gradient rule (supabase_premium_gradient_schema.sql) goes live right
  after this website step. Still to do: the watermark choices (form, preview,
  AI service); on Post a Project the free Featured and the view counts, and
  the tour's words (both wait for the other session's edits of those files);
  Featured paid on Xendit and the admin's billboard link (wait for Step 2's
  deploy).
