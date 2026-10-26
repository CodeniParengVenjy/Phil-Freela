import { formatFeatureDate } from "../../../lib/featured";

// The "Feature" part of a row in My Offers and My Job Posts (PLAN-monetization.md,
// Step 4). It shows where the post stands, and the one button that fits:
//   until:      the end date (ISO text) while the post is Featured; the button then says Extend
//   waiting:    a payment is waiting for an admin; no button until it is answered
//   canFeature: false hides the button (an offer clients can't see yet, a post
//               that is not open, a suspended account), because paying for a
//               post nobody can see would be a waste
//   onFeature:  opens PromoPayDialog
export default function FeatureControl({ until, waiting, canFeature, onFeature }) {
  if (!until && !waiting && !canFeature) return null;
  return (
    <div className="d-flex flex-wrap align-items-center gap-2">
      {until && (
        <span className="badge bg-warning text-dark fs-8 text-wrap text-start">
          <i className="bi bi-star-fill me-1"></i>Featured until {formatFeatureDate(until)}
        </span>
      )}
      {waiting && (
        <span className="badge bg-info text-dark fs-8">
          <i className="bi bi-hourglass-split me-1"></i>Waiting for review
        </span>
      )}
      {!waiting && canFeature && (
        <button type="button" className="btn btn-sm btn-outline-warning rounded-pill px-3 fs-8 fw-bold" onClick={onFeature}>
          <i className="bi bi-star me-1"></i>{until ? "Extend" : "Feature"}
        </button>
      )}
    </div>
  );
}
