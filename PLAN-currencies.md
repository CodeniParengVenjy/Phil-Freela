# PLAN: any currency, not only pesos

The user, 2026-11-14: "can you make not only in currency pesos of transactions, can you make all of the
currency that we have ... in all transactions, as well as subscription, clients to freelancers payment, etc."

## What the user chose (2026-11-14)

1. Each amount has its OWN currency. Whoever posts a job, an offer or a project price picks the currency.
   Payments, tips, balances and receipts of that project use the same currency. Other people also see a
   small estimate in THEIR own currency ("US$50.00  ≈ ₱2,900").
2. About 30 major currencies (not all 160). More can be added later by adding a row.
3. Premium, Featured posts, billboards and member ads (Xendit): show the price in the viewer's currency as
   an estimate, but still CHARGE in pesos ("You will be charged ₱149"). Xendit Philippines only takes PHP.
4. Client to freelancer payments: recorded in the project's currency, with any way of paying (PayPal, bank,
   Wise, GCash...). The AI receipt check runs only for peso/GCash. For other currencies the freelancer's
   "Received?" answer is the check.

## What exists today (facts from the code)

- Money columns, all numeric(10,2) and capped at 1,000,000: services.price, job_posts.budget,
  bookings.price, projects.agreed_amount, payments.amount / tip_amount / received_amount, promotions and
  checkouts (pesos, Xendit), receipt-check amount.
- Website: formatPeso() in client/src/lib/payments.js, used in about 48 files; parseAmount() caps at
  1,000,000; receiptPdf.js writes "PHP 1,500.00" (the PDF font has no peso sign); jobTerms.js and
  projectPrice.js write "₱5,000 per project"; welcomeGuide.js says "in pesos".
- Database: about 25 SQL files write "₱" + to_char(...) into notifications, chat messages, error texts and
  the price_text() sentence.
- Xendit: pro-checkout sends currency "PHP", and _shared/payments.ts refuses any other currency.
- Free exchange rates exist: open.er-api.com/v6/latest/PHP (no key, about 160 currencies, updates daily,
  needs a link back to exchangerate-api.com). I checked it answers today.

## Build steps (each one live and checked before the next)

### Step 1. The currency list and the rates (database + one small function)
- New table `currencies`: code (PHP, USD, EUR...), name, symbol, decimals (JPY/KRW = 0, others 2),
  max_amount (about the old ₱1,000,000, written once per currency, so it never depends on live rates),
  per_php (how many of it one peso buys), rate_updated_at. Seeded with the 30 currencies and today's rates.
  Everyone logged in can read it; nobody can write it from the website.
- New SQL helper `money_text(amount, code)` -> "US$50.00" / "¥7,500". Every "₱" + to_char in the database
  switches to it in Step 2.
- New column `profiles.display_currency` (default 'PHP'): the currency a person likes to see estimates in.
- The daily rate update (changed while building, 2026-11-14: no Edge Function needed): two pg_cron jobs.
  At 9:00 AM Manila ask_exchange_rates() asks open.er-api.com through pg_net (the way the offline emails
  are sent), at 9:10 read_exchange_rates() reads the answer and apply_exchange_rates() copies the rates.
  A rate that halves or doubles in one day is ignored as a likely mistake. Every check is written in
  `exchange_rate_checks` ("updated 30 rates" / "failed: ..."). If it ever fails, the old rates stay.
- File: database/supabase_currencies_schema.sql (+ database/test_currencies.sql).
- Tested 2026-11-14: 47/47 on PGlite (schema run twice) and 47/47 in a rolled-back trial on live,
  nothing left behind.

### Step 2. Prices and payments carry a currency (database)
- New column `currency` (default 'PHP', references currencies) on: services, job_posts, bookings, projects,
  payments. Every row that exists today becomes PHP, so nothing old changes.
- The price rules copy the currency along: booking copies the service's, hire copies the job post's,
  propose_project_price keeps the project's. A project's currency cannot change once it exists.
- Payments: record_payment, record_chat_payment, request_payment, confirm_short_payment and the
  "kulang"/tip rules use the project's currency; the 1,000,000 cap becomes the currency's max_amount.
- Receipt check and the GCash receipt rules apply only when currency = 'PHP'; otherwise the reference and
  receipt picture are optional and a short "sent with" text (PayPal, bank...) is kept.
- Every notification, chat message, error text and price_text() uses money_text(). That means rewriting
  about 25 functions with `create or replace`, only the changed lines, proved by a diff.
- Admin numbers that add up client payments (I will find each one while doing this step) convert to pesos
  at the stored rate and are marked "≈".
- Applied to live only after the user says go, as before.
- Built 2026-11-14 (database/supabase_currencies_prices_schema.sql + test_currencies_prices.sql), APPLIED as
  migration currencies_step2_prices after "Apply Step 2 now". What changed while building:
  * record_payment / record_chat_payment are internal on live (pesos only through the AI receipt check),
    so non-peso payments got two small entry points: record_other_payment and record_other_chat_payment
    (they refuse pesos). The 5-value forms now call new 6-value forms with 'gcash'.
  * Non-peso payments keep the same proof rule as GCash: a transaction number (4-60) AND a screenshot.
  * The live functions were changed by exact find-and-replace patches with a self-check (14 functions,
    79 edits), not pasted copies.
  * The admin graphs only COUNT payments and add up PhilFreela's own peso earnings: nothing to convert.
  * Tests: 77/77 in a rolled-back trial before applying, 21/21 after applying, all existing rows PHP.

### Step 3. Money helpers in the website (no screens change yet)
- New client/src/lib/money.js: formatMoney(amount, code) (uses Intl, so symbols and decimals are right),
  parseMoney(input, code) (cap and decimals per currency), estimateIn(amount, from, to), the list of
  currencies loaded once and kept.
- formatPeso() stays as a thin wrapper = formatMoney(x, "PHP"), so every Xendit/peso place keeps working.
- Settings: "Show estimates in" dropdown for display_currency.

### Step 4. Pick a currency where a price is typed, show it where a price is read
- Post a job (PostNeedView), Offers (ServicesView), Book and Hire dialogs, ProjectPriceBox: a currency box
  next to the amount, defaulting to PHP.
- Job and offer cards, lists, details, search, Find Jobs, Browse, project page: the price in its own
  currency plus a small "≈ ₱..." in the viewer's display currency (hidden when both are the same).
- jobTerms.js and projectPrice.js sentences, and the pesos wording in welcomeGuide.js, reworded.

### Step 5. Client to freelancer payments in any currency
- PaymentsSection, RecordPaymentDialog, RequestPaymentDialog, ShortPaymentForm, PaymentCard, OwesNotice,
  PayBlockNotice, payBlock.js: amounts, balance, tip and "owes" in the project's currency.
- For a non-peso project the dialog hides GCash (number, QR, receipt AI check) and shows "Sent with" plus an
  optional receipt picture; the project page says "Ask the freelancer in the chat where to send it".
- Freelancer's Settings: a small "Other payment details" box (PayPal email, bank...; up to 300 letters),
  private, shown only to the client of a non-peso project.
- receiptPdf.js: "USD 1,500.00" (currency code, because the PDF font has no symbols).

### Step 6. Subscriptions, Featured, billboards, admin
- ProPlans, PromoPayDialog, AdvertiseView, billboard/member-ad pay boxes: "₱149  ≈ US$2.60" and the line
  "You will be charged ₱149 (pesos)". Charging, receipts and admin Earnings stay in pesos.
- Admin Overview and Transactions: totals in pesos "≈" plus a per-currency line.

## Status (2026-11-14): all 6 steps built, live and pushed
- Step 1 database (cb2aa7e), Step 2 database (eaaeabc), both applied after the user's "Apply Step N now".
- Step 3 website helpers + "Show estimates in" (54d423a): 96/96 money.js tests (all 30 currencies written exactly
  like money_text on live), 16/16 browser checks.
- Step 4 currency boxes and estimates (2570656): 31/31 browser checks.
- Step 5 payments in any currency (1c87cf1): new OtherPaymentDialog, OtherPaymentDetailsForm, chat card,
  receipts in the payment's currency; 31/31 browser checks including the PDF text.
- Step 6 Premium / Featured / Advertise (this commit): PesoChargeNote ("≈ US$2.33 in your currency. You are
  charged ₱149.00 in pesos."), only for viewers who picked another currency; 6/6 browser checks. No admin page
  adds up client payments, so nothing needed converting there (admin graphs only count payments).
- Browser checks ran against a pretend backend (scratchpad fake.mjs), not real accounts. Never tried with a real
  foreign payment.

## Change after the user's look at the live site (2026-11-15)
The user saw "₱200,000 per project ≈ US$3,132" on Find Jobs and said it "havent change". Their two answers:
- "Your currency big": on browse lists (Find Jobs, Browse, Search, a profile's offers) and on someone else's
  offer or job page, the price shows in the viewer's currency as the big price ("≈ US$3,132 per project")
  with the real price small ("posted as ₱200,000"). The poster's own posts, the project page and the
  payments keep the real price big (with the small "≈"), since that is what is paid.
  (components/ShownPrice.jsx, shownPrice() in lib/money.js.)
- "Start with their currency": the currency boxes on Post a job, My Offers and Request payment start with the
  viewer's "Show estimates in" currency instead of PHP (they can still change it).
- Checks: 18/18 new browser checks, and the earlier 31 + 31 + 6 + 16 all still pass.

## Second change, same day (2026-11-15): prices as posted, nothing converted
The user: "you made it the currency incorrect ... I wanted that a currency can be changed in all aspects, not
converting something only ... some of the client projects where it is not in their original price". Nothing in
the database had changed (all 14 job posts, 6 offers, projects and payments were still pesos; only the user's own
account had picked USD), so what they saw was the "your currency big" display. Their two answers:
- "Prices as posted + subscription in my currency": every price shows exactly as it was posted, in its own
  currency ("US$24 per project", "₱200,000"), for everyone. No "≈" estimates anywhere. The currency in Settings
  is renamed "My currency": the person's new job posts, offers and payment requests start in it, and (Part 2
  below) Premium, Featured posts and ads are shown and charged in it.
- "By card in their currency": each currency gets its own Premium/Featured/ad price. Until the Xendit account
  can take that currency by card, those buyers pay the peso price by GCash, Maya or QR Ph, and the page says so.

Part 1, website only (0012f29, live 2026-11-15): ShownPrice.jsx and MoneyEstimate.jsx removed; Find Jobs, Browse,
Search, offer and job pages, the user's own lists, the project Price box and the chat payment card show the posted
price only; Settings > Appearance "My currency"; the tour's offer-price step reworded. The Premium/Featured/ad pages
keep the "You are charged ₱... in pesos" note until Part 2 replaces it. Checks: 31 + 18 + 15 + 31 + 6 browser checks.

## Third change, same day (2026-11-15): "Turn into my currency" (replaces "prices as posted")
After Part 1 the user saw "₱200,000 per project" (the Nimloy job, really posted at ₱200,000 on 2026-10-20 by
another account; a 2026-10-25 check already showed 200000.00 and the row was never edited) and asked to "fix the
currency instead". Shown two pictures (no option marked as recommended this time), they chose "Turn into my
currency": every price a person READS shows in their "My currency", worked out at the day's rate, one price only
(Nimloy is "US$3,132 per project" for a dollar reader), and the posted price is only the hover text.
- Converted: Find Jobs, Browse, Search, offer and job pages, offer cards, the person's own lists, the project's
  Price box, the Book window's price line, and the Premium / Featured / ad prices.
- Not converted, on purpose: money that is actually sent or received: the Payments box of a project, chat payment
  cards, the record/pay windows, "you still owe", receipts, Settings > Purchases, the pay buttons for
  Premium/Featured/ads ("Pay ₱99.00 online") and the admin pages. GCash only sends pesos, so a dollar figure there
  could make someone send the wrong amount. Someone whose currency is not pesos sees "Paid in pesos: ₱149.00 by
  GCash, Maya or QR Ph (Xendit takes pesos only)." on Premium and ads.
- Code: shownPrice() / postedTitle() / useMyCurrency() in lib/money.js, budgetText(job, moneyView) and
  budgetTitle() in jobTerms.js, priceText(..., moneyView) in projectPrice.js; the rates load when the dashboard opens.
- Checks: 114 browser checks against the pretend backend (prices 34, look 19, Settings 15, payments 31, Premium /
  ads / Feature window 15).

Part 2 below was planned for "prices as posted". With prices now converted for reading, its per-currency price
table is no longer needed; what is left of it is only charging US dollars by card (once Xendit turns USD on).

### Part 2 (PLANNED for "prices as posted", now only the card part is left): Premium, Featured posts and ads in "My currency"

What Xendit allows (checked 2026-11-15): a Philippine Xendit account charges PHP, and USD by CARD only, after
USD is requested in the Xendit dashboard (Xendit says 7-10 business days). GCash, Maya and QR Ph are pesos only.
No other currency can be charged. The USD card fee is 4.30% + US$1.00 (local card) or 5.00% + US$1.00 (foreign card).
Sources: help.xendit.co/hc/en-us/articles/360035083551, docs.xendit.co/docs/cards-8, xendit.co/en/pricing.

What a person sees:
- The Premium page, the Feature window and the Advertise page show every price in their "My currency":
  "US$2.49 for 30 days", "€2.49", "¥380".
- Under it, one line says how it is paid:
  * pesos: "Pay with GCash, Maya or QR Ph." (as today)
  * a currency PhilFreela can charge by card (only USD can ever be, and only after Xendit turns it on):
    "You pay US$2.49 by card."
  * any other currency, or USD before Xendit turns it on: "Paying in euros isn't possible yet. For now you pay
    ₱149 by GCash, Maya or QR Ph." The peso price is what is charged.
- Settings > Purchases, the PDF receipts and the admin Earnings show each purchase in the currency it was paid in
  (Earnings: the peso total plus one line per other currency, never converted).
- Sponsored billboard links (made by the super admin for a sponsor with no account) stay in pesos.

Prices (my default, change any): the peso price times today's rate, rounded UP to a nice price (x.49 / x.99;
whole numbers for yen, won, rupiah and dong), written ONCE, so they do not move with the rate. A card price is
never below US$1.49, because under that Xendit's US$1.00 fee eats the whole price. In US dollars:

| Option | Price | Premium member price |
|---|---|---|
| Premium, 30 days (₱149) | US$2.49 | - |
| Featured 3 days (₱49 / ₱25) | US$1.49 (raised from US$0.99) | US$1.49 (raised from US$0.49) |
| Featured 7 days (₱99 / ₱50) | US$1.99 | US$1.49 (raised from US$0.99) |
| Featured 14 days (₱179 / ₱90) | US$2.99 | US$1.49 |
| Ad 3 days (₱149 / ₱75) | US$2.49 | US$1.49 |
| Ad 7 days (₱299 / ₱150) | US$4.99 | US$2.49 |
| Ad 14 days (₱499 / ₱250) | US$7.99 | US$3.99 |

Examples of the same rule: Premium is €2.49, £1.99, ¥380, A$3.49, S$3.49, ₩3,200, ₹229, Rp43,000.

Steps (each one live and checked before the next):
- 2a. Database (one migration; asked for with "Apply Part 2 database now"). Nothing on the site changes yet:
  * new table promo_currency_prices (option code, currency, price, Premium member price) with the 29 non-peso
    currencies; pesos stay in promo_prices. Signed-in people can read it; nobody writes it from the website.
  * currencies.card_on (default off): "Xendit can charge this currency by card". Only turned on, with one SQL
    line, after Xendit approved USD and a test payment passed (step 2d).
  * a currency column (default PHP) on online_checkouts and promotions.
  * start_online_checkout, start_feature_checkout and start_ad_checkout read the person's "My currency": when it
    is card_on they save that currency's price, otherwise the peso price as today. Same names and inputs, so the
    live payment function keeps working; since every card_on starts off, everything stays pesos until 2d.
  * finish_online_checkout copies the currency into promotions; admin_promo_earnings adds a total per currency.
- 2b. Edge Functions (deployed only after the user's go, naming them): pro-checkout v4 sends the checkout's
  currency to Xendit and allows CARDS for a non-peso one (GCash, Maya, QR Ph for pesos, as today);
  _shared/payments.ts checks that what Xendit was paid is the checkout's own currency, not always PHP, so
  xendit-webhook is deployed again too.
- 2c. Website: lib/promoPrices.js; ProPlans, PromoPayDialog and AdvertiseView show the price in "My currency"
  with the line above; PesoChargeNote and the rates loading leave the website; Purchases, PDF receipts and the
  admin Earnings use each purchase's currency; Settings "My currency" adds "Premium, Featured posts and ads show
  their price in it."
- 2d. After Xendit approves USD: a test-mode payment with Xendit's test card, then USD card_on (the user's go).

What only the user can do (Xendit dashboard): turn on Cards, then request USD for cards. Until Xendit says yes,
dollar buyers see "Paying in US dollars isn't possible yet" and pay the peso price.

Honest limits: the other 28 currencies only ever show their own price and pay in pesos, which someone abroad may
not be able to do (a later choice: let them pay the US-dollar price by card); never tried with a real card.

## Defaults I chose (change any)
- The default currency of every box is the person's "My currency" (PHP until they pick another one), so a
  freelancer who does nothing changes nothing.
- Since 2026-11-15 (third change) every price a person reads is converted to their "My currency", one price only,
  no "≈"; money that is sent or received never is.
- The "fully paid" and balance math never converts: it all happens inside one currency.
- A project paid in another currency is not unlocked by an AI check; the freelancer's confirmation does it.

## Not in this plan
- Charging PhilFreela's own fees in currencies other than PHP and USD (Xendit Philippines can't; it would need
  another gateway like Stripe or PayPal). USD by card is Part 2 above.
- All 160 currencies, or converting a price after it was agreed.
- Old rows, old notifications and old receipts stay peso (they were peso).

## Honest limits
- Never tested with a real foreign payment: the site only records what two people say, like GCash today.
- Rates come from a free site; if it disappears, the stored rates just stop updating.
