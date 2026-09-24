import { supabase } from "./supabaseClient";

// Who an admin can send an announcement to. The values match the check on
// the announcements table (database), so do not rename them.
export const announcementAudiences = [
  { value: "all", label: "All users" },
  { value: "freelancer", label: "Freelancers only" },
  { value: "client", label: "Clients only" }
];

export function audienceLabel(value) {
  return announcementAudiences.find((a) => a.value === value)?.label || value;
}

// The signed-in user's announcements, newest first. The database rules only
// return the ones meant for them (for everyone + for their account type).
export function getMyAnnouncements() {
  return supabase
    .from("announcements")
    .select("id, title, message, created_at")
    .order("created_at", { ascending: false });
}

// The last time the user opened their Notifications page.
export async function getNotificationsSeenAt(userId) {
  const { data } = await supabase
    .from("profiles")
    .select("notifications_seen_at")
    .eq("id", userId)
    .maybeSingle();
  return data?.notifications_seen_at || null;
}

// How many announcements were posted after the user last opened
// Notifications (head: true = just the count, no rows).
export async function countUnreadAnnouncements(userId) {
  const seenAt = await getNotificationsSeenAt(userId);
  if (!seenAt) return 0;

  const { count } = await supabase
    .from("announcements")
    .select("id", { count: "exact", head: true })
    .gt("created_at", seenAt);
  return count || 0;
}

// Marks everything up to the newest announcement as read. It saves that
// announcement's own time (set by the database), not the computer's clock,
// so a wrong clock can't hide or re-show anything. The .lt() makes sure the
// time only ever moves forward.
export async function markAnnouncementsSeen(userId, newestCreatedAt) {
  if (!newestCreatedAt) return;
  await supabase
    .from("profiles")
    .update({ notifications_seen_at: newestCreatedAt })
    .eq("id", userId)
    .lt("notifications_seen_at", newestCreatedAt);
}
