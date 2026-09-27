import { supabase } from "./supabaseClient";

// A user_suspensions row is either a ban (no end date) or a suspension that
// lifts by itself on its end date. Ended suspensions stay in the table, but
// they no longer count (the database's is_suspended() works the same way).

// "banned", "suspended", or null when the user isn't blocked (anymore).
export function suspensionStatus(row) {
  if (!row) return null;
  if (!row.ends_at) return "banned";
  return new Date(row.ends_at) > new Date() ? "suspended" : null;
}

// Badge text and color for each status, shared by the admin pages.
export const blockedBadges = {
  banned: { label: "Banned", className: "bg-danger" },
  suspended: { label: "Suspended", className: "bg-warning text-dark" }
};

// e.g. "Oct 5, 2026"
export function formatEndDate(endsAt) {
  return new Date(endsAt).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

// Earliest date the admin can pick: tomorrow, as "YYYY-MM-DD" for <input type="date">.
export function tomorrowDateValue() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// The picked date means "lifts at 12:00 AM on that day" in the admin's time zone.
export function endDateToTimestamp(dateValue) {
  return new Date(`${dateValue}T00:00`).toISOString();
}

// Suspends (endsAt = a date) or bans (endsAt = null) a user. There is one row
// per user, so this replaces any older row: a suspension that already ended,
// or a suspension being turned into a ban. The database rules only let admins
// do this, recorded as themselves.
export function saveSuspension({ userId, reason, endsAt, adminId }) {
  return supabase
    .from("user_suspensions")
    .upsert(
      { user_id: userId, reason, ends_at: endsAt, suspended_by: adminId, created_at: new Date().toISOString() },
      { onConflict: "user_id" }
    )
    .select("user_id, reason, ends_at, created_at")
    .single();
}
