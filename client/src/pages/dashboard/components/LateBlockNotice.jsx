import { useEffect, useState } from "react";
import { allowLateFreelancer, getProjectLateness } from "../../../lib/lateBlock";
import { Busy } from "../../../components/Loaders";

// On a project's page: when the work wasn't sent by the due date, the
// freelancer can't apply to this client's job posts (lib/lateBlock.js). The
// client sees why and an "Allow to apply again" button; the freelancer sees
// what happened. Shows nothing for a project that wasn't late, or while the
// answer is loading.
export default function LateBlockNotice({ projectId, isClient, otherName, showToast }) {
  // null until loaded (or when the database can't answer), then { missed, allowedAt }.
  const [lateness, setLateness] = useState(null);
  // The client pressed the button and is asked to confirm.
  const [asking, setAsking] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let active = true;
    getProjectLateness(projectId).then((answer) => {
      if (active) setLateness(answer);
    });
    return () => {
      active = false;
    };
  }, [projectId]);

  if (!lateness?.missed) return null;

  const handleAllow = async () => {
    setSaving(true);
    const problem = await allowLateFreelancer(projectId);
    setSaving(false);
    setAsking(false);
    if (problem) {
      showToast(problem);
      return;
    }
    setLateness({ missed: true, allowedAt: new Date().toISOString() });
    showToast(`${otherName} can apply to your job posts again.`);
  };

  // Already allowed: one quiet line.
  if (lateness.allowedAt) {
    return (
      <p className="text-secondary fs-7 mb-4">
        <i className="bi bi-unlock me-1"></i>
        {isClient
          ? `You allowed ${otherName} to apply to your job posts again (${new Date(lateness.allowedAt).toLocaleDateString()}).`
          : `${otherName} allowed you to apply to their job posts again.`}
      </p>
    );
  }

  if (!isClient) {
    return (
      <div className="alert alert-warning fs-7 py-2 mb-4" role="status">
        <i className="bi bi-slash-circle me-1"></i> The work wasn't sent by the due date, so you can't apply to {otherName}'s job posts unless they allow it.
      </div>
    );
  }

  return (
    <div className="alert alert-warning fs-7 py-2 mb-4 d-flex flex-column flex-sm-row align-items-sm-center gap-2" role="status">
      <span className="flex-grow-1">
        <i className="bi bi-slash-circle me-1"></i>
        {asking
          ? `Allow ${otherName} to apply to your job posts again?`
          : `${otherName} didn't send the work by the due date, so they can't apply to your job posts.`}
      </span>
      <span className="d-flex gap-2 flex-shrink-0">
        {asking ? (
          <>
            <button type="button" className="btn btn-sm btn-dark rounded-pill px-3 fw-bold" disabled={saving} onClick={handleAllow}>
              {saving ? <Busy>Allowing</Busy> : "Yes, allow"}
            </button>
            <button type="button" className="btn btn-sm btn-outline-dark rounded-pill px-3 fw-bold" disabled={saving} onClick={() => setAsking(false)}>
              Cancel
            </button>
          </>
        ) : (
          <button type="button" className="btn btn-sm btn-dark rounded-pill px-3 fw-bold" onClick={() => setAsking(true)}>
            <i className="bi bi-unlock me-1"></i>Allow to apply again
          </button>
        )}
      </span>
    </div>
  );
}
