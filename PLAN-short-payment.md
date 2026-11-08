# Short payments ("kulang") and tips: plan (approved 2026-11-08)

## What the user asked (2026-11-08)

"Does GCash determine if the payment is kulang in PhilFreela?" then "What if the
client paid kulang to the freelancer? How can we fix that?"

## What happens today (checked in the code, 2026-11-08)

1. PhilFreela never sees GCash. The client types the amount they say they sent;
   the database only checks it is more than 0, at most 1,000,000, 2 decimals
   (`record_payment`, `record_chat_payment`). It is never compared with the agreed
   price or the requested amount.
2. The freelancer has only two answers: Confirm received or Not received. There is
   no way to say "it arrived, but less".
3. Nobody sees how much of the agreed price is still unpaid.
4. Pay to unlock opens the original file on the FIRST confirmed payment of any
   amount (trigger `payments_unlock_project_files`, the user's choice 2026-10-25).

## The idea in one line

The freelancer's GCash stays the only check (PhilFreela still never touches the
money), but the freelancer can now say how much really arrived, and the project
keeps a running balance: agreed price minus what the freelancer confirmed.

## Step 1: database (Medium)

1. `payments.received_amount numeric(10,2)`: what the freelancer says arrived.
   Empty until answered. Old confirmed payments get `received_amount = amount`.
2. `confirm_payment` also sets `received_amount = amount` (the full amount arrived).
3. New function `confirm_short_payment(target_payment, got_amount)`: only the
   freelancer of a payment in "sent"; `got_amount` more than 0, LESS than the
   recorded amount, up to 2 decimals. Sets status "confirmed",
   `received_amount = got_amount`, `answered_at = now()`. Tells the client:
   "Carlo checked their GCash: P1,000 arrived, not P1,500. P500 is still unpaid
   for "Logo design"."
4. New notification kind `payment_short` (rebuild `user_notifications_type_check`
   from the LIVE list, the other session also edits it).
5. Balance of a one-time project (`price_basis = 'project'` with an agreed price):
   `agreed_amount - sum(received_amount of confirmed payments)`. A small read-only
   function `project_balance(project)` so the page and later Step B of
   PLAN-transaction-tracking.md use the same number.
6. Unlock rule: depends on the user's choice below (A keeps the trigger as it is;
   B changes it to "when the balance reaches 0", and keeps "any confirmed payment"
   for projects without an agreed price).
7. When a project is marked Done with money still unpaid, the client gets one
   notification: "P500 is still unpaid for "Logo design"."
8. Test file `database/test_short_payment.sql`, run rolled back on live first.

Files: `database/supabase_short_payment_schema.sql`,
`database/test_short_payment.sql`.

## Step 2: screens (Medium)

1. Project page, Payments section (both people): "Paid P1,000 of P1,500 . P500
   left" with a thin progress bar; "Fully paid" when nothing is left.
2. Freelancer: a third button "Received less" next to Confirm received / Not
   received. It opens a small window: "How much arrived in your GCash?"
3. A short payment shows as "Confirmed . P1,000 of P1,500 arrived" (amber badge).
4. Client: the record window warns while typing when the amount is less than what
   is left ("The rest, P500, will stay unpaid") or more ("That is more than the
   P500 left"). It is a warning, not a block: deposits are normal.
5. Client: after a short answer, a "Pay the rest (P500)" button that opens the
   record window with the balance filled in.
6. The Report button (today only on "Not received") also shows on a short
   payment, so the freelancer can report a client who never pays the rest. The
   report already carries the payment and its receipt for the admin.
7. Chat payment card: the same "Received less" button and badge.

Files: `client/src/lib/payments.js`, `client/src/lib/notifications.js`,
`client/src/pages/dashboard/components/PaymentsSection.jsx`,
`client/src/pages/dashboard/components/PaymentCard.jsx`,
`client/src/pages/dashboard/components/RecordPaymentDialog.jsx`,
new `client/src/pages/dashboard/components/ShortPaymentDialog.jsx`,
`client/src/pages/dashboard/payments.css`.

## Step 3: words (Easy)

Terms "Who pays first" (one line on short payments), System Functions doc,
study guide (one panel answer). Check both themes and phone width.

## Limits (say them in the defense)

- PhilFreela still cannot see GCash; the freelancer's answer is the check. A
  freelancer who lies about the amount is handled by the client's report, with the
  receipt screenshot and reference number as proof.
- Per-day and per-month jobs have no single total, so they show "Total paid"
  only, no balance.

## Decisions the user made (2026-11-08), do not ask again

1. "ok" to the plan above.
2. Unlock rule: "Fully paid + additional optional tip". A one-time project with an
   agreed price opens its original file only when it is fully paid; this replaces
   the 2026-10-25 "any confirmed payment" rule for those projects. Projects with
   no agreed one-time price keep the old rule.
3. The client can add an optional tip.

How the tip works (my defaults, from decision 3):
- The record window has "For the project" and "Tip (optional)"; the total is what
  the client sends in GCash. The database gets the total and the tip part.
- On a one-time project with an agreed price, the project part can't be more than
  what is left (a payment still waiting for the freelancer counts), and a tip can
  be added only when the payment pays everything that is left. After the project
  is fully paid, a payment can be a tip alone.
- If less arrived than recorded, the tip is the first thing missing: what counts
  toward the price is the smaller of what arrived and (amount - tip).
- Chat payment cards get the tip box too (no balance there, a chat payment has no
  project).

## Step 1 result (2026-11-08) (DONE)

- `database/supabase_short_payment_schema.sql`, applied as migration
  `short_payment_tips` after a rolled-back trial on live: 34/34 checks of
  `database/test_short_payment.sql` passed, and afterwards nothing was left
  (no columns, functions, test rows; e-mail trigger back on; user number 52).
- payments: `tip_amount` (default 0) and `received_amount`; checks
  `payments_tip_check`, `payments_received_check`.
- `record_payment` and `record_chat_payment` have a new 5-value version with
  `pay_tip`; the old 4-value versions stay (they call the new one with tip 0) so
  the page that was live during the deploy kept working. PostgREST tells them
  apart by the names sent (checked with the public key: both answer 42501).
- New `confirm_short_payment(target_payment, got_amount)`; `confirm_payment` sets
  `received_amount`; helper `project_paid_amount(project, with_waiting)` (no one
  can call it directly); `unlock_project_files` now waits for full payment;
  trigger `projects_remind_unpaid_on_done`; notification kinds 28
  (`payment_short`, `payment_unpaid`).

## Step 2 result (2026-11-08) (DONE)

- `lib/payments.js`: `projectMoney()` (the same balance rule as the database,
  added up in centavos), `isShortPayment`, `paymentBadge`, `unlocksWhenFullyPaid`,
  `confirmShortPayment`; `recordPayment` / `recordChatPayment` send `pay_tip`;
  the payment fields include `tip_amount`, `received_amount`.
- `PaymentsSection.jsx`: the balance bar (both people), "Left to pay", "Fully
  paid. Thank you!" + Record a tip, "the rest is waiting", the third answer
  Received less, the short payment's badge and sentence, Pay the rest, Message and
  Report on a short payment.
- `RecordPaymentDialog.jsx`: "For the project" + "Tip (optional)", warnings while
  typing (less than left / more than left / less or more than requested), the
  total line, a tip-only window; the same rules as the database are checked
  before the receipt is uploaded.
- New `ShortPaymentForm.jsx`: the "How much arrived?" box. It is a box in place
  of the answer buttons (like the existing Yes/Cancel question), not a separate
  window as the plan first said.
- `PaymentCard.jsx` (chat): tip, Received less, short sentence, Report.
- `ProjectDetailsView.jsx`: the lock notices say "when the agreed price is fully
  paid" where that rule applies.
- `notifications.js`: icons and button words for `payment_short`, `payment_unpaid`.
- Tested in a real browser against a pretend database (scratchpad
  `browser/short.test.mjs`, 51/51): client and freelancer, tip refused with a part
  payment, Received less, unlock only when fully paid, tip alone after, a project
  with no price, chat card, light mode and phone width. Not yet tried by real
  people on the live site.

## Step 3 result (2026-11-08) (DONE)

- Terms (`TermsAndPrivacy.jsx`): Payments (tip, Received less, report on a short
  payment), Who pays first ("Work sent before payment stays locked" now says fully
  paid for an agreed one-time price; new "When less arrives than was recorded";
  the Done reminder).
- `PhilFreela-System-Functions.md`: the payment scope paragraph.
- Study guide PDF, now 60 pages, replaced in Downloads, `PhilFreela-Diagrams/`
  and OneDrive (the 59-page one is backed up in this session's scratchpad
  `study/guide-59pages-backup.pdf`): the Terms copy matches the site again, the
  Stage 9 lock box says fully paid, a new "short payments and tips" box, a panel
  answer "Does GCash tell PhilFreela if the payment is short (kulang)?", and the
  cheat sheet / loose ends lines. Built from a copy of the earlier session's
  `study/` folder (patch script `patch-short.cjs` there).

## Current step

All 3 steps done. Left: a real test by two people on the live site (pay part,
Received less, pay the rest with a tip, see the file unlock).
