import { useEffect, useState } from "react";
import { useOutletContext } from "react-router-dom";
import { supabase } from "../../../lib/supabaseClient";
import { useVerifiedIds } from "../../../lib/useVerifiedIds";
import VerifiedBadge from "../../../components/VerifiedBadge";
import { blockedBadges, endDateToTimestamp, formatEndDate, saveSuspension, suspensionStatus, tomorrowDateValue } from "../../../lib/suspensions";

// Text for the Suspend / Ban pop-up.
const blockText = {
  suspend: {
    title: "Suspend",
    info: "They will be signed out and can't log in, post, or send messages until the date below. You can unsuspend them early.",
    button: "Suspend User",
    buttonClass: "btn-warning",
    done: "has been suspended"
  },
  ban: {
    title: "Ban",
    info: "They will be signed out and can't log in, post, or send messages until you unban them. Their account and data are kept.",
    button: "Ban User",
    buttonClass: "btn-danger",
    done: "has been banned"
  }
};

export default function AdminUsersView() {
  const { adminId } = useOutletContext();
  const [users, setUsers] = useState(null);
  const verifiedIds = useVerifiedIds((users || []).map((user) => user.id));
  // user_id -> suspension row, so each table row can look up its status fast.
  // A row with no end date is a ban (see lib/suspensions.js).
  const [suspensions, setSuspensions] = useState({});
  const [loadError, setLoadError] = useState("");
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [message, setMessage] = useState({ text: "", type: "" });
  // The open Suspend / Ban pop-up: { kind: "suspend" | "ban", user } (null = closed).
  const [blockTarget, setBlockTarget] = useState(null);
  const [blockReason, setBlockReason] = useState("");
  // The day the suspension lifts, as "YYYY-MM-DD" from the date picker.
  const [endDate, setEndDate] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;

    (async () => {
      // Load users and suspensions at the same time. admin_list_users() is a
      // database function that adds each user's email (only admins can call it).
      const [profilesResult, suspensionsResult] = await Promise.all([
        supabase.rpc("admin_list_users"),
        supabase.from("user_suspensions").select("user_id, reason, ends_at, created_at")
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
      || (user.username || "").toLowerCase().includes(searchText)
      || (user.email || "").toLowerCase().includes(searchText);
    const matchesRole = roleFilter === "all" || user.account_type === roleFilter;
    // "active" when there's no suspension, or it already ended.
    const status = suspensionStatus(suspensions[user.id]) || "active";
    const matchesStatus = statusFilter === "all" || statusFilter === status;
    return matchesSearch && matchesRole && matchesStatus;
  });

  const openBlockDialog = (kind, user) => {
    setBlockTarget({ kind, user });
    setBlockReason("");
    setEndDate("");
    setMessage({ text: "", type: "" });
  };

  const confirmBlock = async (event) => {
    event.preventDefault();
    const { kind, user } = blockTarget;
    const reason = blockReason.trim();
    if (!reason || (kind === "suspend" && !endDate)) return;

    setBusy(true);
    // A ban is saved with no end date.
    const { data, error } = await saveSuspension({
      userId: user.id,
      reason,
      endsAt: kind === "suspend" ? endDateToTimestamp(endDate) : null,
      adminId
    });
    setBusy(false);

    if (error) {
      setMessage({ text: error.message || `Failed to ${kind} user.`, type: "error" });
    } else {
      setSuspensions((prev) => ({ ...prev, [data.user_id]: data }));
      setMessage({ text: `${user.full_name} ${blockText[kind].done}.`, type: "success" });
    }
    setBlockTarget(null);
  };

  // Unsuspending and unbanning both just delete the row.
  const liftBlock = async (user, status) => {
    const word = status === "banned" ? "Unban" : "Unsuspend";
    if (!window.confirm(`${word} ${user.full_name}? They will be able to log in again.`)) return;

    const { error } = await supabase.from("user_suspensions").delete().eq("user_id", user.id);
    if (error) {
      setMessage({ text: error.message || `Failed to ${word.toLowerCase()} user.`, type: "error" });
      return;
    }

    setSuspensions((prev) => {
      const next = { ...prev };
      delete next[user.id];
      return next;
    });
    setMessage({ text: `${user.full_name} is active again.`, type: "success" });
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
              placeholder="Search by name, username, or email..."
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
              <option value="banned">Banned</option>
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
                <th>Email</th>
                <th>Role</th>
                <th>Status</th>
                <th>Joined</th>
                <th className="text-end">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loadError && (
                <tr><td colSpan={7} className="text-center text-white-50 py-4">{loadError}</td></tr>
              )}
              {!loadError && users === null && (
                <tr><td colSpan={7} className="text-center text-white-50 py-4">Loading users...</td></tr>
              )}
              {!loadError && users !== null && visibleUsers.length === 0 && (
                <tr><td colSpan={7} className="text-center text-white-50 py-4">No users found.</td></tr>
              )}
              {!loadError && visibleUsers.map((user) => {
                const suspension = suspensions[user.id];
                // "banned", "suspended", or null (active).
                const status = suspensionStatus(suspension);
                return (
                  <tr key={user.id}>
                    <td>
                      {user.full_name}
                      <VerifiedBadge verified={verifiedIds.has(user.id)} />
                    </td>
                    <td>{user.username}</td>
                    <td>
                      {user.email}
                      {/* The user signed up but never clicked the link in the confirmation email. */}
                      {!user.email_confirmed_at && (
                        <div><span className="badge bg-secondary fw-normal mt-1">Unconfirmed</span></div>
                      )}
                    </td>
                    <td>
                      <span className={`badge ${user.account_type === "client" ? "bg-info" : "admin-badge-orange"} text-white fw-normal`}>
                        {user.account_type === "client" ? "Client" : "Freelancer"}
                      </span>
                    </td>
                    <td>
                      {status ? (
                        <>
                          <span className={`badge ${blockedBadges[status].className} fw-normal`}>{blockedBadges[status].label}</span>
                          {status === "suspended" && (
                            <div className="text-white fs-8 mt-1">Until {formatEndDate(suspension.ends_at)}</div>
                          )}
                          <div className="text-white-50 fs-8 mt-1 admin-reason" title={suspension.reason}>{suspension.reason}</div>
                        </>
                      ) : (
                        <span className="badge bg-success fw-normal">Active</span>
                      )}
                    </td>
                    <td>{new Date(user.created_at).toLocaleDateString()}</td>
                    <td className="text-end text-nowrap">
                      {status ? (
                        <button className="btn btn-outline-success btn-sm" onClick={() => liftBlock(user, status)}>
                          <i className="bi bi-unlock"></i> {status === "banned" ? "Unban" : "Unsuspend"}
                        </button>
                      ) : (
                        <button className="btn btn-outline-warning btn-sm" onClick={() => openBlockDialog("suspend", user)}>
                          <i className="bi bi-slash-circle"></i> Suspend
                        </button>
                      )}
                      {/* A suspended user can still be banned; that replaces the suspension. */}
                      {status !== "banned" && (
                        <button className="btn btn-outline-danger btn-sm ms-2" onClick={() => openBlockDialog("ban", user)}>
                          <i className="bi bi-ban"></i> Ban
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Suspend / Ban pop-up: asks for a reason (shown to the user at login),
          and for a suspension, the day it lifts. */}
      {blockTarget && (
        <div className="admin-modal-backdrop" onClick={() => !busy && setBlockTarget(null)}>
          <form className="admin-card admin-modal rounded-4 p-4" onClick={(e) => e.stopPropagation()} onSubmit={confirmBlock}>
            <h2 className="h5 fw-bold text-white mb-1">{blockText[blockTarget.kind].title} {blockTarget.user.full_name}?</h2>
            <p className="text-secondary fs-7 mb-3">{blockText[blockTarget.kind].info}</p>
            <label htmlFor="blockReason" className="form-label text-white-50 fs-7 mb-1">Reason (shown to the user)</label>
            <textarea
              id="blockReason"
              className="form-control admin-input mb-3"
              rows={3}
              maxLength={500}
              placeholder="e.g. Posting spam listings"
              value={blockReason}
              onChange={(e) => setBlockReason(e.target.value)}
              autoFocus
              required
            />
            {blockTarget.kind === "suspend" && (
              <>
                <label htmlFor="endDate" className="form-label text-white-50 fs-7 mb-1">Suspension lifts on</label>
                <input
                  id="endDate"
                  type="date"
                  className="form-control admin-input mb-3"
                  min={tomorrowDateValue()}
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  required
                />
              </>
            )}
            <div className="d-flex justify-content-end gap-2">
              <button type="button" className="btn btn-outline-light btn-sm rounded-pill px-3" onClick={() => setBlockTarget(null)} disabled={busy}>
                Cancel
              </button>
              <button
                type="submit"
                className={`btn ${blockText[blockTarget.kind].buttonClass} btn-sm rounded-pill px-3 fw-bold`}
                disabled={busy || !blockReason.trim() || (blockTarget.kind === "suspend" && !endDate)}
              >
                {blockText[blockTarget.kind].button}
              </button>
            </div>
          </form>
        </div>
      )}
    </section>
  );
}
