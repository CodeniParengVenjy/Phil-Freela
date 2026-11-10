import { useState } from "react";
import { endInfo, formatDay } from "../../../lib/projects";
import WithdrawProjectDialog from "./WithdrawProjectDialog";

// On a project's page, for the FREELANCER while the project is still waiting for their work
// (PLAN-end-project.md): a quiet "Withdraw from this project" button, and, once the project is late
// and was never sent, when the daily job would end it by itself.
// payments: the project's payments (the Payments section tells the page), or null while loading.
// onWithdrawn(): called after the project was ended, so the page can read it again.
export default function WithdrawProjectCard({ project, payments, otherName, onWithdrawn }) {
  const [confirming, setConfirming] = useState(false);
  if (project.status !== "started") return null;

  const info = endInfo(project);
  const hasPayments = Array.isArray(payments) && payments.some((payment) => payment.status === "confirmed" || payment.status === "sent");

  return (
    <div className="mb-4" data-withdraw>
      {info.show && (
        <p className="text-secondary fs-8 mb-2" data-auto-end>
          <i className="bi bi-info-circle me-1"></i>
          If nothing is sent, PhilFreela ends this project by itself on {formatDay(info.autoEndDay)}, and tells you the day before.
        </p>
      )}
      <button type="button" className="btn btn-sm btn-outline-secondary rounded-pill px-3 fw-bold" onClick={() => setConfirming(true)}>
        <i className="bi bi-box-arrow-left me-1"></i>Withdraw from this project
      </button>

      {confirming && (
        <WithdrawProjectDialog
          project={project}
          otherName={otherName}
          hasPayments={hasPayments}
          onClose={() => setConfirming(false)}
          onWithdrawn={() => {
            setConfirming(false);
            onWithdrawn?.();
          }}
        />
      )}
    </div>
  );
}
