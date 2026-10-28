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
- Steps 2 to 5: next.

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
  numbers on the Overview.
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
