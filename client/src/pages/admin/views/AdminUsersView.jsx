import { useEffect, useState } from "react";
import { useOutletContext, useSearchParams } from "react-router-dom";
import { supabase } from "../../../lib/supabaseClient";
import { useVerifiedIds } from "../../../lib/useVerifiedIds";
import { presenceStatus, usePresence } from "../../../lib/presence";
import { formatUserNumber } from "../../../lib/userNumber";
import { loadRequests, newestBy, requestKindText, sendRequest } from "../../../lib/adminRequests";
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

// The "Sort by" choices. Each has a direction: "desc" shows the first-named end
// first (newest, online, Z), "asc" the other end. The words on the direction
// button come from here, and a sort starts in its usual direction.
const sortOptions = {
  joined: { label: "Joined", start: "desc", desc: "Newest first", asc: "Oldest first" },
  online: { label: "Online", start: "desc", desc: "Online first", asc: "Offline first" },
  name: { label: "Name A-Z", start: "asc", desc: "Z to A", asc: "A to Z" }
};

// A labelled row of round choice buttons (one is picked), used in the Filters pop-up.
// options: [[value, text], ...]
function ChoiceRow({ label, value, onChange, options }) {
  return (
    <div className="mb-3">
      <div className="text-white-50 fs-8 fw-semibold text-uppercase mb-2">{label}</div>
      <div className="d-flex flex-wrap gap-2" role="group" aria-label={label}>
        {options.map(([optionValue, text]) => (
          <button
            type="button"
            key={optionValue}
            className={`admin-choice ${value === optionValue ? "active" : ""}`}
            aria-pressed={value === optionValue}
            onClick={() => onChange(optionValue)}
          >
            {text}
          </button>
        ))}
      </div>
    </div>
  );
}

export default function AdminUsersView() {
  const { adminId, isSuperAdmin } = useOutletContext();
  // The Overview's cards open this page with choices in the address, like
  // /admin/users?role=freelancer or ?verified=unverified or ?presence=online&sort=online&dir=desc.
  // They only decide where the boxes below start; a value that isn't one of the
  // allowed ones is ignored.
  const [params] = useSearchParams();
  const fromAddress = (name, allowed, fallback) => (allowed.includes(params.get(name)) ? params.get(name) : fallback);
  const [users, setUsers] = useState(null);
  const verifiedIds = useVerifiedIds((users || []).map((user) => user.id));
  // user id -> seconds since they were last seen (refreshed every 30 seconds).
  const lastSeen = usePresence((users || []).map((user) => user.id));
  // user_id -> suspension row, so each table row can look up its status fast.
  // A row with no end date is a ban (see lib/suspensions.js).
  const [suspensions, setSuspensions] = useState({});
  // user id -> a Suspend / Ban request still waiting for a super admin (see
  // lib/adminRequests.js). A regular admin's Suspend / Ban is such a request.
  const [requests, setRequests] = useState({});
  const [loadError, setLoadError] = useState("");
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState(() => fromAddress("role", ["freelancer", "client"], "all"));
  const [statusFilter, setStatusFilter] = useState(() => fromAddress("status", ["active", "suspended", "banned"], "all"));
  // "all", "verified" or "unverified" (the Verified badge, see lib/verification.js).
  const [verifyFilter, setVerifyFilter] = useState(() => fromAddress("verified", ["verified", "unverified"], "all"));
  // "all", "online" (seen in the last 2 minutes) or "offline" (everyone else, including people never seen).
  const [presenceFilter, setPresenceFilter] = useState(() => fromAddress("presence", ["online", "offline"], "all"));
  const [sortBy, setSortBy] = useState(() => fromAddress("sort", Object.keys(sortOptions), "joined"));
  // Each sort has its own usual direction unless the address names one.
  const [sortDir, setSortDir] = useState(() => fromAddress("dir", ["asc", "desc"], sortOptions[fromAddress("sort", Object.keys(sortOptions), "joined")].start));
  // The Filters and sorting pop-up is open.
  const [filterOpen, setFilterOpen] = useState(false);
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
  // user id -> user number (the "7" in PF-0007), loaded next to the users.
  const [numbers, setNumbers] = useState({});
  // The user whose ID was just copied (shows "Copied" for a moment).
  const [copiedId, setCopiedId] = useState(null);

  // The ID column shows PF-0007. If the numbers couldn't be loaded it shows the
  // first 8 characters of the system ID instead, so the column is never empty.
  const idLabel = (user) => (numbers[user.id] ? formatUserNumber(numbers[user.id]) : user.id.slice(0, 8));
  // A click copies the PF number, or the whole system ID when there is no number.
  const copyId = async (user) => {
    try {
      await navigator.clipboard.writeText(numbers[user.id] ? formatUserNumber(numbers[user.id]) : user.id);
    } catch {
      setMessage({ text: "Couldn't copy the ID. Hover over it to read the whole ID.", type: "error" });
      return;
    }
    setCopiedId(user.id);
    setTimeout(() => setCopiedId((current) => (current === user.id ? null : current)), 1500);
  };

  useEffect(() => {
    let active = true;

    (async () => {
      // Load users and suspensions at the same time. admin_list_users() is a
      // database function that adds each user's email (only admins can call it).
      // The user numbers come from the profiles table (admin_list_users doesn't
      // have them); if that fails the page still works, just without them.
      const [profilesResult, suspensionsResult, requestsResult, numbersResult] = await Promise.all([
        supabase.rpc("admin_list_users"),
        supabase.from("user_suspensions").select(SUSPENSION_COLUMNS),
        loadRequests(["pending"]),
        supabase.from("profiles").select("id, user_number")
      ]);

      if (!active) return;

      if (profilesResult.error || suspensionsResult.error || requestsResult.error) {
        setLoadError("Failed to load users.");
        return;
      }

      setRequests(newestBy(
        requestsResult.data.filter((request) => request.kind === "suspend" || request.kind === "ban"),
        (request) => request.target_user_id
      ));

      setUsers(profilesResult.data);
      if (!numbersResult.error) setNumbers(Object.fromEntries(numbersResult.data.map((row) => [row.id, row.user_number])));
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
      || (user.email || "").toLowerCase().includes(searchText)
      // A user number like PF-0007 (3 or more characters), or a system ID (or
      // the start of one, 6 or more); shorter searches are names, so they
      // aren't compared with IDs.
      || (searchText.length >= 3 && numbers[user.id] && formatUserNumber(numbers[user.id]).toLowerCase().includes(searchText))
      || (searchText.length >= 6 && user.id.includes(searchText));
    const matchesRole = roleFilter === "all" || user.account_type === roleFilter;
    // "active" when there's no suspension, or it already ended.
    const status = suspensionStatus(suspensions[user.id]) || "active";
    const matchesStatus = statusFilter === "all" || statusFilter === status;
    const isVerified = verifiedIds.has(user.id);
    const matchesVerify = verifyFilter === "all" || (verifyFilter === "verified") === isVerified;
    const isOnline = !!presenceStatus(lastSeen.get(user.id))?.online;
    const matchesPresence = presenceFilter === "all" || (presenceFilter === "online") === isOnline;
    return matchesSearch && matchesRole && matchesStatus && matchesVerify && matchesPresence;
  });

  // Sort a copy of the filtered list. For "Online", the most recently seen comes
  // first in "desc"; people never seen always go last, either way.
  const sign = sortDir === "desc" ? 1 : -1;
  visibleUsers.sort((a, b) => {
    if (sortBy === "name") return -sign * (a.full_name || "").localeCompare(b.full_name || "");
    if (sortBy === "online") {
      const seenA = lastSeen.get(a.id);
      const seenB = lastSeen.get(b.id);
      if (seenA === undefined || seenB === undefined) return (seenA === undefined) - (seenB === undefined);
      return sign * (seenA - seenB);
    }
    return sign * (new Date(b.created_at) - new Date(a.created_at));
  });

  const changeSort = (value) => {
    setSortBy(value);
    setSortDir(sortOptions[value].start);
  };

  // The start: sorted by Joined, newest first, every filter on "all", nothing searched.
  // changedCount is how many of the five choices (4 filters + the sorting) are away
  // from it (the orange number on the Filters button); the search text isn't counted
  // there, but Reset clears it too.
  const sortChanged = sortBy !== "joined" || sortDir !== sortOptions.joined.start;
  const changedCount = [roleFilter, statusFilter, verifyFilter, presenceFilter].filter((value) => value !== "all").length + (sortChanged ? 1 : 0);
  const anythingChanged = changedCount > 0 || search !== "";
  const resetAll = () => {
    setSearch("");
    setRoleFilter("all");
    setStatusFilter("all");
    setVerifyFilter("all");
    setPresenceFilter("all");
    changeSort("joined");
  };

  // Escape closes the Filters pop-up.
  useEffect(() => {
    if (!filterOpen) return undefined;
    const onKey = (e) => { if (e.key === "Escape") setFilterOpen(false); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [filterOpen]);

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

    // A regular admin sends the Suspend / Ban to a super admin instead of doing it.
    if (!isSuperAdmin) {
      setBusy(true);
      const result = await sendRequest({ adminId, kind, targetUserId: user.id, details: { fields } });
      setBusy(false);
      setBlockTarget(null);
      if (result.error) {
        setMessage({ text: result.error, type: "error" });
        return;
      }
      setRequests((prev) => ({ ...prev, [user.id]: result.data }));
      setMessage({ text: "Sent to a super admin. Nothing happens until they approve it.", type: "success" });
      return;
    }

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

  // Unsuspending and unbanning normally just delete the row. But when the user
  // has an appeal waiting for this same penalty, lifting it means accepting
  // that appeal: the appeal is marked accepted, and the database then lifts
  // the penalty and tells the user (exactly what Accept on the Appeals page
  // does). Otherwise the appeal would stay open for a penalty that is already
  // gone, and rejecting it later would tell the user the penalty was kept.
  // The pop-up below shows what's being lifted first.
  const confirmLift = async () => {
    const { user, status } = liftTarget;
    const word = status === "banned" ? "unban" : "unsuspend";

    setBusy(true);
    // An appeal belongs to one penalty: the one that started at this time.
    const lookup = await supabase
      .from("appeals")
      .select("id")
      .eq("user_id", user.id)
      .eq("suspension_started_at", suspensions[user.id].created_at)
      .eq("status", "pending")
      .maybeSingle();

    let error = lookup.error;
    let appealAccepted = false;
    if (!error && lookup.data) {
      // ".select" returns the rows that changed. None means another admin
      // reviewed the appeal a moment ago, so the plain lift below runs instead.
      const result = await supabase
        .from("appeals")
        .update({ status: "accepted", admin_note: null, reviewed_by: adminId, reviewed_at: new Date().toISOString() })
        .eq("id", lookup.data.id)
        .eq("status", "pending")
        .select("id");
      error = result.error;
      appealAccepted = !error && result.data.length > 0;
    }
    if (!error && !appealAccepted) {
      ({ error } = await supabase.from("user_suspensions").delete().eq("user_id", user.id));
    }
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
    setMessage({
      text: appealAccepted
        ? `${user.full_name} is active again. Their pending appeal was accepted, so they have been told.`
        : `${user.full_name} is active again.`,
      type: "success"
    });
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
        <div className="d-flex gap-2">
          <input
            type="search"
            className="form-control admin-input"
            placeholder="Search by name, username, email, or ID (like PF-0007)..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {/* One button for all the filters and the sorting. The orange number is how
              many of them are away from the default, so a closed pop-up still shows it. */}
          <button
            type="button"
            className="btn btn-outline-light position-relative flex-shrink-0"
            onClick={() => setFilterOpen(true)}
            aria-haspopup="dialog"
            aria-label={changedCount > 0 ? `Filters and sorting (${changedCount} changed)` : "Filters and sorting"}
          >
            <i className="bi bi-sliders"></i><span className="d-none d-sm-inline ms-2">Filters</span>
            {changedCount > 0 && (
              <span className="admin-filter-count position-absolute top-0 start-100 translate-middle badge rounded-pill">{changedCount}</span>
            )}
          </button>
          <button
            type="button"
            className="btn btn-outline-secondary flex-shrink-0"
            onClick={resetAll}
            disabled={!anythingChanged}
            aria-label="Reset the search, filters and sorting"
          >
            <i className="bi bi-arrow-counterclockwise"></i><span className="d-none d-sm-inline ms-2">Reset</span>
          </button>
        </div>
        <div className="text-white-50 fs-7 mt-2 text-end">
          {users !== null && `${visibleUsers.length} of ${users.length} users shown`}
        </div>
      </div>

      {/* Filters and sorting pop-up. Choices apply at once, so the list behind it
          changes while the admin presses; Reset puts everything back to the start. */}
      {filterOpen && (
        <div className="admin-modal-backdrop" onClick={() => setFilterOpen(false)}>
          <div className="admin-card admin-modal admin-filter-modal rounded-4 p-4" role="dialog" aria-modal="true" aria-label="Filters and sorting" onClick={(e) => e.stopPropagation()}>
            <div className="d-flex align-items-center justify-content-between mb-3">
              <h2 className="h5 fw-bold text-white mb-0">Filters and sorting</h2>
              <button type="button" className="btn-close btn-close-white" aria-label="Close" onClick={() => setFilterOpen(false)}></button>
            </div>
            <div className="admin-filter-body">
              <ChoiceRow label="Online" value={presenceFilter} onChange={setPresenceFilter} options={[["all", "All"], ["online", "Online now"], ["offline", "Offline"]]} />
              <ChoiceRow label="Role" value={roleFilter} onChange={setRoleFilter} options={[["all", "All"], ["freelancer", "Freelancers"], ["client", "Clients"]]} />
              <ChoiceRow label="Status" value={statusFilter} onChange={setStatusFilter} options={[["all", "All"], ["active", "Active"], ["suspended", "Suspended"], ["banned", "Banned"]]} />
              <ChoiceRow label="Verification" value={verifyFilter} onChange={setVerifyFilter} options={[["all", "All"], ["verified", "Verified"], ["unverified", "Not verified"]]} />
              <ChoiceRow label="Sort by" value={sortBy} onChange={changeSort} options={Object.entries(sortOptions).map(([value, option]) => [value, option.label])} />
              <button
                type="button"
                className="btn btn-outline-light btn-sm"
                onClick={() => setSortDir(sortDir === "desc" ? "asc" : "desc")}
                aria-label="Change the sort direction"
              >
                <i className={`bi ${sortDir === "desc" ? "bi-sort-down" : "bi-sort-up"} me-1`}></i>
                {sortDir === "asc" ? "Ascending" : "Descending"} · {sortOptions[sortBy][sortDir]}
              </button>
            </div>
            <div className="d-flex align-items-center justify-content-between gap-2 mt-4">
              <button type="button" className="btn btn-outline-secondary btn-sm rounded-pill px-3" onClick={resetAll} disabled={!anythingChanged}>
                <i className="bi bi-arrow-counterclockwise me-1"></i>Reset
              </button>
              <span className="text-white-50 fs-8">{users !== null && `${visibleUsers.length} of ${users.length} shown`}</span>
              <button type="button" className="btn btn-admin-orange btn-sm rounded-pill px-4 fw-bold" onClick={() => setFilterOpen(false)}>Done</button>
            </div>
          </div>
        </div>
      )}

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
                <th>Status</th>
                <th>Joined</th>
                <th className="text-end">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loadError && (
                <tr><td colSpan={8} className="text-center text-white-50 py-4">{loadError}</td></tr>
              )}
              {!loadError && users === null && (
                <tr><td colSpan={8} className="text-center text-white-50 py-4">Loading users...</td></tr>
              )}
              {!loadError && users !== null && visibleUsers.length === 0 && (
                <tr><td colSpan={8} className="text-center text-white-50 py-4">No users found.</td></tr>
              )}
              {!loadError && visibleUsers.map((user) => {
                const suspension = suspensions[user.id];
                // "banned", "suspended", or null (active).
                const status = suspensionStatus(suspension);
                // A Suspend / Ban request waiting for a super admin, if any.
                const waiting = requests[user.id];
                const seen = presenceStatus(lastSeen.get(user.id));
                return (
                  <tr key={user.id}>
                    <td>
                      <button
                        type="button"
                        className="btn btn-link p-0 border-0 font-monospace fs-7 text-decoration-none text-white-50 text-nowrap"
                        title={`${numbers[user.id] ? `${formatUserNumber(numbers[user.id])} · ` : ""}System ID ${user.id} (click to copy)`}
                        aria-label={`Copy ${user.full_name || user.username}'s ID`}
                        onClick={() => copyId(user)}
                      >
                        {copiedId === user.id ? <><i className="bi bi-check2 text-success me-1"></i>Copied</> : idLabel(user)}
                      </button>
                    </td>
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
                      {/* Not "Offline": next to the Active badge that read as a contradiction.
                          This says when they were last on the site; people never seen get nothing. */}
                      {seen && (
                        seen.online ? (
                          <div className="fs-8 mt-1 text-success fw-semibold">
                            <i className="bi bi-circle-fill me-1" style={{ fontSize: "0.5rem" }}></i>Online now
                          </div>
                        ) : (
                          <div className="fs-8 mt-1 text-white-50 text-nowrap" title={`Last seen ${seen.ago}`}>Seen {seen.ago}</div>
                        )
                      )}
                    </td>
                    <td>{new Date(user.created_at).toLocaleDateString()}</td>
                    <td className="text-end text-nowrap">
                      {status ? (
                        <button className="btn btn-outline-success btn-sm" onClick={() => { setLiftTarget({ user, status }); setMessage({ text: "", type: "" }); }}>
                          <i className="bi bi-unlock"></i> {status === "banned" ? "Unban" : "Unsuspend"}
                        </button>
                      ) : !waiting && (
                        <button className="btn btn-outline-warning btn-sm" onClick={() => openBlockDialog("suspend", user)}>
                          <i className="bi bi-slash-circle"></i> Suspend
                        </button>
                      )}
                      {waiting && (
                        <span className="badge bg-warning text-dark fw-normal ms-2" title={isSuperAdmin ? "Decide it on the Approvals page" : "A super admin has to approve it"}>
                          <i className="bi bi-hourglass-split me-1"></i>
                          {isSuperAdmin ? `${waiting.requested_by_name || "An admin"} asked to ${requestKindText[waiting.kind].toLowerCase()}` : `Waiting for a super admin: ${requestKindText[waiting.kind]}`}
                        </span>
                      )}
                      {/* A suspended user can still be banned; that replaces the suspension. */}
                      {status !== "banned" && !waiting && (
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
            {!isSuperAdmin && (
              <p className="fs-8 text-warning mb-3">
                <i className="bi bi-shield-check me-1"></i>
                This is sent to a super admin. Nothing happens until they approve it.
              </p>
            )}
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
                {isSuperAdmin ? blockText[blockTarget.kind].button : "Send for approval"}
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
            <div className="admin-lift-icon danger mx-auto mb-3">
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
