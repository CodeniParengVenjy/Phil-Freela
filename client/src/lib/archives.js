import { supabase } from "./supabaseClient";

// An archived account is kept, nothing in it is deleted, but it can't be used:
// no login, no listings, no posting, no chat (the database's is_suspended() and
// the other "is blocked" functions count archived accounts too). It waits on
// the admin Archives page until an admin restores it, or until it is deleted
// for good: by a super admin, or by the database's daily
// delete_expired_archives() job after this many days.
export const ARCHIVE_DELETE_DAYS = 100;

// The day an archived account is deleted, as e.g. "Jan 5, 2027": ARCHIVE_DELETE_DAYS
// after the archive date. The daily job runs at 12:05 AM Philippine time.
export function archiveDeletionDay(archivedAt) {
  const deleteAt = new Date(new Date(archivedAt).getTime() + ARCHIVE_DELETE_DAYS * 24 * 60 * 60 * 1000);
  return deleteAt.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

// This user's own archive row ({ archived_at }), or null when the account isn't
// archived. Users can only read their own row (database rule).
export async function getMyArchive(userId) {
  const { data } = await supabase.from("archived_users").select("archived_at").eq("user_id", userId).maybeSingle();
  return data || null;
}
