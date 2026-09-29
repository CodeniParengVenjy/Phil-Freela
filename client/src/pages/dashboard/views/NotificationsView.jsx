import { useCallback, useEffect, useState } from "react";
import { useOutletContext } from "react-router-dom";
import { getMyAnnouncements } from "../../../lib/announcements";
import { getMyNotifications, getNotificationsSeenAt, markNotificationsSeen, notificationIcons } from "../../../lib/notifications";
import NotificationDialog from "../components/NotificationDialog";

export default function NotificationsView() {
  const { currentUserId, unreadNotifications, refreshUnreadNotifications } = useOutletContext();
  // Admin announcements and the user's own notifications in one list, newest first.
  const [items, setItems] = useState(null);
  const [loadError, setLoadError] = useState("");
  // When the user last opened this page, from before this visit. Anything
  // newer gets a "New" tag.
  const [lastSeenAt, setLastSeenAt] = useState(null);
  // The item open in the popup (null = closed).
  const [openItem, setOpenItem] = useState(null);
  const closeItem = useCallback(() => setOpenItem(null), []);

  // Also runs again when something new arrives while this page is open
  // (the unread count goes above 0), so it shows up without a refresh.
  const hasUnread = unreadNotifications > 0;

  useEffect(() => {
    if (!currentUserId) return;
    let active = true;

    (async () => {
      const [announcementsResult, notificationsResult, seenAt] = await Promise.all([
        getMyAnnouncements(),
        getMyNotifications(),
        getNotificationsSeenAt(currentUserId)
      ]);

      if (!active) return;
      if (announcementsResult.error || notificationsResult.error) {
        setLoadError("Failed to load notifications.");
        return;
      }

      // Announcements have no type, so they're marked here to get their own
      // icon. "from" is the sender line under each item.
      const merged = [
        ...announcementsResult.data.map((a) => ({ ...a, key: `announcement-${a.id}`, type: "announcement", from: "PhilFreela Admin" })),
        ...notificationsResult.data.map((n) => ({ ...n, key: `notification-${n.id}`, from: "PhilFreela" }))
      ].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

      // Keep the time from the first load, so the "New" tags don't vanish
      // the moment this page marks everything as read.
      setLastSeenAt((prev) => prev ?? seenAt);
      setItems(merged);

      // Opening this page counts as reading them: the badge goes back to 0.
      await markNotificationsSeen(currentUserId, merged[0]?.created_at);
      if (active) refreshUnreadNotifications();
    })();

    return () => { active = false; };
  }, [currentUserId, hasUnread, refreshUnreadNotifications]);

  return (
    <section className="dashboard-view active-view">
      <div className="glass-card rounded-4 p-4 border border-secondary border-opacity-25">
        <h3 className="text-white fw-bold mb-4"><i className="bi bi-bell-fill text-warning me-2"></i> Notifications</h3>

        {loadError && <p className="text-secondary text-center mb-0">{loadError}</p>}
        {!loadError && items === null && <p className="text-secondary text-center mb-0">Loading notifications...</p>}
        {!loadError && items?.length === 0 && (
          <div className="text-secondary text-center py-4">
            <i className="bi bi-bell-slash fs-1 d-block mb-2"></i>
            No notifications yet.
          </div>
        )}

        <div className="d-flex flex-column gap-3">
          {items?.map((item) => {
            const isNew = lastSeenAt && new Date(item.created_at) > new Date(lastSeenAt);
            const icon = notificationIcons[item.type] || notificationIcons.announcement;

            // Each item is a button: clicking it opens the popup with the full message.
            return (
              <button
                type="button"
                key={item.key}
                className="notification-item p-3 p-md-4 rounded-3 bg-dark bg-opacity-50 border border-secondary border-opacity-25 d-flex align-items-start gap-3 text-start w-100"
                onClick={() => setOpenItem(item)}
              >
                {/* notification-icon: 52px, 40px on a phone (dashboard.css). */}
                <div className={`notification-icon avatar-circle ${icon.className} fw-bold flex-shrink-0 d-flex align-items-center justify-content-center`} style={{ width: 52, height: 52 }}>
                  <i className={`bi ${icon.icon} fs-4`}></i>
                </div>
                <div className="flex-grow-1" style={{ minWidth: 0 }}>
                  <div className="d-flex flex-wrap align-items-center gap-2 mb-1">
                    <h5 className="text-white fw-bold mb-0" style={{ overflowWrap: "anywhere" }}>{item.title}</h5>
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
