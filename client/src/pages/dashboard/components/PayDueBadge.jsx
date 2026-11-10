import { payDueInfo } from "../../../lib/payments";

// A small pill next to a project's due date (PLAN-delays.md, Step 1): red
// "Payment 3 days late" for both people, and for the client only, yellow
// "Pay in 2 days" / "Pay today" up to 3 days before the day the rest must be paid.
// money is projectMoney(project, payments); nothing shows while it isn't loaded,
// or when nothing is left to pay (lib/payments.js payDueInfo).
// today: today's date in the Philippines ("YYYY-MM-DD"); worked out if left out.
export default function PayDueBadge({ project, money, today, iAmClient, className = "" }) {
  const due = payDueInfo(project, money, today);
  if (!due || !(due.late || (due.soon && iAmClient))) return null;
  return (
    <span className={`badge rounded-pill ${due.late ? "bg-danger text-white" : "bg-warning text-dark"} ${className}`} data-pay-due-badge>
      <i className={`bi ${due.late ? "bi-cash-coin" : "bi-hourglass-split"} me-1`}></i>{due.text}
    </span>
  );
}
