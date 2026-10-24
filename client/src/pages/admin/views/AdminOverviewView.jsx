import { useEffect, useState } from "react";
import { Link, useOutletContext } from "react-router-dom";
import { supabase } from "../../../lib/supabaseClient";
import { GrowthChart, GrowthTable } from "../components/GrowthChart";
import SplitBar from "../components/SplitBar";

// One card per number returned by the admin_stats() database function. Every
// card opens the page behind its number; the Users ones open the Users page
// already filtered or sorted (it reads ?role=, ?verified=, ?sort= from the
// address). The Users card is drawn separately below because it shows two
// numbers in one: all users and who is online right now.
//   to: where the card goes (superAdminOnly cards are plain, not links, for a
//       regular admin, like the sidebar).
//   value: a number worked out from the stats, for ones the database doesn't send.
const statCards = [
  { key: "freelancers", label: "Current Freelancers", icon: "bi-person-workspace", color: "orange", to: "/admin/users?role=freelancer" },
  { key: "clients", label: "Current Clients", icon: "bi-briefcase-fill", color: "cyan", to: "/admin/users?role=client" },
  { key: "verified_users", label: "Verified Users", icon: "bi-patch-check-fill", color: "green", to: "/admin/users?verified=verified" },
  { key: "not_verified", label: "Not Verified Users", icon: "bi-person-x-fill", color: "red", to: "/admin/users?verified=unverified", value: (stats) => stats.total_users - stats.verified_users },
  { key: "new_this_week", label: "New Users This Week", icon: "bi-person-plus-fill", color: "green", to: "/admin/users?sort=joined&dir=desc" },
  { key: "pending_users", label: "Pending Users", icon: "bi-hourglass-split", color: "orange", to: "/admin/pending" },
  { key: "services", label: "Services Posted", icon: "bi-grid-fill", color: "orange", to: "/admin/listings" },
  { key: "job_posts", label: "Job Posts", icon: "bi-megaphone-fill", color: "cyan", to: "/admin/listings" },
  { key: "admins", label: "Admins", icon: "bi-shield-lock-fill", color: "cyan", to: "/admin/admins", superAdminOnly: true },
  { key: "open_reports", label: "Open Reports", icon: "bi-flag-fill", color: "red", to: "/admin/reports" }
];

// The growth graph under the cards: one line per kind, day by day. The tabs pick
// what is counted. Colors follow the thing counted: orange is freelancers and
// the services they offer, blue is clients and the jobs they post (set in
// admin.css, .admin-trends). The keys are the names in admin_trends() and
// admin_stats(), which give the new items per day and the totals right now.
const growthRanges = [7, 30, 90];
const growthTabs = [
  {
    key: "users",
    label: "Users",
    title: "Total users",
    totalLabel: "users in total",
    emptyText: "No users yet.",
    series: [
      { key: "freelancers", label: "Freelancers", color: "var(--trend-orange)" },
      { key: "clients", label: "Clients", color: "var(--trend-blue)" }
    ]
  },
  {
    key: "listings",
    label: "Listings",
    title: "Total listings",
    totalLabel: "listings in total",
    emptyText: "No listings yet.",
    series: [
      { key: "services", label: "Services", color: "var(--trend-orange)" },
      { key: "job_posts", label: "Job posts", color: "var(--trend-blue)" }
    ]
  }
];

export default function AdminOverviewView() {
  const { adminName, isSuperAdmin } = useOutletContext();
  const [stats, setStats] = useState(null);
  const [error, setError] = useState("");

  // The growth graph: how many days to show, the rows for them, what is counted
  // (Users or Listings) and graph or table.
  const [days, setDays] = useState(30);
  const [trends, setTrends] = useState(null);
  const [trendError, setTrendError] = useState("");
  const [trendsLoading, setTrendsLoading] = useState(true);
  const [growthTab, setGrowthTab] = useState("users");
  const [showTable, setShowTable] = useState(false);

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

  // Runs again whenever a different number of days is picked. admin_trends()
  // is admin-only too and sends one row per day, with zeros on quiet days.
  useEffect(() => {
    let active = true;

    (async () => {
      const { data, error: trendsError } = await supabase.rpc("admin_trends", { p_days: days });
      if (!active) return;

      if (trendsError) setTrendError("Failed to load the graph.");
      else {
        setTrends(data);
        setTrendError("");
      }
      setTrendsLoading(false);
    })();

    return () => { active = false; };
  }, [days]);

  const currentTab = growthTabs.find((tab) => tab.key === growthTab);

  function pickDays(count) {
    if (count === days) return;
    // The old graphs stay on screen, dimmed, until the new numbers arrive.
    setTrendsLoading(true);
    setDays(count);
  }

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
                  <div className="text-secondary fs-7">All Users</div>
                </div>
              </Link>
              <Link to="/admin/users?presence=online&sort=online&dir=desc" className="admin-stat-link d-inline-block fs-8 text-success fw-semibold mt-1" style={{ marginLeft: 60 }}>
                <i className="bi bi-circle-fill me-1" style={{ fontSize: "0.5rem" }}></i>
                {stats ? stats.online_users : "..."} online now
              </Link>
            </div>
          </div>
          {statCards.map((card) => {
            // Only a super admin can open the Admins page.
            const linked = !card.superAdminOnly || isSuperAdmin;
            // A dash if the database didn't send this number.
            const number = stats ? ((card.value ? card.value(stats) : stats[card.key]) ?? "-") : "...";
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

      {!error && (
        <div className="admin-trends mt-4">
          <div className="d-flex flex-wrap align-items-end justify-content-between gap-3 mb-3">
            <div>
              <h2 className="h5 fw-bold text-white mb-0">Growth</h2>
              <p className="text-secondary fs-7 mb-0">How many users and listings there are, day by day, in Philippine time.</p>
            </div>
            {/* What to count, and for how long. */}
            <div className="d-flex flex-wrap gap-2">
              <div className="admin-seg" role="group" aria-label="What to count">
                {growthTabs.map((tab) => (
                  <button key={tab.key} type="button" className={growthTab === tab.key ? "active" : ""} aria-pressed={growthTab === tab.key} onClick={() => setGrowthTab(tab.key)}>
                    {tab.label}
                  </button>
                ))}
              </div>
              <div className="admin-seg" role="group" aria-label="How many days to show">
                {growthRanges.map((count) => (
                  <button key={count} type="button" className={days === count ? "active" : ""} aria-pressed={days === count} onClick={() => pickDays(count)}>
                    {count} days
                  </button>
                ))}
              </div>
            </div>
          </div>

          {trendError && <div className="admin-card rounded-4 p-4 text-center text-white-50">{trendError}</div>}
          {!trendError && (!trends || !stats) && <div className="admin-card rounded-4 p-4 text-center text-white-50">Loading the graph...</div>}

          {!trendError && trends && stats && (
            <div className={trendsLoading ? "admin-trends-loading" : ""} aria-busy={trendsLoading}>
              {showTable ? (
                <GrowthTable series={currentTab.series} data={trends} current={stats} />
              ) : (
                <GrowthChart
                  title={currentTab.title}
                  totalLabel={currentTab.totalLabel}
                  emptyText={currentTab.emptyText}
                  series={currentTab.series}
                  data={trends}
                  current={stats}
                  days={trends.length}
                />
              )}
              <div className="text-end mt-2">
                <button type="button" className="btn btn-link btn-sm text-secondary p-0" onClick={() => setShowTable(!showTable)}>
                  {showTable ? "Back to the graph" : "View as table"}
                </button>
              </div>
            </div>
          )}

          {/* Two shares of the whole, from the numbers the cards already use. */}
          {stats && (
            <div className="row g-3 mt-0">
              <div className="col-12 col-md-6">
                <SplitBar
                  title="Users by role"
                  summary={`${stats.freelancers + stats.clients} users`}
                  parts={[
                    { label: "Current Freelancers", value: stats.freelancers, color: "var(--trend-orange)", to: "/admin/users?role=freelancer" },
                    { label: "Current Clients", value: stats.clients, color: "var(--trend-blue)", to: "/admin/users?role=client" }
                  ]}
                />
              </div>
              <div className="col-12 col-md-6">
                <SplitBar
                  title="Verified users"
                  summary={`${stats.total_users ? Math.round((stats.verified_users / stats.total_users) * 100) : 0}% verified`}
                  parts={[
                    { label: "Verified", value: stats.verified_users, color: "var(--trend-aqua)", to: "/admin/users?verified=verified" },
                    { label: "Not verified", value: stats.total_users - stats.verified_users, color: "var(--trend-track)", to: "/admin/users?verified=unverified" }
                  ]}
                />
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
