// The marks of a Featured post (PLAN-monetization.md, Step 4): the title over the
// separate row at the top of Browse Services / Find Jobs, and the small badge on
// each card in it. A Featured post is paid for, so it always says so.
export default function FeaturedHeading() {
  return (
    <div className="d-flex flex-wrap align-items-baseline gap-2">
      <h6 className="text-warning fw-bold mb-0"><i className="bi bi-star-fill me-2"></i>Featured</h6>
      <small className="text-secondary fs-8">Paid placement</small>
    </div>
  );
}

export function FeaturedBadge() {
  return (
    <span className="badge bg-warning text-dark fs-8">
      <i className="bi bi-star-fill me-1"></i>Featured
    </span>
  );
}
