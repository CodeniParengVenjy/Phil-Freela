import { useCallback, useEffect, useState } from "react";
import { useOutletContext } from "react-router-dom";
import { getMyAnnouncements } from "../../../lib/announcements";
import {
  getMyAnnouncementReads, getMyNotifications, getNotificationsSeenAt, isUnread, markNotificationRead, markNotificationsSeen, mergeNotifications, notificationIcons
} from "../../../lib/notifications";
import NotificationDialog from "../components/NotificationDialog";
import { SkeletonRows } from "../../../components/Loaders";

export default function NotificationsView() {
  const { currentUserId, unreadNotifications, refreshUnreadNotifications } = useOutletContext();
  // Admin announcements and the user's own notifications in one list, newest first.
  const [items, setItems] = useState(null);
  const [loadError, setLoadError] = useState("");
  // The last "Mark all as read": anything newer that wasn't opened is unread
  // (bold, with a "New" tag). Opening this page no longer marks anything
  // (PLAN-notifications.md, Step N5).
  const [seenAt, setSeenAt] = useState(null);
  // The item open in the popup (null = closed).
  const [openItem, setOpenItem] = useState(null);
  const closeItem = useCallback(() => setOpenItem(null), []);

  // Also runs again when the unread count changes (something new arrived
  // while this page is open), so it shows up without a refresh.
  useEffect(() => {
    if (!currentUserId) return;
    let active = true;

    (async () => {
      const [announcementsResult, notificationsResult, reads, lastSeen] = await Promise.all([
        getMyAnnouncements(),
        getMyNotifications(),
        getMyAnnouncementReads(),
        getNotificationsSeenAt(currentUserId)
      ]);

      if (!active) return;
      if (announcementsResult.error || notificationsResult.error) {
        setLoadError("Failed to load notifications.");
        return;
      }

      setSeenAt(lastSeen);
      setItems(mergeNotifications(announcementsResult.data, notificationsResult.data, reads));
    })();

    return () => { active = false; };
  }, [currentUserId, unreadNotifications]);

  // Opening one item marks only that one as read (here at once, then in the
  // database), and the bell's number goes down.
  const openOne = async (item) => {
    setOpenItem(item);
    if (!isUnread(item, seenAt)) return;
    const readAt = new Date().toISOString();
    setItems((prev) => prev.map((one) => (one.key === item.key ? { ...one, read_at: readAt } : one)));
    await markNotificationRead(item);
    refreshUnreadNotifications();
  };

  // "Mark all as read": everything up to the newest item.
  const anyUnread = (items || []).some((item) => isUnread(item, seenAt));
  const markAllRead = async () => {
    const newest = items?.[0]?.created_at;
    if (!newest) return;
    setSeenAt(newest);
    await markNotificationsSeen(currentUserId, newest);
    refreshUnreadNotifications();
  };

  return (
    <section className="dashboard-view active-view">
      <div className="glass-card rounded-4 p-4 border border-secondary border-opacity-25">
        <div className="d-flex flex-wrap align-items-center justify-content-between gap-2 mb-4">
          {/* (data-tour: parts the opening tour points at, components/WelcomeGuide.jsx) */}
          <h3 data-tour="notifications" className="text-white fw-bold mb-0"><i className="bi bi-bell-fill text-warning me-2"></i> Notifications</h3>
          {anyUnread && (
            <button type="button" className="btn btn-sm btn-outline-role rounded-pill px-3 fw-bold" onClick={markAllRead}>
              <i className="bi bi-check2-all me-1"></i> Mark all as read
            </button>
          )}
        </div>

        {loadError && <p className="text-secondary text-center mb-0">{loadError}</p>}
        {!loadError && items === null && <SkeletonRows count={4} picture={52} label="Loading notifications" className="d-flex flex-column gap-3" />}
        {!loadError && items?.length === 0 && (
          <div className="text-secondary text-center py-4">
            <i className="bi bi-bell-slash fs-1 d-block mb-2"></i>
            No notifications yet.
          </div>
        )}

        <div className="d-flex flex-column gap-3">
          {items?.map((item) => {
            const isNew = isUnread(item, seenAt);
            const icon = notificationIcons[item.type] || notificationIcons.announcement;

            // Each item is a button: clicking it opens the popup with the full
            // message and marks it as read.
            return (
              <button
                type="button"
                key={item.key}
                className="notification-item p-3 p-md-4 rounded-3 bg-dark bg-opacity-50 border border-secondary border-opacity-25 d-flex align-items-start gap-3 text-start w-100"
                onClick={() => openOne(item)}
              >
                {/* notification-icon: 52px, 40px on a phone (dashboard.css). */}
                <div className={`notification-icon avatar-circle ${icon.className} fw-bold flex-shrink-0 d-flex align-items-center justify-content-center`} style={{ width: 52, height: 52 }}>
                  <i className={`bi ${icon.icon} fs-4`}></i>
                </div>
                <div className="flex-grow-1" style={{ minWidth: 0 }}>
                  <div className="d-flex flex-wrap align-items-center gap-2 mb-1">
                    {/* Unread: bold with a "New" tag. Read: lighter. */}
                    <h5 className={`mb-0 ${isNew ? "text-white fw-bold" : "text-white-50 fw-semibold"}`} style={{ overflowWrap: "anywhere" }}>{item.title}</h5>
                    {isNew && <span className="badge bg-warning text-dark rounded-pill">New</span>}
                  </div>
                  <p className="notification-preview text-secondary fs-7 mb-1">{item.message}</p>
                  {/* "Sep 29, 2026, 3:00 PM" (no seconds), kept on one line. */}
                  <small className="text-secondary fs-8">
                    {item.from} • <span className="text-nowrap">{new Date(item.created_at).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })}</span>
                  </small>
                </div>
                <i className="bi bi-chevron-right text-secondary align-self-center"></i>
              </button>
            );
          })}
        </div>
      </div>

      <NotificationDialog item={openItem} onClose={closeItem} />
    </section>
  );
}
