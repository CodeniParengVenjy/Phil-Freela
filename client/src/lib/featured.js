import { useCallback, useEffect, useState } from "react";
import { supabase } from "./supabaseClient";

// A Featured post (PLAN-monetization.md, Step 4; database/supabase_promotions_schema.sql):
// the owner of an offer or of an open job post pays PhilFreela on Xendit's page
// (PLAN-premium.md, lib/checkout.js) and it starts at once, with no receipt and no
// admin check. Then the post sits in a separate "Featured" row (at most 3) at the
// top of Browse Services / Find Jobs until its end date. The browser can only READ
// the end dates (featured_posts). getPromoPrices serves Featured posts and Premium.

// Sent on window when a Featured payment was confirmed after Xendit's page, so
// every useFeatureStatus on the page reads the end dates again.
export const FEATURED_CHANGED = "philfreela:featured-changed";

// The 3 options, in the order they are shown. The codes are in the promo_prices table.
export const FEATURE_CODES = ["feature_3", "feature_7", "feature_14"];

// The day an end date falls on in Manila time, like "Nov 3, 2026".
export function formatFeatureDate(iso) {
  return new Date(iso).toLocaleDateString("en-PH", { timeZone: "Asia/Manila", month: "short", day: "numeric", year: "numeric" });
}

// The prices of some options, shortest first (what a Pro member pays for a
// Featured post is pro_price). Returns { prices } or { error }.
export async function getPromoPrices(codes) {
  const { data, error } = await supabase
    .from("promo_prices")
    .select("code, label, days, price, pro_price")
    .in("code", codes)
    .order("days", { ascending: true });
  return error || !data?.length ? { error: "Couldn't load the prices. Please try again." } : { prices: data };
}

// Is this person a Pro member right now? Only changes which price is shown; the
// database picks the real price again when the request is sent.
export async function getIsPro(userId) {
  const { data } = await supabase.rpc("is_pro", { target: userId });
  return data === true;
}

// How many of the 3 Featured spots are free in a list ("service" or "job").
// Returns a number, or null when it couldn't be checked (the database checks
// again when the request is sent).
export async function getSlotsLeft(want) {
  const { data, error } = await supabase.rpc("featured_slots_left", { want });
  return error || typeof data !== "number" ? null : data;
}

// What is Featured right now and what is waiting for an admin:
//   until:   post id -> the end date (ISO text) of the period that is running
//   waiting: the ids of the posts with a payment waiting for review
// Without a userId only `until` is loaded (the lists everyone sees need no more).
// reload() asks again, e.g. after a request was sent.
export function useFeatureStatus(userId) {
  const [status, setStatus] = useState({ until: new Map(), waiting: new Set() });
  const [round, setRound] = useState(0);

  useEffect(() => {
    let active = true;
    const now = new Date().toISOString();
    Promise.all([
      supabase.from("featured_posts").select("service_id, job_id, featured_until").gt("featured_until", now),
      userId
        ? supabase.from("promotions").select("service_id, job_id").eq("user_id", userId).eq("status", "pending").in("kind", ["feature_service", "feature_job"])
        : Promise.resolve({ data: [] })
    ]).then(([featured, pending]) => {
      if (!active) return;
      // If either could not be read the lists simply show no Featured marks.
      const until = new Map((featured.data || []).map((row) => [row.service_id || row.job_id, row.featured_until]));
      const waiting = new Set((pending.data || []).map((row) => row.service_id || row.job_id));
      setStatus({ until, waiting });
    });
    return () => {
      active = false;
    };
  }, [userId, round]);

  const reload = useCallback(() => setRound((value) => value + 1), []);
  useEffect(() => {
    window.addEventListener(FEATURED_CHANGED, reload);
    return () => window.removeEventListener(FEATURED_CHANGED, reload);
  }, [reload]);
  return { ...status, reload };
}
