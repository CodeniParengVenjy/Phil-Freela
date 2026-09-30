import { useRatingSummary } from "../lib/ratings";

// The read-only "★ 4.8 (5)" badge shown next to a name (Job Details, a
// freelancer's public page). Renders nothing until that user has at least
// one rating, so a brand new account doesn't show "★ 0.0 (0)".
export default function StarRating({ userId, size = "fs-7" }) {
  const summary = useRatingSummary(userId);
  if (!summary || summary.count === 0) return null;

  return (
    <span className={`text-warning fw-bold ${size}`}>
      <i className="bi bi-star-fill me-1"></i>{summary.avgStars.toFixed(1)}
      <span className="text-secondary fw-normal"> ({summary.count})</span>
    </span>
  );
}
