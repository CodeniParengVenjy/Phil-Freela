import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { MAX_SCREENSHOTS, checkScreenshot, reportReasons, sendReport } from "../../../lib/reports";

// "Report" popup for a user, service, or job post. The report is saved to the
// reports table, where admins review it on the admin Reports page.
//   target: { type: "user" | "service" | "job_post", id, name } or null (closed)
//           From a call it also has callId and callKind ("voice" / "video").
//   onDone(message): called after sending, e.g. to show a toast
export default function ReportDialog({ target, onClose, onDone }) {
  const [reason, setReason] = useState("");
  const [details, setDetails] = useState("");
  // The picked screenshots: [{ file, preview }] (preview = a temporary link
  // for the thumbnail, freed when it's removed or the popup closes).
  const [screenshots, setScreenshots] = useState([]);
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);

  // Closing starts the next report fresh (and frees the thumbnails).
  const close = () => {
    screenshots.forEach((s) => URL.revokeObjectURL(s.preview));
    setReason("");
    setDetails("");
    setScreenshots([]);
    setError("");
    onClose();
  };

  // Escape closes the popup, unless it's sending. (No dependency list: it
  // re-attaches after every render, so it always uses the latest close.)
  useEffect(() => {
    if (!target) return undefined;
    const handleKeyDown = (event) => {
      if (event.key === "Escape" && !sending) close();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  });

  if (!target) return null;

  const addScreenshots = (event) => {
    const picked = [...event.target.files];
    event.target.value = ""; // so picking the same file again still works
    const room = MAX_SCREENSHOTS - screenshots.length;
    const problem = picked.map(checkScreenshot).find(Boolean);
    if (problem) {
      setError(problem);
      return;
    }
    setError(picked.length > room ? `You can add up to ${MAX_SCREENSHOTS} screenshots.` : "");
    setScreenshots((prev) => [
      ...prev,
      ...picked.slice(0, room).map((file) => ({ file, preview: URL.createObjectURL(file) }))
    ]);
  };

  const removeScreenshot = (index) => {
    URL.revokeObjectURL(screenshots[index].preview);
    setScreenshots((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!reason) {
      setError("Please pick a reason.");
      return;
    }

    setSending(true);
    setError("");
    const { error: sendError } = await sendReport({
      target,
      reason,
      details: details.trim(),
      screenshots: screenshots.map((s) => s.file)
    });
    setSending(false);

    if (sendError) {
      // 23505 = the "one pending report per target" rule. Other database
      // errors get a general message; upload problems explain themselves.
      setError(sendError.code === "23505"
        ? "You already reported this. An admin will review it soon."
        : sendError.code ? "Couldn't send the report. Please try again." : sendError.message);
      return;
    }

    onDone?.("Thanks for reporting. An admin will review it.");
    close();
  };

  return createPortal(
    <div
      style={{
        // Above the call window (calls.css), so it also works during a call.
        position: "fixed", inset: 0, zIndex: 1500,
        background: "rgba(0,0,0,0.65)",
        display: "flex", alignItems: "center", justifyContent: "center", padding: "1rem"
      }}
      onClick={sending ? undefined : close}
    >
      <form
        role="dialog"
        aria-modal="true"
        aria-labelledby="report-dialog-title"
        className="bg-dark text-white border border-secondary border-opacity-25 rounded-4 p-4"
        style={{ maxWidth: 440, width: "100%", maxHeight: "100%", overflowY: "auto" }}
        onClick={(event) => event.stopPropagation()}
        onSubmit={handleSubmit}
      >
        <div className="d-flex align-items-center gap-2 mb-1">
          <i className="bi bi-flag-fill text-danger"></i>
          <h5 id="report-dialog-title" className="fw-bold mb-0 text-truncate">Report {target.name ? `"${target.name}"` : "this"}</h5>
        </div>
        {target.callId && (
          <p className="text-warning fs-7 mb-1">
            <i className={`bi ${target.callKind === "video" ? "bi-camera-video-fill" : "bi-telephone-fill"} me-1`}></i>
            Reporting from your {target.callKind === "video" ? "video" : "voice"} call. The call keeps going.
          </p>
        )}
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

        {/* Screenshots as proof (optional). Only admins can open them. */}
        <label className="form-label text-white-50 fs-7 mb-1">Screenshots (optional, up to {MAX_SCREENSHOTS})</label>
        <div className="d-flex flex-wrap gap-2 mb-3">
          {screenshots.map((s, index) => (
            <div key={s.preview} className="position-relative">
              <img src={s.preview} alt={`Screenshot ${index + 1}`} className="rounded-3 border border-secondary border-opacity-50" style={{ width: 72, height: 72, objectFit: "cover" }} />
              <button
                type="button"
                className="btn btn-sm btn-danger rounded-circle position-absolute top-0 end-0 p-0 d-flex align-items-center justify-content-center"
                style={{ width: 22, height: 22, transform: "translate(35%, -35%)" }}
                aria-label={`Remove screenshot ${index + 1}`}
                disabled={sending}
                onClick={() => removeScreenshot(index)}
              >
                <i className="bi bi-x fs-6"></i>
              </button>
            </div>
          ))}
          {screenshots.length < MAX_SCREENSHOTS && (
            <label
              className={`d-flex flex-column align-items-center justify-content-center rounded-3 border border-secondary border-opacity-50 text-white-50 fs-8 ${sending ? "opacity-50" : "cursor-pointer"}`}
              style={{ width: 72, height: 72, "--bs-border-style": "dashed" }}
            >
              <i className="bi bi-image fs-5"></i>
              Add
              <input type="file" accept="image/jpeg,image/png,image/webp" multiple hidden disabled={sending} onChange={addScreenshots} />
            </label>
          )}
        </div>

        {error && <p className="text-danger fs-7 mb-3">{error}</p>}

        <div className="d-flex gap-2 justify-content-end">
          <button type="button" className="btn btn-outline-secondary text-white-50 rounded-pill px-4 fw-bold" onClick={close} disabled={sending}>
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
