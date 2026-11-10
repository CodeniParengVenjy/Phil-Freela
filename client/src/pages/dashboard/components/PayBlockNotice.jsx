import { useEffect, useState } from "react";
import { allowUnpaidClient, getPayAllowance } from "../../../lib/payBlock";
import { formatPeso, payDueInfo, projectMoney } from "../../../lib/payments";
import { Busy } from "../../../components/Loaders";

// On a project's page, when the payment is late (past its payment day with money
// still unpaid, lib/payments.js payDueInfo): the client can't hire or book this
// freelancer again until it is paid, or until the freelancer allows it
// (lib/payBlock.js, PLAN-delays.md Step 2). Both see why. The freelancer gets
// "Allow to hire again" and "Report"; the client gets "Go to payment". Shows
// nothing when the payment isn't late, while the payments are loading, or when
// the database can't answer (for example before that SQL is run).
// payments: the project's payments (PaymentsSection tells the page), or null while loading.
export default function PayBlockNotice({ project, payments, isClient, otherName, showToast, onPay, onReport }) {
  const money = payments ? projectMoney(project, payments) : null;
  const due = payDueInfo(project, money);
  const late = Boolean(due?.late);
  // null until read (or when it can't be read), then { allowedAt }.
  const [allowance, setAllowance] = useState(null);
  // The freelancer pressed the button and is asked to confirm.
  const [asking, setAsking] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!late) return undefined;
    let active = true;
    getPayAllowance(project.id).then((answer) => {
      if (active) setAllowance(answer);
    });
    return () => {
      active = false;
    };
  }, [late, project.id]);

  if (!late || !allowance) return null;

  const handleAllow = async () => {
    setSaving(true);
    const problem = await allowUnpaidClient(project.id);
    setSaving(false);
    setAsking(false);
    if (problem) {
      showToast(problem);
      return;
    }
    setAllowance({ allowedAt: new Date().toISOString() });
    showToast(`${otherName} can hire or book you again.`);
  };

  // Already allowed: one quiet line.
  if (allowance.allowedAt) {
    return (
      <p className="text-secondary fs-7 mb-4" data-pay-block>
        <i className="bi bi-unlock me-1"></i>
        {isClient
          ? `${otherName} allowed you to hire or book them again (${new Date(allowance.allowedAt).toLocaleDateString()}).`
          : `You allowed ${otherName} to hire or book you again (${new Date(allowance.allowedAt).toLocaleDateString()}).`}
      </p>
    );
  }

  const amount = formatPeso(money.leftForNew);
  const days = `${due.days} day${due.days === 1 ? "" : "s"}`;

  if (isClient) {
    return (
      <div className="alert alert-warning fs-7 py-2 mb-4 d-flex flex-column flex-sm-row align-items-sm-center gap-2" role="status" data-pay-block>
        <span className="flex-grow-1">
          <i className="bi bi-slash-circle me-1"></i>
          The payment is {days} late and {amount} is still unpaid. Until it is paid, you can't hire or book {otherName} again, unless they allow it.
        </span>
        {onPay && (
          <button type="button" className="btn btn-sm btn-dark rounded-pill px-3 fw-bold flex-shrink-0" onClick={onPay}>
            <i className="bi bi-cash-coin me-1"></i>Go to payment
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="alert alert-warning fs-7 py-2 mb-4 d-flex flex-column flex-sm-row align-items-sm-center gap-2" role="status" data-pay-block>
      <span className="flex-grow-1">
        <i className="bi bi-slash-circle me-1"></i>
        {asking
          ? `Allow ${otherName} to hire or book you again?`
          : `${otherName} is ${days} late paying ${amount}. Until it is paid, they can't hire or book you again.`}
      </span>
      <span className="d-flex flex-wrap gap-2 flex-shrink-0">
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
          <>
            <button type="button" className="btn btn-sm btn-dark rounded-pill px-3 fw-bold" onClick={() => setAsking(true)}>
              <i className="bi bi-unlock me-1"></i>Allow to hire again
            </button>
            {onReport && (
              <button type="button" className="btn btn-sm btn-outline-dark rounded-pill px-3 fw-bold" onClick={onReport}>
                <i className="bi bi-flag me-1"></i>Report
              </button>
            )}
          </>
        )}
      </span>
    </div>
  );
}
