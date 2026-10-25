import { useEffect, useMemo, useState } from "react";
import { Link, useOutletContext } from "react-router-dom";
import { supabase } from "../../../lib/supabaseClient";
import { getCategory } from "../../../lib/categories";
import { budgetText, datesText, getJobType } from "../../../lib/jobTerms";
import { removeListing } from "../../../lib/adminListings";
import { byPick, useRecommendations } from "../../../lib/useRecommendations";
import { useVerifiedIds } from "../../../lib/useVerifiedIds";
import { useRatingSummaries } from "../../../lib/ratings";
import Avatar from "../../../components/Avatar";
import VerifiedBadge from "../../../components/VerifiedBadge";
import { StarBadge } from "../../../components/StarRating";
import RecommendationMarks from "../components/RecommendationMarks";
import CensoredText from "../../../components/CensoredText";

// The pills above the list: all posts, or only one-time projects, or only ongoing jobs.
const TYPE_FILTERS = [
  { value: "all", label: "All" },
  { value: "project", label: "Projects" },
  { value: "job", label: "Jobs" }
];

// withRecommendations (the freelancer dashboard): the jobs the Hybrid
// recommendation system picked ("Recommended for you", see lib/aiService.js)
// are merged into this one list, first and in the AI's order, each marked with
// why it was picked; everything else follows, newest first. If the AI service
// can't be reached the list is simply the plain newest-first one.
//
// The database only shows the posts that are still open: one that is filled
// (all the freelancers it needed were hired) or past its due date is hidden
// from freelancers (see database/supabase_job_post_details_schema.sql).
export default function FindJobsView({ withRecommendations = false }) {
  // isAdmin is only set when this page is shown inside the admin panel
  // (Browse Jobs): admins get a Remove button on each row.
  const { isAdmin } = useOutletContext();
  const [query, setQuery] = useState("");
  // Which kind of work the pills show: "all", "project" or "job".
  const [typeFilter, setTypeFilter] = useState("all");
  const [jobs, setJobs] = useState(null);
  const [error, setError] = useState("");
  // The AI's picks (lib/useRecommendations.js): job id -> { position, reasons }.
  const recs = useRecommendations(withRecommendations);
  const picked = recs.picked;

  useEffect(() => {
    let active = true;

    let request = supabase
      .from("job_posts")
      .select("id, title, category, budget, budget_type, job_type, start_date, due_date, created_at, client:profiles!job_posts_client_id_fkey(id, full_name, username, avatar_path)");
    // A freelancer who applied still SEES a post that filled or expired (so My
    // Applications keeps working), but it is no longer an opening: ask the
    // database for the open ones only. Admins see everything.
    if (!isAdmin) request = request.eq("job_state", "open");

    request
      .order("created_at", { ascending: false })
      .then(({ data, error: fetchError }) => {
        if (!active) return;
        if (fetchError) setError("Failed to load job listings.");
        else setJobs(data);
      });

    return () => {
      active = false;
    };
  }, [isAdmin]);

  const handleRemove = async (job) => {
    if (!window.confirm(`Remove "${job.title}"? This cannot be undone.`)) return;
    if (await removeListing("job_posts", job)) {
      setJobs((prev) => prev.filter((j) => j.id !== job.id));
    } else {
      window.alert("Couldn't remove that job post. Please try again.");
    }
  };

  // Clients can post without verifying, so freelancers see who is verified.
  const verifiedIds = useVerifiedIds((jobs || []).map((job) => job.client?.id));
  // Every client's average rating, loaded in one request for the whole list
  // (Feature 5, Profile transparency).
  const ratings = useRatingSummaries((jobs || []).map((job) => job.client?.id));

  const filtered = useMemo(() => {
    if (!jobs) return [];
    const q = query.toLowerCase();
    const matching = jobs.filter((job) => {
      if (typeFilter !== "all" && job.job_type !== typeFilter) return false;
      const clientName = job.client?.full_name || job.client?.username || "";
      const categoryLabel = getCategory(job.category).label;
      return `${clientName} ${job.title} ${categoryLabel}`.toLowerCase().includes(q);
    });
    // The AI's picks first, in its order; the rest stay newest first.
    return matching.sort(byPick(picked));
  }, [jobs, query, typeFilter, picked]);

  return (
    <section className="dashboard-view active-view">
      <div className="glass-card rounded-4 p-3 p-md-4 border border-secondary border-opacity-25 mb-4">
        <div className="mb-3">
          <h3 className="view-title text-white fw-bold mb-1"><i className="bi bi-briefcase text-orange me-2"></i> Client Job Openings</h3>
          {/* The line under the title is left out on a phone, so the list starts higher. */}
          <p className="text-secondary fs-7 mb-0 d-none d-md-block">
            {withRecommendations && picked.size > 0
              ? (recs.personalized
                ? "Jobs picked for you by PhilFreela's AI come first, then the newest listings from clients."
                : "New and trusted jobs come first, then the newest listings. Write a profile description in Settings to get jobs that match your work.")
              : "Browse recent project listings from clients and connect directly."}
          </p>
          {recs.loading && (
            <p className="text-secondary fs-8 mb-0 mt-1">
              <span className="spinner-border spinner-border-sm me-2" aria-hidden="true"></span>Finding recommendations...
            </p>
          )}
        </div>

        {/* Filters the list below as you type (job title, client or category). */}
        <div className="position-relative search-nav-box mb-3 mb-md-4">
          <i className="bi bi-search search-icon text-secondary"></i>
          <input
            type="search"
            className="form-control nav-search-input py-2"
            placeholder="Search..."
            aria-label="Search job openings"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>

        {/* Only one-time projects, or only ongoing jobs. */}
        <div className="d-flex flex-wrap gap-2 mb-3 mb-md-4" role="group" aria-label="Type of work">
          {TYPE_FILTERS.map((filter) => (
            <button
              key={filter.value}
              type="button"
              aria-pressed={typeFilter === filter.value}
              className={`btn btn-sm rounded-pill px-3 fw-bold ${typeFilter === filter.value ? "btn-gradient-role text-white" : "btn-outline-secondary text-white-50"}`}
              onClick={() => setTypeFilter(filter.value)}
            >
              {filter.label}
            </button>
          ))}
        </div>

        {error && <p className="text-danger fs-7 text-center py-4 mb-0">{error}</p>}
        {!error && jobs === null && <p className="text-secondary fs-7 text-center py-4 mb-0">Loading listings...</p>}
        {!error && jobs !== null && filtered.length === 0 && (
          <p className="text-secondary fs-7 text-center py-4 mb-0">
            {jobs.length === 0
              ? "No client listings yet."
              : query.trim()
                ? `No job openings match "${query}".`
                : `No ${typeFilter === "job" ? "ongoing jobs" : "one-time projects"} right now.`}
          </p>
        )}

        <div className="d-flex flex-column gap-3">
          {filtered.map((job) => {
            const clientName = job.client?.full_name || job.client?.username || "Client";
            const categoryLabel = getCategory(job.category).label;
            // The client's public page (admins stay in the admin panel).
            const clientPage = !isAdmin && job.client?.id ? `/dashboard/clients/${job.client.id}` : undefined;
            return (
              // position-relative: the title's link is stretched over the whole
              // row (Bootstrap's stretched-link), so clicking anywhere on a row
              // opens the job. The picture, the client's name and the buttons
              // sit above it (z-2) and keep their own clicks.
              <div key={job.id} className="job-item-card position-relative p-3 p-md-4 rounded-3 bg-dark bg-opacity-50 border border-secondary border-opacity-25 d-flex align-items-center gap-3 hover-lift">
                {/* The client's own picture; like their name, it opens their public page. */}
                <div className="position-relative z-2 d-flex flex-shrink-0">
                  <Avatar path={job.client?.avatar_path} name={clientName} size={64} to={clientPage} />
                </div>

                <div className="flex-grow-1 overflow-hidden">
                  {/* Opens the job's page, where freelancers apply (not in the admin panel). */}
                  <h5 className="text-white fw-bold mb-1 text-break">
                    {isAdmin ? <CensoredText text={job.title} /> : <Link to={`/dashboard/job-details/${job.id}`} className="stretched-link text-white text-decoration-none hover-role"><CensoredText text={job.title} /></Link>}
                  </h5>
                  <div className="position-relative z-2 d-inline-flex flex-wrap align-items-center gap-2 fs-7 mb-2">
                    <span className="text-white-50 text-break">
                      {clientPage
                        ? <Link to={clientPage} className="text-white-50 text-decoration-underline">{clientName}</Link>
                        : clientName}
                      <VerifiedBadge verified={verifiedIds.has(job.client?.id)} showUnverified />
                    </span>
                    {/* The client's average rating from finished projects (nothing until they have one). */}
                    <StarBadge summary={ratings.get(job.client?.id)} />
                  </div>
                  <div className="d-flex flex-wrap align-items-center gap-2 fs-7">
                    {/* text-wrap: a long category name goes to a second line on a phone. */}
                    <span className="badge bg-black text-light text-wrap text-start px-3 py-1 rounded-pill">{categoryLabel}</span>
                    <span className="badge bg-role-subtle text-role px-3 py-1 rounded-pill">{getJobType(job.job_type).short}</span>
                    {budgetText(job) && <span className="text-warning">{budgetText(job)}</span>}
                  </div>
                  {/* When the work starts and is due. */}
                  {datesText(job) && (
                    <p className="text-white-50 fs-8 mb-0 mt-2"><i className="bi bi-calendar-event me-1"></i>{datesText(job)}</p>
                  )}
                  {/* Picked by the AI: marked, with why. */}
                  {picked.has(job.id) && <RecommendationMarks pick={picked.get(job.id)} personalized={recs.personalized} want="jobs" />}
                </div>

                {isAdmin ? (
                  <button className="btn btn-outline-danger rounded-3 px-3 py-2 fw-bold text-nowrap flex-shrink-0" onClick={() => handleRemove(job)}>
                    <i className="bi bi-trash me-1"></i> Remove
                  </button>
                ) : (
                  // No buttons on a row: the whole row opens the job (the arrow
                  // says so), and the job's page has Apply, Message and Report.
                  <i className="bi bi-chevron-right text-secondary fs-5 flex-shrink-0" aria-hidden="true"></i>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
