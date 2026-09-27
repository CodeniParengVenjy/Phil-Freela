import { useEffect, useState } from "react";
import { useOutletContext } from "react-router-dom";
import { supabase } from "../../../lib/supabaseClient";
import { formatEndDate } from "../../../lib/suspensions";
import { getViolation } from "../../../lib/violations";

const statusTabs = [
  { key: "pending", label: "Pending" },
  { key: "accepted", label: "Accepted" },
  { key: "rejected", label: "Rejected" }
];

// Text for the Accept / Reject pop-up.
const actionText = {
  accept: {
    title: "Accept appeal",
    info: "The penalty is lifted right away, and they get a notification.",
    noteLabel: "Note (optional, shown to the user)",
    button: "Accept & Lift",
    buttonClass: "btn-success"
  },
  reject: {
    title: "Reject appeal",
    info: "The penalty stays, and they get a notification with your note. They can't appeal this penalty again.",
    noteLabel: "Why is it rejected? (shown to the user)",
    button: "Reject",
    buttonClass: "btn-danger"
  }
};

export default function AdminAppealsView() {
  const { adminId, refreshPendingAppeals } = useOutletContext();
  const [appeals, setAppeals] = useState(null);
  const [loadError, setLoadError] = useState("");
  const [activeStatus, setActiveStatus] = useState("pending");
  const [message, setMessage] = useState({ text: "", type: "" });
  // The open Accept / Reject pop-up: { kind, appeal } (null = closed).
  const [action, setAction] = useState(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    // The penalty details are copied into each appeal, so they still show
    // after the penalty is lifted.
    supabase
      .from("appeals")
      .select("id, user_id, violation, penalty_reason, penalty_ends_at, message, status, admin_note, reviewed_at, created_at, user:profiles!appeals_user_id_fkey(full_name, username), reviewer:admins!appeals_reviewed_by_fkey(full_name)")
      .order("created_at", { ascending: false })
      .then(({ data, error }) => {
        if (!active) return;
        if (error) setLoadError("Failed to load appeals.");
        else setAppeals(data);
      });
    return () => { active = false; };
  }, []);

  const countFor = (status) => (appeals || []).filter((a) => a.status === status).length;
  // Pending appeals oldest first (first come, first served); the rest newest first.
  const visible = (appeals || [])
    .filter((a) => a.status === activeStatus)
    .sort((a, b) => (activeStatus === "pending" ? 1 : -1) * (new Date(a.created_at) - new Date(b.created_at)));

  const openAction = (kind, appeal) => {
    setAction({ kind, appeal });
    setNote("");
    setMessage({ text: "", type: "" });
  };

  // Accepts or rejects. The "admins can review pending appeals" database rule
  // only allows this for admins, recorded as themselves, and only once. A
  // database trigger then lifts the penalty (accept) and notifies the user.
  const confirmAction = async (event) => {
    event.preventDefault();
    const { kind, appeal } = action;
    const text = note.trim();
    if (kind === "reject" && !text) return;

    setBusy(true);
    const status = kind === "accept" ? "accepted" : "rejected";
    const reviewedAt = new Date().toISOString();
    const { error } = await supabase
      .from("appeals")
      .update({ status, admin_note: text || null, reviewed_by: adminId, reviewed_at: reviewedAt })
      .eq("id", appeal.id);
    setBusy(false);
    setAction(null);

    if (error) {
      // e.g. the penalty already ended or was replaced (from the database).
      setMessage({ text: error.message || "Couldn't update the appeal.", type: "error" });
      return;
    }

    setAppeals((prev) => prev.map((a) => (a.id === appeal.id
      ? { ...a, status, admin_note: text || null, reviewed_at: reviewedAt, reviewer: { full_name: "You" } }
      : a)));
    const name = appeal.user?.full_name || "The user";
    setMessage({
      text: kind === "accept"
        ? `Appeal accepted. ${name}'s penalty is lifted and they'll get a notification.`
        : `Appeal rejected. ${name} will get a notification with your note.`,
      type: "success"
    });
    // Update the number on the sidebar's Appeals link.
    await refreshPendingAppeals();
  };

  return (
    <section>
      <h1 className="h4 fw-bold mb-3">Appeals</h1>

      <div className="d-flex flex-wrap gap-2 mb-3">
        {statusTabs.map((t) => (
          <button
            key={t.key}
            className={`btn btn-sm rounded-pill px-3 fw-bold ${activeStatus === t.key ? "btn-admin-orange" : "btn-outline-light"}`}
            onClick={() => { setActiveStatus(t.key); setMessage({ text: "", type: "" }); }}
          >
            {t.label} <span className="ms-1 opacity-75">({appeals ? countFor(t.key) : "…"})</span>
          </button>
        ))}
      </div>

      {message.text && (
        <p className={`admin-message ${message.type} fs-7 fw-semibold`} aria-live="polite">{message.text}</p>
      )}

      {loadError && <div className="admin-card rounded-4 p-4 text-center text-white-50">{loadError}</div>}
      {!loadError && appeals === null && <div className="admin-card rounded-4 p-4 text-center text-white-50">Loading appeals...</div>}
      {!loadError && appeals !== null && visible.length === 0 && (
        <div className="admin-card rounded-4 p-4 text-center text-white-50">
          <i className="bi bi-envelope-paper fs-1 d-block mb-2"></i>
          No {activeStatus} appeals.
        </div>
      )}

      <div className="d-flex flex-column gap-3">
        {visible.map((a) => {
          const isBan = !a.penalty_ends_at;
          // A suspension that ran out on its own has nothing left to lift.
          const ended = !isBan && new Date(a.penalty_ends_at) <= new Date();

          return (
            <div key={a.id} className="admin-card rounded-4 p-3 p-md-4">
              <div className="d-flex flex-wrap align-items-center gap-2 mb-2">
                <span className={`badge fw-normal ${isBan ? "bg-danger" : "bg-warning text-dark"}`}>{isBan ? "Ban" : "Suspension"}</span>
                <span className="badge admin-badge-orange fw-normal">{getViolation(a.violation)?.label || a.violation}</span>
                {ended && a.status === "pending" && <span className="badge bg-secondary fw-normal">Already ended</span>}
                <span className="text-white-50 fs-8 ms-auto">{new Date(a.created_at).toLocaleString()}</span>
              </div>

              <h2 className="h6 fw-bold text-white mb-1">
                {a.user ? <>{a.user.full_name} <span className="text-white-50 fw-normal">(@{a.user.username})</span></> : <span className="text-white-50 fst-italic">(deleted user)</span>}
              </h2>

              <p className="fs-7 text-white-50 mb-2">
                {isBan ? "Banned" : `Suspended until ${formatEndDate(a.penalty_ends_at)}`} — Reason: {a.penalty_reason}
              </p>

              <p className="fs-7 text-white mb-2 admin-description">"{a.message}"</p>

              {a.status !== "pending" && (
                <p className="fs-8 text-white-50 mb-0">
                  <i className={`bi ${a.status === "accepted" ? "bi-check-circle-fill text-success" : "bi-x-circle-fill text-danger"} me-1`}></i>
                  {a.status === "accepted" ? "Accepted" : "Rejected"} by {a.reviewer?.full_name || "an admin"}
                  {a.reviewed_at && ` on ${new Date(a.reviewed_at).toLocaleDateString()}`}
                  {a.admin_note && ` — ${a.admin_note}`}
                </p>
              )}

              {a.status === "pending" && (
                <div className="d-flex flex-wrap gap-2 mt-3">
                  <button
                    className="btn btn-success btn-sm fw-bold"
                    onClick={() => openAction("accept", a)}
                    disabled={ended}
                    title={ended ? "The suspension already ended, so there's nothing to lift." : undefined}
                  >
                    <i className="bi bi-check-lg"></i> Accept
                  </button>
                  <button className="btn btn-outline-danger btn-sm fw-bold" onClick={() => openAction("reject", a)}>
                    <i className="bi bi-x-lg"></i> Reject
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* One pop-up for Accept and Reject. */}
      {action && (
        <div className="admin-modal-backdrop" onClick={() => !busy && setAction(null)}>
          <form className="admin-card admin-modal rounded-4 p-4" onClick={(e) => e.stopPropagation()} onSubmit={confirmAction}>
            <h2 className="h5 fw-bold text-white mb-1">
              {actionText[action.kind].title}
              {action.appeal.user && ` — ${action.appeal.user.full_name}`}
            </h2>
            <p className="text-secondary fs-7 mb-3">{actionText[action.kind].info}</p>
            <label htmlFor="appealNote" className="form-label text-white-50 fs-7 mb-1">{actionText[action.kind].noteLabel}</label>
            <textarea
              id="appealNote"
              className="form-control admin-input mb-3"
              rows={3}
              maxLength={500}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              autoFocus
              required={action.kind === "reject"}
            />
            <div className="d-flex justify-content-end gap-2">
              <button type="button" className="btn btn-outline-light btn-sm rounded-pill px-3" onClick={() => setAction(null)} disabled={busy}>
                Cancel
              </button>
              <button
                type="submit"
                className={`btn ${actionText[action.kind].buttonClass} btn-sm rounded-pill px-3 fw-bold`}
                disabled={busy || (action.kind === "reject" && !note.trim())}
              >
                {actionText[action.kind].button}
              </button>
            </div>
          </form>
        </div>
      )}
    </section>
  );
}
