import { supabase } from "./supabaseClient";

// Real profile numbers and the completed-projects list (Feature 5, Profile
// transparency and transaction history), see
// database/supabase_profiles_schema.sql. "role" is "freelancer" or "client":
// the numbers only count the projects the person did in that role, and only
// the ones the client marked Done. No money is involved anywhere.

// One person's numbers, or null when they couldn't be loaded. The row has
// completed_count, on_time_count (empty for clients), avg_stars, rating_count,
// reply_minutes, listing_count and member_since.
export async function fetchProfileStats(userId, role) {
  const { data, error } = await supabase.rpc("profile_stats", { target: userId, as_role: role });
  if (error) return null;
  return data?.[0] ?? null;
}

// The person's completed projects, newest first (up to 20), or null when they
// couldn't be loaded. project_id is only filled in for projects the signed-in
// user is on, so only those rows can open their project.
export async function fetchProfileHistory(userId, role) {
  const { data, error } = await supabase.rpc("profile_history", { target: userId, as_role: role, max_rows: 20 });
  if (error) return null;
  return data;
}

// How long the person usually waits before replying, in words. The database
// counts a message that stayed unanswered for a day as a very long wait, so
// the middle value can land between a real wait and that stand-in: anything
// of a day or more just reads "More than a day".
export function formatReplyTime(minutes) {
  if (minutes === null || minutes === undefined) return "No chats yet";
  if (minutes >= 24 * 60) return "More than a day";
  if (minutes < 1) return "Under a minute";
  if (minutes < 60) return `About ${Math.round(minutes)} min`;
  return `About ${Math.round(minutes / 60)} h`;
}

// "October 2026", in the user's own language and format.
export function formatMemberSince(date) {
  if (!date) return "—";
  return new Date(date).toLocaleDateString(undefined, { month: "long", year: "numeric" });
}

// The address of a person's public profile. There is one profile page for
// everyone (views/PublicProfileView.jsx) and both addresses open it; the
// address just follows the role they have today.
export function profilePath(accountType, userId) {
  return accountType === "client" ? `/dashboard/clients/${userId}` : `/dashboard/freelancers/${userId}`;
}
