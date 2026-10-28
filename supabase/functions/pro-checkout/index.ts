// pro-checkout: paying online through Xendit (PLAN-monetization.md, "Paying
// for Pro online (Xendit)", and PLAN-premium.md). The website calls it for
// Premium, for Featured posts, and (the super admin) for a sponsor's billboard.
// (The name stayed "pro-checkout" because the live website already calls it.)
//
//   { action: "start" }                         Premium: opens a Xendit payment
//                                               page and returns { url }
//   { action: "start", code, service | job }    a Featured post (code feature_3,
//                                               feature_7 or feature_14)
//   { action: "start", ad }                     a Community Billboard ad: the owner's
//                                               own, once an admin approved it (the
//                                               database knows its price and length)
//   { action: "confirm", checkout }             when the person comes back: asks
//                                               Xendit whether that page was paid;
//                                               { status: "paid" | "open" | "expired" | "canceled" }
//   { action: "billboard", billboard }          super admin: a payment link for a
//                                               sponsored billboard; { url }
//   { action: "billboard-confirm", checkout }   super admin: has the sponsor paid?
//   { action: "version" }                       { version: 3, open }: the website asks
//                                               before offering Featured posts, billboard
//                                               links (2) and ads (3) online. An older
//                                               version would open a Premium page for an
//                                               ad, so the website checks the number.
//
// Only a signed-in person can call it, and only for their own payment (the
// super admin for billboard links). The price comes from the database, never
// from the browser, and nothing personal is sent to Xendit (only the amount
// and our payment's id).
import { CORS, db, env, isTestKey, isUuid, json, sessionIdOf, settleCheckout, whoIsAsking, xendit } from "../_shared/payments.ts";

const SITE_URL = env("SITE_URL") || "https://phil-freela.pages.dev";

// GCash, Maya and QR Ph only. Cards are left out: on small amounts their fee is about ₱20.
const CHANNELS = ["GCASH", "PAYMAYA", "QRPH"];
const FEATURE_CODES = ["feature_3", "feature_7", "feature_14"];

// The database's own sentence when it refused (suspended, not the owner, too
// many pages in an hour...), else a plain one.
function plain(error: unknown, fallback: string): string {
  const e = error as { code?: string; message?: string };
  return e?.code === "P0001" && e.message ? e.message : fallback;
}

const FAILED = "Couldn't open the payment page. Please try again.";

// Makes the Xendit page for a payment row and remembers it (with the service
// role: the browser can't write this). Returns the page's address, or null.
async function openXenditPage(
  table: "online_checkouts" | "billboard_checkouts",
  row: { id: string; amount: number; label: string },
  back: string,
  cancel: string
): Promise<string | null> {
  const secretKey = env("XENDIT_SECRET_KEY");
  let session: { payment_session_id?: string; id?: string; payment_link_url?: string };
  try {
    session = await xendit("POST", "/sessions", {
      reference_id: row.id,
      session_type: "PAY",
      mode: "PAYMENT_LINK",
      amount: Number(row.amount),
      currency: "PHP",
      country: "PH",
      allowed_payment_channels: CHANNELS,
      description: `PhilFreela: ${row.label}`,
      success_return_url: back,
      cancel_return_url: cancel
    });
  } catch {
    return null;
  }
  const sessionId = sessionIdOf(session);
  if (!sessionId || !session.payment_link_url) {
    console.error("Xendit's answer had no page id or address:", JSON.stringify(session));
    return null;
  }
  try {
    await db(`${table}?id=eq.${row.id}`, {
      method: "PATCH",
      body: { session_id: sessionId, checkout_url: session.payment_link_url, test_mode: isTestKey(secretKey) }
    });
  } catch (error) {
    console.error("Saving the Xendit page failed:", error);
    return null;
  }
  return session.payment_link_url;
}

export async function handle(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Not found." }, 404);

  const me = await whoIsAsking(req);
  if (!me) return json({ error: "Please sign in again." }, 401);
  const body = await req.json().catch(() => ({}));
  const open = Boolean(env("XENDIT_SECRET_KEY"));

  // open: false while Xendit's key isn't set (paying online is closed).
  if (body?.action === "version") return json({ version: 3, open });

  if (body?.action === "start") {
    if (!open) return json({ error: "Paying online is not open yet. Please try again later." }, 503);
    // What is paid for: an ad ({ ad }), a Featured post ({ code, service | job }) or, with
    // nothing else given, Premium.
    const advertising = body.ad !== undefined;
    const featuring = !advertising && body.code !== undefined;
    if (advertising) {
      if (body.code !== undefined || body.service !== undefined || body.job !== undefined) return json({ error: "Choose one thing to pay for." }, 400);
      if (!isUuid(body.ad)) return json({ error: "That ad was not found." }, 404);
    }
    if (featuring) {
      if (!FEATURE_CODES.includes(body.code)) return json({ error: "Choose one of the listed options." }, 400);
      if ((body.service === undefined) === (body.job === undefined)) return json({ error: "Choose one post to feature." }, 400);
      if (!isUuid(body.service ?? body.job)) return json({ error: "That post was not found." }, 404);
    }

    // 1. The database checks the person (and the post) and saves the page as open (as them).
    let started: { id: string; amount: number; days: number; label: string };
    try {
      started = advertising
        ? await db("rpc/start_ad_checkout", { method: "POST", body: { p_ad: body.ad }, token: me.token })
        : featuring
          ? await db("rpc/start_feature_checkout", {
            method: "POST",
            body: { p_code: body.code, p_service: body.service ?? null, p_job: body.job ?? null },
            token: me.token
          })
          : await db("rpc/start_online_checkout", { method: "POST", body: { p_code: "pro_30" }, token: me.token });
    } catch (error) {
      return json({ error: plain(error, FAILED) }, 400);
    }

    // 2. Xendit makes the payment page, which sends the person back to the page they came from.
    const page = advertising ? "advertise" : !featuring ? "pro" : body.job ? "post-need" : "services";
    const back = `${SITE_URL}/dashboard/${page}?checkout=${started.id}`;
    const url = await openXenditPage("online_checkouts", started, back, `${back}&canceled=1`);
    return url ? json({ url }) : json({ error: FAILED }, 502);
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

  if (body?.action === "billboard") {
    if (!open) return json({ error: "Paying online is not open yet. Please try again later." }, 503);
    if (!isUuid(body.billboard)) return json({ error: "That billboard was not found." }, 404);
    // The database checks that this is the super admin (as them) and saves the link as open.
    let started: { id: string; amount: number; title: string; sponsor: string };
    try {
      started = await db("rpc/start_billboard_checkout", { method: "POST", body: { p_billboard: body.billboard }, token: me.token });
    } catch (error) {
      return json({ error: plain(error, FAILED) }, 400);
    }
    // The sponsor has no PhilFreela account: after paying they land on the home page.
    const url = await openXenditPage(
      "billboard_checkouts",
      { id: started.id, amount: started.amount, label: `Sponsored billboard: ${started.title}` },
      `${SITE_URL}/?sponsor=paid`,
      `${SITE_URL}/?sponsor=canceled`
    );
    return url ? json({ url, checkout: started.id }) : json({ error: FAILED }, 502);
  }

  if (body?.action === "billboard-confirm") {
    if (!isUuid(body.checkout)) return json({ error: "That payment was not found." }, 404);
    // Read AS the person: only the super admin can see billboard payments.
    const rows = await db(`billboard_checkouts?id=eq.${body.checkout}&select=id,status,session_id`, { token: me.token });
    if (!rows?.length) return json({ error: "That payment was not found." }, 404);
    try {
      return json(await settleCheckout(rows[0], "billboard_checkouts"));
    } catch (error) {
      console.error("Checking the billboard payment failed:", error);
      return json({ error: "Couldn't check the payment. Please try again." }, 502);
    }
  }

  return json({ error: "Unknown action." }, 400);
}

Deno.serve(handle);
