import { useEffect, useState } from "react";
import { useOutletContext } from "react-router-dom";
import { supabase } from "../../../lib/supabaseClient";
import { useVerifiedIds } from "../../../lib/useVerifiedIds";
import VerifiedBadge from "../../../components/VerifiedBadge";
import { BAN_DELETE_DAYS, SUSPENSION_COLUMNS, banDeletionDay, blockedBadges, formatEndDate, restrictionText, saveSuspension, suspensionStatus } from "../../../lib/suspensions";
import { buildPenalty, emptyViolationFields } from "../../../lib/violations";
import ViolationFields from "../components/ViolationFields";

// Text for the Suspend / Ban pop-up.
const blockText = {
  suspend: {
    title: "Suspend",
    info: "The violation decides how long it lasts and what they can't do. They can still log in, and you can unsuspend them early.",
    button: "Suspend User",
    buttonClass: "btn-warning",
    done: "has been suspended"
  },
  ban: {
    title: "Ban",
    info: `They will be signed out and can't log in until you unban them. If they aren't unbanned within ${BAN_DELETE_DAYS} days, the account and everything in it is deleted for good.`,
    button: "Ban User",
    buttonClass: "btn-danger",
    done: "has been banned"
  }
};

export default function AdminUsersView() {
  const { adminId, isSuperAdmin } = useOutletContext();
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
  // What the admin picked in the pop-up (see ViolationFields).
  const [fields, setFields] = useState(emptyViolationFields);
  // The open Unsuspend / Unban pop-up: { user, status } (null = closed).
  const [liftTarget, setLiftTarget] = useState(null);
  // The open Delete account pop-up (super admins only): the user, or null (closed).
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;

    (async () => {
      // Load users and suspensions at the same time. admin_list_users() is a
      // database function that adds each user's email (only admins can call it).
      const [profilesResult, suspensionsResult] = await Promise.all([
        supabase.rpc("admin_list_users"),
        supabase.from("user_suspensions").select(SUSPENSION_COLUMNS)
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
    setFields(emptyViolationFields);
    setMessage({ text: "", type: "" });
  };

  const confirmBlock = async (event) => {
    event.preventDefault();
    const { kind, user } = blockTarget;
    // The penalty chart (lib/violations.js) turns the violation into the
    // length and what's blocked; a ban is saved with no end date.
    const penalty = buildPenalty(kind, fields);
    if (!penalty) return;

    setBusy(true);
    const { data, error } = await saveSuspension({ userId: user.id, adminId, penalty });
    setBusy(false);

    if (error) {
      setMessage({ text: error.message || `Failed to ${kind} user.`, type: "error" });
    } else {
      setSuspensions((prev) => ({ ...prev, [data.user_id]: data }));
      setMessage({ text: `${user.full_name} ${blockText[kind].done}.`, type: "success" });
    }
    setBlockTarget(null);
  };

  // Unsuspending and unbanning both just delete the row. The pop-up below
  // shows what's being lifted first.
  const confirmLift = async () => {
    const { user, status } = liftTarget;
    const word = status === "banned" ? "unban" : "unsuspend";

    setBusy(true);
    const { error } = await supabase.from("user_suspensions").delete().eq("user_id", user.id);
    setBusy(false);
    setLiftTarget(null);

    if (error) {
      setMessage({ text: error.message || `Failed to ${word} user.`, type: "error" });
      return;
    }

    setSuspensions((prev) => {
      const next = { ...prev };
      delete next[user.id];
      return next;
    });
    setMessage({ text: `${user.full_name} is active again.`, type: "success" });
  };

  // delete_user() is a database function that re-checks on the server that the
  // caller is a super admin and the target isn't an admin, then deletes the
  // login account and everything tied to it.
  const confirmDelete = async () => {
    const user = deleteTarget;

    setBusy(true);
    const { error } = await supabase.rpc("delete_user", { target_id: user.id });
    setBusy(false);
    setDeleteTarget(null);

    if (error) {
      setMessage({ text: error.message || "Failed to delete the account.", type: "error" });
      return;
    }

    setUsers((prev) => prev.filter((u) => u.id !== user.id));
    setMessage({ text: `${user.full_name}'s account was deleted.`, type: "success" });
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
                            <div className="text-white fs-8 mt-1">
                              Until {formatEndDate(suspension.ends_at)}
                              <div className="text-warning">{restrictionText(suspension.blocks_posting, suspension.blocks_messaging)}</div>
                            </div>
                          )}
                          {/* A daily database job deletes accounts banned 100 days ago. */}
                          {status === "banned" && (
                            <div className="text-danger fs-8 mt-1">Deleted on {banDeletionDay(suspension)}</div>
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
                        <button className="btn btn-outline-success btn-sm" onClick={() => { setLiftTarget({ user, status }); setMessage({ text: "", type: "" }); }}>
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
                      {/* Hiding this is only for looks; the database refuses anyone but a super admin. */}
                      {isSuperAdmin && (
                        <button className="btn btn-danger btn-sm ms-2" onClick={() => { setDeleteTarget(user); setMessage({ text: "", type: "" }); }}>
                          <i className="bi bi-trash"></i> Delete
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

      {/* Suspend / Ban pop-up: the admin picks the violation, and the penalty
          chart decides the rest. */}
      {blockTarget && (
        <div className="admin-modal-backdrop" onClick={() => !busy && setBlockTarget(null)}>
          <form className="admin-card admin-modal rounded-4 p-4" onClick={(e) => e.stopPropagation()} onSubmit={confirmBlock}>
            <h2 className="h5 fw-bold text-white mb-1">{blockText[blockTarget.kind].title} {blockTarget.user.full_name}?</h2>
            <p className="text-secondary fs-7 mb-3">{blockText[blockTarget.kind].info}</p>
            <ViolationFields kind={blockTarget.kind} fields={fields} setFields={setFields} />
            <div className="d-flex justify-content-end gap-2">
              <button type="button" className="btn btn-outline-light btn-sm rounded-pill px-3" onClick={() => setBlockTarget(null)} disabled={busy}>
                Cancel
              </button>
              <button
                type="submit"
                className={`btn ${blockText[blockTarget.kind].buttonClass} btn-sm rounded-pill px-3 fw-bold`}
                disabled={busy || !buildPenalty(blockTarget.kind, fields)}
              >
                {blockText[blockTarget.kind].button}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Delete account pop-up (super admins only): permanent, so it spells out
          what is lost before the admin confirms. */}
      {isSuperAdmin && deleteTarget && (
        <div className="admin-modal-backdrop" onClick={() => !busy && setDeleteTarget(null)}>
          <div
            className="admin-card admin-modal rounded-4 p-4 text-center"
            role="dialog"
            aria-modal="true"
            aria-labelledby="deleteTitle"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="admin-lift-icon mx-auto mb-3 text-danger">
              <i className="bi bi-trash-fill"></i>
            </div>
            <h2 id="deleteTitle" className="h5 fw-bold text-white mb-2">Delete {deleteTarget.full_name}'s account?</h2>
            <p className="text-secondary fs-7 mb-1">
              {deleteTarget.username} · {deleteTarget.email}
            </p>
            <p className="text-secondary fs-7 mb-4">
              This permanently deletes their login and everything in the account. It cannot be undone. To stop someone without deleting them, use Suspend or Ban instead.
            </p>
            <div className="d-flex justify-content-center gap-2">
              <button type="button" className="btn btn-outline-light btn-sm rounded-pill px-4" onClick={() => setDeleteTarget(null)} disabled={busy}>
                Cancel
              </button>
              <button type="button" className="btn btn-danger btn-sm rounded-pill px-4 fw-bold" onClick={confirmDelete} disabled={busy}>
                <i className="bi bi-trash me-1"></i>
                {busy ? "Deleting..." : "Delete account"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Unsuspend / Unban pop-up: shows the penalty being lifted before the
          admin confirms. */}
      {liftTarget && (
        <div className="admin-modal-backdrop" onClick={() => !busy && setLiftTarget(null)}>
          <div
            className="admin-card admin-modal rounded-4 p-4 text-center"
            role="dialog"
            aria-modal="true"
            aria-labelledby="liftTitle"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="admin-lift-icon mx-auto mb-3">
              <i className="bi bi-unlock-fill"></i>
            </div>
            <h2 id="liftTitle" className="h5 fw-bold text-white mb-2">
              {liftTarget.status === "banned" ? "Unban" : "Unsuspend"} {liftTarget.user.full_name}?
            </h2>
            <p className="text-secondary fs-7 mb-3">
              {liftTarget.status === "banned"
                ? "They'll be able to log in again right away."
                : "They'll be able to post and send messages again right away, instead of waiting for the end date."}
            </p>

            <div className="admin-lift-details text-start fs-7 mb-4">
              <div>
                <span className="text-white-50">Current penalty: </span>
                {liftTarget.status === "banned" ? "Ban" : `Suspended until ${formatEndDate(suspensions[liftTarget.user.id].ends_at)}`}
              </div>
              {liftTarget.status === "suspended" && (
                <div>
                  <span className="text-white-50">Restrictions: </span>
                  {restrictionText(suspensions[liftTarget.user.id].blocks_posting, suspensions[liftTarget.user.id].blocks_messaging)}
                </div>
              )}
              <div className="admin-description">
                <span className="text-white-50">Reason: </span>
                {suspensions[liftTarget.user.id].reason}
              </div>
            </div>

            <div className="d-flex justify-content-center gap-2">
              <button type="button" className="btn btn-outline-light btn-sm rounded-pill px-4" onClick={() => setLiftTarget(null)} disabled={busy}>
                Cancel
              </button>
              <button type="button" className="btn btn-success btn-sm rounded-pill px-4 fw-bold" onClick={confirmLift} disabled={busy}>
                <i className="bi bi-unlock me-1"></i>
                {busy ? "Working..." : liftTarget.status === "banned" ? "Unban" : "Unsuspend"}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
