import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { MAX_PROJECT_NOTE_LENGTH, hireApplicant, todayInManila } from "../../../lib/projects";

// The Hire popup on Projects & Resumes. The client writes a note for the
// freelancer and picks the due date; Hire starts the project (screen 2).
// It uses the same look as the delete popup (the role-confirm-* CSS classes).
// applicant: { applicationId, freelancerName, jobTitle, jobDueDate }, or null
// when closed. The parent gives it key={applicationId}, so it starts fresh
// for each person.
export default function HireDialog({ applicant, onClose, onHired }) {
  const [note, setNote] = useState("");
  // The due date the client put on the job post, when it has one that is
  // still today or later. The date box starts with it; the client can change it.
  const jobDueDate = applicant?.jobDueDate && applicant.jobDueDate >= todayInManila() ? applicant.jobDueDate : "";
  const [dueDate, setDueDate] = useState(jobDueDate);
  const [error, setError] = useState("");
  const [hiring, setHiring] = useState(false);

  // Escape closes the popup, unless hiring is in progress.
  useEffect(() => {
    if (!applicant) return undefined;
    const handleKeyDown = (event) => {
      if (event.key === "Escape" && !hiring) onClose();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [applicant, hiring, onClose]);

  if (!applicant) return null;

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (hiring) return;
    setHiring(true);
    setError("");
    const { projectId, error: problem } = await hireApplicant(applicant.applicationId, note, dueDate);
    setHiring(false);
    if (problem) {
      setError(problem);
      return;
    }
    onHired(projectId);
  };

  return createPortal(
    <div
      className="role-confirm-backdrop"
      style={{
        position: "fixed", inset: 0, zIndex: 1300,
        background: "rgba(0,0,0,0.65)",
        display: "flex", alignItems: "center", justifyContent: "center", padding: "1rem"
      }}
      onClick={hiring ? undefined : onClose}
    >
      <form
        role="dialog"
        aria-modal="true"
        aria-labelledby="hire-dialog-title"
        className="role-confirm-card bg-dark text-white border border-secondary border-opacity-25 rounded-4 p-4"
        style={{ maxWidth: 460, width: "100%" }}
        onClick={(event) => event.stopPropagation()}
        onSubmit={handleSubmit}
      >
        <div className="text-center">
          <div className="role-confirm-icon bg-role text-white rounded-circle d-flex align-items-center justify-content-center mx-auto mb-3" style={{ width: 56, height: 56 }}>
            <i className="bi bi-briefcase-fill fs-4"></i>
          </div>
          <h5 id="hire-dialog-title" className="fw-bold mb-1 text-break">Hire {applicant.freelancerName}?</h5>
          <p className="text-secondary fs-7 mb-4 text-break">for "{applicant.jobTitle}"</p>
        </div>

        <label htmlFor="hireNote" className="form-label text-white-50 fw-semibold fs-7">Note for the freelancer (optional)</label>
        <textarea
          id="hireNote"
          className="form-control bg-secondary bg-opacity-25 border-secondary text-white fs-7 mb-1"
          rows="3"
          maxLength={MAX_PROJECT_NOTE_LENGTH}
          placeholder="e.g. The video must be 1 minute long and have realistic transitions."
          value={note}
          onChange={(event) => setNote(event.target.value)}
        ></textarea>
        <small className="text-secondary fs-8 d-block mb-3">{note.length}/{MAX_PROJECT_NOTE_LENGTH}</small>

        <label htmlFor="hireDueDate" className="form-label text-white-50 fw-semibold fs-7">Due date</label>
        <input
          id="hireDueDate"
          type="date"
          className="form-control bg-secondary bg-opacity-25 border-secondary text-white mb-1"
          // colorScheme: a light calendar icon and a dark calendar, to suit the dark box.
          style={{ colorScheme: "dark" }}
          min={todayInManila()}
          value={dueDate}
          onChange={(event) => setDueDate(event.target.value)}
          required
        />
        <small className="text-secondary fs-8 d-block mb-3">
          {jobDueDate ? "Filled in from your job post. You can change it." : "The day the work should be finished."}
        </small>

        {error && <p className="text-danger fs-7 mb-3">{error}</p>}

        <div className="d-flex gap-2 justify-content-center">
          <button type="button" className="btn btn-outline-secondary text-white-50 rounded-pill px-4 py-2 fw-bold" onClick={onClose} disabled={hiring}>
            Cancel
          </button>
          <button type="submit" className="btn btn-gradient-role text-white rounded-pill px-4 py-2 fw-bold" disabled={hiring}>
            {hiring ? "Hiring..." : "Hire"}
          </button>
        </div>
      </form>
    </div>,
    document.body
  );
}
