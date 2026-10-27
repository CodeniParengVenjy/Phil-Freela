// pro-checkout: Freelancer Pro paid online (PLAN-monetization.md, "Paying for
// Pro online (Xendit)"). The website calls it from the Freelancer Pro page.
//
//   { action: "start" }               opens a Xendit payment page and returns
//                                     { url } for the browser to go to
//   { action: "confirm", checkout }   when the person comes back: asks Xendit
//                                     whether that page was paid and returns
//                                     { status: "paid" | "open" | "expired" | "canceled" }
//
// Only a signed-in person can call it, and only for their own payment. The
// price comes from the database's price list, never from the browser, and
// nothing personal is sent to Xendit (only the amount and our payment's id).
import { CORS, db, env, isTestKey, isUuid, json, sessionIdOf, settleCheckout, whoIsAsking, xendit } from "../_shared/payments.ts";

const SITE_URL = env("SITE_URL") || "https://phil-freela.pages.dev";

// GCash, Maya and QR Ph only. Cards are left out: on ₱149 their fee is about ₱20.
const CHANNELS = ["GCASH", "PAYMAYA", "QRPH"];

// The database's own sentence when it refused (not a freelancer account,
// suspended, too many pages in an hour), else a plain one.
function plain(error: unknown, fallback: string): string {
  const e = error as { code?: string; message?: string };
  return e?.code === "P0001" && e.message ? e.message : fallback;
}

export async function handle(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Not found." }, 404);

  const me = await whoIsAsking(req);
  if (!me) return json({ error: "Please sign in again." }, 401);
  const body = await req.json().catch(() => ({}));

  if (body?.action === "start") {
    const secretKey = env("XENDIT_SECRET_KEY");
    if (!secretKey) return json({ error: "Paying online is not open yet. Please try again later." }, 503);

    // 1. The database checks the person and saves the page as open (as them).
    let started: { id: string; amount: number; days: number; label: string };
    try {
      started = await db("rpc/start_online_checkout", { method: "POST", body: { p_code: "pro_30" }, token: me.token });
    } catch (error) {
      return json({ error: plain(error, "Couldn't open the payment page. Please try again.") }, 400);
    }

    // 2. Xendit makes the payment page. It sends the person back to the Pro page.
    const back = `${SITE_URL}/dashboard/pro?checkout=${started.id}`;
    let session: { payment_session_id?: string; id?: string; payment_link_url?: string };
    try {
      session = await xendit("POST", "/sessions", {
        reference_id: started.id,
        session_type: "PAY",
        mode: "PAYMENT_LINK",
        amount: Number(started.amount),
        currency: "PHP",
        country: "PH",
        allowed_payment_channels: CHANNELS,
        description: `PhilFreela: ${started.label}`,
        success_return_url: back,
        cancel_return_url: `${back}&canceled=1`
      });
    } catch {
      return json({ error: "Couldn't open the payment page. Please try again." }, 502);
    }
    const sessionId = sessionIdOf(session);
    if (!sessionId || !session.payment_link_url) {
      console.error("Xendit's answer had no page id or address:", JSON.stringify(session));
      return json({ error: "Couldn't open the payment page. Please try again." }, 502);
    }

    // 3. Remember which Xendit page it is (with the service role: the browser can't write this).
    try {
      await db(`online_checkouts?id=eq.${started.id}`, {
        method: "PATCH",
        body: { session_id: sessionId, checkout_url: session.payment_link_url, test_mode: isTestKey(secretKey) }
      });
    } catch (error) {
      console.error("Saving the Xendit page failed:", error);
      return json({ error: "Couldn't open the payment page. Please try again." }, 502);
    }
    return json({ url: session.payment_link_url });
  }

  if (body?.action === "confirm") {
    if (!isUuid(body.checkout)) return json({ error: "That payment was not found." }, 404);
    // Only the person's own payment (the service role reads it, so the check is here).
    const rows = await db(`online_checkouts?id=eq.${body.checkout}&user_id=eq.${me.id}&select=id,status,session_id`);
    if (!rows?.length) return json({ error: "That payment was not found." }, 404);
    try {
      return json(await settleCheckout(rows[0]));
    } catch (error) {
      console.error("Checking the payment failed:", error);
      return json({ error: "Couldn't check the payment. Please try again." }, 502);
    }
  }

  return json({ error: "Unknown action." }, 400);
}

Deno.serve(handle);
