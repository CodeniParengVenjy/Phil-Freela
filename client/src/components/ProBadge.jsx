// The small gold "Pro" pill next to a freelancer's name: they have Freelancer Pro
// right now (lib/pro.js, useProIds). It says "Pro" in words, not only an icon, so
// nobody has to guess what it means. Shows nothing when `pro` is false.
export default function ProBadge({ pro }) {
  if (!pro) return null;
  return (
    <span className="badge rounded-pill bg-warning text-dark fw-bold fs-8 ms-1 align-middle" title="Freelancer Pro">
      <i className="bi bi-gem me-1"></i>Pro
    </span>
  );
}
