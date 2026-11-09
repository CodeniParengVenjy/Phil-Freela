import { useCallback, useEffect, useState } from "react";
import { NavLink } from "react-router-dom";
import { getMyAnnouncements } from "../../../lib/announcements";
import {
  getMyAnnouncementReads, getMyNotifications, getNotificationsSeenAt, isUnread, markNotificationRead, markNotificationsSeen, mergeNotifications, notificationIcons
} from "../../../lib/notifications";
import { shortTimeAgo } from "../../../lib/chatTime";
import TopNavIconMenu from "./TopNavIconMenu";
import NotificationDialog from "./NotificationDialog";
import { SkeletonRows } from "../../../components/Loaders";

// How many of the newest notifications the bell's list shows.
const LIST_SIZE = 6;

// The bell in the top bar: a red number for the notifications not read yet,
// and a list of the newest ones when pressed. Pressing one opens the same
// popup as on the Notifications page and marks only that one as read;
// "Mark all as read" clears the number; "See all notifications" opens that
// page. Opening the list marks nothing (PLAN-notifications.md, Step N5).
export default function TopNavNotifications({ currentUserId, unread, onRead }) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState(null);
  const [loadError, setLoadError] = useState(false);
  // The last "Mark all as read": anything newer that wasn't opened is shown
  // in bold with a dot.
  const [seenAt, setSeenAt] = useState(null);
  // The item open in the popup (null = closed).
  const [openItem, setOpenItem] = useState(null);
  const closeItem = useCallback(() => setOpenItem(null), []);

  // Loads the list each time it opens, and again if the number changes while
  // it is open (something new arrived, or one was read).
  useEffect(() => {
    if (!open || !currentUserId) return undefined;
    let active = true;

    (async () => {
      const [announcementsResult, notificationsResult, reads, lastSeen] = await Promise.all([
        getMyAnnouncements().limit(LIST_SIZE),
        getMyNotifications().limit(LIST_SIZE),
        getMyAnnouncementReads(),
        getNotificationsSeenAt(currentUserId)
      ]);

      if (!active) return;
      if (announcementsResult.error || notificationsResult.error) {
        setLoadError(true);
        return;
      }

      setLoadError(false);
      setSeenAt(lastSeen);
      setItems(mergeNotifications(announcementsResult.data, notificationsResult.data, reads).slice(0, LIST_SIZE));
    })();

    return () => { active = false; };
  }, [open, currentUserId, unread]);

  // Opening one item marks only that one as read, and the number goes down.
  const openOne = async (item) => {
    setOpenItem(item);
    if (!isUnread(item, seenAt)) return;
    const readAt = new Date().toISOString();
    setItems((prev) => prev.map((one) => (one.key === item.key ? { ...one, read_at: readAt } : one)));
    await markNotificationRead(item);
    onRead();
  };

  // "Mark all as read": everything up to the newest item.
  const markAllRead = async () => {
    const newest = items?.[0]?.created_at;
    if (!newest) return;
    setSeenAt(newest);
    await markNotificationsSeen(currentUserId, newest);
    onRead();
  };

  return (
    <>
      <TopNavIconMenu icon="bi-bell-fill" label="Notifications" count={unread} tour="topbar-notifications" onOpenChange={setOpen}>
        <div className="topbar-panel-head px-3 py-2 border-bottom border-secondary border-opacity-25 fw-bold text-white d-flex align-items-center justify-content-between gap-2">
          <span>Notifications</span>
          {unread > 0 && items?.length > 0 && (
            <button type="button" className="btn btn-link p-0 text-role fs-8 fw-bold text-decoration-none" onClick={markAllRead}>
              Mark all as read
            </button>
          )}
        </div>

        <div className="topbar-panel-list">
          {loadError && <p className="text-white-50 fs-7 text-center py-4 mb-0">Failed to load notifications.</p>}
          {!loadError && items === null && <SkeletonRows count={4} picture={40} boxed={false} label="Loading notifications" className="d-flex flex-column py-1" />}
          {!loadError && items?.length === 0 && (
            <div className="text-white-50 fs-7 text-center py-4">
              <i className="bi bi-bell-slash fs-3 d-block mb-1"></i>
              No notifications yet.
            </div>
          )}

          {!loadError && items?.map((item) => {
            const isNew = isUnread(item, seenAt);
            const icon = notificationIcons[item.type] || notificationIcons.announcement;
            return (
              <button type="button" key={item.key} className="dropdown-item topbar-panel-item" onClick={() => openOne(item)}>
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
