import { useState } from "react";
import { endInfo, formatDay } from "../../../lib/projects";
import EndProjectDialog from "./EndProjectDialog";

// On a project's page, for the CLIENT (PLAN-end-project.md): a project that is late and was never
// sent can be ended once it is more than 7 days late. Before that day a quiet line says from when;
// from that day the button shows. Nothing for a project that was sent once, or that is not late.
// payments: the project's payments (the Payments section tells the page), or null while loading.
// onEnded(): called after the project was ended, so the page can read it again.
export default function EndProjectCard({ project, payments, otherName, onEnded }) {
  const [confirming, setConfirming] = useState(false);
  const info = endInfo(project);
  if (!info.show) return null;

  const hasPayments = Array.isArray(payments) && payments.some((payment) => payment.status === "confirmed" || payment.status === "sent");

  return (
    <div className="mb-4" data-end-project>
      {info.canEnd ? (
        <div className="alert alert-warning fs-7 py-2 mb-0 d-flex flex-column flex-sm-row align-items-sm-center gap-2" role="status">
          <span className="flex-grow-1 text-break">
            <i className="bi bi-slash-circle me-1"></i>
            {otherName} never sent any work, and the project is {info.daysLate} days late. If you don't want to wait any longer, you can end it.
          </span>
          <button type="button" className="btn btn-sm btn-dark rounded-pill px-3 fw-bold flex-shrink-0" onClick={() => setConfirming(true)}>
            End project
          </button>
        </div>
      ) : (
        <p className="text-secondary fs-8 mb-0" data-end-from>
          <i className="bi bi-info-circle me-1"></i>
          If {otherName} still hasn't sent anything, you can end this project from {formatDay(info.fromDay)}.
        </p>
      )}
      {/* The daily job ends a project that is 30 days late and was never sent (PLAN-end-project.md). */}
      <p className="text-secondary fs-8 mb-0 mt-2" data-auto-end>
        <i className="bi bi-robot me-1"></i>
        If nothing is sent, PhilFreela ends it by itself on {formatDay(info.autoEndDay)}, and tells you both the day before.
      </p>

      {confirming && (
        <EndProjectDialog
          project={project}
          otherName={otherName}
          daysLate={info.daysLate}
          hasPayments={hasPayments}
          onClose={() => setConfirming(false)}
          onEnded={() => {
            setConfirming(false);
            onEnded?.();
          }}
        />
      )}
    </div>
  );
}
