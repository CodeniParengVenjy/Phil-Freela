import { formatFeatureDate } from "../../../lib/featured";

// The "Feature" part of a row in My Offers and My Job Posts (PLAN-monetization.md,
// Step 4, and PLAN-premium.md). It shows where the post stands, and the buttons that fit:
//   until:      the end date (ISO text) while the post is Featured; the button then says Extend
//   waiting:    a payment is waiting for an admin; no button until it is answered
//   canFeature: false hides the buttons (an offer clients can't see yet, a post
//               that is not open, a suspended account), because paying for a
//               post nobody can see would be a waste
//   onFeature:  opens the pay window
//   free:       Premium's free Featured post ({ available } from lib/pro.js,
//               getFreeFeature); when it is available a "Feature free" button shows
//   onUseFree:  uses it on this post
//   views:      Premium: how many people opened this post (left out without Premium)
export default function FeatureControl({ until, waiting, canFeature, onFeature, free, onUseFree, views }) {
  const showViews = typeof views === "number";
  if (!until && !waiting && !canFeature && !showViews) return null;
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
      {!waiting && canFeature && free?.available && onUseFree && (
        <button type="button" className="btn btn-sm btn-warning text-dark rounded-pill px-3 fs-8 fw-bold" onClick={onUseFree} title="Premium: one free 3-day Featured post every 30 days">
          <i className="bi bi-gift me-1"></i>Feature free
        </button>
      )}
      {showViews && (
        <span className="text-white-50 fs-8" title="People who opened this post (Premium)">
          <i className="bi bi-eye me-1"></i>{views} {views === 1 ? "view" : "views"}
        </span>
      )}
    </div>
  );
}
