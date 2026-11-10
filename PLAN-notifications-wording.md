# Step N6: clearer notification wording (APPROVED "ok" and LIVE 2026-11-10, migration notifications_wording)

Part of PLAN-notifications.md. Collected 2026-11-10 from the LIVE database functions
(35 functions write notifications). Nothing has been changed yet.

Rule used: short, plain, names the project or post, says what to do next.
Most texts already do that, so only 9 changes are proposed. The rest stay as they are.

## Proposed changes

1. **New applicant** (client), `application_new`
   - Now: Juan Dela Cruz applied to your job "Logo for my shop".
   - New: Juan Dela Cruz applied to your job post "Logo for my shop". Open it to see their resume and how well they fit.

2. **Job post closed** (client), `job_expired`
   - Now: Your job post "Logo for my shop" closed because its due date passed. Edit it to reopen it.
   - New: Your job post "Logo for my shop" closed because its due date passed, so freelancers can't see it or apply. Pick new dates to show it again.
   - Why: the same words the post page already uses.

3. **Work submitted** (client), `project_submitted`
   - Now: Juan sent the work for "Logo for my shop". Open the project to review it.
   - New: Juan sent the work for "Logo for my shop". Open the project to review it, then mark it as done or ask for changes.

4. **Project marked as done** (freelancer), `project_done`
   - Now: Maria confirmed "Logo for my shop" is done. It now shows on both your histories.
   - New: Maria marked "Logo for my shop" as done. It now shows on both your histories, and you can rate Maria on the project page.
   - Why: the freelancer can rate right after Done; nothing told them.

5. **Identity verified** (everyone), `verification_approved`
   - Now: "... If you're a freelancer, you can now post services for clients to find."
   - New: "... If you're a freelancer, you can now post services for clients to find. If you're a client, you can now post job projects."
   - Why: since 2026-10-27 clients need a verified ID to post.

6. **Payment short** (client), `payment_short`: title only
   - Now: Less than you recorded arrived
   - New: Only part of your payment arrived

7. **Price agreed**, `price_agreed`
   - Now: Maria agreed to ₱500.00 for "Logo for my shop".
   - New: Maria agreed to ₱500.00 for "Logo for my shop". This is now the project's price.

8. **A rating is waiting for you**, `project_rated` (the still-unapplied Section 4 of
   database/supabase_rating_after_payment_schema.sql, migration `rating_after_payment_notice`)
   - Adds, for a client who hasn't paid yet: "You can rate them once your payment for this project is confirmed."
   - Apply it as written.

9. **Project is late** (freelancer), `project_overdue`: ONLY if the other session's "late freelancer"
   rule goes live (a late freelancer can't apply to that client's posts until the client allows it)
   - Now: "Logo for my shop" is 1 day late. Submit your work or message the client.
   - New: "Logo for my shop" is 1 day late. Submit your work or message the client. Until the client allows it, you can't apply to their other job posts.

## Kept as they are (already clear)

Booking requested / accepted / declined / cancelled, You were hired!, Changes requested, You got a new rating,
Price proposed, Payment sent / confirmed / not received / still unpaid, Payment request, Payment received
(Premium, Featured, Community Billboard), Your ad was approved / not approved / taken down, You can verify
with a School ID, Verification not approved, Account suspended, Suspension / Ban lifted, Appeal accepted /
not accepted, Your report was reviewed (both), Job post filled, and the due-date reminders (due in 3 days,
tomorrow, today, work waiting for review).

Not used any more (left alone): "Payment approved" / "Payment not accepted" from approve_promotion and
reject_promotion, the old manual PhilFreela GCash way removed on 2026-11-03.

## How it will be done after approval

One migration that re-creates only those functions with ONLY the text changed (each compared with the live
`pg_get_functiondef` before applying), a rolled-back test that checks each new text, then the user's go.
