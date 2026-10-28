import { Link } from "react-router-dom";

// One bar split into shares, for "how much of the whole is each part" (Users by
// role, Verified users, where bookings and projects stand, where the earnings came
// from). A single bar reads faster than a round chart of a few slices. Under the bar
// every part is named with its number and its percent, so no meaning depends on a
// color. A part that has a link opens the page behind it (the Users page already
// filtered, Listings); a part without one is plain.
//
// Props:
//   title    the heading, e.g. "Users by role"
//   summary  one short line on the right, e.g. "30 users"
//   parts    [{ label: "Current Freelancers", value: 18, color: "var(--trend-orange)", to: "/admin/users?role=freelancer" }]
//            (`to` is optional)
//   format   optional: how a value is written (pesos: "₱1,250.00"); default: the number
export default function SplitBar({ title, summary, parts, format = (value) => value }) {
  const total = parts.reduce((sum, part) => sum + part.value, 0);
  const percent = (value) => (total ? Math.round((value / total) * 100) : 0);

  return (
    <div className="admin-card rounded-4 p-3 h-100">
      <div className="d-flex justify-content-between align-items-baseline gap-3 mb-3">
        <h3 className="h6 fw-bold text-white mb-0">{title}</h3>
        <span className="text-secondary fs-7">{summary}</span>
      </div>

      {/* The bar: each part is as wide as its share, with a small gap between. */}
      <div className="admin-split-bar" role="img" aria-label={parts.map((part) => `${part.label}: ${format(part.value)} (${percent(part.value)}%)`).join(", ")}>
        {parts.filter((part) => part.value > 0).map((part) => {
          const shared = {
            className: "admin-split-part",
            style: { flexGrow: part.value, background: part.color },
            title: `${part.label}: ${format(part.value)} (${percent(part.value)}%)`
          };
          return part.to
            ? <Link key={part.label} {...shared} to={part.to} aria-label={`${part.label}: ${format(part.value)}. Open the list.`} />
            : <div key={part.label} {...shared} />;
        })}
      </div>

      <ul className="list-unstyled d-flex flex-wrap column-gap-4 row-gap-1 mt-3 mb-0">
        {parts.map((part) => (
          <li key={part.label} className="d-flex align-items-center gap-2 fs-7">
            <span className="admin-trend-swatch" style={{ background: part.color }}></span>
            {part.to ? <Link to={part.to} className="admin-stat-link text-white-50">{part.label}</Link> : <span className="text-white-50">{part.label}</span>}
            <strong className="text-white">{format(part.value)}</strong>
            <span className="text-secondary fs-8">{percent(part.value)}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
