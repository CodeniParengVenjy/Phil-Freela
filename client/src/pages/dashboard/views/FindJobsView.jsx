import { useEffect, useMemo, useState } from "react";
import { useOutletContext } from "react-router-dom";
import { supabase } from "../../../lib/supabaseClient";
import { getCategory } from "../../../lib/categories";
import { removeListing } from "../../../lib/adminListings";
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
      .select("id, title, category, budget, created_at, client:profiles!job_posts_client_id_fkey(id, full_name, username)")
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
        <div className="d-flex flex-column flex-md-row justify-content-between align-items-md-center gap-3 mb-4">
          <div>
            <h3 className="text-white fw-bold mb-1"><i className="bi bi-briefcase text-orange me-2"></i> Client Job Openings</h3>
            <p className="text-secondary fs-7 mb-0">Browse recent project listings from clients and connect directly.</p>
          </div>

          <div className="position-relative search-nav-box" style={{ minWidth: 280 }}>
            <i className="bi bi-search search-icon text-secondary"></i>
            <input
              type="search"
              className="form-control nav-search-input"
              placeholder="Search..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
        </div>

        {error && <p className="text-danger fs-7 text-center py-4 mb-0">{error}</p>}
        {!error && jobs === null && <p className="text-secondary fs-7 text-center py-4 mb-0">Loading listings...</p>}
        {!error && jobs !== null && filtered.length === 0 && (
          <p className="text-secondary fs-7 text-center py-4 mb-0">No client listings yet.</p>
        )}

        <div className="d-flex flex-column gap-3">
          {filtered.map((job) => {
            const clientName = job.client?.full_name || job.client?.username || "Client";
            const categoryLabel = getCategory(job.category).label;
            return (
              <div key={job.id} className="job-item-card p-3 p-md-4 rounded-3 bg-dark bg-opacity-50 border border-secondary border-opacity-25 d-flex align-items-center justify-content-between gap-3 hover-lift">
                <div className="d-flex align-items-center gap-3">
                  <div className="avatar-circle bg-secondary text-white fw-bold flex-shrink-0 d-flex align-items-center justify-content-center" style={{ width: 52, height: 52 }}>
                    <i className="bi bi-building fs-3"></i>
                  </div>
                  <div>
                    <h5 className="text-white fw-bold mb-1">{job.title}</h5>
                    <div className="d-flex align-items-center gap-2 fs-7 mb-2">
                      <span className="text-white-50">{clientName}</span>
                      {job.budget && <span className="text-warning">₱{Number(job.budget).toLocaleString()}</span>}
                      <span className="badge bg-black text-light px-3 py-1 rounded-pill">{categoryLabel}</span>
                    </div>
                  </div>
                </div>
                {isAdmin ? (
                  <button className="btn btn-outline-danger rounded-3 px-3 py-2 fw-bold text-nowrap" onClick={() => handleRemove(job)}>
                    <i className="bi bi-trash me-1"></i> Remove
                  </button>
                ) : (
                  <div className="d-flex gap-2 flex-shrink-0">
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
                    <button className="btn btn-dark border border-secondary text-orange hover-bg-orange rounded-3 px-3 py-2" onClick={() => openChat(job.client?.id)}>
                      <i className="bi bi-chat-dots-fill fs-5"></i>
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <ReportDialog target={reportTarget} currentUserId={currentUserId} onClose={() => setReportTarget(null)} onDone={showToast} />
    </section>
  );
}
