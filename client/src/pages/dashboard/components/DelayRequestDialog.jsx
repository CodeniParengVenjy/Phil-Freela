import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { DELAY_MAX_DAYS, MAX_DELAY_REASON_LENGTH, delayWhat, requestDelay } from "../../../lib/delayRequests";
import { formatDay } from "../../../lib/projects";
import { Busy } from "../../../components/Loaders";

// "Ask for more time" on a project's page (PLAN-delay-requests.md): the freelancer asks the
// client for more days to send the work, or the client asks the freelancer for more days to
// pay. A new day (up to 7 days after the current one) and a short reason. The database
// checks everything again and writes the notice to the other person. The parent mounts it
// only while it is open, so every opening starts empty.
//   kind: "work" or "payment"; currentDay: the date that would move; minDay / maxDay: what the date box allows
//   onSent(): called after the request was sent
export default function DelayRequestDialog({ projectId, projectTitle, kind, currentDay, minDay, maxDay, otherName, onClose, onSent }) {
  const [newDay, setNewDay] = useState(minDay);
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);

  // Escape closes the window, unless it is sending.
  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === "Escape" && !sending) onClose();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [sending, onClose]);

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (sending) return;
    if (!newDay || newDay < minDay || newDay > maxDay) {
      setError(`Pick a day from ${formatDay(minDay)} to ${formatDay(maxDay)}.`);
      return;
    }
    if (reason.trim().length < 3) {
      setError("Tell them why, in a few words.");
      return;
    }
    setSending(true);
    setError("");
    const problem = await requestDelay(projectId, kind, newDay, reason);
    setSending(false);
    if (problem) {
      setError(problem);
      return;
    }
    onSent?.();
  };

  return createPortal(
    <div
      className="role-confirm-backdrop"
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
        aria-labelledby="delay-request-title"
        className="role-confirm-card bg-dark text-white border border-secondary border-opacity-25 rounded-4 p-4"
        style={{ maxWidth: 460, width: "100%", maxHeight: "92vh", overflowY: "auto" }}
        onClick={(event) => event.stopPropagation()}
        onSubmit={handleSubmit}
        noValidate
      >
        <h5 id="delay-request-title" className="fw-bold mb-1">Ask for more time to {delayWhat(kind)}</h5>
        <p className="text-secondary fs-7 mb-3 text-break">
          "{projectTitle}" is now due {formatDay(currentDay)}. {otherName} will be told and can accept or decline.
        </p>

        <label htmlFor="delayNewDay" className="form-label text-white-50 fw-semibold fs-7">New day</label>
        <input
          id="delayNewDay"
          type="date"
          className="form-control bg-secondary bg-opacity-25 border-secondary text-white mb-1"
          value={newDay}
          min={minDay}
          max={maxDay}
          onChange={(event) => setNewDay(event.target.value)}
          disabled={sending}
        />
        <small className="text-secondary fs-8 d-block mb-3">Up to {DELAY_MAX_DAYS} days after {formatDay(currentDay)}.</small>

        <label htmlFor="delayReason" className="form-label text-white-50 fw-semibold fs-7">Reason</label>
        <textarea
          id="delayReason"
          className="form-control bg-secondary bg-opacity-25 border-secondary text-white mb-1"
          rows={3}
          placeholder={kind === "work" ? "I was sick this week" : "My salary comes in on the fifth"}
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          maxLength={MAX_DELAY_REASON_LENGTH}
          disabled={sending}
        />
        <small className="text-secondary fs-8 d-block mb-3">{reason.length}/{MAX_DELAY_REASON_LENGTH}</small>

        <p className="text-secondary fs-8 mb-3">
          <i className="bi bi-info-circle me-1"></i>
          You can ask twice for each project. If {otherName} doesn't answer, the old day stays and the reminders keep going.
        </p>

        {error && <p className="text-danger fs-7 mb-3" role="alert">{error}</p>}

        <div className="d-flex gap-2 justify-content-end">
          <button type="button" className="btn btn-outline-secondary text-white-50 rounded-pill px-4 py-2 fw-bold" onClick={onClose} disabled={sending}>
            Cancel
          </button>
          <button type="submit" className="btn btn-gradient-role text-white rounded-pill px-4 py-2 fw-bold" disabled={sending}>
            {sending ? <Busy kind="send">Sending</Busy> : "Send request"}
          </button>
        </div>
      </form>
    </div>,
    document.body
  );
}
