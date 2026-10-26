# Earning plan: sponsored billboards, featured posts, Freelancer Pro

Saved 2026-10-25 after the user said "ok", "you manage the plan prices" and
"yes gcash". Step 1 (database) was approved with "ok ok ok" and is built and live
since 2026-10-25 (migrations promotions_tables and promotions_functions); nothing
on the website used it until Step 2 (sponsored billboards) and Step 3 (the admin
Promotions page and the Overview's Earnings), all built the same day. Step 4
(Featured post: the pay screen and the Featured row) was built on 2026-10-25 too.
Step 5 (Freelancer Pro) was built on 2026-10-26; Step 6 (wording and demo data) is not started.
To continue in a new Claude session, say: "Read PLAN-monetization.md and
continue from the current step."

Each step gets its own detailed plan, approved by the user, before any code.

Page version of the plan (private, opened from the user's Claude account):
https://claude.ai/artifact/PbWFK7KahKjMpndj5PgvRv

## Why

The user asked how the site can earn. As built it cannot: the GCash payments
record money between a client and a freelancer, and PhilFreela never touches it.
So the site earns from things it sells itself, with no commission and no payment
gateway. Three ways, one shared way to pay.

## Three ways to earn

1. **Sponsored billboards.** A business pays; an admin posts its banner on the
   dashboard billboard, marked "Sponsored by ...". It has a start date and an end
   date and stops showing by itself. (The user's "how it lasted" was read as this
   duration; the user said "ok" to it.) Only admins create them; a sponsor cannot
   buy one in the app. The admin records the amount and reference on the billboard.
2. **Featured post.** The owner of a service offer or an open job post pays to
   appear in a separate, labeled "Featured" row (at most 3 at a time) at the top
   of Browse Services / Find Jobs for 3, 7 or 14 days.
3. **Freelancer Pro.** A freelancer pays for 30 days of: a Pro badge, up to 15
   active offers (free accounts: 3), and half price on featuring.

## How a fee is paid (the same for featured and Pro)

PhilFreela's own GCash number, checked by an admin by hand. No gateway, nothing
automatic.

1. The person picks what they want and sees PhilFreela's GCash name, number, QR and the price.
2. They pay in their own GCash app. The site is not part of that step.
3. They send the 13-digit reference number and a receipt screenshot (required).
4. An admin checks PhilFreela's own GCash and taps Approve or Reject (a reason is
   required when rejecting). The person is notified either way.
5. On Approve the period starts; the end date makes it stop by itself (nothing
   runs on a timer: every list just compares the end date with now()).

## Not for sale

- The recommendation order ("Recommended for you" stays ranked by ratings,
  completed projects and response time). Featured posts sit in their own row.
- Identity verification (eKYC), the verified badge and ratings stay free.
- Money between users: the site still never touches it.

## Decisions already made (do not ask again)

- Prices (the user said "you manage the plan prices", so these are final unless
  the user changes them; a super admin can change them in the price table):
  - Featured: 3 days P49, 7 days P99, 14 days P179. Pro members pay P25 / P50 / P90.
  - Freelancer Pro: 30 days, P149.
  - Sponsored billboard: the price is agreed with the sponsor; the admin records it.
- Payment method: GCash to a PhilFreela number. The number is NOT in the code; a
  super admin types it into the Promotions page. For the demo a clearly fake
  number is used until the user gives the real one.
- Free accounts: 3 active offers, Pro: 15. A freelancer who already has more
  keeps them and just cannot add more. Live check on 2026-10-25: the most any
  freelancer has is 3, so nobody is over the limit.
- Profile view stats are NOT part of Pro (they need a new tracking table and
  Data Privacy Act care). Left for later.
- The Review of Related Literature (RRL) was offered; the user has not asked for
  it yet. Sources found are listed at the end of this file.

## What was found in the live database (2026-10-25)

- `profiles`, `services` and `job_posts` give the signed-in role table-wide UPDATE
  (guarded only by "your own row"). A new column such as `pro_until` or
  `featured_until` on those tables would let a person give themselves Pro or a
  featured spot for free. So the end dates live in their own tables that no
  browser can write to (`pro_members`, `featured_posts`), written only by the
  approve function.
- `dashboard_billboards` only allows updating `is_active` (column grant), so new
  columns there are safe; `ends_at` is added to the allowed ones so a sponsorship
  can be extended.
- `user_notifications` has 22 kinds (the last is `payment_requested`); this adds
  `promotion_approved` and `promotion_rejected`.
- `admin_log.action` has no promotion kind; this adds `promotion`.
- Admin roles are `admin` and `super_admin`. Any admin approves or rejects; only
  a super admin sets PhilFreela's GCash number and the prices.
- Live counts: 6 services, 11 job posts, 1 billboard, 11 freelancers, 30 profiles.

## Steps

1. **Database for fees.** (detail below) BUILT AND LIVE 2026-10-25.
2. **Sponsored billboards.** BUILT 2026-10-25 (no database change). Admin >
   Billboard (super admin only) form: First Day (starts as today), Last Day,
   Sponsor's Name, Paid (P), GCash Reference. The days are whole days in Manila
   time and the last day is shown in full (the database end is the start of the
   day after it). A sponsor needs a last day; a welcome message can run with no
   end. Posted list: Running / Scheduled / Ended / Off badge, "Sponsored by X",
   the days, what was paid and the reference (admin only), "Change last day"
   (extend, or remove the end of a non-sponsored one), Switch off, Delete. The
   user dashboard shows a "Sponsored by X" tag; the database already hides a
   billboard outside its dates. Files: `lib/billboards.js` (date helpers,
   `checkSponsorship`, `checkNewEnd`, `billboardState`, `setBillboardEnd`),
   `AdminBillboardView.jsx`, `DashboardBillboard.jsx`. Tested in a real browser
   against a pretend table with the database's rules: 47 checks, laptop and phone,
   dark and light (it found a long sponsor name stretching the admin page on a
   phone; fixed with `text-wrap`); lint and build clean. Not tried on the live
   site (no test billboards were posted on the live database).
3. **Admin Promotions page.** BUILT 2026-10-25 in two commits. 3a (database):
   `admin_promo_earnings()` (admin only; `database/supabase_promo_earnings_schema.sql`,
   test `test_promo_earnings.sql`, 14 checks passed; applied as the migration
   admin_promo_earnings). 3b (website): Admin > Site > Promotions, visible to every
   admin with a red number for waiting requests. Tabs: Waiting (oldest first; kind,
   amount, days, title, the person's link to Users, the reference with Copy, View
   receipt on a 60-second signed link, Approve with a confirm popup, Reject with a
   reason of 3 to 200 characters; a request whose offer or job post was removed
   can only be rejected), Running now (Featured offers and job posts "N of 3
   spots used", Pro members, ended ones left out), History (last 50, who answered,
   the reason, the days an approved one ran) and Settings (a super admin sets
   PhilFreela's GCash number, name and QR picture, and the two prices of each
   option; other admins see them read-only). A banner on Waiting says nobody can
   pay while no GCash number is set. The Overview has an Earnings part (earned in
   total, this month, waiting, where it came from, running now), and the Activity
   Log labels the new "promotion" entries. Files: `lib/promotions.js`,
   `AdminPromotionsView.jsx`, `components/PromotionRequestCard.jsx`,
   `components/PromotionSettings.jsx`, plus small edits to `AdminLayout.jsx`,
   `App.jsx`, `pageTitles.js`, `AdminLogView.jsx`, `AdminOverviewView.jsx`. Tested
   in a real browser against a pretend backend that applies the database's rules:
   59 checks, 0 failed (laptop and phone at 390px; the admin panel has no light
   mode), lint and build clean. Not tried on the live site: no GCash number was
   put into the live database, so the Waiting banner will show until a super
   admin types the real number in Settings.
4. **Featured post.** BUILT 2026-10-25 in two commits (detail below, approved
   with "ok"): "Feature" on My Offers and My Job Posts, the pay screen, the
   Featured row (max 3, badge) in Browse Services and Find Jobs. 4a = the owner's
   side (commit 55330f1, 59 browser checks), 4b = the row (37 browser checks).
   An offer of a freelancer who is not verified yet gets no Feature button
   (clients can't see it). No GCash number is in the live database, so the pay
   window says "Payments for Featured posts are not open yet" until a super
   admin types one in Admin > Site > Promotions > Settings. Not tried on the
   live site; the Featured row was not tested together with the AI's
   "Recommended for you" picks (the split happens after the AI's order is set).
5. **Freelancer Pro.** BUILT 2026-10-26 in three commits (detail below, approved
   with "ok"): a Freelancer Pro tab in Settings (no new menu button) with the same
   pay flow, the offer limit message in My Offers, the Pro badge on Browse
   Services, the offer page and the public profile. 5a = buying Pro (1183d08, 44
   browser checks), 5b = the offer limit (a2a694b, 27 checks), 5c = the badge (20
   checks). The Feature pay window was renamed PromoPayDialog and serves both.
   The badge uses one request for "who is Pro now" per page (`useProIds`), not one
   per card. Not tried on the live site: no GCash number is in the live database,
   so the Go Pro window says "not open yet" until a super admin types one in
   Admin > Site > Promotions > Settings.
6. **Wording and demo data.** PARTLY DONE 2026-10-26: PhilFreela-System-Functions.md (ade26b1: Scope line + "How PhilFreela earns" + Xendit in the tech stack), the Terms and Privacy page and "Download your data" (7a5b445: "charges no fees" gone, a "PhilFreela's own fees" section, Xendit under limited sharing, fee records in the download). STILL OPEN, waiting for the user: the Word/PDF defense study guide and the paper (outside the repo, in OneDrive) and demo data on the live site (needs an explicit ok: it would show to real users). Original step: Update PhilFreela-System-Functions.md (Feature 5
   "Scope" line says "no payment or money features"), the defense study guide and
   the paper's "no payments" line; sample data for the defense (a made-up
   sponsor, one pending request, one approved Featured post).

## Step 4 detail: Featured post (approved 2026-10-25)

No database change: everything it needs is live from Step 1 (`request_promotion`,
`featured_slots_left`, `is_pro`, `promo_prices`, `site_gcash`, the private
`promo-receipts` and `promo-qr` buckets, `featured_posts` readable by everyone
signed in). A browser can only READ the end dates.

4a. The owner pays to feature (own commit):
1. `lib/featured.js` (new): reads the prices, PhilFreela's GCash row and QR link,
   whether the person is Pro, their own requests and what is featured now;
   `sendFeatureRequest` uploads the receipt first, then calls
   `request_promotion`, and removes the upload if the database refuses (the same
   pattern as `recordPayment` in `lib/payments.js`).
2. `components/FeatureDialog.jsx` (new, built like `RecordPaymentDialog.jsx`):
   pick 3 / 7 / 14 days (Pro members see `pro_price`), PhilFreela's GCash name,
   number with Copy, QR and the exact amount; then the 13-digit reference and the
   receipt screenshot (required). The database's plain messages are shown as they
   are ("All 3 Featured spots are taken right now."). While `site_gcash` is empty
   it only says "Payments are not open yet".
3. One small "Feature" button on each offer row (`ServicesView.jsx`, through
   `ServiceCard.jsx`) and each OPEN job post row (`PostNeedView.jsx`). It is
   replaced by a badge when it applies: "Featured until <date>" (the button
   becomes "Extend") or "Waiting for review" (no button).
4. `lib/notifications.js`: icon and wording for `promotion_approved` and
   `promotion_rejected` (a rejection shows the admin's reason).

4b. The Featured row (own commit):
5. Browse Services and Find Jobs (NOT the admin copies, `isAdmin`): the posts
   whose `featured_until` is still in the future move out of the normal list into
   a "Featured" row on top, with a star badge and a small "Paid placement" note.
   It uses the list already loaded, so the usual hiding rules still apply (an
   unverified freelancer's offer, a filled or expired job).
6. The row follows the search and the filters (category; one-time or ongoing).
   "Recommended for you" is not touched: paid posts never get a place in the
   AI's order. A featured post is not repeated in the normal list below. The row
   is hidden when nothing is featured.
7. Nothing runs on a timer: the row compares `featured_until` with now().
8. Paying again for a post that is already featured extends it and needs no new
   spot (the database does this).

Testing: a real browser against a pretend backend that applies the database's
rules (laptop and phone, dark and light), lint and build. Not tried on the live
site: no GCash number is in the live database yet.

Built as planned, plus: the Feature button is hidden for an offer of a freelancer
who is not verified and for an account suspended from posting; the pay window
checks the free spots before it shows the payment details, so nobody pays for a
spot that is gone; `components/FeaturedMarks.jsx` (the "Featured / Paid placement"
title and the badge) is shared by both lists; the two list pages build their
cards through one small function each (`renderService`, `renderJob`) that the
Featured row and the normal list both call.

## Step 5 detail: Freelancer Pro (approved 2026-10-26)

Pro = 3 things, nothing more (the user asked "the things that pro have than
regular accounts" and kept the three): up to 15 offers (free: 3), a gold "Pro"
pill by the name, and half-price Featured (P25 / P50 / P90 instead of P49 / P99 /
P179). P149 for 30 days; paying again before it ends adds 30 more days. Not part
of Pro: the "Recommended for you" order, verification, ratings, profile view
stats. Ideas looked at and left out: more files per offer or per portfolio item
(10 now, needs a database change too), a higher new-chat limit (a spam guard, not
for sale).

No database change: everything is live from Step 1 (`request_promotion('pro_30')`,
`approve_promotion` extends a running Pro, `is_pro`, `pro_members` readable by
everyone signed in, the `limit_offers` trigger on `services`: 3 free, 15 Pro).

5a. Buying Pro (own commit):
1. `lib/pro.js` (new): the limits (3 and 15), `useProStatus(userId)` (until when,
   or a payment waiting, reload) and `useProIds(ids)` (which of these people are
   Pro right now, like `useVerifiedIds`).
2. The Feature pay window becomes reusable instead of copied: `FeatureDialog.jsx`
   is renamed `PromoPayDialog.jsx` and gets a Pro mode (no day picker, one option:
   30 days P149; same GCash block, reference and receipt; "Payments are not open
   yet" while no GCash number is saved). The Feature window behaves exactly as
   before (its 59 browser checks are run again).
3. `components/ProSettings.jsx` (new) = the new "Freelancer Pro" tab in Settings,
   freelancers only: status ("Free" or "Pro until <date>"), "N of 3 (or 15) offers
   used", what Pro gives with the real Featured prices, and one button: Go Pro,
   Extend, or the "Waiting for review" badge.
4. `SettingsView.jsx` can open a tab from a link: `/dashboard/settings?tab=Freelancer Pro`.

5b. The offer limit (own commit):
5. `ServicesView.jsx`: "2 of 3 offers" in the list heading.
6. At the limit the form shows a notice ("You have 3 of 3 offers. Go Pro for up to
   15." with a link to the Pro tab) and Upload & Publish is off; editing existing
   offers still works. A free account that is over 3 (Pro ended) keeps its offers.
7. If the database refuses anyway (two tabs open), the toast shows the database's
   own sentence instead of "Couldn't publish that service".

5c. The Pro badge (own commit):
8. `components/ProBadge.jsx` (new): a small gold "Pro" pill, text not just an icon.
   Next to the freelancer's name in Browse Services cards, the offer page and the
   freelancer's public profile. Clients never get it; an ended Pro shows nothing.

Defaults: Pro ending changes nothing for existing offers; no cancel button
(payments are final, a wrong one is rejected by an admin who refunds by hand
outside the site); a client who switches to a freelancer account keeps any Pro
they paid for.

Testing: a real browser against a pretend backend that applies the database's
rules (laptop and phone, dark and light), lint and build; the Featured window's
59 checks run again. Not tried on the live site: no GCash number is in the live
database yet.

Built as planned, plus: the Pro status is only trusted once it was read (a Pro
member with 15 offers never sees the free-account notice for a moment, and if it
cannot be read nothing is guessed); an account with more offers than the free
limit (its Pro ended) keeps them and is told it cannot add another; the database's
own sentence is now shown when it refuses an offer (it used to read "Couldn't
publish that service"); `components/ProBadge.jsx` was made in 5a because the Pro
tab shows it too.

## Paying for Pro online (Xendit), asked 2026-10-26

The user said Pro "must have a payment": asked what that meant, they chose "Pay
inside the site" (a real checkout page, Pro starts by itself, no admin check).
PayMongo was the first pick, but its sign-up page was paused ("We're making
sign-up even better... check back soon"), so the user chose Xendit (a payment
company registered with the BSP as a payment system operator, PCI DSS Level 1 by
its own help center) and created an account on 2026-10-26. Test mode works right
after sign-up with no documents; real money needs Xendit's business
verification (up to 14 days). Fees only on real payments. Allowed channels:
GCash, Maya and QR Ph (cards cost about ₱20 on ₱149, so they are left out).

This changes the old "no gateway" rule for PhilFreela's OWN Pro fee only. Money
between clients and freelancers stays the GCash record. Featured posts keep the
GCash + receipt + admin check flow for now. For Pro the checkout REPLACES the
GCash + receipt way (one clear way to pay; the Pro mode of PromoPayDialog goes).

How it works:
1. Settings > Freelancer Pro > Go Pro calls the Edge Function `pro-checkout`
   (action start). It checks who is asking, calls `start_online_checkout('pro_30')`
   as that person (freelancer account, not suspended, price from the price list),
   creates a Xendit Payment Session (POST https://api.xendit.co/sessions,
   session_type PAY, mode PAYMENT_LINK, PHP, PH, channels GCASH / PAYMAYA / QRPH,
   reference_id = our checkout id, no personal data sent) and returns its
   payment_link_url. The browser goes to Xendit's page.
2. The person pays on Xendit's page (test mode: pretend money).
3. Xendit sends them back to /dashboard/settings?tab=Freelancer Pro&checkout=<id>.
   The tab asks `pro-checkout` (action confirm), which asks Xendit
   (GET /sessions/{id}) whether the session is COMPLETED; if so it calls
   `finish_online_checkout` (server only): records the payment once, starts or
   extends Pro, sends the notification.
4. Xendit also calls the Edge Function `xendit-webhook`
   (payment_session.completed / expired, header x-callback-token checked against
   the secret XENDIT_WEBHOOK_TOKEN). It never trusts the message alone: it asks
   Xendit for the session again before giving Pro. So closing the tab early still
   gives Pro, and a fake message gives nothing.
5. Admin > Promotions > History shows "Paid online (Xendit)" with Xendit's
   payment id and a TEST badge for test-mode payments; nothing to approve. Test
   payments are left out of Earnings so the totals stay true.

Database (`database/supabase_online_pro_schema.sql`): `promotions` gets `method`
(gcash | online), `provider_payment_id` and `test_mode`; `reference_no` and
`receipt_path` may be empty for an online payment (a check keeps them required
for GCash). New table `online_checkouts` (one row per payment page opened; the
payer and admins can read, nobody writes from the browser). Functions
`start_online_checkout` (signed-in people) and `finish_online_checkout`
(service role only, locked row, idempotent, amount and test/live must match).
`admin_promo_earnings()` leaves test payments out.

Secrets (Supabase > Edge Functions > Secrets, set by the user, never in chat or
code): XENDIT_SECRET_KEY, XENDIT_WEBHOOK_TOKEN. Webhook URL to set in Xendit:
https://rpopftzrrhuzjxzwobvl.supabase.co/functions/v1/xendit-webhook

LIVE AND WORKING 2026-10-26: migration online_pro_payments, functions pro-checkout and xendit-webhook (v2 accepts Xendit's page id as "id" or "payment_session_id"; Xendit's webhook test was answered 200, so the token matches), website cd85ae4 + b4fb40b. The user's first real test-mode payment went through on the live site: Xendit's page, back to "Payment received", Pro until Nov 25, 2026, 2 of 15 offers. On the user's request the Pro tab was then redesigned as two pricing cards, Free and Pro, with ticks, crosses and one button each (pro.css).

Parts: (1) database, (2) the two Edge Functions in supabase/functions/ (no
outside packages, so they are tested here with Node against a pretend Xendit),
(3) website: Go Pro goes to the checkout, the return message, (4) admin History
and Earnings. Nothing goes live (migration, functions) until the user says ok;
then one real test-mode payment on the live site.

## Step 1 detail: the database

New file `database/supabase_promotions_schema.sql`, applied live as the migration
`promotions`, tested by `database/test_promotions.sql` (rolled back, nothing left
behind).

Tables (all with row level security on, no insert/update/delete for browsers
unless stated):
- `site_gcash`: one row (id is always true) with PhilFreela's gcash_number
  (09 + 9 digits), account_name, qr_path, updated_at. Signed-in people can read it
  (they need it to pay); only a super admin can add or change it.
- `promo_prices`: code (feature_3, feature_7, feature_14, pro_30), label, days,
  price, pro_price (what a Pro member pays; null for pro_30). Seeded with the
  prices above. Signed-in people can read; only a super admin can change a price.
- `promotions`: one row per request. User, kind (feature_service, feature_job,
  pro), price code, the service or job (kept as null with a saved title if the
  post is later deleted, so the money record stays), days, amount charged,
  13-digit reference, receipt path, status (pending / approved / rejected),
  reject reason, who decided and when, starts_at, ends_at. A reference can be used
  once (free again after a rejection). One pending request per post / per person
  at a time. Only the payer and admins can read.
- `featured_posts`: a service or a job post, and featured_until. Signed-in people
  can read (that is how lists know what is featured).
- `pro_members`: user and pro_until. Signed-in people can read (for the badge).
- `dashboard_billboards` gets: sponsor_name (up to 60), amount, payment_ref
  (13 digits, optional), starts_at (default now), ends_at (empty = no end, must
  be after starts_at). The read rule is changed with ALTER POLICY so people only
  see a billboard between its dates; admins still see all. Admins may extend
  `ends_at` afterwards.

Storage (both private): `promo-receipts` (5 MB, JPG/PNG/WEBP; a person uploads
only into their own folder; the uploader and admins can open; an unused upload
can be removed) and `promo-qr` (2 MB; a super admin uploads; signed-in people
can open).

Functions (problems are raised with a plain message the page shows as is):
- `request_promotion(code, service, job, reference, receipt_path)`: checks the
  person owns the post (a job post must be open) or is a freelancer (for Pro),
  that a free featured slot exists (3 at a time, counting pending requests; an
  extension of an already featured post needs no new slot), the reference, the
  receipt, no other pending request for the same thing; copies the price (Pro
  members get pro_price); saves it as pending.
- `approve_promotion(id)`: admin only, row locked, only while pending. Starts at
  now, or when the current period ends if one is running (so paying again
  extends it). Writes featured_posts / pro_members, notifies the person, writes
  the admin log.
- `reject_promotion(id, reason)`: admin only, reason 3 to 200 characters,
  notifies the person, writes the admin log.
- `is_pro(user)` and `featured_slots_left(kind)`: small helpers the pages call.
- A trigger on `services`: a free account cannot add a 4th offer, Pro can have
  15. The message says so in plain words.

Small changes to existing rules: two new notification kinds
(`promotion_approved`, `promotion_rejected`) and one new admin log kind
(`promotion`), each keeping every kind already live.

Tests, four files (rolled back, nothing left behind; each borrows existing
accounts, no user numbers used). The connector refuses a very long block and any
statement that removes rows, so they are split:
- `test_promotions_1_rules.sql` (run, 28 checks): the shape and grants (a browser
  cannot write any of the new tables; a signed-out visitor sees nothing), the
  seeded prices, PhilFreela's GCash row, who can change a price. Ran 27 passed and
  1 failed because the test named the wrong constraint (`promo_prices_check`);
  the database did refuse a Pro price above the normal one, and the name is fixed
  in the file, not re-run.
- `test_promotions_2_requests.sql` (run, 44 of 44 passed): request rules, the 3
  spots, approve (7 days, extension adds to the running period, Pro 30 days and
  the Pro price), reject, notifications and the Activity Log.
- `test_promotions_3_limits_and_billboards.sql` (run, 25 of 25 passed): the offer
  limit (free 3, Pro 15, over-limit keeps theirs), billboard dates and sponsor
  fields, the receipt and QR pictures.
- `test_promotions_4_removals.sql` (NOT RUN, the connector declined it): removing
  an offer or a job post after payment keeps the record and ends the Featured
  spot, nobody removes PhilFreela's GCash row, who can remove a receipt file.
  Needs to be pasted into the Supabase SQL Editor.

Afterwards a live check: 0 rows left in the new tables, no test offers or
billboards, no files in the new buckets, user number counter unchanged (38),
`email_offline_on_notification` enabled again, the 4 prices intact.

Not in Step 1: any page. Nothing on the website changes.

## Findings while building Step 1 (2026-10-25)

- Live billboard rules: only a SUPER admin can post, switch, extend or remove a
  billboard (an earlier admin-roles change); any admin can read all of them.
  Step 2 (sponsored billboards) is therefore super-admin work. Approving or
  rejecting a fee request is for any admin (`is_admin()`), setting PhilFreela's
  GCash number and the prices is super admin only.
- All 3 accounts that own offers are currently in the CLIENT role (people switch).
  A test or a page cannot assume the owner of an offer is a freelancer-account.
  `request_promotion` checks the account type only for Pro.
- Connector declines to remember: an `update` with no `where` (even on a
  one-row table: use `where id`), any `delete from`, and one very long block.
  `drop constraint` on its own is fine.
- The email trigger on `user_notifications` is switched off inside each test and
  comes back with the rollback (checked `tgenabled = 'O'`).

## Related literature found (2026-10-25, for the paper's RRL if the user asks)

Read only abstracts and summaries (the INFORMS pages refused to open); the
user should read each abstract before citing.

- Gu & Zhu (2021). Trust and disintermediation: Evidence from an online freelance
  marketplace. Management Science 67(2), 794-807. When trust is high, people
  bypass the platform to avoid its fees: why a commission would leak here.
- Joo, Shi & Abhishek (2024). Do sellers benefit from sponsored product listings?
  Evidence from an online marketplace. Marketing Science 43(4), 817-839. Shoppers
  prefer organic over sponsored listings in top positions (trust): why Featured
  is a separate labeled row.
- Abhishek, Jerath & Sharma (2025). The impact of "retail media" on online
  marketplaces: Insights from a field experiment. Information Systems Research,
  DOI 10.1287/isre.2022.0188 (volume and issue not found). More sponsored
  listings did not change clicks or conversions and added revenue.
- Tyrvainen & Karjaluoto (2024). Willingness to pay for freemium services:
  Addressing the differences between monetization strategies. Int. Journal of
  Information Management 77, 102787. Meta-analysis of 55 studies + 15 interviews.
- Mantymaki, Islam & Benbasat. What drives subscribing to premium in freemium
  services? A consumer value-based view of differences between upgrading to and
  staying with premium. Information Systems Journal 30(2), 295-333, DOI
  10.1111/isj.12262 (sources show 2019 online; check the final year).
- Rochet & Tirole (2003). Platform competition in two-sided markets. Journal of
  the European Economic Association 1(4), 990-1029, DOI 10.1162/154247603322493212.
- DICT (2022). Philippine Online Freelancing Industry Study, seen only through a
  NewsBytes.ph report (43.4% under one year in the industry, 42.9% with clients
  abroad); find the original before citing. Payoneer and GCash report: up to 57%
  more per hour with both local and foreign clients (secondhand).
- Not usable: general marketplace revenue models only came from vendor blogs; the
  "90% of jobs go off-platform" claim could not be confirmed.
- No paper on how Philippine freelance platforms make money was found: that is
  the gap PhilFreela fills.
