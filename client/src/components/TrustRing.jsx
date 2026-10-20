import { useRatingSummary, trustPercent, trustLevel } from "../lib/ratings";

// The round Trust score: the average stars a person got from their projects,
// out of 5, drawn as a ring with the percentage in the middle (4.5 stars =
// 90%). Nothing new is stored: avgStars and count come from the same
// rating_summaries / profile_stats numbers as the "★ 4.8 (5)" badge, so a
// rating the blind rule still hides is not counted here either.
// size: "lg" (Performance box) or "sm" (next to a name).
export default function TrustRing({ avgStars, count, size = "lg" }) {
  const hasRatings = count > 0 && avgStars !== null && avgStars !== undefined;
  const percent = hasRatings ? trustPercent(avgStars) : 0;
  const level = hasRatings ? trustLevel(percent) : null;
  const label = hasRatings
    ? `Trust score ${percent}% from ${count} rating${count === 1 ? "" : "s"}`
    : "No ratings yet";

  return (
    // The arc takes its color from the level (text-success, text-role...), so
    // it follows light mode and the user's accent color like the rest.
    <span className={`trust-ring trust-ring-${size} ${level?.tone ?? ""}`} role="img" aria-label={label} title={label}>
      <svg viewBox="0 0 100 100" aria-hidden="true">
        <circle className="trust-ring-track" cx="50" cy="50" r="42" />
        {/* pathLength 100 makes the dash length the percentage itself; the arc
            is turned so it starts at the top. */}
        {hasRatings && (
          <circle
            className="trust-ring-arc"
            cx="50"
            cy="50"
            r="42"
            pathLength="100"
            transform="rotate(-90 50 50)"
            style={{ strokeDasharray: `${percent} 100` }}
          />
        )}
      </svg>
      <span className="trust-ring-value">{hasRatings ? `${percent}%` : "—"}</span>
    </span>
  );
}

// A small ring next to one name (a freelancer's public page, Job Details,
// Service Details): it loads that user's summary itself. Renders nothing until
// they have at least one rating, so a brand new account shows no empty ring.
export function TrustBadge({ userId }) {
  const summary = useRatingSummary(userId);
  if (!summary || summary.count === 0) return null;

  return (
    <span className="d-inline-flex align-items-center gap-1">
      <TrustRing avgStars={summary.avgStars} count={summary.count} size="sm" />
      <span className="text-secondary fs-8">Trust · {summary.count} rating{summary.count === 1 ? "" : "s"}</span>
    </span>
  );
}
