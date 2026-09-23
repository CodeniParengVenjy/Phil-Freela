import { useEffect, useState } from "react";
import { useOutletContext } from "react-router-dom";
import { supabase } from "../../../lib/supabaseClient";

export default function AdminUsersView() {
  const { adminId } = useOutletContext();
  const [users, setUsers] = useState(null);
  // user_id -> suspension row, so each table row can look up its status fast.
  const [suspensions, setSuspensions] = useState({});
  const [loadError, setLoadError] = useState("");
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [message, setMessage] = useState({ text: "", type: "" });
  // The user the "Suspend" dialog is open for (null = dialog closed).
  const [suspendTarget, setSuspendTarget] = useState(null);
  const [suspendReason, setSuspendReason] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;

    (async () => {
      // Load users and suspensions at the same time.
      const [profilesResult, suspensionsResult] = await Promise.all([
        supabase.from("profiles").select("id, full_name, username, account_type, created_at").order("created_at", { ascending: false }),
        supabase.from("user_suspensions").select("user_id, reason, created_at")
      ]);

      if (!active) return;

      if (profilesResult.error || suspensionsResult.error) {
        setLoadError("Failed to load users.");
        return;
      }

      setUsers(profilesResult.data);
      setSuspensions(Object.fromEntries(suspensionsResult.data.map((s) => [s.user_id, s])));
    })();

    return () => { active = false; };
  }, []);

  // Apply the search box and the two filters to the full list.
  const searchText = search.trim().toLowerCase();
  const visibleUsers = (users || []).filter((user) => {
    const matchesSearch = !searchText
      || (user.full_name || "").toLowerCase().includes(searchText)
      || (user.username || "").toLowerCase().includes(searchText);
    const matchesRole = roleFilter === "all" || user.account_type === roleFilter;
    const isSuspended = Boolean(suspensions[user.id]);
    const matchesStatus = statusFilter === "all" || (statusFilter === "suspended" ? isSuspended : !isSuspended);
    return matchesSearch && matchesRole && matchesStatus;
  });

  const openSuspendDialog = (user) => {
    setSuspendTarget(user);
    setSuspendReason("");
    setMessage({ text: "", type: "" });
  };

  const confirmSuspend = async (event) => {
    event.preventDefault();
    const reason = suspendReason.trim();
    if (!reason) return;

    setBusy(true);
    // The "admins can suspend users" database rule only lets an admin add
    // this row, and only with their own id as suspended_by.
    const { data, error } = await supabase
      .from("user_suspensions")
      .insert({ user_id: suspendTarget.id, reason, suspended_by: adminId })
      .select("user_id, reason, created_at")
      .single();
    setBusy(false);

    if (error) {
      setMessage({ text: error.message || "Failed to suspend user.", type: "error" });
    } else {
      setSuspensions((prev) => ({ ...prev, [data.user_id]: data }));
      setMessage({ text: `${suspendTarget.full_name} has been suspended.`, type: "success" });
    }
    setSuspendTarget(null);
  };

  const unsuspendUser = async (user) => {
    if (!window.confirm(`Unsuspend ${user.full_name}? They will be able to log in again.`)) return;

    const { error } = await supabase.from("user_suspensions").delete().eq("user_id", user.id);
    if (error) {
      setMessage({ text: error.message || "Failed to unsuspend user.", type: "error" });
      return;
    }

    setSuspensions((prev) => {
      const next = { ...prev };
      delete next[user.id];
      return next;
    });
    setMessage({ text: `${user.full_name} is active again.`, type: "success" });
  };

  const deleteUser = async (user) => {
    if (!window.confirm(`Permanently delete ${user.full_name}? Their login, profile, services, job posts, and chats will all be deleted. This cannot be undone.`)) return;

    // delete_user() is a database function: it checks the caller is an
    // admin, then deletes the login account and everything linked to it.
    const { error } = await supabase.rpc("delete_user", { target_id: user.id });
    if (error) {
      setMessage({ text: error.message || "Failed to delete user.", type: "error" });
      return;
    }

    setUsers((prev) => prev.filter((u) => u.id !== user.id));
    setMessage({ text: `${user.full_name} was deleted.`, type: "success" });
  };

  return (
    <section>
      <h1 className="h4 fw-bold mb-3">Users</h1>

      <div className="admin-card rounded-4 p-3 mb-3">
        <div className="row g-2">
          <div className="col-12 col-lg-6">
            <input
              type="search"
              className="form-control admin-input"
              placeholder="Search by name or username..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="col-6 col-lg-3">
            <select className="form-select admin-input" value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)} aria-label="Filter by role">
              <option value="all">All roles</option>
              <option value="freelancer">Freelancers</option>
              <option value="client">Clients</option>
            </select>
          </div>
          <div className="col-6 col-lg-3">
            <select className="form-select admin-input" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} aria-label="Filter by status">
              <option value="all">All statuses</option>
              <option value="active">Active</option>
              <option value="suspended">Suspended</option>
            </select>
          </div>
        </div>
      </div>

      {message.text && (
        <p className={`admin-message ${message.type} fs-7 fw-semibold`} aria-live="polite">{message.text}</p>
      )}

      <div className="admin-card rounded-4 p-3 p-md-4">
        <div className="table-responsive">
          <table className="table table-dark table-hover align-middle mb-0">
            <thead>
              <tr>
                <th>Full Name</th>
                <th>Username</th>
                <th>Role</th>
                <th>Status</th>
                <th>Joined</th>
                <th className="text-end">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loadError && (
                <tr><td colSpan={6} className="text-center text-white-50 py-4">{loadError}</td></tr>
              )}
              {!loadError && users === null && (
                <tr><td colSpan={6} className="text-center text-white-50 py-4">Loading users...</td></tr>
              )}
              {!loadError && users !== null && visibleUsers.length === 0 && (
                <tr><td colSpan={6} className="text-center text-white-50 py-4">No users found.</td></tr>
              )}
              {!loadError && visibleUsers.map((user) => {
                const suspension = suspensions[user.id];
                return (
                  <tr key={user.id}>
                    <td>{user.full_name}</td>
                    <td>{user.username}</td>
                    <td>
                      <span className={`badge ${user.account_type === "client" ? "bg-info" : "admin-badge-orange"} text-white fw-normal`}>
                        {user.account_type === "client" ? "Client" : "Freelancer"}
                      </span>
                    </td>
                    <td>
                      {suspension ? (
                        <>
                          <span className="badge bg-danger fw-normal">Suspended</span>
                          <div className="text-white-50 fs-8 mt-1 admin-reason" title={suspension.reason}>{suspension.reason}</div>
                        </>
                      ) : (
                        <span className="badge bg-success fw-normal">Active</span>
                      )}
                    </td>
                    <td>{new Date(user.created_at).toLocaleDateString()}</td>
                    <td className="text-end text-nowrap">
                      {suspension ? (
                        <button className="btn btn-outline-success btn-sm me-2" onClick={() => unsuspendUser(user)}>
                          <i className="bi bi-unlock"></i> Unsuspend
                        </button>
                      ) : (
                        <button className="btn btn-outline-warning btn-sm me-2" onClick={() => openSuspendDialog(user)}>
                          <i className="bi bi-slash-circle"></i> Suspend
                        </button>
                      )}
                      <button className="btn btn-outline-danger btn-sm" onClick={() => deleteUser(user)}>
                        <i className="bi bi-trash"></i> Delete
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Suspend dialog: asks the admin for a reason, which the user sees at login. */}
      {suspendTarget && (
        <div className="admin-modal-backdrop" onClick={() => !busy && setSuspendTarget(null)}>
          <form className="admin-card admin-modal rounded-4 p-4" onClick={(e) => e.stopPropagation()} onSubmit={confirmSuspend}>
            <h2 className="h5 fw-bold text-white mb-1">Suspend {suspendTarget.full_name}?</h2>
            <p className="text-secondary fs-7 mb-3">
              They will be signed out and can't log in, post, or send messages until you unsuspend them.
            </p>
            <label htmlFor="suspendReason" className="form-label text-white-50 fs-7 mb-1">Reason (shown to the user)</label>
            <textarea
              id="suspendReason"
              className="form-control admin-input mb-3"
              rows={3}
              maxLength={500}
              placeholder="e.g. Posting spam listings"
              value={suspendReason}
              onChange={(e) => setSuspendReason(e.target.value)}
              autoFocus
              required
            />
            <div className="d-flex justify-content-end gap-2">
              <button type="button" className="btn btn-outline-light btn-sm rounded-pill px-3" onClick={() => setSuspendTarget(null)} disabled={busy}>
                Cancel
              </button>
              <button type="submit" className="btn btn-warning btn-sm rounded-pill px-3 fw-bold" disabled={busy || !suspendReason.trim()}>
                Suspend User
              </button>
            </div>
          </form>
        </div>
      )}
    </section>
  );
}
