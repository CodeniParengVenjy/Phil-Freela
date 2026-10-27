import { useCallback, useEffect, useState } from "react";
import { NavLink } from "react-router-dom";
import { getMyAnnouncements } from "../../../lib/announcements";
import { getMyNotifications, getNotificationsSeenAt, markNotificationsSeen, mergeNotifications, notificationIcons } from "../../../lib/notifications";
import { shortTimeAgo } from "../../../lib/chatTime";
import TopNavIconMenu from "./TopNavIconMenu";
import NotificationDialog from "./NotificationDialog";

// How many of the newest notifications the bell's list shows.
const LIST_SIZE = 6;

// The bell in the top bar: a red number for the notifications not read yet,
// and a list of the newest ones when pressed. Pressing one opens the same
// popup as on the Notifications page; "See all notifications" opens that page.
// Opening the list counts as reading them (like opening the page), so the
// number goes back to 0.
export default function TopNavNotifications({ currentUserId, unread, onRead }) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState(null);
  const [loadError, setLoadError] = useState(false);
  // When the user last read their notifications, from before this opening:
  // anything newer is shown in bold with a dot.
  const [lastSeenAt, setLastSeenAt] = useState(null);
  // The item open in the popup (null = closed).
  const [openItem, setOpenItem] = useState(null);
  const closeItem = useCallback(() => setOpenItem(null), []);

  const handleOpenChange = useCallback((isOpen) => {
    setOpen(isOpen);
    // The next opening reads the time again, so its new ones get the dot.
    if (!isOpen) setLastSeenAt(null);
  }, []);

  // Loads the list each time it opens, and again if something new arrives
  // while it is open (the number goes above 0).
  const hasUnread = unread > 0;

  useEffect(() => {
    if (!open || !currentUserId) return undefined;
    let active = true;

    (async () => {
      const [announcementsResult, notificationsResult, seenAt] = await Promise.all([
        getMyAnnouncements().limit(LIST_SIZE),
        getMyNotifications().limit(LIST_SIZE),
        getNotificationsSeenAt(currentUserId)
      ]);

      if (!active) return;
      if (announcementsResult.error || notificationsResult.error) {
        setLoadError(true);
        return;
      }

      const merged = mergeNotifications(announcementsResult.data, notificationsResult.data).slice(0, LIST_SIZE);
      setLoadError(false);
      setLastSeenAt((prev) => prev ?? seenAt);
      setItems(merged);

      // Seeing the list counts as reading them: the number goes back to 0.
      await markNotificationsSeen(currentUserId, merged[0]?.created_at);
      if (active) onRead();
    })();

    return () => { active = false; };
  }, [open, currentUserId, hasUnread, onRead]);

  return (
    <>
      <TopNavIconMenu icon="bi-bell-fill" label="Notifications" count={unread} tour="topbar-notifications" onOpenChange={handleOpenChange}>
        <div className="topbar-panel-head px-3 py-2 border-bottom border-secondary border-opacity-25 fw-bold text-white">Notifications</div>

        <div className="topbar-panel-list">
          {loadError && <p className="text-white-50 fs-7 text-center py-4 mb-0">Failed to load notifications.</p>}
          {!loadError && items === null && <p className="text-white-50 fs-7 text-center py-4 mb-0">Loading...</p>}
          {!loadError && items?.length === 0 && (
            <div className="text-white-50 fs-7 text-center py-4">
              <i className="bi bi-bell-slash fs-3 d-block mb-1"></i>
              No notifications yet.
            </div>
          )}

          {!loadError && items?.map((item) => {
            const isNew = lastSeenAt && new Date(item.created_at) > new Date(lastSeenAt);
            const icon = notificationIcons[item.type] || notificationIcons.announcement;
            return (
              <button type="button" key={item.key} className="dropdown-item topbar-panel-item" onClick={() => setOpenItem(item)}>
                <span className={`topbar-panel-icon ${icon.className}`}>
                  <i className={`bi ${icon.icon}`}></i>
                </span>
                <span className="flex-grow-1 min-w-0">
                  <span className={`d-block text-truncate text-white ${isNew ? "fw-bold" : ""}`}>{item.title}</span>
                  <span className="d-block text-truncate text-white-50 fs-8">{item.message}</span>
                </span>
                <span className="topbar-panel-meta">
                  <small className="text-white-50 fs-8">{shortTimeAgo(item.created_at)}</small>
                  {isNew && <span className="topbar-new-dot" title="New"></span>}
                </span>
              </button>
            );
          })}
        </div>

        <NavLink to="/dashboard/notifications" className="dropdown-item topbar-panel-all">See all notifications</NavLink>
      </TopNavIconMenu>

      <NotificationDialog item={openItem} onClose={closeItem} />
    </>
  );
}
