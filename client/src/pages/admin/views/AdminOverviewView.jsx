import { useEffect, useState } from "react";
import { Link, useOutletContext, useSearchParams } from "react-router-dom";
import { supabase } from "../../../lib/supabaseClient";
import { formatPeso } from "../../../lib/payments";
import { getEarnings } from "../../../lib/promotions";
import { GrowthChart, GrowthTable } from "../components/GrowthChart";
import SplitBar from "../components/SplitBar";
import HiredList from "../components/HiredList";
import RatingCard from "../components/RatingCard";
import StatusCounts from "../components/StatusCounts";
import TopRatedList from "../components/TopRatedList";

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

// The parts of the Overview, chosen in the dropdown at the top. Only the chosen part
// is drawn, so the page is not one long list, and each part asks the database for its
// numbers when it is opened. "overview" is the first and the default.
const overviewViews = [
  { key: "overview", label: "Overview" },
  { key: "ratings", label: "Ratings" },
  { key: "transactions", label: "Transactions" },
  { key: "jobs", label: "Job hiring" },
  { key: "earnings", label: "Earnings" }
];

export default function AdminOverviewView() {
  const { adminName, isSuperAdmin } = useOutletContext();
  const [stats, setStats] = useState(null);
  const [error, setError] = useState("");

  // The chosen part is kept in the address (?view=ratings), so a refresh comes back
  // to the same part. A missing or unknown ?view= means the Overview.
  const [searchParams, setSearchParams] = useSearchParams();
  const asked = searchParams.get("view");
  const view = overviewViews.some((item) => item.key === asked) ? asked : "overview";

  // replace: choosing a part is not a page of its own, so Back doesn't step through
  // every part that was looked at.
  function pickView(key) {
    setSearchParams(key === "overview" ? {} : { view: key }, { replace: true });
  }

  // The growth graph: how many days to show, the rows for them, what is counted
  // (Users or Listings) and graph or table.
  const [days, setDays] = useState(30);
  const [trends, setTrends] = useState(null);
  const [trendError, setTrendError] = useState("");
  const [trendsLoading, setTrendsLoading] = useState(true);
  const [growthTab, setGrowthTab] = useState("users");
  const [showTable, setShowTable] = useState(false);

  // The Overview's own numbers: only asked for while that part is open.
  useEffect(() => {
    if (view !== "overview") return undefined;
    let active = true;

    (async () => {
      // rpc() calls a database function. admin_stats() checks on the server
      // that the caller is an admin before returning any numbers.
      const { data, error: statsError } = await supabase.rpc("admin_stats");
      if (!active) return;

      if (statsError) setError("Failed to load stats.");
      else {
        setStats(data);
        setError("");
      }
    })();

    return () => { active = false; };
  }, [view]);

  // Runs again whenever a different number of days is picked (and when the Overview
  // is opened again). admin_trends() is admin-only too and sends one row per day,
  // with zeros on quiet days.
  useEffect(() => {
    if (view !== "overview") return undefined;
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
  }, [days, view]);

  // The stars given to freelancers and clients (admin_ratings()) and where the
  // bookings and projects stand (admin_transactions()). Each has its own error,
  // so one failing does not hide the other or the cards.
  const [ratings, setRatings] = useState(null);
  const [ratingsError, setRatingsError] = useState("");
  const [transactions, setTransactions] = useState(null);
  const [transactionsError, setTransactionsError] = useState("");
  // The best rated freelancers and clients (admin_top_rated()), the top 5 of each.
  const [topRated, setTopRated] = useState(null);
  const [topRatedError, setTopRatedError] = useState("");
  // Where hiring from job posts stands (admin_job_hiring()): only its totals are
  // used here; the per-post numbers are for Listings.
  const [hiringTotals, setHiringTotals] = useState(null);
  const [hiringError, setHiringError] = useState("");
  // How many GCash payments are at each step (admin_payment_counts(): counts only,
  // no amounts). Null until it has loaded, or when it can't be loaded: the card
  // then says payments aren't set up yet, and nothing else on the page changes.
  const [paymentCounts, setPaymentCounts] = useState(null);
  // What PhilFreela earned from fees (admin_promo_earnings()). Its own error, so
  // it never hides the rest of the Overview.
  const [earnings, setEarnings] = useState(null);
  const [earningsError, setEarningsError] = useState("");

  // Each of these asks for its numbers when its part is opened (so the page only works
  // out what is on screen, and the numbers are fresh each time). A failure clears that
  // part's numbers and shows its own message; opening the part again tries again.
  useEffect(() => {
    if (view !== "ratings") return undefined;
    let active = true;

    (async () => {
      const [ratingsResult, topRatedResult] = await Promise.all([
        supabase.rpc("admin_ratings"),
        supabase.rpc("admin_top_rated", { p_limit: 5 })
      ]);
      if (!active) return;

      setRatings(ratingsResult.error ? null : ratingsResult.data);
      setRatingsError(ratingsResult.error ? "Failed to load the ratings." : "");
      setTopRated(topRatedResult.error ? null : topRatedResult.data);
      setTopRatedError(topRatedResult.error ? "Failed to load the top rated." : "");
    })();

    return () => { active = false; };
  }, [view]);

  useEffect(() => {
    if (view !== "transactions") return undefined;
    let active = true;

    (async () => {
      const [transactionsResult, paymentsResult] = await Promise.all([
        supabase.rpc("admin_transactions"),
        supabase.rpc("admin_payment_counts")
      ]);
      if (!active) return;

      setTransactions(transactionsResult.error ? null : transactionsResult.data);
      setTransactionsError(transactionsResult.error ? "Failed to load the transactions." : "");
      setPaymentCounts(paymentsResult.error ? null : paymentsResult.data);
    })();

    return () => { active = false; };
  }, [view]);

  useEffect(() => {
    if (view !== "jobs") return undefined;
    let active = true;

    (async () => {
      const { data, error: hiringResultError } = await supabase.rpc("admin_job_hiring");
      if (!active) return;

      setHiringTotals(hiringResultError ? null : data.totals);
      setHiringError(hiringResultError ? "Failed to load the job hiring numbers." : "");
    })();

    return () => { active = false; };
  }, [view]);

  useEffect(() => {
    if (view !== "earnings") return undefined;
    let active = true;

    (async () => {
      const result = await getEarnings();
      if (!active) return;

      setEarnings(result.error ? null : result.earnings);
      setEarningsError(result.error || "");
    })();

    return () => { active = false; };
  }, [view]);

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
        <p className="text-secondary fs-7 mb-0">A quick look at what's happening on PhilFreela. Pick a part below, and click a number to see who or what is behind it.</p>

        {/* What to look at: one part at a time, so the page is not one long list. */}
        <div className="mt-3">
          <select
            className="form-select admin-input admin-view-select"
            value={view}
            onChange={(event) => pickView(event.target.value)}
            aria-label="Choose what to look at"
          >
            {overviewViews.map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}
          </select>
        </div>
      </div>

      {view === "overview" && error && <div className="admin-card rounded-4 p-4 text-center text-white-50">{error}</div>}

      {view === "overview" && !error && (
        <div className="admin-trends mb-4">
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

      {view === "overview" && !error && (
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

      {/* Ratings: the stars given, and who is best rated. */}
      {view === "ratings" && (
        <div className="admin-trends">
          <div className="mb-3">
            <h2 className="h5 fw-bold text-white mb-0">Ratings</h2>
            <p className="text-secondary fs-7 mb-0">The stars people were given after a finished project. A rating shows here once both sides have rated, or after 14 days.</p>
          </div>

          {ratingsError && <div className="admin-card rounded-4 p-4 text-center text-white-50">{ratingsError}</div>}
          {!ratingsError && !ratings && <div className="admin-card rounded-4 p-4 text-center text-white-50">Loading the ratings...</div>}

          {ratings && (
            <>
              <div className="row g-3">
                <div className="col-12 col-md-6">
                  <RatingCard title="Freelancers" rating={ratings.freelancers} color="var(--trend-orange)" />
                </div>
                <div className="col-12 col-md-6">
                  <RatingCard title="Clients" rating={ratings.clients} color="var(--trend-blue)" />
                </div>
              </div>
              <p className="text-secondary fs-7 mt-2 mb-0">
                <i className="bi bi-star-fill text-warning me-1" aria-hidden="true"></i>
                Offer reviews, the stars clients gave a service:{" "}
                {ratings.offers.count === 0
                  ? "none yet."
                  : `${Number(ratings.offers.average).toFixed(1)} out of 5 from ${ratings.offers.count} ${ratings.offers.count === 1 ? "review" : "reviews"}.`}
              </p>
            </>
          )}

          {/* Who is outstanding: the best rated people, best first. */}
          <div className="mt-4 mb-3">
            <h3 className="h6 fw-bold text-white mb-0">Top rated</h3>
            <p className="text-secondary fs-7 mb-0">The best rated people by average stars, with how many ratings that comes from. Click a name to find them in Users.</p>
          </div>

          {topRatedError && <div className="admin-card rounded-4 p-4 text-center text-white-50">{topRatedError}</div>}
          {!topRatedError && !topRated && <div className="admin-card rounded-4 p-4 text-center text-white-50">Loading the top rated...</div>}

          {topRated && (
            <div className="row g-3">
              <div className="col-12 col-md-6">
                <TopRatedList title="Top freelancers" people={topRated.freelancers} emptyText="No rated freelancers yet." />
              </div>
              <div className="col-12 col-md-6">
                <TopRatedList title="Top clients" people={topRated.clients} emptyText="No rated clients yet." />
              </div>
            </div>
          )}

        </div>
      )}

      {/* Transactions: where the bookings, projects and payments stand. */}
      {view === "transactions" && (
        <div className="admin-trends">
          <div className="mb-3">
            <h2 className="h5 fw-bold text-white mb-0">Transactions</h2>
            <p className="text-secondary fs-7 mb-0">Where the work stands today, from bookings and projects.</p>
          </div>

          {transactionsError && <div className="admin-card rounded-4 p-4 text-center text-white-50">{transactionsError}</div>}
          {!transactionsError && !transactions && <div className="admin-card rounded-4 p-4 text-center text-white-50">Loading the transactions...</div>}

          {transactions && (
            <div className="row g-3">
              <div className="col-12 col-md-6">
                <StatusCounts
                  title="Bookings"
                  items={[
                    { label: "Pending", value: transactions.bookings.pending },
                    { label: "Accepted", value: transactions.bookings.accepted },
                    { label: "Declined", value: transactions.bookings.declined },
                    { label: "Cancelled", value: transactions.bookings.cancelled }
                  ]}
                />
              </div>
              <div className="col-12 col-md-6">
                <StatusCounts
                  title="Projects"
                  items={[
                    { label: "Started", value: transactions.projects.started },
                    { label: "Submitted", value: transactions.projects.submitted },
                    { label: "Done", value: transactions.projects.done }
                  ]}
                />
              </div>
              {/* GCash payments: how many are at each step, from projects and chats
                  together (counts only, no amounts: PhilFreela never holds the money). */}
              <div className="col-12">
                {paymentCounts ? (
                  <StatusCounts
                    title="Payments"
                    items={[
                      { label: "Requested", value: paymentCounts.requested },
                      { label: "Payment sent", value: paymentCounts.sent },
                      { label: "Confirmed", value: paymentCounts.confirmed },
                      { label: "Not received", value: paymentCounts.not_received },
                      { label: "Cancelled", value: paymentCounts.cancelled }
                    ]}
                  />
                ) : (
                  <div className="admin-card rounded-4 p-3 d-flex align-items-center gap-3">
                    <span className="admin-stat-icon admin-stat-orange">
                      <i className="bi bi-cash-coin"></i>
                    </span>
                    <div>
                      <div className="fw-bold text-white">Payments <span className="badge admin-badge-orange rounded-pill fs-8 ms-1">Not set up yet</span></div>
                      <div className="text-secondary fs-7">How many payments there are at each step will show here.</div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

        </div>
      )}

      {/* Job hiring: how many posts are open, filled or expired, and who applied and was hired. */}
      {view === "jobs" && (
        <div className="admin-trends">
          <div className="mb-3">
            <h2 className="h5 fw-bold text-white mb-0">Job hiring</h2>
            <p className="text-secondary fs-7 mb-0">
              How many job posts are open, filled (everyone needed was hired, so freelancers no longer see it) or expired, and how many freelancers applied and were hired.
              {" "}Click a number to see those posts in <Link to="/admin/listings" className="text-white">Listings</Link>; View a post there to see who was hired from it.
            </p>
          </div>

          {hiringError && <div className="admin-card rounded-4 p-4 text-center text-white-50">{hiringError}</div>}
          {!hiringError && !hiringTotals && <div className="admin-card rounded-4 p-4 text-center text-white-50">Loading the job hiring numbers...</div>}

          {hiringTotals && (
            <div className="row g-3">
              <div className="col-12 col-md-6">
                <StatusCounts
                  title="Job posts"
                  items={[
                    { label: "Open", value: hiringTotals.open, to: "/admin/listings?state=open" },
                    { label: "Filled", value: hiringTotals.filled, to: "/admin/listings?state=filled" },
                    { label: "Expired", value: hiringTotals.expired, to: "/admin/listings?state=expired" }
                  ]}
                />
              </div>
              <div className="col-12 col-md-6">
                <StatusCounts
                  title="Applications and hires"
                  showTotal={false}
                  items={[
                    { label: "Applications", value: hiringTotals.applications },
                    { label: "Freelancers hired", value: hiringTotals.hired }
                  ]}
                />
              </div>
            </div>
          )}

          {/* Who was hired: its own request, so it shows even if the numbers above fail (and the other way round). */}
          <div className="mt-3">
            <HiredList />
          </div>

        </div>
      )}

      {/* Earnings: what PhilFreela earns from fees for Featured posts, Premium,
          sponsored billboards and members' ads. */}
      {view === "earnings" && (
        <div className="admin-trends">
          <div className="mb-3">
            <h2 className="h5 fw-bold text-white mb-0">Earnings</h2>
            <p className="text-secondary fs-7 mb-0">
              Fees paid to PhilFreela's own GCash (never the money between clients and freelancers).
              {" "}Answer waiting payments in <Link to="/admin/promotions" className="text-white">Promotions</Link>.
            </p>
          </div>

          {earningsError && <div className="admin-card rounded-4 p-4 text-center text-white-50">{earningsError}</div>}
          {!earningsError && !earnings && <div className="admin-card rounded-4 p-4 text-center text-white-50">Loading the earnings...</div>}

          {earnings && (
            <div className="row g-3">
              <div className="col-12 col-md-6">
                <StatusCounts
                  title="Earned"
                  showTotal={false}
                  items={[
                    { label: "In total", value: formatPeso(earnings.total) },
                    { label: "This month", value: formatPeso(earnings.this_month) },
                    { label: `Waiting for approval (${earnings.waiting.count})`, value: formatPeso(earnings.waiting.amount) }
                  ]}
                />
              </div>
              <div className="col-12 col-md-6">
                <StatusCounts
                  title="Running now"
                  showTotal={false}
                  items={[
                    { label: "Featured offers", value: earnings.running.featured_offers },
                    { label: "Featured job posts", value: earnings.running.featured_jobs },
                    { label: "Pro members", value: earnings.running.pro_members }
                  ]}
                />
              </div>
              <div className="col-12">
                <StatusCounts
                  title="Where it came from"
                  showTotal={false}
                  items={[
                    { label: `Featured offers (${earnings.by_kind.feature_service.count})`, value: formatPeso(earnings.by_kind.feature_service.amount) },
                    { label: `Featured job posts (${earnings.by_kind.feature_job.count})`, value: formatPeso(earnings.by_kind.feature_job.amount) },
                    { label: `Premium (${earnings.by_kind.pro.count})`, value: formatPeso(earnings.by_kind.pro.amount) },
                    { label: `Sponsored billboards (${earnings.by_kind.billboard.count})`, value: formatPeso(earnings.by_kind.billboard.amount) },
                    { label: `Community ads (${earnings.by_kind.member_ad?.count ?? 0})`, value: formatPeso(earnings.by_kind.member_ad?.amount ?? 0) }
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
