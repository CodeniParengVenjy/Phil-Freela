import { useEffect, useState } from "react";
import { useOutletContext } from "react-router-dom";
import { supabase } from "../../../lib/supabaseClient";
import { removeListing } from "../../../lib/adminListings";
import { REQUEST_COLUMNS, loadRequests, requestText } from "../../../lib/adminRequests";
import { SLIDES_SELECT } from "../../../lib/slides";
import { reportReasonLabel, reportTargetLabels } from "../../../lib/reports";
import { saveSuspension } from "../../../lib/suspensions";
import { buildPenalty, getViolation } from "../../../lib/violations";

const tabs = [
  { key: "pending", label: "Waiting" },
  { key: "decided", label: "Decided" }
];

// What a "remove" request points at, by its table: the same words reports
// use for their targets ("service:<id>" and so on in the names list below).
const targetOfTable = { services: "service", job_posts: "job_post", portfolio_items: "portfolio_item" };

// Super admins only (the menu hides it, and the database refuses everyone
// else). A regular admin's Suspend, Ban, Resolve, Dismiss and Remove listing
// arrive here as requests. Approving does the action as the super admin, the
// same way the Reports and Users pages do it for a super admin; declining
// does nothing and leaves the report pending.
export default function AdminApprovalsView() {
  const { adminId, refreshPendingApprovals, refreshPendingReports } = useOutletContext();
  const [requests, setRequests] = useState(null);
  // report id -> the report; "user:<id>" / "service:<id>" / "job_post:<id>" /
  // "portfolio_item:<id>" -> a name.
  const [reports, setReports] = useState({});
  const [names, setNames] = useState({});
  const [loadError, setLoadError] = useState("");
  const [activeTab, setActiveTab] = useState("pending");
  const [message, setMessage] = useState({ text: "", type: "" });
  // The open pop-up: { request, mode: "approve" | "decline" } (null = closed).
  const [dialog, setDialog] = useState(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;

    (async () => {
      const result = await loadRequests(["pending", "approved", "declined"]);
      if (!active) return;
      if (result.error) {
        setLoadError("Failed to load requests.");
        return;
      }

      // Look up what each request is about, so a card can say who and what.
      const reportIds = [...new Set(result.data.map((r) => r.report_id).filter(Boolean))];
      const reportsResult = reportIds.length
        ? await supabase.from("reports").select("id, target_type, target_id, reason, status").in("id", reportIds)
        : { data: [] };
      if (!active) return;

      const reportMap = Object.fromEntries((reportsResult.data || []).map((r) => [r.id, r]));
      const idsOf = (type) => (reportsResult.data || []).filter((r) => r.target_type === type).map((r) => r.target_id);
      const userIds = [...new Set([...idsOf("user"), ...result.data.map((r) => r.target_user_id).filter(Boolean)])];
      const serviceIds = [...new Set([...idsOf("service"), ...result.data.filter((r) => r.listing_table === "services").map((r) => r.listing_id)])];
      const jobIds = [...new Set([...idsOf("job_post"), ...result.data.filter((r) => r.listing_table === "job_posts").map((r) => r.listing_id)])];
      const projectIds = [...new Set([...idsOf("portfolio_item"), ...result.data.filter((r) => r.listing_table === "portfolio_items").map((r) => r.listing_id)])];

      const [users, services, jobs, projects] = await Promise.all([
        userIds.length ? supabase.from("profiles").select("id, full_name, username").in("id", userIds) : { data: [] },
        serviceIds.length ? supabase.from("services").select("id, title").in("id", serviceIds) : { data: [] },
        jobIds.length ? supabase.from("job_posts").select("id, title").in("id", jobIds) : { data: [] },
        projectIds.length ? supabase.from("portfolio_items").select("id, title").in("id", projectIds) : { data: [] }
      ]);
      if (!active) return;

      const found = {};
      (users.data || []).forEach((u) => { found[`user:${u.id}`] = `${u.full_name} (@${u.username})`; });
      (services.data || []).forEach((s) => { found[`service:${s.id}`] = s.title; });
      (jobs.data || []).forEach((j) => { found[`job_post:${j.id}`] = j.title; });
      (projects.data || []).forEach((p) => { found[`portfolio_item:${p.id}`] = p.title; });

      setReports(reportMap);
      setNames(found);
      setRequests(result.data);
    })();

    return () => { active = false; };
  }, []);

  // Words for what a request is about, e.g. "Keanne Reyes (@keanne)".
  const nameOf = (type, id) => names[`${type}:${id}`] || "(deleted)";

  const aboutText = (request) => {
    if (request.kind === "suspend" || request.kind === "ban") return nameOf("user", request.target_user_id);
    if (request.kind === "remove_listing") return nameOf(targetOfTable[request.listing_table], request.listing_id);
    const report = reports[request.report_id];
    return report ? `a report about ${nameOf(report.target_type, report.target_id)}` : "a report that no longer exists";
  };

  const pendingList = (requests || []).filter((r) => r.status === "pending");
  const decidedList = (requests || []).filter((r) => r.status !== "pending").slice(0, 50);
  const visible = activeTab === "pending" ? pendingList : decidedList;

  const openDialog = (request, mode) => {
    setDialog({ request, mode });
    setNote("");
    setMessage({ text: "", type: "" });
  };

  // Marks the report resolved or dismissed, as this super admin. Only while it
  // is still pending, so a report someone else already closed isn't overwritten.
  const closeReport = async (reportId, status, adminNote) => {
    const { error } = await supabase
      .from("reports")
      .update({ status, admin_note: adminNote || null, reviewed_by: adminId, reviewed_at: new Date().toISOString() })
      .eq("id", reportId)
      .eq("status", "pending");
    if (error) throw new Error("Couldn't update the report.");
    await refreshPendingReports();
  };

  // Does what the request asks. The same steps as the Reports and Users pages.
  const carryOut = async (request) => {
    const details = request.details || {};

    if (request.kind === "suspend" || request.kind === "ban") {
      // The penalty is worked out now, so a suspension runs from approval, not from the request.
      const penalty = buildPenalty(request.kind, details.fields || { violation: "", note: "" });
      if (!penalty) throw new Error("This request is incomplete. Decline it and ask for a new one.");
      const { error } = await saveSuspension({ userId: request.target_user_id, adminId, penalty });
      if (error) throw new Error(`Couldn't ${request.kind} the user.`);
      if (request.report_id) {
        await closeReport(request.report_id, "resolved", request.kind === "ban" ? `Banned: ${penalty.reason}` : `Suspended ${penalty.days} days: ${penalty.reason}`);
      }
    } else if (request.kind === "remove_listing") {
      // Removing a service or a portfolio project also removes its files, so load them first.
      const isProject = request.listing_table === "portfolio_items";
      const select = request.listing_table === "services" ? `id, title, image_url, ${SLIDES_SELECT}`
        : isProject ? `id, title, ${SLIDES_SELECT}` : "id, title";
      const { data: item } = await supabase.from(request.listing_table).select(select).eq("id", request.listing_id).maybeSingle();
      // Already gone (the owner or another admin removed it): nothing left to do.
      if (item && !(await removeListing(request.listing_table, item))) throw new Error(`Couldn't remove the ${isProject ? "project" : "listing"}.`);
      await closeReport(request.report_id, "resolved", `${isProject ? "Project" : "Listing"} removed.${details.note ? ` ${details.note}` : ""}`);
    } else {
      await closeReport(request.report_id, request.kind === "resolve" ? "resolved" : "dismissed", details.note);
    }
  };

  const confirmDialog = async (event) => {
    event.preventDefault();
    const { request, mode } = dialog;
    const text = note.trim();

    setBusy(true);
    try {
      if (mode === "approve") await carryOut(request);

      // The decision is saved last. The database only lets a pending request be
      // decided, and records who decided it and when.
      const { data, error } = await supabase
        .from("admin_requests")
        .update({ status: mode === "approve" ? "approved" : "declined", decision_note: text || null })
        .eq("id", request.id)
        .select(REQUEST_COLUMNS);
      if (error || !data?.length) throw new Error("Couldn't save the decision. Someone may have decided it already; reload the page.");

      setRequests((prev) => prev.map((r) => (r.id === request.id ? data[0] : r)));
      await refreshPendingApprovals();
      setMessage({ text: mode === "approve" ? "Approved and done." : "Declined. Nothing was changed.", type: "success" });
    } catch (error) {
      setMessage({ text: error.message, type: "error" });
    } finally {
      setBusy(false);
      setDialog(null);
    }
  };

  // What the pop-up tells the super admin will happen.
  const approveText = (request) => {
    if (request.kind === "ban") return "They will be signed out and can't log in until an admin unbans them.";
    if (request.kind === "suspend") return "The suspension starts now, and the length and limits come from the violation.";
    if (request.kind === "remove_listing") {
      return `The ${request.listing_table === "portfolio_items" ? "project" : "listing"} (and its files) will be deleted, and the report marked resolved.`;
    }
    if (request.kind === "resolve") return "The report will be marked resolved.";
    return "The report will be marked dismissed.";
  };

  return (
    <section>
      <h1 className="h4 fw-bold mb-1">Approvals</h1>
      <p className="text-white-50 fs-7 mb-3">What regular admins asked to do. Nothing happens until you approve it.</p>

      <div className="d-flex flex-wrap gap-2 mb-3">
        {tabs.map((t) => (
          <button
            key={t.key}
            className={`btn btn-sm rounded-pill px-3 fw-bold ${activeTab === t.key ? "btn-admin-orange" : "btn-outline-light"}`}
            onClick={() => { setActiveTab(t.key); setMessage({ text: "", type: "" }); }}
          >
            {t.label} <span className="ms-1 opacity-75">({requests ? (t.key === "pending" ? pendingList.length : decidedList.length) : "…"})</span>
          </button>
        ))}
      </div>

      {message.text && (
        <p className={`admin-message ${message.type} fs-7 fw-semibold`} aria-live="polite">{message.text}</p>
      )}

      {loadError && <div className="admin-card rounded-4 p-4 text-center text-white-50">{loadError}</div>}
      {!loadError && requests === null && <div className="admin-card rounded-4 p-4 text-center text-white-50">Loading requests...</div>}
      {!loadError && requests !== null && visible.length === 0 && (
        <div className="admin-card rounded-4 p-4 text-center text-white-50">
          <i className="bi bi-check2-circle fs-1 d-block mb-2"></i>
          {activeTab === "pending" ? "Nothing is waiting for you." : "No decided requests yet."}
        </div>
      )}

      <div className="d-flex flex-column gap-3">
        {visible.map((request) => {
          const report = reports[request.report_id];
          const violation = getViolation(request.details?.fields?.violation);
          return (
            <div key={request.id} className="admin-card rounded-4 p-3 p-md-4">
              <div className="d-flex flex-wrap align-items-center gap-2 mb-2">
                <span className={`badge ${request.kind === "ban" || request.kind === "remove_listing" ? "bg-danger" : request.kind === "suspend" ? "bg-warning text-dark" : "admin-badge-orange"} fw-normal`}>
                  {requestText(request)}
                </span>
                {report && <span className="badge bg-secondary fw-normal">{reportTargetLabels[report.target_type]} report · {reportReasonLabel(report.reason)}</span>}
                {!request.report_id && <span className="badge bg-secondary fw-normal">From the Users page</span>}
                <span className="text-white-50 fs-8 ms-auto">{new Date(request.created_at).toLocaleString()}</span>
              </div>

              <h2 className="h6 fw-bold text-white mb-1 admin-title-cell">{requestText(request)}: {aboutText(request)}</h2>
              <p className="fs-7 text-white-50 mb-1">Asked by {request.requested_by_name || "an admin"}</p>
              {violation && (
                <p className="fs-7 text-white mb-1">
                  Violation: {violation.label}
                  {request.details.fields.note && ` — ${request.details.fields.note}`}
                </p>
              )}
              {request.details?.note && <p className="fs-7 text-white mb-1 admin-description">"{request.details.note}"</p>}

              {request.status === "pending" ? (
                <div className="d-flex flex-wrap gap-2 mt-3">
                  <button className="btn btn-outline-success btn-sm" onClick={() => openDialog(request, "approve")}>
                    <i className="bi bi-check-lg"></i> Approve
                  </button>
                  <button className="btn btn-outline-light btn-sm" onClick={() => openDialog(request, "decline")}>
                    <i className="bi bi-x-lg"></i> Decline
                  </button>
                </div>
              ) : (
                <p className="fs-8 text-white-50 mb-0 mt-2">
                  <i className={`bi ${request.status === "approved" ? "bi-check-circle-fill text-success" : "bi-x-circle-fill text-secondary"} me-1`}></i>
                  {request.status === "approved" ? "Approved" : "Declined"} by {request.decider?.full_name || "a super admin"}
                  {request.decided_at && ` on ${new Date(request.decided_at).toLocaleDateString()}`}
                  {request.decision_note && ` — ${request.decision_note}`}
                </p>
              )}
            </div>
          );
        })}
      </div>

      {/* Approve / Decline pop-up. Approving shows what will happen first. */}
      {dialog && (
        <div className="admin-modal-backdrop" onClick={() => !busy && setDialog(null)}>
          <form className="admin-card admin-modal rounded-4 p-4" onClick={(e) => e.stopPropagation()} onSubmit={confirmDialog}>
            <h2 className="h5 fw-bold text-white mb-1">
              {dialog.mode === "approve" ? "Approve" : "Decline"}: {requestText(dialog.request)}
            </h2>
            <p className="text-white fs-7 mb-1">{aboutText(dialog.request)}</p>
            <p className="text-secondary fs-7 mb-3">
              {dialog.mode === "approve" ? approveText(dialog.request) : "Nothing will be changed. The report stays pending, and the admin can pick another action."}
            </p>
            <label htmlFor="decisionNote" className="form-label text-white-50 fs-7 mb-1">
              {dialog.mode === "approve" ? "Note (optional)" : "Why? (optional, the admin will see it)"}
            </label>
            <textarea
              id="decisionNote"
              className="form-control admin-input mb-3"
              rows={3}
              maxLength={400}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              autoFocus
            />
            <div className="d-flex justify-content-end gap-2">
              <button type="button" className="btn btn-outline-light btn-sm rounded-pill px-3" onClick={() => setDialog(null)} disabled={busy}>
                Cancel
              </button>
              <button
                type="submit"
                className={`btn ${dialog.mode === "approve" ? "btn-success" : "btn-secondary"} btn-sm rounded-pill px-3 fw-bold`}
                disabled={busy}
              >
                {busy ? "Working..." : dialog.mode === "approve" ? "Approve" : "Decline"}
              </button>
            </div>
          </form>
        </div>
      )}
    </section>
  );
}
