import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { withdrawFromProject } from "../../../lib/projects";
import { Busy } from "../../../components/Loaders";
import EndReasonBox from "./EndReasonBox";

// "Withdraw from this project" on a project's page, for the FREELANCER (PLAN-end-project.md): they
// step out of a project that is still waiting for their work, and can write why (optional). The
// project becomes Ended for both people. The database checks the rules again and tells the client.
// The parent mounts it only while it is open.
//   hasPayments: the client already recorded a payment; onWithdrawn(): called after it worked
export default function WithdrawProjectDialog({ project, otherName, hasPayments, onClose, onWithdrawn }) {
  const [error, setError] = useState("");
  const [working, setWorking] = useState(false);
  const [reason, setReason] = useState("");

  // Escape closes the window, unless it is working.
  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === "Escape" && !working) onClose();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [working, onClose]);

  const handleWithdraw = async () => {
    if (working) return;
    if (reason.trim() && reason.trim().length < 3) {
      setError("Write a few words for the reason, or leave it empty.");
      return;
    }
    setWorking(true);
    setError("");
    const problem = await withdrawFromProject(project.id, reason);
    setWorking(false);
    if (problem) {
      setError(problem);
      return;
    }
    onWithdrawn?.();
  };

  return createPortal(
    <div
      className="role-confirm-backdrop"
      style={{
        position: "fixed", inset: 0, zIndex: 1300,
        background: "rgba(0,0,0,0.65)",
        display: "flex", alignItems: "center", justifyContent: "center", padding: "1rem"
      }}
      onClick={working ? undefined : onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="withdraw-project-title"
        className="role-confirm-card bg-dark text-white border border-secondary border-opacity-25 rounded-4 p-4"
        style={{ maxWidth: 460, width: "100%", maxHeight: "92vh", overflowY: "auto" }}
        onClick={(event) => event.stopPropagation()}
      >
        <h5 id="withdraw-project-title" className="fw-bold mb-1">Withdraw from this project?</h5>
        <p className="text-secondary fs-7 mb-3 text-break">"{project.title}" for {otherName}.</p>

        <ul className="text-white-50 fs-7 ps-3 mb-3">
          <li>It becomes Ended for both of you. <strong className="text-white">This can't be undone.</strong></li>
          <li>{otherName} is told, and it shows as Ended on both your histories.</li>
          {project.job_post_id && <li>Its place on the job post opens again, so {otherName} can hire someone else.</li>}
          <li>Nobody is rated and no money moves. PhilFreela never holds money.</li>
        </ul>

        {hasPayments && (
          <p className="text-warning fs-7 mb-3" data-withdraw-paid-warning>
            <i className="bi bi-exclamation-triangle-fill me-1"></i>
            A payment was recorded on this project. PhilFreela doesn't hold money, so give it back to {otherName} directly.
            Keeping money for work you didn't deliver can be reported as Scam / Fraud.
          </p>
        )}

        <EndReasonBox id="withdrawProjectReason" value={reason} onChange={setReason} disabled={working} placeholder="I took a full time job" />

        {error && <p className="text-danger fs-7 mb-3" role="alert">{error}</p>}

        <div className="d-flex gap-2 justify-content-end">
          <button type="button" className="btn btn-outline-secondary text-white-50 rounded-pill px-4 py-2 fw-bold" onClick={onClose} disabled={working}>
            Cancel
          </button>
          <button type="button" className="btn btn-danger text-white rounded-pill px-4 py-2 fw-bold" onClick={handleWithdraw} disabled={working}>
            {working ? <Busy>Withdrawing</Busy> : "Withdraw"}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
