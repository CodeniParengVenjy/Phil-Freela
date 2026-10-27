// The server side of paying online (PLAN-monetization.md, "Paying for Pro
// online (Xendit)", and PLAN-premium.md: Premium, Featured posts and sponsored
// billboards), shared by pro-checkout and xendit-webhook.
// No outside packages: Xendit and PhilFreela's database are both called with
// plain fetch(), so this is easy to read and to test.
//
// Secrets (Supabase > Edge Functions > Secrets), never in the website's code:
//   XENDIT_SECRET_KEY     Xendit's secret API key (Money-in: Write)
//   XENDIT_WEBHOOK_TOKEN  the verification token from Xendit's Webhooks page
// Supabase gives every function SUPABASE_URL, SUPABASE_ANON_KEY and
// SUPABASE_SERVICE_ROLE_KEY by itself.

export const XENDIT_API = "https://api.xendit.co";

export const env = (name: string): string => Deno.env.get(name) ?? "";

// Xendit's live keys start with xnd_production_ and take real money; any other
// key (xnd_development_...) is test mode, with pretend money.
export const isTestKey = (key: string): boolean => !key.startsWith("xnd_production_");

export const isUuid = (value: unknown): boolean =>
  typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);

// The website calls pro-checkout from the browser, so it must allow that.
export const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });
}

// ---------------------------------------------------------------------------
// Xendit
// ---------------------------------------------------------------------------

// Basic auth: the secret key is the user name and the password is empty.
function xenditHeaders(): Record<string, string> {
  return { Authorization: `Basic ${btoa(`${env("XENDIT_SECRET_KEY")}:`)}`, "Content-Type": "application/json" };
}

// One call to Xendit. Throws when Xendit says no (the details go to the log,
// never to the person).
export async function xendit(method: string, path: string, body?: unknown) {
  const res = await fetch(`${XENDIT_API}${path}`, {
    method,
    headers: xenditHeaders(),
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    console.error(`Xendit ${method} ${path} failed:`, res.status, JSON.stringify(data));
    throw new Error(`Xendit said ${res.status}`);
  }
  return data;
}

// ---------------------------------------------------------------------------
// PhilFreela's database, through its REST API
// ---------------------------------------------------------------------------

// With `token` the call is made AS that person (their rules apply); without it,
// with the service role (only the server has that key).
export async function db(path: string, options: { method?: string; body?: unknown; token?: string } = {}) {
  const key = options.token ? env("SUPABASE_ANON_KEY") : env("SUPABASE_SERVICE_ROLE_KEY");
  const res = await fetch(`${env("SUPABASE_URL")}/rest/v1/${path}`, {
    method: options.method ?? "GET",
    headers: { apikey: key, Authorization: `Bearer ${options.token ?? key}`, "Content-Type": "application/json" },
    body: options.body === undefined ? undefined : JSON.stringify(options.body)
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) {
    // P0001 = a sentence the database raised for the person ("You can only
    // feature your own offers." and the like); anything else is technical.
    throw Object.assign(new Error(data?.message || `Database said ${res.status}`), { code: data?.code ?? "" });
  }
  return data;
}

// Who is asking, from the sign-in token the website sends, or null.
export async function whoIsAsking(req: Request): Promise<{ id: string; token: string } | null> {
  const header = req.headers.get("Authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!token) return null;
  const res = await fetch(`${env("SUPABASE_URL")}/auth/v1/user`, {
    headers: { apikey: env("SUPABASE_ANON_KEY"), Authorization: `Bearer ${token}` }
  });
  if (!res.ok) return null;
  const user = await res.json().catch(() => null);
  return user?.id ? { id: user.id, token } : null;
}

// ---------------------------------------------------------------------------
// The heart of it
// ---------------------------------------------------------------------------

type Checkout = { id: string; status: string; session_id: string | null };

// The two kinds of payment page (PLAN-premium.md): a person's own (Premium or
// a Featured post: online_checkouts, finished by finish_online_checkout) and
// a sponsor's billboard link (billboard_checkouts, finish_billboard_checkout).
export type PaymentTable = "online_checkouts" | "billboard_checkouts";
const FINISH: Record<PaymentTable, string> = {
  online_checkouts: "finish_online_checkout",
  billboard_checkouts: "finish_billboard_checkout"
};

// Xendit's own id for a payment page (ps-...). Its docs call it
// payment_session_id, but the webhook test it sent on 2026-10-26 called it id,
// so both names are accepted.
export const sessionIdOf = (session: { payment_session_id?: string; id?: string } | null | undefined): string =>
  session?.payment_session_id || session?.id || "";

// Asks Xendit how a payment page stands and acts on it. Nothing is ever given
// because of what a message SAYS: only what Xendit answers here counts. A
// COMPLETED page that really is ours is recorded once (finish_online_checkout
// gives Premium or features the post; finish_billboard_checkout lets the
// billboard show); an expired or canceled one is marked so. Returns { status }
// with "paid", "open", "expired" or "canceled" (and proUntil when Premium was
// just paid).
export async function settleCheckout(checkout: Checkout, table: PaymentTable = "online_checkouts") {
  if (checkout.status === "paid") return { status: "paid" };
  if (checkout.status !== "open" || !checkout.session_id) return { status: checkout.status };

  const session = await xendit("GET", `/sessions/${encodeURIComponent(checkout.session_id)}`);
  if (session?.reference_id !== checkout.id || sessionIdOf(session) !== checkout.session_id) {
    throw new Error("Xendit's page does not belong to this payment.");
  }

  if (session.status === "COMPLETED") {
    if (session.currency !== "PHP") throw new Error(`Paid in ${session.currency}, not PHP.`);
    const result = await db(`rpc/${FINISH[table]}`, {
      method: "POST",
      body: {
        p_checkout: checkout.id,
        p_payment_id: session.payment_id || session.payment_request_id || sessionIdOf(session),
        p_amount: session.amount,
        p_test: isTestKey(env("XENDIT_SECRET_KEY"))
      }
    });
    return { status: "paid", proUntil: result?.pro_until ?? null };
  }

  if (session.status === "EXPIRED" || session.status === "CANCELED") {
    const status = session.status === "EXPIRED" ? "expired" : "canceled";
    await db(`${table}?id=eq.${checkout.id}&status=eq.open`, { method: "PATCH", body: { status } });
    return { status };
  }

  return { status: "open" };
}
