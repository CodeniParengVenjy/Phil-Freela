import { Link } from "react-router-dom";

// One bar split into shares, for "how much of the whole is each part" (Users by
// role, Verified users). A single bar reads faster than a round chart of two
// slices. Every part opens the Users page already filtered, like the cards do.
//
// Props:
//   title    the heading, e.g. "Users by role"
//   summary  one short line on the right, e.g. "30 users"
//   parts    [{ label: "Current Freelancers", value: 18, color: "var(--trend-orange)", to: "/admin/users?role=freelancer" }]
export default function SplitBar({ title, summary, parts }) {
  const total = parts.reduce((sum, part) => sum + part.value, 0);
  const percent = (value) => (total ? Math.round((value / total) * 100) : 0);

  return (
    <div className="admin-card rounded-4 p-3 h-100">
      <div className="d-flex justify-content-between align-items-baseline gap-3 mb-3">
        <h3 className="h6 fw-bold text-white mb-0">{title}</h3>
        <span className="text-secondary fs-7">{summary}</span>
      </div>

      {/* The bar: each part is as wide as its share, with a small gap between. */}
      <div className="admin-split-bar" role="img" aria-label={parts.map((part) => `${part.label}: ${part.value} (${percent(part.value)}%)`).join(", ")}>
        {parts.filter((part) => part.value > 0).map((part) => (
          <Link
            key={part.label}
            to={part.to}
            className="admin-split-part"
            style={{ flexGrow: part.value, background: part.color }}
            title={`${part.label}: ${part.value} (${percent(part.value)}%)`}
            aria-label={`${part.label}: ${part.value}. Open the list.`}
          />
        ))}
      </div>

      <ul className="list-unstyled d-flex flex-wrap column-gap-4 row-gap-1 mt-3 mb-0">
        {parts.map((part) => (
          <li key={part.label} className="d-flex align-items-center gap-2 fs-7">
            <span className="admin-trend-swatch" style={{ background: part.color }}></span>
            <Link to={part.to} className="admin-stat-link text-white-50">{part.label}</Link>
            <strong className="text-white">{part.value}</strong>
            <span className="text-secondary fs-8">{percent(part.value)}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
