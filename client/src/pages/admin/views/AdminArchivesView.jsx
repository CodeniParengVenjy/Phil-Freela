import { useEffect, useState } from "react";
import { useOutletContext } from "react-router-dom";
import { supabase } from "../../../lib/supabaseClient";
import { ARCHIVE_DELETE_DAYS, archiveDeletionDay } from "../../../lib/archives";
import { formatUserNumber } from "../../../lib/userNumber";

// Someone who signed up before names were required can have no name. In
// sentences ("Restore ...'s account?") they are called by their @username.
const nameOf = (user) => user.full_name || `@${user.username}`;

// Where "Archive" on the Users page puts an account (see lib/archives.js). The
// account is kept, but can't log in and its listings are hidden. Any admin can
// restore it; only a super admin can delete it for good (the database refuses
// anyone else). A daily database job deletes it after ARCHIVE_DELETE_DAYS days.
export default function AdminArchivesView() {
  const { isSuperAdmin } = useOutletContext();
  // null while loading, then the archived accounts (newest first).
  const [accounts, setAccounts] = useState(null);
  const [loadError, setLoadError] = useState("");
  const [search, setSearch] = useState("");
  const [message, setMessage] = useState({ text: "", type: "" });
  // The open pop-up: { kind: "restore" | "delete", user } (null = closed).
  const [dialog, setDialog] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;

    // admin_list_archived() is a database function that adds each account's
    // email (only admins can call it).
    supabase.rpc("admin_list_archived").then(({ data, error }) => {
      if (!active) return;
      if (error) {
        setLoadError("Failed to load archived accounts.");
        return;
      }
      setAccounts(data);
    });

    return () => { active = false; };
  }, []);

  const searchText = search.trim().toLowerCase();
  const visible = (accounts || []).filter((user) => !searchText
    || (user.full_name || "").toLowerCase().includes(searchText)
    || (user.username || "").toLowerCase().includes(searchText)
    || (user.email || "").toLowerCase().includes(searchText)
    || (searchText.length >= 3 && user.user_number && formatUserNumber(user.user_number).toLowerCase().includes(searchText)));

  const openDialog = (kind, user) => {
    setDialog({ kind, user });
    setMessage({ text: "", type: "" });
  };

  // restore_user() and delete_user() are database functions that re-check who
  // is asking: any admin may restore, only a super admin may delete, and
  // delete_user() refuses an account that isn't archived.
  const confirmDialog = async () => {
    const { kind, user } = dialog;

    setBusy(true);
    const { error } = await supabase.rpc(kind === "restore" ? "restore_user" : "delete_user", { target_id: user.id });
    setBusy(false);
    setDialog(null);

    if (error) {
      setMessage({ text: error.message || `Failed to ${kind === "restore" ? "restore" : "delete"} the account.`, type: "error" });
      return;
    }

    setAccounts((prev) => prev.filter((u) => u.id !== user.id));
    setMessage({
      text: kind === "restore" ? `${nameOf(user)}'s account was restored. They can log in again.` : `${nameOf(user)}'s account was deleted for good.`,
      type: "success"
    });
  };

  return (
    <section>
      <h1 className="h4 fw-bold mb-1">Archives</h1>
      <p className="text-white-50 fs-7 mb-3">
        Archived accounts can't log in, and their listings are hidden. Nothing is deleted until a super admin deletes it here, or after {ARCHIVE_DELETE_DAYS} days.
      </p>

      <div className="admin-card rounded-4 p-3 mb-3">
        <input
          type="search"
          className="form-control admin-input"
          placeholder="Search by name, username, email, or ID (like PF-0007)..."
          aria-label="Search archived accounts"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {message.text && (
        <p className={`admin-message ${message.type} fs-7 fw-semibold`} aria-live="polite">{message.text}</p>
      )}

      <div className="admin-card rounded-4 p-3 p-md-4">
        <div className="table-responsive">
          <table className="table table-dark table-hover align-middle mb-0">
            <thead>
              <tr>
                <th>ID</th>
                <th>Name</th>
                <th>Username</th>
                <th>Email</th>
                <th>Role</th>
                <th>Archived</th>
                <th className="text-end">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loadError && (
                <tr><td colSpan={7} className="text-center text-white-50 py-4">{loadError}</td></tr>
              )}
              {!loadError && accounts === null && (
                <tr><td colSpan={7} className="text-center text-white-50 py-4">Loading archived accounts...</td></tr>
              )}
              {!loadError && accounts !== null && visible.length === 0 && (
                <tr>
                  <td colSpan={7} className="text-center text-white-50 py-4">
                    {accounts.length === 0 ? "No archived accounts." : "No archived accounts match your search."}
                  </td>
                </tr>
              )}
              {!loadError && visible.map((user) => (
                <tr key={user.id}>
                  <td className="font-monospace fs-7 text-white-50 text-nowrap" title={`System ID ${user.id}`}>
                    {user.user_number ? formatUserNumber(user.user_number) : user.id.slice(0, 8)}
                  </td>
                  <td>{user.full_name || <span className="text-white-50">No name</span>}</td>
                  <td>{user.username}</td>
                  <td>{user.email}</td>
                  <td>
                    <span className={`badge ${user.account_type === "client" ? "bg-info" : "admin-badge-orange"} text-white fw-normal`}>
                      {user.account_type === "client" ? "Client" : "Freelancer"}
                    </span>
                  </td>
                  <td>
                    {new Date(user.archived_at).toLocaleDateString()}
                    <div className="text-white-50 fs-8">by {user.archived_by_name || "an admin who was removed"}</div>
                    {/* A daily database job deletes accounts archived 100 days ago. */}
                    <div className="text-danger fs-8">Deleted on {archiveDeletionDay(user.archived_at)}</div>
                  </td>
                  <td className="text-end text-nowrap">
                    <button className="btn btn-outline-success btn-sm" onClick={() => openDialog("restore", user)}>
                      <i className="bi bi-arrow-counterclockwise"></i> Restore
                    </button>
                    {/* Hiding this is only for looks; the database refuses anyone but a super admin. */}
                    {isSuperAdmin && (
                      <button className="btn btn-danger btn-sm ms-2" onClick={() => openDialog("delete", user)}>
                        <i className="bi bi-trash"></i> Delete forever
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Restore / Delete forever pop-up. Deleting is permanent, so it spells out
          what is lost before the admin confirms. */}
      {dialog && (
        <div className="admin-modal-backdrop" onClick={() => !busy && setDialog(null)}>
          <div
            className="admin-card admin-modal rounded-4 p-4 text-center"
            role="dialog"
            aria-modal="true"
            aria-labelledby="archiveDialogTitle"
            onClick={(e) => e.stopPropagation()}
          >
            <div className={`admin-lift-icon ${dialog.kind === "delete" ? "danger" : ""} mx-auto mb-3`}>
              <i className={`bi ${dialog.kind === "delete" ? "bi-trash-fill" : "bi-arrow-counterclockwise"}`}></i>
            </div>
            <h2 id="archiveDialogTitle" className="h5 fw-bold text-white mb-2">
              {dialog.kind === "delete" ? "Delete" : "Restore"} {nameOf(dialog.user)}'s account{dialog.kind === "delete" ? " for good" : ""}?
            </h2>
            <p className="text-secondary fs-7 mb-1">
              {dialog.user.username} · {dialog.user.email}
            </p>
            <p className="text-secondary fs-7 mb-4">
              {dialog.kind === "delete"
                ? "This permanently deletes their login and everything in the account. It cannot be undone."
                : "They can log in again right away, and their listings come back."}
            </p>
            <div className="d-flex justify-content-center gap-2">
              <button type="button" className="btn btn-outline-light btn-sm rounded-pill px-4" onClick={() => setDialog(null)} disabled={busy}>
                Cancel
              </button>
              {dialog.kind === "delete" ? (
                <button type="button" className="btn btn-danger btn-sm rounded-pill px-4 fw-bold" onClick={confirmDialog} disabled={busy}>
                  <i className="bi bi-trash me-1"></i>
                  {busy ? "Deleting..." : "Delete forever"}
                </button>
              ) : (
                <button type="button" className="btn btn-success btn-sm rounded-pill px-4 fw-bold" onClick={confirmDialog} disabled={busy}>
                  <i className="bi bi-arrow-counterclockwise me-1"></i>
                  {busy ? "Working..." : "Restore account"}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
