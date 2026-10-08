import { useEffect, useState } from "react";
import { Link, useOutletContext } from "react-router-dom";
import { supabase } from "../../../lib/supabaseClient";

// One card per number returned by the admin_stats() database function. Every
// card opens the page behind its number; the Users ones open the Users page
// already filtered or sorted (it reads ?role=, ?verified=, ?sort= from the
// address). The Users card is drawn separately below because it shows two
// numbers in one: all users and who is online right now.
//   to: where the card goes (superAdminOnly cards are plain, not links, for a
//       regular admin, like the sidebar).
//   value: a number worked out from the stats, for ones the database doesn't send.
const statCards = [
  { key: "freelancers", label: "Freelancers", icon: "bi-person-workspace", color: "orange", to: "/admin/users?role=freelancer" },
  { key: "clients", label: "Clients", icon: "bi-briefcase-fill", color: "cyan", to: "/admin/users?role=client" },
  { key: "verified_users", label: "Verified Users", icon: "bi-patch-check-fill", color: "green", to: "/admin/users?verified=verified" },
  { key: "not_verified", label: "Not Verified Users", icon: "bi-person-x-fill", color: "red", to: "/admin/users?verified=unverified", value: (stats) => stats.total_users - stats.verified_users },
  { key: "new_this_week", label: "New Users This Week", icon: "bi-person-plus-fill", color: "green", to: "/admin/users?sort=joined&dir=desc" },
  { key: "services", label: "Services Posted", icon: "bi-grid-fill", color: "orange", to: "/admin/listings" },
  { key: "job_posts", label: "Job Posts", icon: "bi-megaphone-fill", color: "cyan", to: "/admin/listings" },
  { key: "admins", label: "Admins", icon: "bi-shield-lock-fill", color: "cyan", to: "/admin/admins", superAdminOnly: true },
  { key: "open_reports", label: "Open Reports", icon: "bi-flag-fill", color: "red", to: "/admin/reports" }
];

export default function AdminOverviewView() {
  const { adminName, isSuperAdmin } = useOutletContext();
  const [stats, setStats] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;

    (async () => {
      // rpc() calls a database function. admin_stats() checks on the server
      // that the caller is an admin before returning any numbers.
      const { data, error: statsError } = await supabase.rpc("admin_stats");
      if (!active) return;

      if (statsError) setError("Failed to load stats.");
      else setStats(data);
    })();

    return () => { active = false; };
  }, []);

  return (
    <section>
      <div className="admin-card rounded-4 p-4 mb-4">
        <span className="badge admin-badge-orange px-3 py-1 rounded-pill fw-bold text-uppercase fs-8 mb-2">Admin Overview</span>
        <h1 className="h3 fw-bold text-white mb-1">Welcome, {adminName}</h1>
        <p className="text-secondary fs-7 mb-0">A quick look at what's happening on PhilFreela. Click a number to see who or what is behind it.</p>
      </div>

      {error && <div className="admin-card rounded-4 p-4 text-center text-white-50">{error}</div>}

      {!error && (
        <div className="row g-3">
          {/* All users, and the ones online right now (seen in the last 2 minutes). */}
          <div className="col-12 col-sm-6 col-xl-4">
            <div className="admin-card admin-stat-card is-link rounded-4 p-3">
              <Link to="/admin/users" className="admin-stat-link d-flex align-items-center gap-3">
                <span className="admin-stat-icon admin-stat-orange">
                  <i className="bi bi-people-fill"></i>
                </span>
                <div>
                  <div className="admin-stat-value">{stats ? stats.total_users : "..."}</div>
                  <div className="text-secondary fs-7">Users</div>
                </div>
              </Link>
              <Link to="/admin/users?sort=online&dir=desc" className="admin-stat-link d-inline-block fs-8 text-success fw-semibold mt-1" style={{ marginLeft: 60 }}>
                <i className="bi bi-circle-fill me-1" style={{ fontSize: "0.5rem" }}></i>
                {stats ? stats.online_users : "..."} online now
              </Link>
            </div>
          </div>
          {statCards.map((card) => {
            // Only a super admin can open the Admins page.
            const linked = !card.superAdminOnly || isSuperAdmin;
            const number = stats ? (card.value ? card.value(stats) : stats[card.key]) : "...";
            const body = (
              <>
                <span className={`admin-stat-icon admin-stat-${card.color}`}>
                  <i className={`bi ${card.icon}`}></i>
                </span>
                <div>
                  <div className="admin-stat-value">{number}</div>
                  <div className="text-secondary fs-7">{card.label}</div>
                </div>
              </>
            );
            return (
              <div key={card.key} className="col-12 col-sm-6 col-xl-4">
                {linked ? (
                  <Link to={card.to} className="admin-card admin-stat-card is-link admin-stat-link rounded-4 p-3 d-flex align-items-center gap-3">
                    {body}
                  </Link>
                ) : (
                  <div className="admin-card admin-stat-card rounded-4 p-3 d-flex align-items-center gap-3">{body}</div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
