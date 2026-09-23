import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { supabase } from "../../../lib/supabaseClient";
import { reportReasons } from "../../../lib/reports";

// "Report" popup for a user, service, or job post. The report is saved to the
// reports table, where admins review it on the admin Reports page.
//   target: { type: "user" | "service" | "job_post", id, name } or null (closed)
//   onDone(message): called after sending, e.g. to show a toast
export default function ReportDialog({ target, currentUserId, onClose, onDone }) {
  const [reason, setReason] = useState("");
  const [details, setDetails] = useState("");
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);

  // Escape closes the popup, unless it's sending.
  useEffect(() => {
    if (!target) return undefined;
    const handleKeyDown = (event) => {
      if (event.key === "Escape" && !sending) onClose();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [target, sending, onClose]);

  if (!target) return null;

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!reason) {
      setError("Please pick a reason.");
      return;
    }

    setSending(true);
    setError("");

    // The database rules check the rest: you report as yourself, can't
    // report yourself, and can't report while suspended.
    const { error: insertError } = await supabase.from("reports").insert({
      reporter_id: currentUserId,
      target_type: target.type,
      target_id: target.id,
      reason,
      details: details.trim() || null
    });

    setSending(false);

    if (insertError) {
      // 23505 = the "one pending report per target" rule.
      setError(insertError.code === "23505"
        ? "You already reported this. An admin will review it soon."
        : "Couldn't send the report. Please try again.");
      return;
    }

    setReason("");
    setDetails("");
    onDone?.("Thanks for reporting. An admin will review it.");
    onClose();
  };

  return createPortal(
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 1300,
        background: "rgba(0,0,0,0.65)",
        display: "flex", alignItems: "center", justifyContent: "center", padding: "1rem"
      }}
      onClick={sending ? undefined : onClose}
    >
      <form
        role="dialog"
        aria-modal="true"
        aria-labelledby="report-dialog-title"
        className="bg-dark text-white border border-secondary border-opacity-25 rounded-4 p-4"
        style={{ maxWidth: 440, width: "100%" }}
        onClick={(event) => event.stopPropagation()}
        onSubmit={handleSubmit}
      >
        <div className="d-flex align-items-center gap-2 mb-1">
          <i className="bi bi-flag-fill text-danger"></i>
          <h5 id="report-dialog-title" className="fw-bold mb-0">Report {target.name ? `"${target.name}"` : "this"}</h5>
        </div>
        <p className="text-secondary fs-7 mb-3">Your report is private. Only admins will see it.</p>

        <label className="form-label text-white-50 fs-7 mb-2">Why are you reporting this?</label>
        <div className="d-flex flex-column gap-2 mb-3">
          {reportReasons.map((r) => (
            <label key={r.value} className="d-flex align-items-center gap-2 fs-7 cursor-pointer">
              <input
                type="radio"
                name="report-reason"
                className="form-check-input m-0"
                value={r.value}
                checked={reason === r.value}
                onChange={() => setReason(r.value)}
              />
              {r.label}
            </label>
          ))}
        </div>

        <label htmlFor="report-details" className="form-label text-white-50 fs-7 mb-1">Details (optional)</label>
        <textarea
          id="report-details"
          className="form-control bg-secondary bg-opacity-25 border-secondary text-white fs-7 mb-3"
          rows={3}
          maxLength={1000}
          placeholder="Tell us what happened..."
          value={details}
          onChange={(e) => setDetails(e.target.value)}
        />

        {error && <p className="text-danger fs-7 mb-3">{error}</p>}

        <div className="d-flex gap-2 justify-content-end">
          <button type="button" className="btn btn-outline-secondary text-white-50 rounded-pill px-4 fw-bold" onClick={onClose} disabled={sending}>
            Cancel
          </button>
          <button type="submit" className="btn btn-danger rounded-pill px-4 fw-bold" disabled={sending}>
            {sending ? "Sending..." : "Send Report"}
          </button>
        </div>
      </form>
    </div>,
    document.body
  );
}
