import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "../../../lib/supabaseClient";
import { removeListing } from "../../../lib/adminListings";
import { categories, getCategory } from "../../../lib/categories";
import { blockedBadges, suspensionStatus } from "../../../lib/suspensions";
import { SLIDES_SELECT, itemSlides } from "../../../lib/slides";
import { JOB_STATES, budgetText, datesText, getJobType } from "../../../lib/jobTerms";
import MediaCarousel from "../../dashboard/components/MediaCarousel";
import HiringTrail from "../components/HiringTrail";

// The two kinds of listings share one page. Each tab says which table it
// reads, which column holds the owner, and how its price is labeled.
const tabs = {
  services: {
    label: "Services",
    table: "services",
    ownerColumn: "freelancer_id",
    priceColumn: "price",
    priceLabel: "Price",
    select: `id, title, category, description, price, skill, image_url, media_type, created_at, freelancer_id, owner:profiles!services_freelancer_id_fkey(full_name, username), ${SLIDES_SELECT}`
  },
  jobs: {
    label: "Job Posts",
    table: "job_posts",
    ownerColumn: "client_id",
    priceColumn: "budget",
    priceLabel: "Budget",
    select: "id, title, category, description, budget, budget_type, job_type, freelancers_needed, start_date, due_date, created_at, client_id, owner:profiles!job_posts_client_id_fkey(full_name, username)"
  }
};

// The state filter on the Job Posts tab (the states come from lib/jobTerms.js).
const STATE_FILTERS = [{ value: "all", label: "All" }, ...Object.entries(JOB_STATES).map(([value, state]) => ({ value, label: state.label }))];

const formatPeso = (value) => (value ? `₱${Number(value).toLocaleString()}` : "—");

export default function AdminListingsView() {
  // The Overview links here: ?state=filled opens the Job Posts tab already
  // filtered, and ?post=<id> opens that job post's pop-up (with its hiring trail).
  const [params] = useSearchParams();
  const wantedPost = useRef(params.get("post"));
  const startState = STATE_FILTERS.some((option) => option.value === params.get("state")) ? params.get("state") : "all";
  const [activeTab, setActiveTab] = useState(params.get("post") || startState !== "all" ? "jobs" : "services");
  // Both lists load once; switching tabs just shows the other one.
  const [listings, setListings] = useState({ services: null, jobs: null });
  // owner id -> "banned" or "suspended", only for bans/suspensions still in effect.
  const [blockedStatus, setBlockedStatus] = useState({});
  const [loadError, setLoadError] = useState("");
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  // Job Posts tab: all / open / filled / expired.
  const [stateFilter, setStateFilter] = useState(startState);
  // How hiring stands per job post: null while loading, "failed" if it could not
  // be loaded (the list still works without it), or { post id: { state, applicants, hired } }.
  const [hiring, setHiring] = useState(null);
  const [message, setMessage] = useState({ text: "", type: "" });
  // The listing open in the "View" pop-up (null = closed).
  const [viewing, setViewing] = useState(null);

  useEffect(() => {
    let active = true;

    (async () => {
      const [servicesResult, jobsResult, suspensionsResult, archivedResult, hiringResult] = await Promise.all([
        supabase.from("services").select(tabs.services.select).order("created_at", { ascending: false }),
        supabase.from("job_posts").select(tabs.jobs.select).order("created_at", { ascending: false }),
        supabase.from("user_suspensions").select("user_id, ends_at"),
        supabase.from("archived_users").select("user_id"),
        // admin_job_hiring() checks on the server that the caller is an admin.
        supabase.rpc("admin_job_hiring")
      ]);

      if (!active) return;

      // Hiring is extra information: if it fails, say so and keep the list.
      if (hiringResult.error) {
        console.error("Loading the hiring numbers failed:", hiringResult.error);
        setHiring("failed");
      } else {
        setHiring(Object.fromEntries(hiringResult.data.posts.map((post) => [post.id, post])));
      }

      if (servicesResult.error || jobsResult.error || suspensionsResult.error || archivedResult.error) {
        setLoadError("Failed to load listings.");
        return;
      }

      setListings({ services: servicesResult.data, jobs: jobsResult.data });
      // Sent here from a hire on the Overview: open that post (nothing if it was removed).
      const wanted = jobsResult.data.find((job) => job.id === wantedPost.current);
      if (wanted) setViewing(wanted);
      // An archived account's badge wins over a penalty it may also have.
      setBlockedStatus({
        ...Object.fromEntries(suspensionsResult.data.map((s) => [s.user_id, suspensionStatus(s)]).filter(([, status]) => status)),
        ...Object.fromEntries(archivedResult.data.map((a) => [a.user_id, "archived"]))
      });
    })();

    return () => { active = false; };
  }, []);

  const tab = tabs[activeTab];
  const currentList = listings[activeTab];
  const isJobs = activeTab === "jobs";

  // The hiring numbers of one job post (undefined until they are loaded).
  const hiringOf = (item) => (hiring && hiring !== "failed" ? hiring[item.id] : undefined);

  // Apply the search box (title or owner), the category filter and, on the Job
  // Posts tab, the state filter.
  const searchText = search.trim().toLowerCase();
  const visibleListings = (currentList || []).filter((item) => {
    const matchesSearch = !searchText
      || item.title.toLowerCase().includes(searchText)
      || (item.owner?.full_name || "").toLowerCase().includes(searchText)
      || (item.owner?.username || "").toLowerCase().includes(searchText);
    const matchesCategory = categoryFilter === "all" || item.category === categoryFilter;
    // Without the hiring numbers there is no state to filter by (the pills are hidden too).
    const matchesState = !isJobs || stateFilter === "all" || !hiring || hiring === "failed" || hiringOf(item)?.state === stateFilter;
    return matchesSearch && matchesCategory && matchesState;
  });

  // How many job posts are in each state, for the numbers on the state filter.
  const stateCounts = { all: (listings.jobs || []).length, open: 0, filled: 0, expired: 0 };
  (listings.jobs || []).forEach((item) => {
    const state = hiringOf(item)?.state;
    if (state) stateCounts[state] += 1;
  });

  const switchTab = (key) => {
    setActiveTab(key);
    setStateFilter("all");
    setMessage({ text: "", type: "" });
  };

  const handleRemove = async (item) => {
    if (!window.confirm(`Remove "${item.title}"? The owner will no longer see it, and this cannot be undone.`)) return;

    // Shared with the admin Browse pages (lib/adminListings.js): deletes the
    // listing and, for services, its photo/video.
    const removed = await removeListing(tab.table, item);
    if (!removed) {
      setMessage({ text: "Couldn't remove that listing. Please try again.", type: "error" });
      return;
    }

    setListings((prev) => ({ ...prev, [activeTab]: prev[activeTab].filter((l) => l.id !== item.id) }));
    setViewing(null);
    setMessage({ text: `"${item.title}" was removed.`, type: "success" });
  };

  // The Job Posts tab has two more columns (state and hiring) than Services.
  const columnCount = isJobs ? 8 : 6;

  // Open / Filled / Expired badge ("—" until the hiring numbers are loaded).
  const stateBadge = (numbers) => {
    const state = numbers && JOB_STATES[numbers.state];
    return state ? <span className={`badge ${state.className}`}>{state.label}</span> : "—";
  };

  const ownerCell = (item) => {
    const status = blockedStatus[item[tab.ownerColumn]];
    return (
      <>
        <div>{item.owner?.full_name || "Unknown"}</div>
        <div className="text-white-50 fs-8">
          @{item.owner?.username || "?"}
          {status && <span className={`badge ${blockedBadges[status].className} fw-normal ms-2`}>{blockedBadges[status].label}</span>}
        </div>
      </>
    );
  };

  return (
    <section>
      <h1 className="h4 fw-bold mb-3">Listings</h1>

      {/* Tabs: Services / Job Posts, with how many each has */}
      <div className="d-flex gap-2 mb-3">
        {Object.entries(tabs).map(([key, t]) => (
          <button
            key={key}
            className={`btn btn-sm rounded-pill px-3 fw-bold ${activeTab === key ? "btn-admin-orange" : "btn-outline-light"}`}
            onClick={() => switchTab(key)}
          >
            {t.label} <span className="ms-1 opacity-75">({listings[key] ? listings[key].length : "…"})</span>
          </button>
        ))}
      </div>

      <div className="admin-card rounded-4 p-3 mb-3">
        {/* Job Posts: how many are open, filled (everyone needed was hired) or expired. */}
        {isJobs && hiring && hiring !== "failed" && (
          <div className="d-flex flex-wrap gap-2 mb-3" role="group" aria-label="Filter by state">
            {STATE_FILTERS.map((option) => (
              <button
                key={option.value}
                type="button"
                className={`btn btn-sm rounded-pill px-3 ${stateFilter === option.value ? "btn-admin-orange fw-bold" : "btn-outline-light"}`}
                aria-pressed={stateFilter === option.value}
                onClick={() => setStateFilter(option.value)}
              >
                {option.label} <span className="ms-1 opacity-75">({stateCounts[option.value]})</span>
              </button>
            ))}
          </div>
        )}
        <div className="row g-2">
          <div className="col-12 col-lg-8">
            <input
              type="search"
              className="form-control admin-input"
              placeholder="Search by title or owner..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="col-12 col-lg-4">
            <select className="form-select admin-input" value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)} aria-label="Filter by category">
              <option value="all">All categories</option>
              {categories.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
            </select>
          </div>
        </div>
      </div>

      {message.text && (
        <p className={`admin-message ${message.type} fs-7 fw-semibold`} aria-live="polite">{message.text}</p>
      )}
      {isJobs && hiring === "failed" && (
        <p className="admin-message error fs-7 fw-semibold" aria-live="polite">Couldn't load the hiring numbers, so the state and hiring columns are empty. The rest of the list works.</p>
      )}

      <div className="admin-card rounded-4 p-3 p-md-4">
        <div className="table-responsive">
          <table className="table table-dark table-hover align-middle mb-0">
            <thead>
              <tr>
                <th>Title</th>
                <th>Category</th>
                <th>Owner</th>
                <th>{tab.priceLabel}</th>
                {isJobs && <th>State</th>}
                {isJobs && <th>Hiring</th>}
                <th>Posted</th>
                <th className="text-end">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loadError && (
                <tr><td colSpan={columnCount} className="text-center text-white-50 py-4">{loadError}</td></tr>
              )}
              {!loadError && currentList === null && (
                <tr><td colSpan={columnCount} className="text-center text-white-50 py-4">Loading listings...</td></tr>
              )}
              {!loadError && currentList !== null && visibleListings.length === 0 && (
                <tr><td colSpan={columnCount} className="text-center text-white-50 py-4">No {tab.label.toLowerCase()} found.</td></tr>
              )}
              {!loadError && visibleListings.map((item) => (
                <tr key={item.id}>
                  <td className="admin-title-cell">{item.title}</td>
                  <td className="fs-7">{getCategory(item.category).label}</td>
                  <td>{ownerCell(item)}</td>
                  <td>{isJobs ? (budgetText(item) || "—") : formatPeso(item[tab.priceColumn])}</td>
                  {isJobs && <td>{stateBadge(hiringOf(item))}</td>}
                  {isJobs && (
                    <td className="fs-7 text-nowrap">
                      {hiringOf(item) ? (
                        <>
                          <div>{hiringOf(item).applicants} {hiringOf(item).applicants === 1 ? "applicant" : "applicants"}</div>
                          <div className="text-white-50 fs-8">{hiringOf(item).hired} of {item.freelancers_needed} hired</div>
                        </>
                      ) : "—"}
                    </td>
                  )}
                  <td>{new Date(item.created_at).toLocaleDateString()}</td>
                  <td className="text-end text-nowrap">
                    <button className="btn btn-outline-light btn-sm me-2" onClick={() => setViewing(item)}>
                      <i className="bi bi-eye"></i> View
                    </button>
                    <button className="btn btn-outline-danger btn-sm" onClick={() => handleRemove(item)}>
                      <i className="bi bi-trash"></i> Remove
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* View pop-up: the full listing, including description and photo/video */}
      {viewing && (
        <div className="admin-modal-backdrop" onClick={() => setViewing(null)}>
          <div className="admin-card admin-modal admin-modal-wide rounded-4 p-4" onClick={(e) => e.stopPropagation()}>
            <div className="d-flex justify-content-between align-items-start gap-3 mb-2">
              <h2 className="h5 fw-bold text-white mb-0">{viewing.title}</h2>
              <button className="btn btn-sm btn-outline-light rounded-circle" onClick={() => setViewing(null)} aria-label="Close">
                <i className="bi bi-x-lg"></i>
              </button>
            </div>

            <p className="text-secondary fs-7 mb-3">
              {isJobs
                ? `${getJobType(viewing.job_type).label} • ${getCategory(viewing.category).label} • ${budgetText(viewing) || "No budget given"} • Posted ${new Date(viewing.created_at).toLocaleDateString()}`
                : `${getCategory(viewing.category).label} • ${tab.priceLabel}: ${formatPeso(viewing[tab.priceColumn])} • Posted ${new Date(viewing.created_at).toLocaleDateString()}`}
              {isJobs && datesText(viewing) && <><br />{datesText(viewing)}</>}
            </p>

            {/* A service's photos and videos (job posts have none). */}
            {itemSlides(viewing).length > 0 && (
              <div className="rounded-3 overflow-hidden mb-3">
                <MediaCarousel slides={itemSlides(viewing)} height={320} fit="contain" alt={viewing.title} />
              </div>
            )}

            <div className="mb-3">{ownerCell(viewing)}</div>
            {viewing.skill && <p className="fs-7 mb-2"><span className="text-white-50">Skill:</span> {viewing.skill}</p>}
            <p className="fs-7 text-white mb-4 admin-description">{viewing.description}</p>

            {/* A job post: where its hiring stands and who was hired from it. */}
            {isJobs && (
              <>
                <p className="fs-7 mb-3 d-flex flex-wrap align-items-center gap-2">
                  {stateBadge(hiringOf(viewing))}
                  {hiringOf(viewing)
                    ? <span className="text-white-50">{hiringOf(viewing).hired} of {viewing.freelancers_needed} hired • {hiringOf(viewing).applicants} {hiringOf(viewing).applicants === 1 ? "applicant" : "applicants"}</span>
                    : <span className="text-white-50">Needs {viewing.freelancers_needed} {viewing.freelancers_needed === 1 ? "freelancer" : "freelancers"}</span>}
                </p>
                <HiringTrail key={viewing.id} jobId={viewing.id} />
              </>
            )}

            <div className="d-flex justify-content-end">
              <button className="btn btn-outline-danger btn-sm rounded-pill px-3" onClick={() => handleRemove(viewing)}>
                <i className="bi bi-trash me-1"></i> Remove Listing
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
