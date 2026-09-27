import { supabase } from "./supabaseClient";

// The Notifications page shows two kinds of items:
//  - announcements: posted by an admin to everyone (lib/announcements.js)
//  - user_notifications: for one user only, made by the database itself when
//    a verification is reviewed or the user is suspended
// Both count as unread when they're newer than the last time the user opened
// the page (profiles.notifications_seen_at).

// The signed-in user's own notifications, newest first. The database rules
// only return theirs.
export function getMyNotifications() {
  return supabase
    .from("user_notifications")
    .select("id, type, title, message, link, created_at")
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

// How many announcements and personal notifications arrived since then
// (head: true = just the count, no rows).
export async function countUnreadNotifications(userId) {
  const seenAt = await getNotificationsSeenAt(userId);
  if (!seenAt) return 0;

  const [announcements, personal] = await Promise.all([
    supabase.from("announcements").select("id", { count: "exact", head: true }).gt("created_at", seenAt),
    supabase.from("user_notifications").select("id", { count: "exact", head: true }).gt("created_at", seenAt)
  ]);
  return (announcements.count || 0) + (personal.count || 0);
}

// Marks everything up to the newest item as read. It saves that item's own
// time (set by the database), not the computer's clock, so a wrong clock
// can't hide or re-show anything. The .lt() makes sure the time only ever
// moves forward.
export async function markNotificationsSeen(userId, newestCreatedAt) {
  if (!newestCreatedAt) return;
  await supabase
    .from("profiles")
    .update({ notifications_seen_at: newestCreatedAt })
    .eq("id", userId)
    .lt("notifications_seen_at", newestCreatedAt);
}

// Icon and colors for each kind of item ("announcement" = admin announcement).
export const notificationIcons = {
  announcement: { icon: "bi-megaphone-fill", className: "bg-role text-white" },
  verification_approved: { icon: "bi-patch-check-fill", className: "bg-success text-white" },
  verification_rejected: { icon: "bi-x-circle-fill", className: "bg-danger text-white" },
  suspension: { icon: "bi-exclamation-triangle-fill", className: "bg-warning text-dark" }
};

// Text for the popup's button, by the page it goes to.
export const notificationLinkLabels = {
  "/dashboard/verify-identity": "Go to Verify Identity"
};
