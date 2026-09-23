import { useEffect, useState } from "react";
import { useOutletContext } from "react-router-dom";
import { supabase } from "../../../lib/supabaseClient";
import { removeListing } from "../../../lib/adminListings";
import { reportReasonLabel, reportTargetLabels } from "../../../lib/reports";

const statusTabs = [
  { key: "pending", label: "Pending" },
  { key: "resolved", label: "Resolved" },
  { key: "dismissed", label: "Dismissed" }
];

// Text for the action pop-up. "noteRequired" = the admin must type something.
const actionText = {
  resolve: { title: "Resolve report", button: "Resolve", noteLabel: "Note (optional)", buttonClass: "btn-success" },
  dismiss: { title: "Dismiss report", button: "Dismiss", noteLabel: "Why is it being dismissed? (optional)", buttonClass: "btn-secondary" },
  remove: { title: "Remove listing", button: "Remove Listing", noteLabel: "Note (optional)", buttonClass: "btn-danger" },
  suspend: { title: "Suspend user", button: "Suspend User", noteLabel: "Reason (shown to the user)", buttonClass: "btn-warning", noteRequired: true }
};

// Key for looking up what a report points at, e.g. "service:<id>".
const targetKey = (type, id) => `${type}:${id}`;

export default function AdminReportsView() {
  const { adminId, refreshPendingReports } = useOutletContext();
  const [reports, setReports] = useState(null);
  // targetKey -> { name, ownerId, ownerName, item } for everything reported.
  // A missing entry means the user/listing was deleted after being reported.
  const [targets, setTargets] = useState({});
  const [suspendedIds, setSuspendedIds] = useState(new Set());
  const [loadError, setLoadError] = useState("");
  const [activeStatus, setActiveStatus] = useState("pending");
  const [message, setMessage] = useState({ text: "", type: "" });
  // The open action pop-up: { kind, report } (null = closed).
  const [action, setAction] = useState(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;

    (async () => {
      const [reportsResult, suspensionsResult] = await Promise.all([
        supabase
          .from("reports")
          .select("id, reporter_id, target_type, target_id, reason, details, status, admin_note, reviewed_at, created_at, reporter:profiles!reports_reporter_id_fkey(full_name, username), reviewer:admins!reports_reviewed_by_fkey(full_name)")
          .order("created_at", { ascending: false }),
        supabase.from("user_suspensions").select("user_id")
      ]);

      if (!active) return;
      if (reportsResult.error || suspensionsResult.error) {
        setLoadError("Failed to load reports.");
        return;
      }

      // Look up everything that was reported, grouped by kind, so each
      // report card can show the name/title and the owner.
      const idsOf = (type) => [...new Set(reportsResult.data.filter((r) => r.target_type === type).map((r) => r.target_id))];
      const [usersResult, servicesResult, jobsResult] = await Promise.all([
        supabase.from("profiles").select("id, full_name, username").in("id", idsOf("user")),
        supabase.from("services").select("id, title, image_url, freelancer_id, owner:profiles!services_freelancer_id_fkey(full_name, username)").in("id", idsOf("service")),
        supabase.from("job_posts").select("id, title, client_id, owner:profiles!job_posts_client_id_fkey(full_name, username)").in("id", idsOf("job_post"))
      ]);

      if (!active) return;

      const found = {};
      (usersResult.data || []).forEach((u) => {
        found[targetKey("user", u.id)] = { name: `${u.full_name} (@${u.username})`, ownerId: u.id, ownerName: u.full_name };
      });
      (servicesResult.data || []).forEach((s) => {
        found[targetKey("service", s.id)] = { name: s.title, ownerId: s.freelancer_id, ownerName: s.owner?.full_name, item: s };
      });
      (jobsResult.data || []).forEach((j) => {
        found[targetKey("job_post", j.id)] = { name: j.title, ownerId: j.client_id, ownerName: j.owner?.full_name, item: j };
      });

      setTargets(found);
      setSuspendedIds(new Set(suspensionsResult.data.map((s) => s.user_id)));
      setReports(reportsResult.data);
    })();

    return () => { active = false; };
  }, []);

  const countFor = (status) => (reports || []).filter((r) => r.status === status).length;
  const visibleReports = (reports || []).filter((r) => r.status === activeStatus);

  const openAction = (kind, report) => {
    const target = targets[targetKey(report.target_type, report.target_id)];
    setAction({ kind, report, target });
    // Suggest a suspension reason based on what the user was reported for.
    setNote(kind === "suspend" ? `Reported for: ${reportReasonLabel(report.reason)}` : "");
    setMessage({ text: "", type: "" });
  };

  // Marks a report resolved/dismissed. The "admins can review reports"
  // database rule only allows this for admins, recorded as themselves.
  const markReviewed = async (report, status, adminNote) => {
    const reviewedAt = new Date().toISOString();
    const { error } = await supabase
      .from("reports")
      .update({ status, admin_note: adminNote || null, reviewed_by: adminId, reviewed_at: reviewedAt })
      .eq("id", report.id);
    if (error) throw new Error("Couldn't update the report.");

    setReports((prev) => prev.map((r) => (r.id === report.id
      ? { ...r, status, admin_note: adminNote || null, reviewed_at: reviewedAt, reviewer: { full_name: "You" } }
      : r)));
    // Update the number on the sidebar's Reports link.
    await refreshPendingReports();
  };

  const confirmAction = async (event) => {
    event.preventDefault();
    const { kind, report, target } = action;
    const text = note.trim();
    if (actionText[kind].noteRequired && !text) return;

    setBusy(true);
    try {
      if (kind === "remove") {
        // Same Remove as the Listings page (deletes the photo/video too).
        const table = report.target_type === "service" ? "services" : "job_posts";
        if (!(await removeListing(table, target.item))) throw new Error("Couldn't remove the listing.");
        setTargets((prev) => {
          const next = { ...prev };
          delete next[targetKey(report.target_type, report.target_id)];
          return next;
        });
        await markReviewed(report, "resolved", `Listing removed.${text ? ` ${text}` : ""}`);
        setMessage({ text: "Listing removed and report resolved.", type: "success" });
      } else if (kind === "suspend") {
        // Same suspension as the Users page: the user sees this reason at login.
        const { error } = await supabase
          .from("user_suspensions")
          .insert({ user_id: target.ownerId, reason: text, suspended_by: adminId });
        if (error) throw new Error("Couldn't suspend the user.");
        setSuspendedIds((prev) => new Set(prev).add(target.ownerId));
        await markReviewed(report, "resolved", `User suspended: ${text}`);
        setMessage({ text: `${target.ownerName} was suspended and the report resolved.`, type: "success" });
      } else {
        await markReviewed(report, kind === "resolve" ? "resolved" : "dismissed", text);
        setMessage({ text: kind === "resolve" ? "Report resolved." : "Report dismissed.", type: "success" });
      }
      setAction(null);
    } catch (error) {
      setMessage({ text: error.message, type: "error" });
      setAction(null);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section>
      <h1 className="h4 fw-bold mb-3">Reports</h1>

      <div className="d-flex flex-wrap gap-2 mb-3">
        {statusTabs.map((t) => (
          <button
            key={t.key}
            className={`btn btn-sm rounded-pill px-3 fw-bold ${activeStatus === t.key ? "btn-admin-orange" : "btn-outline-light"}`}
            onClick={() => { setActiveStatus(t.key); setMessage({ text: "", type: "" }); }}
          >
            {t.label} <span className="ms-1 opacity-75">({reports ? countFor(t.key) : "…"})</span>
          </button>
        ))}
      </div>

      {message.text && (
        <p className={`admin-message ${message.type} fs-7 fw-semibold`} aria-live="polite">{message.text}</p>
      )}

      {loadError && <div className="admin-card rounded-4 p-4 text-center text-white-50">{loadError}</div>}
      {!loadError && reports === null && <div className="admin-card rounded-4 p-4 text-center text-white-50">Loading reports...</div>}
      {!loadError && reports !== null && visibleReports.length === 0 && (
        <div className="admin-card rounded-4 p-4 text-center text-white-50">
          <i className="bi bi-flag fs-1 d-block mb-2"></i>
          No {activeStatus} reports.
        </div>
      )}

      <div className="d-flex flex-column gap-3">
        {visibleReports.map((report) => {
          const target = targets[targetKey(report.target_type, report.target_id)];
          const isListing = report.target_type !== "user";
          const ownerSuspended = target && suspendedIds.has(target.ownerId);

          return (
            <div key={report.id} className="admin-card rounded-4 p-3 p-md-4">
              <div className="d-flex flex-wrap align-items-center gap-2 mb-2">
                <span className="badge admin-badge-orange fw-normal">{reportTargetLabels[report.target_type]}</span>
                <span className="badge bg-danger bg-opacity-75 fw-normal">{reportReasonLabel(report.reason)}</span>
                <span className="text-white-50 fs-8 ms-auto">{new Date(report.created_at).toLocaleString()}</span>
              </div>

              <h2 className="h6 fw-bold text-white mb-1 admin-title-cell">
                {target ? target.name : <span className="text-white-50 fst-italic">(deleted)</span>}
              </h2>

              {isListing && target && (
                <p className="fs-7 text-white-50 mb-1">
                  Posted by {target.ownerName || "Unknown"}
                  {ownerSuspended && <span className="badge bg-danger fw-normal ms-2">Suspended</span>}
                </p>
              )}
              {!isListing && ownerSuspended && <span className="badge bg-danger fw-normal mb-1">Suspended</span>}

              <p className="fs-7 text-white-50 mb-2">
                Reported by {report.reporter?.full_name || "a deleted user"}
                {report.reporter?.username && ` (@${report.reporter.username})`}
              </p>

              {report.details && <p className="fs-7 text-white mb-2 admin-description">"{report.details}"</p>}

              {report.status !== "pending" && (
                <p className="fs-8 text-white-50 mb-0">
                  <i className={`bi ${report.status === "resolved" ? "bi-check-circle-fill text-success" : "bi-x-circle-fill text-secondary"} me-1`}></i>
                  {report.status === "resolved" ? "Resolved" : "Dismissed"} by {report.reviewer?.full_name || "an admin"}
                  {report.reviewed_at && ` on ${new Date(report.reviewed_at).toLocaleDateString()}`}
                  {report.admin_note && ` — ${report.admin_note}`}
                </p>
              )}

              {report.status === "pending" && (
                <div className="d-flex flex-wrap gap-2 mt-3">
                  {isListing && target && (
                    <button className="btn btn-outline-danger btn-sm" onClick={() => openAction("remove", report)}>
                      <i className="bi bi-trash"></i> Remove Listing
                    </button>
                  )}
                  {target && !ownerSuspended && (
                    <button className="btn btn-outline-warning btn-sm" onClick={() => openAction("suspend", report)}>
                      <i className="bi bi-slash-circle"></i> Suspend {isListing ? "Owner" : "User"}
                    </button>
                  )}
                  <button className="btn btn-outline-success btn-sm" onClick={() => openAction("resolve", report)}>
                    <i className="bi bi-check-lg"></i> Resolve
                  </button>
                  <button className="btn btn-outline-light btn-sm" onClick={() => openAction("dismiss", report)}>
                    <i className="bi bi-x-lg"></i> Dismiss
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* One pop-up for every action; the text changes with the action. */}
      {action && (
        <div className="admin-modal-backdrop" onClick={() => !busy && setAction(null)}>
          <form className="admin-card admin-modal rounded-4 p-4" onClick={(e) => e.stopPropagation()} onSubmit={confirmAction}>
            <h2 className="h5 fw-bold text-white mb-1">
              {actionText[action.kind].title}
              {action.kind === "suspend" && action.target && ` — ${action.target.ownerName}`}
            </h2>
            <p className="text-secondary fs-7 mb-3">
              {action.kind === "remove" && "The listing (and its photo/video) will be deleted, and this report marked resolved."}
              {action.kind === "suspend" && "They will be signed out and can't log in, post, or send messages until unsuspended. This report will be marked resolved."}
              {action.kind === "resolve" && "Use this when the problem has been handled."}
              {action.kind === "dismiss" && "Use this when the report isn't a real problem."}
            </p>
            <label htmlFor="actionNote" className="form-label text-white-50 fs-7 mb-1">{actionText[action.kind].noteLabel}</label>
            <textarea
              id="actionNote"
              className="form-control admin-input mb-3"
              rows={3}
              // Kept short enough that "User suspended: ..." / "Listing removed. ..."
              // still fits the 500-character admin_note limit.
              maxLength={action.kind === "suspend" ? 480 : 400}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              autoFocus
              required={actionText[action.kind].noteRequired}
            />
            <div className="d-flex justify-content-end gap-2">
              <button type="button" className="btn btn-outline-light btn-sm rounded-pill px-3" onClick={() => setAction(null)} disabled={busy}>
                Cancel
              </button>
              <button
                type="submit"
                className={`btn ${actionText[action.kind].buttonClass} btn-sm rounded-pill px-3 fw-bold`}
                disabled={busy || (actionText[action.kind].noteRequired && !note.trim())}
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
