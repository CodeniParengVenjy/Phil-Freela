import { useEffect } from "react";

// What a super admin can do that a regular admin cannot. Kept in one list so
// the Promote and Demote pop-ups always describe the same powers.
const SUPER_ADMIN_POWERS = [
  { icon: "bi-person-plus-fill", text: "Add new admin accounts and remove admins" },
  { icon: "bi-arrow-left-right", text: "Promote and demote other admins" },
  { icon: "bi-patch-check-fill", text: "Approve or decline other admins' suspend and ban requests" },
  { icon: "bi-megaphone-fill", text: "Post announcements and the dashboard billboard" },
  { icon: "bi-trash-fill", text: "Permanently delete user accounts" }
];

// The designed pop-up for changing an admin's role on the Admins page (it
// replaces the browser's plain confirm box). newRole is "super_admin" to
// promote or "admin" to demote. The page runs the change in onConfirm, shows
// busy while it works and passes the database's words in error if it refuses.
export default function AdminRoleDialog({ admin, newRole, busy, error, onConfirm, onCancel }) {
  const promoting = newRole === "super_admin";

  // Escape closes the pop-up, unless the change is already being saved.
  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === "Escape" && !busy) onCancel();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [busy, onCancel]);

  return (
    <div className="admin-modal-backdrop" onClick={() => !busy && onCancel()}>
      <div
        className={`admin-card admin-modal admin-role-modal rounded-4 text-center ${promoting ? "is-promote" : "is-demote"}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="roleDialogTitle"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="admin-role-hero">
          <div className="admin-role-icon">
            <i className={`bi ${promoting ? "bi-shield-fill-check" : "bi-arrow-down-circle-fill"}`}></i>
          </div>
        </div>

        <div className="px-4 pt-3 pb-1">
          <h2 id="roleDialogTitle" className="h5 fw-bold text-white mb-1">
            {promoting ? `Promote ${admin.full_name} to super admin?` : `Demote ${admin.full_name} to a regular admin?`}
          </h2>
          <p className="text-secondary fs-7 mb-3">
            {promoting
              ? "This gives them the highest level of access in the Admin Panel."
              : "They will keep their admin account but lose the powers below."}
          </p>

          {/* Who is changing, and from which role to which. */}
          <div className="admin-role-person text-start mb-3">
            <div className="admin-role-avatar">{(admin.full_name || "?").trim().charAt(0).toUpperCase()}</div>
            <div className="admin-role-who">
              <div className="fw-bold text-white text-truncate">{admin.full_name}</div>
              <div className="text-white-50 fs-8 text-truncate">@{admin.username}</div>
            </div>
            <div className="admin-role-change">
              <span className={`badge ${promoting ? "bg-secondary" : "admin-badge-orange"} fw-normal`}>
                {promoting ? "Admin" : "Super admin"}
              </span>
              <i className="bi bi-arrow-right text-white-50"></i>
              <span className={`badge ${promoting ? "admin-badge-orange" : "bg-secondary"} fw-normal`}>
                {promoting ? "Super admin" : "Admin"}
              </span>
            </div>
          </div>

          <div className="admin-role-powers text-start mb-3">
            <div className="fs-8 fw-bold text-uppercase text-white-50 mb-2">
              {promoting ? "They will be able to" : "They will no longer be able to"}
            </div>
            <ul className="list-unstyled mb-0">
              {SUPER_ADMIN_POWERS.map((power) => (
                <li key={power.icon} className="fs-7">
                  <i className={`bi ${power.icon}`}></i>
                  <span>{power.text}</span>
                </li>
              ))}
            </ul>
          </div>

          {promoting && (
            <p className="admin-role-note text-start fs-8 mb-3">
              <i className="bi bi-exclamation-triangle-fill me-2"></i>
              Only promote someone you trust. You can demote them later from this page.
            </p>
          )}

        </div>

        {/* The buttons stay in view at the bottom of the card, so on a small
            phone the pop-up scrolls above them and a refusal is seen at once. */}
        <div className="admin-role-actions">
          {error && (
            <p className="admin-message error fs-7 fw-semibold mb-2" role="alert">{error}</p>
          )}
          <div className="d-flex justify-content-center flex-wrap gap-2">
            <button type="button" className="btn btn-outline-light btn-sm rounded-pill px-4" onClick={onCancel} disabled={busy}>
              Cancel
            </button>
            <button
              type="button"
              className={`btn ${promoting ? "btn-admin-orange" : "btn-warning"} btn-sm rounded-pill px-4 fw-bold`}
              onClick={onConfirm}
              disabled={busy}
            >
              <i className={`bi ${promoting ? "bi-shield-fill-check" : "bi-arrow-down-circle"} me-1`}></i>
              {busy ? "Saving..." : promoting ? "Promote to super admin" : "Demote to admin"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
