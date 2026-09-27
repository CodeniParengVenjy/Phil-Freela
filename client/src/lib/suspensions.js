import { supabase } from "./supabaseClient";

// A user_suspensions row is either a ban (no end date, blocks everything,
// can't log in) or a suspension that blocks posting and/or messaging until its
// end date. Ended suspensions stay in the table, but they no longer count (the
// database's is_posting_blocked() / is_messaging_blocked() work the same way).

// Every column the pages need from a suspension row.
export const SUSPENSION_COLUMNS = "user_id, reason, violation, ends_at, blocks_posting, blocks_messaging, created_at";

// "banned", "suspended", or null when the user isn't blocked (anymore).
export function suspensionStatus(row) {
  if (!row) return null;
  if (!row.ends_at) return "banned";
  return new Date(row.ends_at) > new Date() ? "suspended" : null;
}

export const isPostingBlocked = (row) => Boolean(suspensionStatus(row) && row.blocks_posting);
export const isMessagingBlocked = (row) => Boolean(suspensionStatus(row) && row.blocks_messaging);

// Badge text and color for each status, shared by the admin pages.
export const blockedBadges = {
  banned: { label: "Banned", className: "bg-danger" },
  suspended: { label: "Suspended", className: "bg-warning text-dark" }
};

// What a suspension stops the user from doing, e.g. "can't send messages".
export function restrictionText(blocksPosting, blocksMessaging) {
  if (blocksPosting && blocksMessaging) return "can't post or send messages";
  return blocksPosting ? "can't post services or job posts" : "can't send messages";
}

// e.g. "Sep 30, 2026, 5:21 PM"
export function formatEndDate(endsAt) {
  return new Date(endsAt).toLocaleString(undefined, { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
}

// Saves a penalty from buildPenalty() (lib/violations.js). There is one row
// per user, so this replaces any older row: a suspension that already ended,
// or a suspension being turned into a ban. The database rules only let admins
// do this, recorded as themselves.
export function saveSuspension({ userId, adminId, penalty }) {
  return supabase
    .from("user_suspensions")
    .upsert(
      {
        user_id: userId,
        reason: penalty.reason,
        violation: penalty.violation,
        ends_at: penalty.endsAt,
        blocks_posting: penalty.blocksPosting,
        blocks_messaging: penalty.blocksMessaging,
        suspended_by: adminId,
        created_at: new Date().toISOString()
      },
      { onConflict: "user_id" }
    )
    .select(SUSPENSION_COLUMNS)
    .single();
}
