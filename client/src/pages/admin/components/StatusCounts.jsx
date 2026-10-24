// A card with one plain number per status, e.g. Bookings: Pending 0, Accepted 4.
// Numbers only, no colors, so nothing depends on telling colors apart.
//
// Props:
//   title  the heading, e.g. "Bookings"
//   items  [{ label: "Accepted", value: 4 }]
export default function StatusCounts({ title, items }) {
  const total = items.reduce((sum, item) => sum + item.value, 0);

  return (
    <div className="admin-card rounded-4 p-3 h-100">
      <div className="d-flex justify-content-between align-items-baseline gap-3 mb-3">
        <h3 className="h6 fw-bold text-white mb-0">{title}</h3>
        <span className="text-secondary fs-7">{total} in total</span>
      </div>

      <div className="d-flex flex-wrap column-gap-4 row-gap-2">
        {items.map((item) => (
          <div key={item.label}>
            <div className="admin-trend-total">{item.value}</div>
            <div className="text-secondary fs-8">{item.label}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
