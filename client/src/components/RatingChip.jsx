// "★ 4.5 (2)": the average stars clients gave an offer and how many ratings
// that is (lib/serviceReviews.js). Shows nothing for an offer nobody has rated.
// rating: { count, average } or nothing. className sets the size, for example
// "fs-8" on a small card or "px-3 py-2" next to the offer's title.
export default function RatingChip({ rating, className = "" }) {
  if (!rating?.count) return null;
  return (
    <span className={`badge bg-secondary bg-opacity-50 text-warning rounded-pill ${className}`} title="Average rating clients gave this offer">
      <i className="bi bi-star-fill me-1"></i>{rating.average.toFixed(1)} ({rating.count})
    </span>
  );
}
