import { useEffect, useState } from "react";
import { useOutletContext } from "react-router-dom";
import { supabase } from "../../../lib/supabaseClient";

// One card per number returned by the admin_stats() database function. The
// Users card is drawn separately below because it shows two numbers in one:
// all users and who is online right now.
const statCards = [
  { key: "freelancers", label: "Freelancers", icon: "bi-person-workspace", color: "orange" },
  { key: "clients", label: "Clients", icon: "bi-briefcase-fill", color: "cyan" },
  { key: "new_this_week", label: "New Users This Week", icon: "bi-person-plus-fill", color: "green" },
  { key: "services", label: "Services Posted", icon: "bi-grid-fill", color: "orange" },
  { key: "job_posts", label: "Job Posts", icon: "bi-megaphone-fill", color: "cyan" },
  { key: "admins", label: "Admins", icon: "bi-shield-lock-fill", color: "cyan" },
  { key: "open_reports", label: "Open Reports", icon: "bi-flag-fill", color: "red" }
];

export default function AdminOverviewView() {
  const { adminName } = useOutletContext();
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
        <p className="text-secondary fs-7 mb-0">A quick look at what's happening on PhilFreela.</p>
      </div>

      {error && <div className="admin-card rounded-4 p-4 text-center text-white-50">{error}</div>}

      {!error && (
        <div className="row g-3">
          {/* All users and the ones online right now (seen in the last 2 minutes). */}
          <div className="col-12 col-sm-6 col-xl-4">
            <div className="admin-card admin-stat-card rounded-4 p-3 d-flex align-items-center gap-3">
              <span className="admin-stat-icon admin-stat-orange">
                <i className="bi bi-people-fill"></i>
              </span>
              <div>
                <div className="admin-stat-value">{stats ? stats.total_users : "..."}</div>
                <div className="text-secondary fs-7">Users</div>
                <div className="fs-8 text-success fw-semibold">
                  <i className="bi bi-circle-fill me-1" style={{ fontSize: "0.5rem" }}></i>
                  {stats ? stats.online_users : "..."} online now
                </div>
              </div>
            </div>
          </div>
          {statCards.map((card) => (
            <div key={card.key} className="col-12 col-sm-6 col-xl-4">
              <div className="admin-card admin-stat-card rounded-4 p-3 d-flex align-items-center gap-3">
                <span className={`admin-stat-icon admin-stat-${card.color}`}>
                  <i className={`bi ${card.icon}`}></i>
                </span>
                <div>
                  <div className="admin-stat-value">{stats ? stats[card.key] : "..."}</div>
                  <div className="text-secondary fs-7">{card.label}</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
