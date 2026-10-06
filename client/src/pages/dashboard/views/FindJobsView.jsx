import { useEffect, useMemo, useState } from "react";
import { Link, useOutletContext } from "react-router-dom";
import { supabase } from "../../../lib/supabaseClient";
import { getCategory } from "../../../lib/categories";
import { removeListing } from "../../../lib/adminListings";
import { useVerifiedIds } from "../../../lib/useVerifiedIds";
import { useRatingSummaries } from "../../../lib/ratings";
import Avatar from "../../../components/Avatar";
import VerifiedBadge from "../../../components/VerifiedBadge";
import { StarBadge } from "../../../components/StarRating";
import ReportDialog from "../components/ReportDialog";

export default function FindJobsView() {
  // isAdmin is only set when this page is shown inside the admin panel
  // (Browse Jobs): admins get a Remove button instead of the chat button.
  const { openChat, isAdmin, currentUserId, showToast } = useOutletContext();
  const [query, setQuery] = useState("");
  const [jobs, setJobs] = useState(null);
  const [error, setError] = useState("");
  // The job post being reported (null = Report popup closed).
  const [reportTarget, setReportTarget] = useState(null);

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

  const filtered = useMemo(() => {
    if (!jobs) return [];
    const q = query.toLowerCase();
    return jobs.filter((job) => {
      const clientName = job.client?.full_name || job.client?.username || "";
      const categoryLabel = getCategory(job.category).label;
      return `${clientName} ${job.title} ${categoryLabel}`.toLowerCase().includes(q);
    });
  }, [jobs, query]);

  return (
    <section className="dashboard-view active-view">
      <div className="glass-card rounded-4 p-4 border border-secondary border-opacity-25 mb-4">
        <div className="mb-3">
          <h3 className="text-white fw-bold mb-1"><i className="bi bi-briefcase text-orange me-2"></i> Client Job Openings</h3>
          <p className="text-secondary fs-7 mb-0">Browse recent project listings from clients and connect directly.</p>
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
