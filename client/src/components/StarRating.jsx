// The "★ 4.8 (5)" badge for a rating summary that is already loaded. Lists
// (Find Jobs) load every row's summary in one request (useRatingSummaries)
// and show it with this. Renders nothing until that user has at least one
// rating, so a brand new account doesn't show "★ 0.0 (0)". Next to one name
// (a profile, Job Details, Service Details) the round Trust score is used
// instead: components/TrustRing.jsx.
export function StarBadge({ summary, size = "fs-7" }) {
  if (!summary || summary.count === 0) return null;

  return (
    <span className={`text-warning fw-bold ${size}`}>
      <i className="bi bi-star-fill me-1"></i>{summary.avgStars.toFixed(1)}
      <span className="text-secondary fw-normal"> ({summary.count})</span>
    </span>
  );
}
