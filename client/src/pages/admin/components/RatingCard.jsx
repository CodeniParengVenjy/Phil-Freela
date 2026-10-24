// The stars one kind of account (freelancers or clients) was given: the average
// as a big number, how many ratings it comes from, and a row per star level
// (5 down to 1) with a bar as wide as its share. The numbers come from
// admin_ratings().
//
// Props:
//   title   the heading, e.g. "Freelancers"
//   rating  { count: 4, average: 4.5 or null, stars: [one-star count, ..., five-star count] }
//   color   the color of the bars, e.g. "var(--trend-orange)"
export default function RatingCard({ title, rating, color }) {
  const { count, average, stars } = rating;

  return (
    <div className="admin-card rounded-4 p-3 h-100">
      <div className="d-flex justify-content-between align-items-baseline gap-3 mb-2">
        <h3 className="h6 fw-bold text-white mb-0">{title}</h3>
        <span className="text-secondary fs-7">{count === 1 ? "1 rating" : `${count} ratings`}</span>
      </div>

      {/* With no ratings there is no average, so say so instead of showing 0 or NaN. */}
      {count === 0 ? (
        <p className="text-secondary fs-7 mb-0">No ratings yet.</p>
      ) : (
        <>
          <div className="d-flex align-items-baseline gap-2 mb-3">
            <span className="admin-stat-value">{Number(average).toFixed(1)}</span>
            <i className="bi bi-star-fill text-warning" aria-hidden="true"></i>
            <span className="text-secondary fs-8">out of 5</span>
          </div>

          <ul className="list-unstyled d-grid gap-1 mb-0">
            {[5, 4, 3, 2, 1].map((level) => {
              const total = stars[level - 1];
              return (
                <li key={level} className="admin-rating-row" aria-label={`${level} ${level === 1 ? "star" : "stars"}: ${total}`}>
                  <span className="text-white-50 fs-7">
                    {level} <i className="bi bi-star-fill fs-8" aria-hidden="true"></i>
                  </span>
                  <span className="admin-rating-track" aria-hidden="true">
                    <span className="admin-rating-fill" style={{ width: `${(total / count) * 100}%`, background: color }}></span>
                  </span>
                  <strong className="text-white fs-7">{total}</strong>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </div>
  );
}
