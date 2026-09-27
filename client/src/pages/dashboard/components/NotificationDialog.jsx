import { useEffect } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { notificationIcons, notificationLinkLabels } from "../../../lib/notifications";

// The popup that opens when a notification is clicked: the full message, and
// a button to the related page when it has one (e.g. Verify Identity). Same
// look as the other popups (it reuses the role-confirm-* CSS classes), and
// rendered straight into <body> so it always covers the whole screen.
export default function NotificationDialog({ item, onClose }) {
  const navigate = useNavigate();

  // Escape closes the popup.
  useEffect(() => {
    if (!item) return undefined;
    const handleKeyDown = (event) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [item, onClose]);

  if (!item) return null;

  const icon = notificationIcons[item.type] || notificationIcons.announcement;

  const goToLink = () => {
    onClose();
    navigate(item.link);
  };

  return createPortal(
    <div
      className="role-confirm-backdrop"
      style={{
        position: "fixed", inset: 0, zIndex: 1300,
        background: "rgba(0,0,0,0.65)",
        display: "flex", alignItems: "center", justifyContent: "center", padding: "1rem"
      }}
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="notification-dialog-title"
        className="role-confirm-card bg-dark text-white border border-secondary border-opacity-25 rounded-4 p-4"
        style={{ maxWidth: 520, width: "100%", maxHeight: "85vh", overflowY: "auto" }}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="d-flex align-items-center gap-3 mb-3">
          <div className={`${icon.className} rounded-circle flex-shrink-0 d-flex align-items-center justify-content-center`} style={{ width: 48, height: 48 }}>
            <i className={`bi ${icon.icon} fs-5`}></i>
          </div>
          <div style={{ minWidth: 0 }}>
            <h5 id="notification-dialog-title" className="fw-bold mb-0" style={{ overflowWrap: "anywhere" }}>{item.title}</h5>
            <small className="text-secondary">{item.from} • {new Date(item.created_at).toLocaleString()}</small>
          </div>
        </div>

        <p className="text-white-50 fs-7 mb-4" style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{item.message}</p>

        <div className="d-flex flex-wrap gap-2 justify-content-end">
          <button type="button" className="btn btn-outline-secondary text-white-50 rounded-pill px-4 py-2 fw-bold" onClick={onClose}>
            Close
          </button>
          {item.link && (
            <button type="button" className="btn btn-gradient-role rounded-pill px-4 py-2 fw-bold text-white" onClick={goToLink}>
              {notificationLinkLabels[item.link] || "Open"}
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
