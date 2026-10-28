import { useEffect, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { FEATURED_CHANGED } from "./featured";
import { ADS_CHANGED } from "./memberAds";
import { supabase } from "./supabaseClient";

// Paying PhilFreela online through Xendit (PLAN-premium.md): Premium (lib/pro.js),
// Featured posts, and the sponsor of a billboard. The Edge Function pro-checkout
// (supabase/functions/pro-checkout) opens a page on Xendit, where the person pays
// with GCash, Maya or QR Ph; PhilFreela never sees those details. Nothing is
// given before Xendit confirms the payment (the webhook, or "confirm" when the
// person comes back).

// The sentence the function sent back ({ error: "..." }), or the fallback.
export async function functionError(error, fallback) {
  try {
    const body = await error?.context?.json();
    if (body?.error) return body.error;
  } catch {
    // The answer was not the function's own (no connection, for example).
  }
  return fallback;
}

const OPEN_FAILED = "Couldn't open the payment page. Please try again.";
const CHECK_FAILED = "Couldn't check the payment. Please try again.";

// Can this be paid online? Only once the server function has been updated far enough
// and Xendit's key is set: version 2 = Featured posts and billboard links (until then
// Featured posts keep the GCash way, PromoPayDialog, and billboards have no link),
// version 3 = also Community Billboard ads (an older function would open a PREMIUM
// page for an ad, so ads need 3). Asked once per visit (again after a "no", in case
// it was a bad moment).
let versionCheck = null;
export async function onlinePaymentsReady(minVersion = 2) {
  versionCheck ??= supabase.functions
    .invoke("pro-checkout", { body: { action: "version" } })
    .then(({ data, error }) => (error ? { version: 0, open: false } : { version: Number(data?.version) || 0, open: data?.open === true }))
    .catch(() => ({ version: 0, open: false }))
    .then((info) => {
      if (!info.open) versionCheck = null;
      return info;
    });
  const info = await versionCheck;
  return info.open && info.version >= minVersion;
}

// Asks whether a payment page was paid: { status: "paid" | "open" | "expired" |
// "canceled" } or { error }. billboard: a sponsor's link (super admin only).
export async function confirmCheckout(checkoutId, { billboard = false } = {}) {
  const action = billboard ? "billboard-confirm" : "confirm";
  const { data, error } = await supabase.functions.invoke("pro-checkout", { body: { action, checkout: checkoutId } });
  if (error) return { error: await functionError(error, CHECK_FAILED) };
  return data?.status ? { status: data.status } : { error: CHECK_FAILED };
}

// "Pay online" for a Featured post: code is feature_3, feature_7 or feature_14,
// target { kind: "service" | "job", id }. The database works out the price
// (half with Premium). Returns { url } (Xendit's page) or { error }.
export async function startFeatureCheckout(code, target) {
  const { data, error } = await supabase.functions.invoke("pro-checkout", { body: { action: "start", code, [target.kind]: target.id } });
  if (error) return { error: await functionError(error, OPEN_FAILED) };
  return data?.url ? { url: data.url } : { error: OPEN_FAILED };
}

// A payment link for a billboard's sponsor (super admin): the billboard's own
// amount; the billboard waits until it is paid. Returns { url, checkout } or { error }.
export async function startBillboardLink(billboardId) {
  const { data, error } = await supabase.functions.invoke("pro-checkout", { body: { action: "billboard", billboard: billboardId } });
  if (error) return { error: await functionError(error, "Couldn't make the payment link. Please try again.") };
  return data?.url ? { url: data.url, checkout: data.checkout } : { error: "Couldn't make the payment link. Please try again." };
}

// "Pay" on an approved Community Billboard ad: the database knows its price and
// length. Needs onlinePaymentsReady(3). Returns { url } (Xendit's page) or { error }.
export async function startAdCheckout(adId) {
  const { data, error } = await supabase.functions.invoke("pro-checkout", { body: { action: "start", ad: adId } });
  if (error) return { error: await functionError(error, OPEN_FAILED) };
  return data?.url ? { url: data.url } : { error: OPEN_FAILED };
}

// The pages Xendit sends a person's payment back to (the server function's
// "services", "post-need" and "advertise"), and what to say about each.
const ADVERTISE_PAGE = "/dashboard/advertise";
const FEATURE_PAGES = ["/dashboard/services", "/dashboard/post-need", ADVERTISE_PAGE];
const OUTCOMES = {
  featured: {
    paid: "Payment received. Your post is Featured now.",
    waiting: "Your payment isn't confirmed yet. If you paid, your post is Featured within a few minutes and you'll get a notification."
  },
  ad: {
    paid: "Payment received. Your ad is on the Community Billboard now.",
    waiting: "Your payment isn't confirmed yet. If you paid, your ad goes live within a few minutes and you'll get a notification."
  }
};
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Back from Xendit's page after paying for a Featured post: My Services or Post a
// Project opens with ?checkout=<id> (and &canceled=1 when they canceled). The
// dashboard layouts call this: it asks whether the payment went through, says so
// in a toast, has the page reload its Featured marks (FEATURED_CHANGED) and
// takes ?checkout off the address, so a reload doesn't ask again.
export function useFeatureCheckoutReturn(showToast) {
  const { pathname, search } = useLocation();
  const navigate = useNavigate();
  // Kept in refs: a new showToast or navigate must not start the questions again.
  const toastRef = useRef(showToast);
  const navigateRef = useRef(navigate);
  useEffect(() => {
    toastRef.current = showToast;
    navigateRef.current = navigate;
  });

  const params = new URLSearchParams(search);
  const checkoutId = FEATURE_PAGES.includes(pathname) ? params.get("checkout") : null;
  const canceled = params.get("canceled") === "1";
  // On the Advertise page the payment is for an ad, elsewhere for a Featured post.
  const advertising = pathname === ADVERTISE_PAGE;
  const outcome = advertising ? OUTCOMES.ad : OUTCOMES.featured;

  useEffect(() => {
    if (!checkoutId) return undefined;
    let active = true;
    const say = (text) => toastRef.current?.(text);
    const done = (text) => {
      say(text);
      navigateRef.current(pathname, { replace: true });
    };
    if (canceled) {
      done("Payment canceled. Nothing was paid.");
      return undefined;
    }
    say("Checking your payment with Xendit...");
    (async () => {
      // Xendit may need a few seconds to confirm a payment.
      for (let attempt = 0; attempt < 4; attempt += 1) {
        const result = await confirmCheckout(checkoutId);
        if (!active) return;
        if (result.status === "paid") {
          window.dispatchEvent(new Event(advertising ? ADS_CHANGED : FEATURED_CHANGED));
          done(outcome.paid);
          return;
        }
        if (result.status === "expired" || result.status === "canceled") {
          done("That payment didn't go through, so nothing was paid. You can try again.");
          return;
        }
        await wait(3000);
        if (!active) return;
      }
      done(outcome.waiting);
    })();
    return () => {
      active = false;
    };
  }, [checkoutId, canceled, pathname, advertising, outcome]);
}
