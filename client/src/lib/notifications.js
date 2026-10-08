import { supabase } from "./supabaseClient";

// The Notifications page shows two kinds of items:
//  - announcements: posted by an admin to everyone (lib/announcements.js)
//  - user_notifications: for one user only, made by the database itself when
//    a verification is reviewed, the user is suspended, or their report is
//    reviewed
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
  // A super admin allowed a School ID for 12 hours (database/supabase_school_id_pass_schema.sql).
  school_id_pass: { icon: "bi-person-vcard-fill", className: "bg-info text-dark" },
  suspension: { icon: "bi-exclamation-triangle-fill", className: "bg-warning text-dark" },
  suspension_lifted: { icon: "bi-unlock-fill", className: "bg-success text-white" },
  appeal_accepted: { icon: "bi-check-circle-fill", className: "bg-success text-white" },
  appeal_rejected: { icon: "bi-x-circle-fill", className: "bg-danger text-white" },
  // An admin reviewed a report the user sent (database/supabase_reports_schema.sql).
  report_resolved: { icon: "bi-flag-fill", className: "bg-success text-white" },
  report_dismissed: { icon: "bi-flag", className: "bg-secondary text-white" },
  // A step in a project (database/supabase_projects_schema.sql).
  project_hired: { icon: "bi-briefcase-fill", className: "bg-success text-white" },
  project_submitted: { icon: "bi-box-arrow-up", className: "bg-info text-dark" },
  project_done: { icon: "bi-check2-circle", className: "bg-success text-white" },
  project_changes: { icon: "bi-arrow-repeat", className: "bg-warning text-dark" },
  project_rated: { icon: "bi-star-fill", className: "bg-warning text-dark" },
  // A step in a booking (database/supabase_bookings_schema.sql).
  booking_requested: { icon: "bi-calendar-plus-fill", className: "bg-info text-dark" },
  booking_accepted: { icon: "bi-calendar-check-fill", className: "bg-success text-white" },
  booking_declined: { icon: "bi-calendar-x-fill", className: "bg-danger text-white" },
  booking_cancelled: { icon: "bi-calendar-minus-fill", className: "bg-secondary text-white" }
};

// Text for the popup's button (only for kinds that have a link).
export const notificationLinkLabels = {
  verification_approved: "Go to Verify Identity",
  verification_rejected: "Go to Verify Identity",
  school_id_pass: "Go to Verify Identity",
  suspension: "Appeal this suspension",
  appeal_rejected: "View appeal",
  project_hired: "Open project",
  project_submitted: "Open project",
  project_done: "Open project",
  project_changes: "Open project",
  project_rated: "Open project",
  booking_requested: "Open bookings",
  booking_accepted: "Open project",
  booking_declined: "Open bookings",
  booking_cancelled: "Open bookings"
};
