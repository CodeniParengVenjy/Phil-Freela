import { useEffect, useState } from "react";
import { useOutletContext } from "react-router-dom";
import { getMyAnnouncements, getNotificationsSeenAt, markAnnouncementsSeen } from "../../../lib/announcements";

export default function NotificationsView() {
  const { currentUserId, unreadAnnouncements, refreshUnreadAnnouncements } = useOutletContext();
  const [announcements, setAnnouncements] = useState(null);
  const [loadError, setLoadError] = useState("");
  // When the user last opened this page, from before this visit. Anything
  // newer gets a "New" tag.
  const [lastSeenAt, setLastSeenAt] = useState(null);

  // Also runs again when a new announcement arrives while this page is open
  // (the unread count goes above 0), so it shows up without a refresh.
  const hasUnread = unreadAnnouncements > 0;

  useEffect(() => {
    if (!currentUserId) return;
    let active = true;

    (async () => {
      const [{ data, error }, seenAt] = await Promise.all([
        getMyAnnouncements(),
        getNotificationsSeenAt(currentUserId)
      ]);

      if (!active) return;
      if (error) {
        setLoadError("Failed to load notifications.");
        return;
      }

      // Keep the time from the first load, so the "New" tags don't vanish
      // the moment this page marks everything as read.
      setLastSeenAt((prev) => prev ?? seenAt);
      setAnnouncements(data);

      // Opening this page counts as reading them: the badge goes back to 0.
      await markAnnouncementsSeen(currentUserId, data[0]?.created_at);
      if (active) refreshUnreadAnnouncements();
    })();

    return () => { active = false; };
  }, [currentUserId, hasUnread, refreshUnreadAnnouncements]);

  return (
    <section className="dashboard-view active-view">
      <div className="glass-card rounded-4 p-4 border border-secondary border-opacity-25">
        <h3 className="text-white fw-bold mb-4"><i className="bi bi-bell-fill text-warning me-2"></i> Notifications</h3>

        {loadError && <p className="text-secondary text-center mb-0">{loadError}</p>}
        {!loadError && announcements === null && <p className="text-secondary text-center mb-0">Loading notifications...</p>}
        {!loadError && announcements?.length === 0 && (
          <div className="text-secondary text-center py-4">
            <i className="bi bi-bell-slash fs-1 d-block mb-2"></i>
            No notifications yet.
          </div>
        )}

        <div className="d-flex flex-column gap-3">
          {announcements?.map((announcement) => {
            const isNew = lastSeenAt && new Date(announcement.created_at) > new Date(lastSeenAt);

            return (
              <div key={announcement.id} className="p-3 p-md-4 rounded-3 bg-dark bg-opacity-50 border border-secondary border-opacity-25 d-flex align-items-start gap-3">
                <div className="avatar-circle bg-role text-white fw-bold flex-shrink-0 d-flex align-items-center justify-content-center" style={{ width: 52, height: 52 }}>
                  <i className="bi bi-megaphone-fill fs-4"></i>
                </div>
                <div className="flex-grow-1" style={{ minWidth: 0 }}>
                  <div className="d-flex flex-wrap align-items-center gap-2 mb-1">
                    <h5 className="text-white fw-bold mb-0" style={{ overflowWrap: "anywhere" }}>{announcement.title}</h5>
                    {isNew && <span className="badge bg-warning text-dark rounded-pill">New</span>}
                  </div>
                  <p className="text-secondary fs-7 mb-1" style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{announcement.message}</p>
                  <small className="text-secondary fs-8">PhilFreela Admin • {new Date(announcement.created_at).toLocaleString()}</small>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
