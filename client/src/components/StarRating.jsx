import { useRatingSummary } from "../lib/ratings";

// The "★ 4.8 (5)" badge for a rating summary that is already loaded. Lists
// (Find Jobs) load every row's summary in one request (useRatingSummaries)
// and show it with this. Renders nothing until that user has at least one
// rating, so a brand new account doesn't show "★ 0.0 (0)".
export function StarBadge({ summary, size = "fs-7" }) {
  if (!summary || summary.count === 0) return null;

  return (
    <span className={`text-warning fw-bold ${size}`}>
      <i className="bi bi-star-fill me-1"></i>{summary.avgStars.toFixed(1)}
      <span className="text-secondary fw-normal"> ({summary.count})</span>
    </span>
  );
}

// The same read-only badge next to one name (Job Details, a freelancer's
// public page): it loads that user's summary itself.
export default function StarRating({ userId, size = "fs-7" }) {
  return <StarBadge summary={useRatingSummary(userId)} size={size} />;
}
