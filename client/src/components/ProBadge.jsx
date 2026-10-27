// The small gold "Premium" pill next to a name: the person has Premium right
// now (lib/pro.js, useProIds / useProStatus), whether they are a client or a
// freelancer. It says "Premium" in words, not only an icon, so nobody has to
// guess what it means. Shows nothing when `pro` is false.
export default function ProBadge({ pro }) {
  if (!pro) return null;
  return (
    <span className="badge rounded-pill bg-warning text-dark fw-bold fs-8 ms-1 align-middle" title="Premium member">
      <i className="bi bi-gem me-1"></i>Premium
    </span>
  );
}
