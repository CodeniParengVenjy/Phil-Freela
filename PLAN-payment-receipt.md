# Payment receipt as a PDF file (Steps 1 to 3 BUILT 2026-11-10)

Saved 2026-11-10. The user: "after transaction.... system will print a receipt in a
pdf file, plan first". After seeing two sample PDFs the user said "can you make
that? may I see a UI that receiving a receipt??", taken as the go for Steps 1 to 3
(GCash payments between users only). Step 4 (PhilFreela's own online purchases)
was not asked for and is not built.
To continue in a new Claude session, say: "Read PLAN-payment-receipt.md and continue
from the current step."

## What I understood

When a payment between two users is finished, PhilFreela makes a receipt that both
people can download as a PDF file (to keep, print or send).

"Finished" = the freelancer answered **Confirm received** or **Received less**
(payment status `confirmed`). No receipt while it is still "Payment sent", "Not
received" or "Cancelled", because the money is not confirmed yet.

## What I found (code + a read-only look at the live database, 2026-11-10)

- Payments between users are rows in `payments` (one per payment, id is a uuid).
  A payment belongs to a project (shown in `PaymentsSection.jsx` on the project
  page) or to a chat (shown by `PaymentCard.jsx` in `ChatView.jsx`).
- Everything a receipt needs is already saved: amount, tip, received amount, GCash
  reference number, initials read from the GCash receipt, paid date (from the
  receipt), recorded date, confirmed date, the two people and the project.
- Live: 1 confirmed payment (the user's own ₱1 test, project payment) and 1
  cancelled chat request. So there is one real payment to try the receipt on.
- PhilFreela's own sales through Xendit (Premium, Featured, ads) are a different
  table (`online_checkouts`, 5 paid, all test mode). They have no purchase list on
  the site yet. Not part of this plan unless the user asks (see the question below).
- The site has no PDF tool yet. `qrcode.react` is the only extra package.

## The plan, in order

### Step 1: the receipt maker (new file, no database change)

1. Add the package **jsPDF** (draws a real .pdf file inside the browser, no server).
   It is loaded only when someone taps Download, so the site does not get slower.
2. New file `client/src/lib/receiptPdf.js` with one function,
   `downloadPaymentReceipt({ payment, project, client, freelancer, allPayments })`.
   It draws one A4 page and saves it as `PhilFreela-Receipt-PF-XXXXXXXX.pdf`.
3. What the page shows, top to bottom:
   1. PhilFreela logo, the words "Payment Receipt", the receipt number and the date
      it was made. Receipt number = `PF-` + the first 8 characters of the payment id
      (so the same payment always gets the same number; no new column needed).
   2. A green line: "Confirmed received by the freelancer on <date>" (or "Received
      less" in orange).
   3. **Paid by** (client): full name, @username. **Paid to** (freelancer): full
      name, @username, GCash name initials.
   4. **For**: the project title (or "Chat payment" + the request's note).
   5. **Amounts**: amount paid, tip (if any), amount received (only when less
      arrived). For a one-time project with an agreed price: agreed price, paid so
      far, balance left after this payment (worked out with the same rule as
      `projectMoney()`, counting only payments confirmed up to this one).
   6. **GCash details**: reference number, date paid (from the GCash receipt),
      recorded on PhilFreela, confirmed by the freelancer.
   7. Footer: "PhilFreela only records this payment. The money was sent directly
      through GCash between the two users; PhilFreela did not hold or move it. This
      is an acknowledgement receipt, not an Official Receipt (BIR)."
4. Short comments in the code for the defense.

### Step 2: the Download buttons

1. `PaymentsSection.jsx` (project page): every confirmed payment gets a
   **Download receipt (PDF)** button next to "View receipt", for the client and the
   freelancer.
2. `PaymentCard.jsx` (chat): the same button on a confirmed chat payment.
3. After the freelancer taps Confirm received, the toast says the receipt is ready
   to download.
4. The names come from `profiles` (already readable); no new database function.

### Step 3: words

1. Terms and Privacy: one line that the PDF receipt is a record from PhilFreela,
   not an Official Receipt, and is made on the person's own device.
2. `PhilFreela-System-Functions.md`: add "Payment receipt (PDF)" under payments.
3. The study guide PDF: only if the user asks.

### How it will be tested

1. Build + lint.
2. A pretend-backend browser test: confirmed / received less / with tip / chat
   payment / not confirmed (no button); the downloaded file is checked to be a PDF
   and to contain the right names, amounts and reference.
3. On the live site with the one real confirmed payment (downloading changes no
   data).

## Endpoints and tables

- No new table, column, database function, Edge Function or ai-service route.
- Reads only what the page already loads (`payments`, `projects`, `profiles`).
- Files: `client/package.json`, new `client/src/lib/receiptPdf.js`,
  `PaymentsSection.jsx`, `PaymentCard.jsx`, `TermsAndPrivacy.jsx`,
  `PhilFreela-System-Functions.md`.

## Defaults I chose (the user can change these)

1. Made in the browser (jsPDF), not on a server: simpler, free, works on phones.
2. Amounts written as "PHP 1,000.00": the built-in PDF font has no ₱ sign, and
   adding a font file makes the PDF bigger.
3. A4 page, black text on white (prints well), not the dark theme.
4. The GCash screenshot is NOT put inside the PDF (it is already one tap away).
5. Admins get no receipt button (the earlier decision: admins do not see amounts).
6. No QR code to check a receipt online (would need a public page; can be added later).

## Question for the user

Receipts for GCash payments between users only, or also for what users pay
PhilFreela online (Premium, Featured, ads)? The second needs a small "My purchases"
list first (an extra Step 4 with its own plan).

## Result (2026-11-10): Steps 1 to 3 built

- `client/package.json`: jsPDF 4.2.1 (exact; `npm audit` 0 problems). Vite puts it
  in its own file (about 400 KB, 130 KB gzipped) that loads only on Download PDF.
- `client/src/lib/receiptPdf.js`: `downloadPaymentReceipt(payment)` reads the two
  people (`profiles`), the project and its payments (balance after THIS payment:
  only payments confirmed up to its `answered_at`), draws the A4 page and saves
  `PhilFreela-Receipt-PF-XXXXXXXX.pdf`. Names and the project title are cut with
  "..." if too long. The logo is the site SVG with "Freela" dark, drawn on a canvas.
- `ReceiptReady.jsx`: the green "Receipt PF-XXXXXXXX is ready" box with Download PDF,
  on confirmed payments in `PaymentsSection.jsx` and `PaymentCard.jsx`. The old
  "View receipt" button (the GCash screenshot) is now called "GCash screenshot" so
  the two aren't mixed up (the admin Reports page keeps its own "View receipt").
  The toast after Confirm received says the receipt is ready.
- Terms and Privacy: one line under payments. `PhilFreela-System-Functions.md`:
  "PDF receipt" under section 5.
- Tested: lint + build; a pretend-backend browser test, 27/27 (receipt appears after
  Confirm received, two receipts with the right balances, Received less in a chat,
  no box while sent / not received, the PDF text read back with pdf.js, dark /
  light + yellow accent / phone 390 with no sideways scroll). Test and screenshots in
  this session's scratchpad `receipt/browser`.
- Not yet tried by a person on the live site (there is one real confirmed payment,
  the user's own ₱1 test, to try it on).

## Step 4 plan: receipts for what users pay PhilFreela online (NOT approved yet)

The user, 2026-11-10: "plan it" (receipts for Premium, Featured posts and
Community Billboard ads, paid through Xendit).

### What I found (code + a read-only look at the live database, 2026-11-10)

- Every online purchase is a row in `online_checkouts` (who paid, price code, days,
  amount, test mode, status, when it started and was paid, the post title or ad).
  When it is paid, a `promotions` row holds when it runs (`starts_at` to `ends_at`)
  and Xendit's payment id (`provider_payment_id`). Ads have their headline in
  `member_ads`.
- The database already lets each person read their OWN rows of all three (and
  admins all of them). So no database change is needed.
- Live: 5 paid purchases (3 Premium, 1 Featured, 1 ad) and 1 that expired unpaid,
  ALL in Xendit's test mode (no real money). There are also 2 free Featured posts
  (the Premium perk), which are not purchases.
- No page lists a person's purchases today. After paying, the person only sees a
  message (the Premium page's "Payment received" card, a toast for Featured and ads).
- Xendit does not tell PhilFreela whether they paid with GCash, Maya or QR Ph, so
  the receipt says "Xendit online checkout".
- Sponsored billboards (`billboard_checkouts`) are paid by outside businesses
  through a link the super admin sends; they have no PhilFreela account. Left out.

### What the user will see

1. **Settings > Purchases** (a new tab, for clients and freelancers): every paid
   purchase, newest first, each with what it was ("Premium for 30 days", "Featured
   post for 7 days: <post title>", "Community Billboard ad for 14 days: <headline>"),
   the date, the amount, a "Test" badge while Xendit is in test mode, and a
   **Receipt (PDF)** button. Empty: "No purchases yet." Unpaid or expired checkouts
   and free Featured posts are not listed (nothing was charged).
2. Right after paying: the Premium page's "Payment received" card gets a
   **Download receipt (PDF)** button; the Featured and ad messages add "Your receipt
   is in Settings, Purchases."
3. **The PDF** (same look as the GCash receipt, see the sample files
   `PhilFreela-Receipt-Sample-Premium.pdf` and `...-Featured.pdf` in Downloads):
   receipt number `PFO-` + the first 8 characters of the checkout id; a green
   "PAID" band, or an orange "TEST PAYMENT ... no real money was charged" band plus
   a light "TEST PAYMENT" stamp across the page; Bought by (name, @username, client
   or freelancer) and Sold by (PhilFreela); what was bought with the post or ad name,
   runs from / until, total; Xendit payment id, checkout started, paid on, test or
   live; footer: PhilFreela's own service paid through Xendit, PhilFreela never sees
   wallet or bank details, acknowledgement receipt, not a BIR-registered invoice or
   Official Receipt.

### Files

1. New `client/src/lib/purchases.js`: `listMyPurchases(userId)` reads my paid
   `online_checkouts`, their `promotions` (period, Xendit id) and the ad headlines.
2. `client/src/lib/receiptPdf.js`: the header, bands, boxes, rows and footer
   become small shared pieces; add `downloadPurchaseReceipt(purchase)`.
3. New `client/src/pages/dashboard/components/PurchasesList.jsx`: the list.
4. `SettingsView.jsx`: the "Purchases" tab (a link can open it:
   `/dashboard/settings?tab=Purchases`).
5. `ProPlans.jsx`: the button on the "Payment received" card. `checkout.js`: the
   two "paid" messages mention Settings, Purchases.
6. Terms (one line under "PhilFreela's own fees") and
   `PhilFreela-System-Functions.md` ("How PhilFreela earns").

No new table, column, database function, Edge Function or AI route.

### How it will be tested

1. Lint + build.
2. Pretend-backend browser test: the list (Premium, Featured, ad, test badge, no
   unpaid or free rows, empty list), each PDF read back with pdf.js, the button on
   the Premium card, dark / light / phone.
3. Live: the user's own test purchases (downloading changes nothing).

### Defaults I chose

1. In Settings, not a new side-menu item (the panel asked for fewer buttons).
2. The real price paid only, no "regular price / Premium discount" line: an admin
   can change prices later, so the old regular price isn't known for sure.
3. Test-mode purchases get receipts too, clearly stamped TEST, because every
   purchase today is a test one.
4. Admins and sponsored billboards get no receipt button (can be added later).

## Step 4 result (2026-11-10): built (the user: "build please")

- `client/src/lib/purchases.js`: `listMyPurchases(userId)` (paid checkouts only,
  newest first, plus run dates and Xendit id from `promotions`) and
  `getPurchase(checkoutId)`. The ad and Featured names come from
  `online_checkouts.target_title` (filled for both on live).
- `client/src/lib/receiptPdf.js`: the drawing is now one shared `receiptKit`
  (header, band, amount, boxes, rows, footer) used by both receipts;
  `downloadPurchaseReceipt(purchaseOrCheckoutId, userId)` added. The GCash receipt
  looks the same as before (27/27 again).
- `PurchasesList.jsx` + Settings tab "Purchases" (last, for everyone; a link can
  open it with `?tab=Purchases`). `ProPlans.jsx`: "Download receipt (PDF)" on the
  "Payment received" card. `checkout.js`: the Featured and ad "paid" messages say
  the receipt is in Settings, Purchases.
- Terms (one line under PhilFreela's own fees), `PhilFreela-System-Functions.md`
  ("Receipts for these purchases" under How PhilFreela earns).
- Tested: lint + build; pretend-backend browser test 20/20 (`purchases.test.mjs`:
  only paid and own rows, order, Test badges, the three PDFs read back, empty list,
  light + yellow accent, phone 390, the Premium card button, no button while unpaid).

## Current step

Steps 1 to 4 are done. Left: a person trying both receipts on the live site.
