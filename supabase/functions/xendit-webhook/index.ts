// xendit-webhook: Xendit tells PhilFreela that a payment page was paid or
// expired (PLAN-monetization.md and PLAN-premium.md). This is what gives
// Premium, features a post, or lets a sponsored billboard show when the person
// closed the tab before coming back (a sponsor never comes back at all).
//
// Set in Xendit (Settings > Developers > Webhooks), for Payment Sessions:
//   https://<project>.supabase.co/functions/v1/xendit-webhook
// Deployed WITHOUT the sign-in check (Xendit has no PhilFreela account); it
// checks Xendit's x-callback-token instead. Even then the message itself is
// never trusted: settleCheckout asks Xendit again before anything is given.
import { db, env, isUuid, json, sessionIdOf, settleCheckout, type PaymentTable } from "../_shared/payments.ts";

// Compares every character, so how long it takes says nothing about the token.
function sameText(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function handle(req: Request): Promise<Response> {
  if (req.method !== "POST") return json({ error: "Not found." }, 404);

  const expected = env("XENDIT_WEBHOOK_TOKEN");
  if (!expected || !sameText(req.headers.get("x-callback-token") ?? "", expected)) {
    return json({ error: "Not allowed." }, 401);
  }

  const event = await req.json().catch(() => null);
  const name = event?.event;
  const data = event?.data ?? {};
  // Anything else is answered with 200 so Xendit doesn't keep sending it.
  if (name !== "payment_session.completed" && name !== "payment_session.expired") return json({ ok: true, ignored: true });
  if (!isUuid(data.reference_id)) return json({ ok: true, ignored: true });

  // A person's own payment (Premium or a Featured post), or a sponsor's billboard link.
  let table: PaymentTable = "online_checkouts";
  let rows = await db(`online_checkouts?id=eq.${data.reference_id}&select=id,status,session_id`);
  if (!rows?.length) {
    table = "billboard_checkouts";
    rows = await db(`billboard_checkouts?id=eq.${data.reference_id}&select=id,status,session_id`);
  }
  const checkout = rows?.[0];
  // Not one of our pages, or a different Xendit page than the one we opened.
  if (!checkout || checkout.session_id !== sessionIdOf(data)) return json({ ok: true, ignored: true });

  try {
    const result = await settleCheckout(checkout, table);
    return json({ ok: true, status: result.status });
  } catch (error) {
    // 500 makes Xendit try again later (it retries a few times).
    console.error("Settling the payment failed:", error);
    return json({ error: "Please try again." }, 500);
  }
}

Deno.serve(handle);
