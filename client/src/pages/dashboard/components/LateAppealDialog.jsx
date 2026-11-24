import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import {
  APPEAL_MAX,
  APPEAL_MAX_LENGTH,
  APPEAL_MIN_LENGTH,
  APPEAL_REASON_MAX_LENGTH,
  answerLateAppeal,
  sendLateAppeal
} from "../../../lib/lateBlock";
import { Busy } from "../../../components/Loaders";
import { closeOnBackdrop } from "../../../lib/backdrop";

// The appeal window (PLAN-late-appeals.md), the same look as "Ask for more time":
//   mode "appeal":  the blocked freelancer writes why the client should let them
//                   apply again (10-500 characters) and sends it
//   mode "decline": the client declines an appeal, with an optional reason the
//                   freelancer will see (up to 300 characters)
// The database checks everything again and writes the notice to the other person.
// The parent mounts it only while it is open, so every opening starts empty.
//   left: appeals the freelancer has left (mode "appeal"); appealId: the appeal (mode "decline")
//   onDone(): called after it was sent or saved
export default function LateAppealDialog({ mode, projectId, projectTitle, appealId, left, otherName, onClose, onDone }) {
  const isAppeal = mode === "appeal";
  const maxLength = isAppeal ? APPEAL_MAX_LENGTH : APPEAL_REASON_MAX_LENGTH;
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  // Escape closes the window, unless it is saving.
  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === "Escape" && !saving) onClose();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [saving, onClose]);

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (saving) return;
    if (isAppeal && text.trim().length < APPEAL_MIN_LENGTH) {
      setError(`Tell ${otherName} why, in at least ${APPEAL_MIN_LENGTH} characters.`);
      return;
    }
    setSaving(true);
    setError("");
    const problem = isAppeal
      ? await sendLateAppeal(projectId, text)
      : await answerLateAppeal(appealId, false, text);
    setSaving(false);
    if (problem) {
      setError(problem);
      return;
    }
    onDone?.();
  };

  return createPortal(
    <div
      className="role-confirm-backdrop"
      style={{
        position: "fixed", inset: 0, zIndex: 1300,
        background: "rgba(0,0,0,0.65)",
        display: "flex", alignItems: "center", justifyContent: "center", padding: "1rem"
      }}
      {...closeOnBackdrop(saving ? undefined : onClose)}
    >
      <form
        role="dialog"
        aria-modal="true"
        aria-labelledby="late-appeal-title"
        className="role-confirm-card bg-dark text-white border border-secondary border-opacity-25 rounded-4 p-4"
        style={{ maxWidth: 460, width: "100%", maxHeight: "92vh", overflowY: "auto" }}
        onClick={(event) => event.stopPropagation()}
        onSubmit={handleSubmit}
        noValidate
      >
        <h5 id="late-appeal-title" className="fw-bold mb-1">
          {isAppeal ? `Appeal to ${otherName}` : "Decline the appeal"}
        </h5>
        <p className="text-secondary fs-7 mb-3 text-break">
          {isAppeal
            ? `The work for "${projectTitle}" wasn't sent by its due date, so you can't apply to ${otherName}'s job posts. Tell them why they should let you apply again. ${otherName} will be told and can allow or decline.`
            : `${otherName} still won't be able to apply to your job posts. You can tell them why (optional).`}
        </p>

        <label htmlFor="lateAppealText" className="form-label text-white-50 fw-semibold fs-7">
          {isAppeal ? "Your message" : "Reason (optional)"}
        </label>
        <textarea
          id="lateAppealText"
          className="form-control bg-secondary bg-opacity-25 border-secondary text-white mb-1"
          rows={isAppeal ? 4 : 3}
          placeholder={isAppeal ? "The files I needed came three days late" : "You were a week late and didn't message me"}
          value={text}
          onChange={(event) => setText(event.target.value)}
          maxLength={maxLength}
          disabled={saving}
        />
        <small className="text-secondary fs-8 d-block mb-3">{text.length}/{maxLength}</small>

        {isAppeal && (
          <p className="text-secondary fs-8 mb-3">
            <i className="bi bi-info-circle me-1"></i>
            You can appeal {APPEAL_MAX} times for each late project ({left} left). If {otherName} doesn't answer, the block stays.
          </p>
        )}

        {error && <p className="text-danger fs-7 mb-3" role="alert">{error}</p>}

        <div className="d-flex gap-2 justify-content-end">
          <button type="button" className="btn btn-outline-secondary text-white-50 rounded-pill px-4 py-2 fw-bold" onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button type="submit" className="btn btn-gradient-role text-white rounded-pill px-4 py-2 fw-bold" disabled={saving}>
            {saving
              ? <Busy kind={isAppeal ? "send" : undefined}>{isAppeal ? "Sending" : "Saving"}</Busy>
              : isAppeal ? "Send appeal" : "Decline appeal"}
          </button>
        </div>
      </form>
    </div>,
    document.body
  );
}
