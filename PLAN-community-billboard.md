# Plan: a Community Billboard, where users post their own (paid) ads

Status (2026-10-28): approved by the user ("ok", after the mockups in PhilFreela-Mockups/,
which are not committed).

- Step 1 (database): LIVE (2026-10-28), as three migrations (community_billboard_1_table_and_rules,
  _2_payments, _3_picture_bucket; database/supabase_community_billboard_schema.sql). Tried first on the
  live database as one rolled-back block (the schema plus database/test_community_billboard.sql):
  41 checks passed, nothing left behind. The first apply_migration was refused by Claude Code's
  permission check ("dangerous", no reason); after the user said "go" the retry went through, all
  three pieces. Checked afterwards: the table has row security on and only SELECT for signed-in
  users (nothing for anon, no direct writes), the mask trigger is enabled, the member functions
  run for signed-in users only, finish_online_checkout is still server-only, no leftover rows, the
  bucket is public 2 MB with its 4 rules, the prices are 149/299/499 (Premium 75/150/250). The same
  41 checks passed again on the applied schema, and the old test_premium.sql (36 checks) passed
  too, because finish_online_checkout and admin_promo_earnings were replaced.
- Step 2 (server): supabase/functions/pro-checkout now takes { action: "start", ad } (the owner's own
  approved ad: start_ad_checkout as the person, the page for the database's price, back to
  /dashboard/advertise?checkout=<id>; an ad together with a code, a service or a job is refused; a
  made-up id is "not found" without asking anyone) and "version" says 3. The webhook is unchanged.
  Tested in Node against a pretend Xendit and database: 93 checks (the 79 from before and 14 new),
  0 failed. NOT deployed: the deployed pro-checkout (v4) would open a PREMIUM page for an ad, so
  the website must not offer ad payments until it answers version 3 (lib/checkout.js checks the
  number), and the deploy needs the user's go.
- Step 3 (website, user side): built and pushed. The Advertise page (/dashboard/advertise, an
  "Advertise" link last in both side menus): the form (headline, message, picture, who sees it, the
  button, 3 / 7 / 14 days with the normal or Premium price, a live preview, the checks the database
  also makes) and "My Ads" with every status (waiting, approved with Pay and Withdraw, rejected with
  the reason, running, ended, withdrawn, taken down) and "N of 5 spots in use". Pay goes to Xendit
  only when pro-checkout answers version 3 (lib/checkout.js onlinePaymentsReady(3)); until the
  server is deployed an approved ad says paying online is not open yet. Coming back from Xendit the
  dashboard says "Your ad is on the Community Billboard now" and the page reads its ads again. The
  strip "Community Billboard" on the dashboard home of both roles (components/DashboardMemberAds.jsx,
  under the Billboard): the ads running for that person take turns like the Billboard, each "Ad by
  <name>" with the Verified check and the Premium pill, an optional button to the poster's own offer,
  job post or profile, hidden when nothing runs. Tested in a real browser against a pretend backend,
  laptop and phone: 89 checks, 0 failed. The older suites against the changed menus, layouts and
  checkout helper: Premium 72, Post a Project 30, Featured and billboards on Xendit 96, the
  freelancer's full tour 538 and the client's 514, all passed.
- Step 4 (website, admin side): built and pushed. Admin > Site > Community Billboard
  (/admin/community-billboard, any admin, a number on the menu link for the ads waiting): Waiting
  for review (Approve, or Reject with a reason box and "Send rejection"), Running now (Take down with
  a reason) and History, each ad drawn with the same card the members see, with the price (the
  Premium price when the poster has Premium). lib/adminMemberAds.js holds the reads and the two calls
  (review_member_ad, take_down_member_ad). Two places that would have broken on the first paid ad
  were fixed: the Promotions History now labels the kind "Community ad", and the Overview Earnings
  list "Community ads (N)" (a database without the new number shows 0 instead of crashing).
  Tested in a real browser against a pretend backend, laptop and phone: 48 checks on the admin
  page, 12 on Promotions History and Overview Earnings, 0 failed; the older Featured and billboard
  suite (96) passed against the changed admin layout; lint shows only the two old warnings, build
  clean.
- Step 5 (words): built and pushed. The full tour of both roles has three more notes after Premium
  (the "Advertise" menu link, the form "Send an ad", and "My Ads"; the "Your menu" note names
  Advertise too). Terms of Service: the intro and a new bullet in "PhilFreela's own fees" (verified
  members, an admin approves first, the poster pays after on Xendit, 3 / 7 / 14 days, half price with
  Premium, 5 at once, no links, taken down with a reason, no automatic refunds, test mode like
  Premium); the Featured bullet now says it can be paid on Xendit (the GCash way stays for when online
  payment is not open), which was already true since the Featured payments went online. Privacy
  Policy: the fees list says what is kept for ads and Xendit payments, a new "Ads you send" bullet
  (what an ad holds, who sees it, never email or phone number), Xendit's page also for a Featured
  post or an ad, and the ads are removed with the account (an ad's picture file stays in storage but
  nothing shows it). PhilFreela-System-Functions.md: the online-payment line, the Featured row, a new
  Community Billboard row and the admin page. Tested in a real browser, laptop and phone: the full
  tours 586 (freelancer) and 562 (client) checks, 0 failed, and the Terms page 18 checks, 0 failed.
- LEFT: deploy pro-checkout v5 (adds the ad payment, version 3). It needs the user's go. Until then
  an approved ad shows "Paying online is not open yet" and Pay is off; nothing is lost.

The user asked (2026-10-28): "user can post in the billboard, how?" and then "can you
make billboard for user's and billboard for super admin". So there are TWO boards:

- **Billboard** (exists, unchanged): only the super admin posts. Welcome messages,
  announcements and sponsors' ads (a business pays by GCash/cash or by a Xendit link).
- **Community Billboard** (new): freelancers and clients post their own ads, pay for
  them on Xendit, and an admin approves each ad first.

## What people see

- Dashboard home (both roles): the usual Billboard on top, and under it a
  "Community Billboard" strip. It only shows when ads are running. Ads take turns
  (8 seconds each, like the Billboard), each tagged "Ad by <name>" (with the Verified
  and Premium badges), with an optional button that opens one of the poster's OWN
  offers, job posts or their profile (inside PhilFreela only, no outside links).
- A new "Advertise" link in both side menus. The page has the form (headline up to 80
  characters, message up to 300, an optional picture, who sees it: everyone /
  freelancers / clients, and how long: 3, 7 or 14 days) with the price (half price
  with Premium), and "My ads" with the status of each: Waiting for review, Approved
  (Pay now), Rejected (with the reason), Running until <date>, Ended, Taken down.
- Admin: Site > Community Billboard (any admin): Waiting for review (Approve / Reject
  with a reason), Running (Take down with a reason), History. A number on the menu
  link shows how many are waiting, like Promotions.

## Rules (defaults the user can change)

- Every VERIFIED account can post (not suspended or blocked), the same rule as posting
  offers and jobs.
- The admin approves FIRST, and the poster pays AFTER, so nobody pays for an ad that is
  rejected and no refunds are needed. The ad runs for the bought days from the moment
  it is paid.
- Prices in Admin > Promotions (the super admin edits them, like the boost prices):
  ad_3 / ad_7 / ad_14 = 149 / 299 / 499 pesos, Premium half price (75 / 150 / 250).
- At most 5 ads run at once (like the 3 Featured spots); a person can have at most 3
  waiting for review. No links in the text; bad words are hidden like everywhere else.
- Money goes to PhilFreela and counts in Earnings as "Community ads" (test-mode money is
  left out, as for the other fees).

## Database (one migration, tried first as a rolled-back block on the live database)

- New table `member_ads`: owner, title, message, image_path, audience, price_code, days,
  one optional link (own service / own job / own profile), status (pending, approved,
  rejected, paid, canceled, removed), reject_reason, reviewed_by/at, starts_at/ends_at
  (set when paid). "Running" = paid and between the two dates. The browser can only READ
  (own ads, admins all, everyone the running ads meant for them); every change goes
  through security-definer functions.
- Functions: request_member_ad, withdraw_member_ad, review_member_ad (admin, logged in
  the Activity Log, notifies the owner), take_down_member_ad (admin), member_ads_slots_left,
  start_ad_checkout (owner, approved, a free spot, 10 pages per hour, Premium price).
  finish_online_checkout gets one more branch: the ad goes live and the owner is told.
  admin_promo_earnings gets "member_ad" in by_kind.
- Small changes to what exists: `online_checkouts.ad_id`; `promotions_kind_check` and
  `promotions_target` accept the kind 'member_ad'; three rows in `promo_prices`; the
  trigger `member_ads_mask_words` like services/job_posts; a public bucket
  `member-ad-images` (JPEG, 2 MB, owners write in their own folder). The notification
  types 'promotion_approved' / 'promotion_rejected' are reused (no new type).

## Server (the payment helper)

- pro-checkout "start" also takes { code: ad_3 | ad_7 | ad_14, ad: <id> } and sends the
  person back to /dashboard/advertise?checkout=<id>; "version" becomes 3. The webhook
  needs NO change: an ad is paid as the person's own payment (online_checkouts), which
  the deployed webhook already handles. pro-checkout has to be deployed again (needs
  the user's go).

## Website

- lib/memberAds.js, lib/checkout.js (startAdCheckout; the return toast says "Your ad is
  live now" on the Advertise page), views/AdvertiseView.jsx with its form and "My ads"
  cards, components/DashboardMemberAds.jsx (the strip) in both dashboard layouts,
  "Advertise" in both side menus, the route, the page title, and one tour note each.
- Admin: views/AdminMemberAdsView.jsx, lib/adminMemberAds.js, route /admin/member-ads,
  the menu link with its badge, the label "Community ad" in Promotions and the Earnings
  numbers on the Overview. (The route became /admin/community-billboard.)
- Words: Terms and Privacy (ads, Xendit), PhilFreela-System-Functions.md, this plan, memory.

## Steps (each one tried, tested, committed and pushed)

1. Database: table, functions, prices, bucket, constraints. A SQL test file
   (database/test_member_ads.sql) tried on the live database and rolled back, including
   the old Featured / Premium / billboard checks again, then applied.
2. Server: pro-checkout v5 with the ad payment (tested in Node against a pretend Xendit),
   deployed once the user says go.
3. Website, user side: the Advertise page, the strip on the dashboards, the return toast,
   menus and tour notes.
4. Website, admin side: the Community Billboard page, labels and earnings.
5. Words: Terms, Privacy, System Functions, plan and memory.

## Not included (on purpose)

No click or view counting for ads, no automatic refunds (a rare case is handled by
message, like Featured), no editing after submitting (withdraw and submit again), no
video, no outside links, no choosing a start day (it starts when paid).
