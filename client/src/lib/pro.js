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

// How many offers a person has now, or null when it could not be counted.
export async function countMyOffers(userId) {
  const { count, error } = await supabase.from("services").select("id", { count: "exact", head: true }).eq("freelancer_id", userId);
  return error ? null : count;
}
