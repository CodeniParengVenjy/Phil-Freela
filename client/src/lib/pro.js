import { useCallback, useEffect, useState } from "react";
import { supabase } from "./supabaseClient";

// Freelancer Pro (PLAN-monetization.md, Step 5; database/supabase_promotions_schema.sql):
// 30 days of up to 15 offers instead of 3, a gold Pro badge and half-price
// Featured posts. It is paid like a Featured post (PromoPayDialog: GCash to
// PhilFreela, the 13-digit reference and a receipt, an admin approves). The
// browser can only READ pro_members; the end date is written by the database
// function approve_promotion, so nobody can give themselves Pro.

export const PRO_CODE = "pro_30";

// The offer limits. The database enforces them (the limit_offers trigger on
// services); the pages only show them early so nobody fills in a form for nothing.
export const FREE_OFFERS = 3;
export const PRO_OFFERS = 15;

// My own Pro status:
//   until:   the end date (ISO text) while I am Pro, else null (an ended Pro is just a free account)
//   waiting: a Pro payment is waiting for an admin
//   loaded:  false until it was read (or when it could not be), so a page never
//            shows "limit reached" for someone who is Pro but not read yet
// reload() asks again, e.g. after a payment was sent.
export function useProStatus(userId) {
  const [status, setStatus] = useState({ until: null, waiting: false, loaded: false });
  const [round, setRound] = useState(0);

  useEffect(() => {
    if (!userId) return undefined;
    let active = true;
    Promise.all([
      supabase.from("pro_members").select("pro_until").eq("user_id", userId).maybeSingle(),
      supabase.from("promotions").select("id").eq("user_id", userId).eq("kind", "pro").eq("status", "pending").limit(1)
    ]).then(([member, pending]) => {
      if (!active) return;
      const until = member.data && Date.parse(member.data.pro_until) > Date.now() ? member.data.pro_until : null;
      setStatus({ until, waiting: (pending.data || []).length > 0, loaded: !member.error });
    });
    return () => {
      active = false;
    };
  }, [userId, round]);

  const reload = useCallback(() => setRound((value) => value + 1), []);
  return { ...status, reload };
}

// Who is Pro right now, as a Set of user ids, for the gold Pro badge next to a
// freelancer's name. One small request for the whole page (a page can list
// hundreds of offers, so asking per person would make the address too long).
// The database returns at most 1000 rows, far more Pro members than this site will have.
export function useProIds() {
  const [proIds, setProIds] = useState(() => new Set());

  useEffect(() => {
    let active = true;
    supabase
      .from("pro_members")
      .select("user_id")
      .gt("pro_until", new Date().toISOString())
      .then(({ data, error }) => {
        // If it can't be read nobody gets a badge, and nothing else changes.
        if (active && !error) setProIds(new Set((data || []).map((row) => row.user_id)));
      });
    return () => {
      active = false;
    };
  }, []);

  return proIds;
}

// ---------------------------------------------------------------------------
// Paying for Pro online (PLAN-monetization.md, "Paying for Pro online (Xendit)").
// The Edge Function pro-checkout (supabase/functions/pro-checkout) opens a page
// on Xendit, a payment company, where the person pays with GCash, Maya or QR
// Ph; PhilFreela never sees those details. Xendit sends them back to the Pro
// page (/dashboard/pro) with ?checkout=<id>, and Pro starts once Xendit confirms the payment.
// ---------------------------------------------------------------------------

// The sentence the function sent back ({ error: "..." }), or the fallback.
async function functionError(error, fallback) {
  try {
    const body = await error?.context?.json();
    if (body?.error) return body.error;
  } catch {
    // The answer was not the function's own (no connection, for example).
  }
  return fallback;
}

// "Go Pro": returns { url } (Xendit's payment page, for the browser to go to) or { error }.
export async function startProCheckout() {
  const fallback = "Couldn't open the payment page. Please try again.";
  const { data, error } = await supabase.functions.invoke("pro-checkout", { body: { action: "start" } });
  // 404: the function is not on the server yet, so paying online isn't open.
  if (error?.context?.status === 404) return { error: "Paying online is not open yet. Please try again later." };
  if (error) return { error: await functionError(error, fallback) };
  return data?.url ? { url: data.url } : { error: fallback };
}

// Back from Xendit's page: asks whether that payment went through. Returns
// { status: "paid" | "open" | "expired" | "canceled" } or { error }.
export async function confirmProCheckout(checkoutId) {
  const fallback = "Couldn't check the payment. Please try again.";
  const { data, error } = await supabase.functions.invoke("pro-checkout", { body: { action: "confirm", checkout: checkoutId } });
  if (error) return { error: await functionError(error, fallback) };
  return data?.status ? { status: data.status } : { error: fallback };
}

// How many offers a person has now, or null when it could not be counted.
export async function countMyOffers(userId) {
  const { count, error } = await supabase.from("services").select("id", { count: "exact", head: true }).eq("freelancer_id", userId);
  return error ? null : count;
}
