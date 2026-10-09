import { useEffect, useMemo, useState } from "react";
import { Link, useOutletContext } from "react-router-dom";
import { supabase } from "../../../lib/supabaseClient";
import { getCategory } from "../../../lib/categories";
import { removeListing } from "../../../lib/adminListings";
import { getRecommendations } from "../../../lib/aiService";
import { REASONS } from "../../../lib/recommendationReasons";
import { useVerifiedIds } from "../../../lib/useVerifiedIds";
import { useRatingSummaries } from "../../../lib/ratings";
import Avatar from "../../../components/Avatar";
import VerifiedBadge from "../../../components/VerifiedBadge";
import { StarBadge } from "../../../components/StarRating";
import ReportDialog from "../components/ReportDialog";

// withRecommendations (the freelancer dashboard): the jobs the Hybrid
// recommendation system picked ("Recommended for you", see lib/aiService.js)
// are merged into this one list, first and in the AI's order, each marked with
// why it was picked; everything else follows, newest first. If the AI service
// can't be reached the list is simply the plain newest-first one.
export default function FindJobsView({ withRecommendations = false }) {
  // isAdmin is only set when this page is shown inside the admin panel
  // (Browse Jobs): admins get a Remove button instead of the chat button.
  const { openChat, isAdmin, currentUserId, showToast } = useOutletContext();
  const [query, setQuery] = useState("");
  const [jobs, setJobs] = useState(null);
  const [error, setError] = useState("");
  // The job post being reported (null = Report popup closed).
  const [reportTarget, setReportTarget] = useState(null);
  // The AI's picks: [{ id, reasons }], best first. personalized is false when
  // it only had "new and trusted" posts to offer (nothing to match yet).
  const [recs, setRecs] = useState({ loading: withRecommendations, personalized: false, picks: [] });

  useEffect(() => {
    if (!withRecommendations) return undefined;
    let active = true;
    getRecommendations()
      .then(({ personalized, results = [] }) => {
        if (active) setRecs({ loading: false, personalized, picks: results });
      })
      .catch(() => {
        if (active) setRecs({ loading: false, personalized: false, picks: [] });
      });
    return () => {
      active = false;
    };
  }, [withRecommendations]);

  useEffect(() => {
    let active = true;

    supabase
      .from("job_posts")
      .select("id, title, category, budget, created_at, client:profiles!job_posts_client_id_fkey(id, full_name, username, avatar_path)")
      .order("created_at", { ascending: false })
      .then(({ data, error: fetchError }) => {
        if (!active) return;
        if (fetchError) setError("Failed to load job listings.");
        else setJobs(data);
      });

    return () => {
      active = false;
    };
  }, []);

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

  // job id -> where the AI ranked it (0 = best) and why.
  const picked = useMemo(() => new Map(recs.picks.map((pick, position) => [pick.id, { position, reasons: pick.reasons || [] }])), [recs.picks]);

  const filtered = useMemo(() => {
    if (!jobs) return [];
    const q = query.toLowerCase();
    const matching = jobs.filter((job) => {
      const clientName = job.client?.full_name || job.client?.username || "";
      const categoryLabel = getCategory(job.category).label;
      return `${clientName} ${job.title} ${categoryLabel}`.toLowerCase().includes(q);
    });
    // The AI's picks first, in its order; the rest keep their newest-first
    // order (a sort keeps equal items where they were).
    const rank = (job) => picked.get(job.id)?.position ?? Infinity;
    return matching.sort((a, b) => (rank(a) === rank(b) ? 0 : rank(a) - rank(b)));
  }, [jobs, query, picked]);

  return (
    <section className="dashboard-view active-view">
      <div className="glass-card rounded-4 p-4 border border-secondary border-opacity-25 mb-4">
        <div className="mb-3">
          <h3 className="text-white fw-bold mb-1"><i className="bi bi-briefcase text-orange me-2"></i> Client Job Openings</h3>
          <p className="text-secondary fs-7 mb-0">
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
        <div className="position-relative search-nav-box mb-4">
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

        {error && <p className="text-danger fs-7 text-center py-4 mb-0">{error}</p>}
        {!error && jobs === null && <p className="text-secondary fs-7 text-center py-4 mb-0">Loading listings...</p>}
        {!error && jobs !== null && filtered.length === 0 && (
          <p className="text-secondary fs-7 text-center py-4 mb-0">
            {jobs.length === 0 ? "No client listings yet." : `No job openings match "${query}".`}
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
                    {isAdmin ? job.title : <Link to={`/dashboard/job-details/${job.id}`} className="stretched-link text-white text-decoration-none hover-role">{job.title}</Link>}
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
                    {job.budget && <span className="text-warning">₱{Number(job.budget).toLocaleString()}</span>}
                  </div>
                  {/* Picked by the AI: marked, with why (the same reasons as "Recommended for you").
                      text-wrap: on a narrow phone a long mark goes to a second line instead of being cut off. */}
                  {picked.has(job.id) && (
                    <div className="d-flex flex-wrap gap-1 mt-2">
                      <span className="badge rounded-pill bg-role text-white text-wrap text-start fw-semibold">
                        <i className="bi bi-stars me-1"></i>{recs.personalized ? "Recommended for you" : "New and trusted"}
                      </span>
                      {picked.get(job.id).reasons.map((code) => {
                        const reason = REASONS[code];
                        if (!reason) return null;
                        return (
                          <span key={code} className="badge rounded-pill bg-role-subtle text-role text-wrap text-start fw-semibold">
                            <i className={`bi ${reason.icon} me-1`}></i>{reason.text || reason.jobs}
                          </span>
                        );
                      })}
                    </div>
                  )}
                </div>

                {isAdmin ? (
                  <button className="btn btn-outline-danger rounded-3 px-3 py-2 fw-bold text-nowrap flex-shrink-0" onClick={() => handleRemove(job)}>
                    <i className="bi bi-trash me-1"></i> Remove
                  </button>
                ) : (
                  // Side by side on a laptop, one above the other on a phone.
                  <div className="position-relative z-2 d-flex flex-column flex-sm-row gap-2 flex-shrink-0">
                    <button
                      className="btn btn-dark border border-secondary text-orange hover-bg-orange rounded-3 px-3 py-2"
                      title={`Message ${clientName}`}
                      aria-label={`Message ${clientName}`}
                      onClick={() => openChat(job.client?.id)}
                    >
                      <i className="bi bi-chat-dots-fill fs-5"></i>
                    </button>
                    {job.client?.id !== currentUserId && (
                      <button
                        className="btn btn-dark border border-secondary text-secondary rounded-3 px-3 py-2"
                        title="Report this job post"
                        aria-label="Report this job post"
                        onClick={() => setReportTarget({ type: "job_post", id: job.id, name: job.title })}
                      >
                        <i className="bi bi-flag fs-5"></i>
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <ReportDialog target={reportTarget} onClose={() => setReportTarget(null)} onDone={showToast} />
    </section>
  );
}
