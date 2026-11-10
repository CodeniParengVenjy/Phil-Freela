import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { endProject } from "../../../lib/projects";
import { Busy } from "../../../components/Loaders";

// "End project" on a project's page (PLAN-end-project.md): the client confirms ending a project
// that is more than 7 days late and was never sent. The database checks every rule again and
// writes the notice to both people. The parent mounts it only while it is open.
//   daysLate: how late the project is today; hasPayments: the client already recorded a payment
//   onEnded(): called after the project was ended
export default function EndProjectDialog({ project, otherName, daysLate, hasPayments, onClose, onEnded }) {
  const [error, setError] = useState("");
  const [ending, setEnding] = useState(false);

  // Escape closes the window, unless it is working.
  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === "Escape" && !ending) onClose();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [ending, onClose]);

  const handleEnd = async () => {
    if (ending) return;
    setEnding(true);
    setError("");
    const problem = await endProject(project.id);
    setEnding(false);
    if (problem) {
      setError(problem);
      return;
    }
    onEnded?.();
  };

  return createPortal(
    <div
      className="role-confirm-backdrop"
      style={{
        position: "fixed", inset: 0, zIndex: 1300,
        background: "rgba(0,0,0,0.65)",
        display: "flex", alignItems: "center", justifyContent: "center", padding: "1rem"
      }}
      onClick={ending ? undefined : onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="end-project-title"
        className="role-confirm-card bg-dark text-white border border-secondary border-opacity-25 rounded-4 p-4"
        style={{ maxWidth: 460, width: "100%", maxHeight: "92vh", overflowY: "auto" }}
        onClick={(event) => event.stopPropagation()}
      >
        <h5 id="end-project-title" className="fw-bold mb-1">End this project?</h5>
        <p className="text-secondary fs-7 mb-3 text-break">
          "{project.title}" is {daysLate} days late and {otherName} never sent any work.
        </p>

        <ul className="text-white-50 fs-7 ps-3 mb-3">
          <li>It becomes Ended for both of you. <strong className="text-white">This can't be undone.</strong></li>
          <li>{otherName} is told, and it shows as Ended on both your histories.</li>
          {project.job_post_id && <li>Its place on your job post opens again, so you can hire someone else.</li>}
          <li>Nobody is rated and no money moves. PhilFreela never holds money.</li>
        </ul>

        {hasPayments && (
          <p className="text-warning fs-7 mb-3" data-end-paid-warning>
            <i className="bi bi-exclamation-triangle-fill me-1"></i>
            You already recorded a payment on this project. Ending it doesn't return money. If {otherName} took it and never
            delivered the work, report it as Scam / Fraud.
          </p>
        )}

        {error && <p className="text-danger fs-7 mb-3" role="alert">{error}</p>}

        <div className="d-flex gap-2 justify-content-end">
          <button type="button" className="btn btn-outline-secondary text-white-50 rounded-pill px-4 py-2 fw-bold" onClick={onClose} disabled={ending}>
            Cancel
          </button>
          <button type="button" className="btn btn-danger text-white rounded-pill px-4 py-2 fw-bold" onClick={handleEnd} disabled={ending}>
            {ending ? <Busy>Ending</Busy> : "End project"}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
