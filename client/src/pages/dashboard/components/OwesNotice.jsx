import { Link } from "react-router-dom";
import { formatPeso } from "../../../lib/payments";
import CensoredText from "../../../components/CensoredText";

// Shown inside the Hire and Book popups, instead of the form, when the client is
// late paying this freelancer (PLAN-delays.md, Step 2; lib/payBlock.js
// getOwedProject). The database refuses the hire or booking too; this explains
// why before the client fills in anything.
// owed: { id, title, left, days }; what: "hire" or "book".
export default function OwesNotice({ owed, freelancerName, what, onClose }) {
  return (
    <div data-owes-notice>
      <div className="alert alert-warning fs-7 py-2 mb-3 text-start" role="status">
        <i className="bi bi-slash-circle me-1"></i>
        You still owe {freelancerName} <strong>{formatPeso(owed.left)}</strong> for "<CensoredText text={owed.title} />". Its payment day
        passed {owed.days} day{owed.days === 1 ? "" : "s"} ago, so you can't {what} {freelancerName} again yet.
      </div>
      <p className="text-secondary fs-8 mb-3">
        Pay what is left on that project, or ask {freelancerName} to allow you to hire again. Then come back here.
      </p>
      <div className="d-flex gap-2 justify-content-center">
        <button type="button" className="btn btn-outline-secondary text-white-50 rounded-pill px-4 py-2 fw-bold" onClick={onClose}>
          Close
        </button>
        <Link to={`/dashboard/project-details/${owed.id}`} className="btn btn-gradient-role text-white rounded-pill px-4 py-2 fw-bold" onClick={onClose}>
          Open the project
        </Link>
      </div>
    </div>
  );
}
