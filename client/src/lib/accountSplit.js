import { supabase } from "./supabaseClient";

// Splitting an account that has work on both sides (PLAN-separate-accounts.md,
// Step 5). Accounts made before Freelancer and Client were separated could
// switch, so a few still have the other side's work. Nothing is deleted: the
// old account keeps its role, and the other side's work moves to a new account
// the same person makes with another email. The database does the moving
// (database/supabase_account_splits_schema.sql); these are the three calls.

// { keep_side, move_side, counts: { offers: 4, ... }, total, code, expires_at,
//   moved_to, moved_at } for the signed-in account, or null.
export async function getSplitSummary() {
  const { data, error } = await supabase.rpc("my_split_summary");
  if (error) throw error;
  return data;
}

// Old account: makes the move code (or shows the open one again).
// Returns { code, expires_at }.
export async function startSplit() {
  const { data, error } = await supabase.rpc("start_account_split");
  if (error) throw error;
  return data;
}

// New account: uses the code. Returns how many of each kind moved.
export async function finishSplit(code) {
  const { data, error } = await supabase.rpc("finish_account_split", { p_code: code });
  if (error) throw error;
  return data;
}

// The database's own sentence (e.g. "That move code is wrong, already used or
// expired.") when it gave one, otherwise a general one.
export function splitErrorText(error) {
  return error?.code === "P0001" && error.message ? error.message : "Something went wrong. Please try again.";
}

const LABELS = {
  offers: ["offer", "offers"],
  portfolio: ["portfolio piece", "portfolio pieces"],
  applications: ["job application", "job applications"],
  bookings: ["booking", "bookings"],
  projects: ["project", "projects"],
  payments: ["payment", "payments"],
  job_posts: ["job post", "job posts"],
  reviews: ["offer review", "offer reviews"],
  ratings_given: ["rating given", "ratings given"],
  ratings_received: ["rating received", "ratings received"]
};

// { offers: 4, projects: 1 } -> "4 offers, 1 project" (zeros are left out).
export function countsText(counts) {
  return Object.entries(counts || {})
    .filter(([kind, n]) => LABELS[kind] && Number(n) > 0)
    .map(([kind, n]) => `${n} ${Number(n) === 1 ? LABELS[kind][0] : LABELS[kind][1]}`)
    .join(", ");
}

// "ABCDEFGH" -> "ABCD EFGH", easier to read and type.
export function groupedCode(code) {
  return code ? `${code.slice(0, 4)} ${code.slice(4)}` : "";
}

export const SIDE_NAMES = { freelancer: "Freelancer", client: "Client" };
