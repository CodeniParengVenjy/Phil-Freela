import { supabase } from "./supabaseClient";

// The Notifications page shows two kinds of items:
//  - announcements: posted by an admin to everyone (lib/announcements.js)
//  - user_notifications: for one user only, made by the database itself when
//    a verification is reviewed, the user is suspended, or their report is
//    reviewed
// An item is unread when it's newer than the last "Mark all as read"
// (profiles.notifications_seen_at) AND it wasn't opened on its own
// (user_notifications.read_at, or a row in announcement_reads for an
// announcement). Opening the list no longer marks anything; opening one item
// marks that one (PLAN-notifications.md, Step N5).

// The signed-in user's own notifications, newest first. The database rules
// only return theirs.
export function getMyNotifications() {
  return supabase
    .from("user_notifications")
    .select("id, type, title, message, link, created_at, read_at")
    .order("created_at", { ascending: false });
}

// Which announcements this user already opened: a Map of announcement id ->
// when. (The database rules only return their own marks.) An empty Map if it
// can't be read, so nothing breaks; those just show as unread.
export async function getMyAnnouncementReads() {
  const { data, error } = await supabase.from("announcement_reads").select("announcement_id, read_at");
  return new Map(error ? [] : data.map((row) => [row.announcement_id, row.read_at]));
}

// Admin announcements and the user's own notifications in one list, newest
// first (the Notifications page and the bell in the top bar). Announcements
// have no type, so they're marked here to get their own icon, and their
// read_at comes from announcementReads. "from" is the sender line under each item.
export function mergeNotifications(announcements, notifications, announcementReads = new Map()) {
  return [
    ...announcements.map((a) => ({ ...a, key: `announcement-${a.id}`, type: "announcement", from: "PhilFreela Admin", read_at: announcementReads.get(a.id) || null })),
    ...notifications.map((n) => ({ ...n, key: `notification-${n.id}`, from: "PhilFreela" }))
  ].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
}

// Whether one item is unread: newer than the last "Mark all as read" and not
// opened on its own.
export function isUnread(item, seenAt) {
  if (!seenAt || new Date(item.created_at) <= new Date(seenAt)) return false;
  return !item.read_at;
}

// The user opened one item (its pop-up): mark only that one as read. The
// database only touches the signed-in user's own item.
export async function markNotificationRead(item) {
  if (!item || item.read_at) return;
  await supabase.rpc("mark_notification_read", {
    p_kind: item.type === "announcement" ? "announcement" : "notification",
    p_id: item.id
  });
}

// The last time the user pressed "Mark all as read" (before Step N5: the last
// time they opened their Notifications page or the bell's list).
export async function getNotificationsSeenAt(userId) {
  const { data } = await supabase
    .from("profiles")
    .select("notifications_seen_at")
    .eq("id", userId)
    .maybeSingle();
  return data?.notifications_seen_at || null;
}

// The number on the bell: announcements and personal notifications that
// arrived since the last "Mark all as read" and weren't opened on their own
// (head: true = just the count, no rows).
export async function countUnreadNotifications(userId) {
  const seenAt = await getNotificationsSeenAt(userId);
  if (!seenAt) return 0;

  const [announcements, reads, personal] = await Promise.all([
    supabase.from("announcements").select("id").gt("created_at", seenAt),
    getMyAnnouncementReads(),
    supabase.from("user_notifications").select("id", { count: "exact", head: true }).gt("created_at", seenAt).is("read_at", null)
  ]);
  const unreadAnnouncements = (announcements.data || []).filter((a) => !reads.has(a.id)).length;
  return unreadAnnouncements + (personal.count || 0);
}

// "Mark all as read": everything up to the newest item counts as read. It saves that item's own
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
  booking_cancelled: { icon: "bi-calendar-minus-fill", className: "bg-secondary text-white" },
  // A step in a GCash payment (database/supabase_payments_schema.sql).
  payment_sent: { icon: "bi-cash-coin", className: "bg-warning text-dark" },
  payment_confirmed: { icon: "bi-cash-stack", className: "bg-success text-white" },
  payment_not_received: { icon: "bi-exclamation-circle-fill", className: "bg-danger text-white" },
  // Less arrived than the client recorded, or a project was marked Done with
  // money unpaid (database/supabase_short_payment_schema.sql).
  payment_short: { icon: "bi-exclamation-triangle-fill", className: "bg-warning text-dark" },
  payment_unpaid: { icon: "bi-hourglass-split", className: "bg-warning text-dark" },
  // A freelancer asked for payment in a chat (database/supabase_chat_payments_schema.sql).
  payment_requested: { icon: "bi-wallet2", className: "bg-info text-dark" },
  // The price of a project was proposed or agreed (database/supabase_project_price_schema.sql).
  price_proposed: { icon: "bi-tag-fill", className: "bg-info text-dark" },
  price_agreed: { icon: "bi-tags-fill", className: "bg-success text-white" },
  // An admin answered a Featured post payment (database/supabase_promotions_schema.sql).
  promotion_approved: { icon: "bi-star-fill", className: "bg-warning text-dark" },
  promotion_rejected: { icon: "bi-x-circle-fill", className: "bg-danger text-white" },
  // A freelancer applied to the client's job post
  // (database/supabase_notifications_more_schema.sql, Section 1).
  application_new: { icon: "bi-person-plus-fill", className: "bg-info text-dark" },
  // The client's job post was filled, or closed because its due date passed
  // (Section 2 of the same file; the closed one comes from the 8:00 AM daily job).
  job_filled: { icon: "bi-people-fill", className: "bg-success text-white" },
  job_expired: { icon: "bi-hourglass-bottom", className: "bg-secondary text-white" },
  // The 8:00 AM reminders about a project's due date (Section 3 of the same file).
  project_due_soon: { icon: "bi-alarm", className: "bg-warning text-dark" },
  project_due_today: { icon: "bi-alarm-fill", className: "bg-warning text-dark" },
  project_overdue: { icon: "bi-exclamation-octagon-fill", className: "bg-danger text-white" },
  project_review_reminder: { icon: "bi-eye-fill", className: "bg-info text-dark" },
  // The 8:00 AM reminders about money still unpaid after a project is Done
  // (database/supabase_payment_due_schema.sql, PLAN-delays.md Step 1).
  payment_due_soon: { icon: "bi-calendar-event-fill", className: "bg-warning text-dark" },
  payment_overdue: { icon: "bi-exclamation-octagon-fill", className: "bg-danger text-white" },
  // A payment waits for the freelancer's answer (database/supabase_payment_waiting_schema.sql,
  // PLAN-delays.md Step 3): reminders to the freelancer, and when the client can report it.
  payment_waiting: { icon: "bi-hourglass-top", className: "bg-warning text-dark" },
  // Asking for more time to send the work or to pay (database/supabase_delay_requests_schema.sql,
  // PLAN-delay-requests.md): the request, and the answer.
  delay_requested: { icon: "bi-clock-history", className: "bg-info text-dark" },
  delay_accepted: { icon: "bi-calendar-check-fill", className: "bg-success text-white" },
  delay_declined: { icon: "bi-calendar-x-fill", className: "bg-secondary text-white" },
  // The client ended a project that was late and never sent (database/supabase_end_project_schema.sql,
  // PLAN-end-project.md): both people are told.
  project_ended: { icon: "bi-slash-circle-fill", className: "bg-secondary text-white" }
};

// Text for the popup's button (only for kinds that have a link).
export const notificationLinkLabels = {
  verification_approved: "Go to Verify Identity",
  verification_rejected: "Go to Verify Identity",
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
  booking_cancelled: "Open bookings",
  payment_sent: "View payment",
  payment_confirmed: "View payment",
  payment_not_received: "View payment",
  payment_short: "View payment",
  payment_unpaid: "Pay the rest",
  payment_requested: "Open chat",
  price_proposed: "Open project",
  price_agreed: "Open project",
  // A Featured post links to My Offers / My Job Posts, Premium to its own page.
  promotion_approved: "View details",
  promotion_rejected: "View details",
  // Opens the Projects page on that job's applicants (?job=<id>).
  application_new: "View applicants",
  // Both open the job post's page.
  job_filled: "View post",
  job_expired: "View post",
  project_due_soon: "Open project",
  project_due_today: "Open project",
  project_overdue: "Open project",
  project_review_reminder: "Open project",
  payment_due_soon: "Pay the rest",
  payment_overdue: "Open project",
  payment_waiting: "View payment",
  delay_requested: "Answer request",
  delay_accepted: "Open project",
  delay_declined: "Open project",
  project_ended: "Open project"
};
