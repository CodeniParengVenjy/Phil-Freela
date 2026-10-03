import { useEffect, useState } from "react";
import { fetchProfileStats, formatMemberSince, formatReplyTime } from "../../../lib/profileStats";

// The Performance box on a profile (Feature 5, Profile transparency): real
// numbers worked out from the person's projects, ratings and chats, not typed
// in. role is "freelancer" or "client" (the numbers count only projects done
// in that role); a freelancer also gets On-time Delivery and Services Posted,
// a client gets Job Posts. It is the same for the person's own Profile and
// their public page.
export default function PerformanceBox({ userId, role, className = "" }) {
  // undefined while loading, null when it couldn't load, else the numbers.
  const [stats, setStats] = useState(undefined);

  useEffect(() => {
    if (!userId) return undefined;
    let active = true;

    fetchProfileStats(userId, role).then((result) => {
      if (active) setStats(result);
    });

    return () => {
      active = false;
    };
  }, [userId, role]);

  const rows = stats ? buildRows(stats, role === "freelancer") : [];

  return (
    <div className={`glass-card rounded-4 p-4 border border-secondary border-opacity-25 ${className}`}>
      <h5 className="text-white fw-bold mb-3"><i className="bi bi-bar-chart-line text-warning me-2"></i> Performance</h5>

      {stats === undefined && <p className="text-secondary fs-7 mb-0">Loading...</p>}
      {stats === null && <p className="text-secondary fs-7 mb-0">Couldn't load these numbers right now.</p>}

      {rows.map((row, index) => (
        <div
          key={row.label}
          className={`d-flex justify-content-between align-items-center gap-3 py-2 ${index < rows.length - 1 ? "border-bottom border-secondary border-opacity-25" : ""}`}
        >
          <span className="text-secondary fs-7">{row.label}</span>
          <span className={`fw-bold fs-6 text-end ${row.className}`}>{row.value}</span>
        </div>
      ))}
    </div>
  );
}

// The rows to show, from the numbers the database gave back.
function buildRows(stats, isFreelancer) {
  const completed = stats.completed_count;

  const rating = stats.rating_count > 0
    ? (
      <>
        <i className="bi bi-star-fill me-1"></i>{Number(stats.avg_stars).toFixed(1)}
        <small className="text-secondary fw-normal ms-1">({stats.rating_count})</small>
      </>
    )
    : "No ratings yet";

  const rows = [
    { label: "Completed Projects", value: completed, className: "text-white" },
    {
      label: "Average Rating",
      value: rating,
      className: stats.rating_count > 0 ? "text-warning" : "text-white-50"
    },
    {
      label: "Response Time",
      value: formatReplyTime(stats.reply_minutes),
      className: stats.reply_minutes === null ? "text-white-50" : "text-info"
    },
    {
      label: isFreelancer ? "Services Posted" : "Job Posts",
      value: stats.listing_count,
      className: "text-white"
    },
    { label: "Member Since", value: formatMemberSince(stats.member_since), className: "text-white" }
  ];

  if (isFreelancer) {
    // Only freelancers deliver work, so only they have an on-time number. It
    // waits for a first completed project.
    const hasOnTime = completed > 0 && stats.on_time_count !== null;
    const percent = hasOnTime ? Math.round((stats.on_time_count / completed) * 100) : null;
    rows.splice(1, 0, {
      label: "On-time Delivery",
      value: hasOnTime
        ? <>{percent}%<small className="text-secondary fw-normal ms-1">({stats.on_time_count} of {completed})</small></>
        : "—",
      className: !hasOnTime ? "text-white-50" : percent >= 80 ? "text-success" : "text-warning"
    });
  }

  return rows;
}
