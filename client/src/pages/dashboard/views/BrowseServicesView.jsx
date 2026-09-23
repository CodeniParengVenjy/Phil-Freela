import { useEffect, useMemo, useState } from "react";
import { useOutletContext } from "react-router-dom";
import { supabase } from "../../../lib/supabaseClient";
import { categories, getCategory } from "../../../lib/categories";
import { removeListing } from "../../../lib/adminListings";
import ReportDialog from "../components/ReportDialog";

const mediaStyle = { height: 140, width: "100%", objectFit: "cover" };

export default function BrowseServicesView() {
  // isAdmin is only set when this page is shown inside the admin panel
  // (Browse Services): admins get a Remove button instead of Message.
  const { openChat, isAdmin, currentUserId, showToast } = useOutletContext();
  const [category, setCategory] = useState("");
  const [query, setQuery] = useState("");
  const [services, setServices] = useState(null);
  const [error, setError] = useState("");
  // The service being reported (null = Report popup closed).
  const [reportTarget, setReportTarget] = useState(null);

  useEffect(() => {
    let active = true;

    supabase
      .from("services")
      .select("id, title, category, price, image_url, media_type, created_at, freelancer:profiles!services_freelancer_id_fkey(id, full_name, username)")
      .order("created_at", { ascending: false })
      .then(({ data, error: fetchError }) => {
        if (!active) return;
        if (fetchError) setError("Failed to load services.");
        else setServices(data);
      });

    return () => {
      active = false;
    };
  }, []);

  const handleRemove = async (service) => {
    if (!window.confirm(`Remove "${service.title}"? This cannot be undone.`)) return;
    if (await removeListing("services", service)) {
      setServices((prev) => prev.filter((s) => s.id !== service.id));
    } else {
      window.alert("Couldn't remove that service. Please try again.");
    }
  };

  const filtered = useMemo(() => {
    if (!services) return [];
    const q = query.toLowerCase();
    return services.filter((s) => {
      if (category && s.category !== category) return false;
      if (!q) return true;
      const freelancerName = s.freelancer?.full_name || s.freelancer?.username || "";
      return `${s.title} ${freelancerName}`.toLowerCase().includes(q);
    });
  }, [services, category, query]);

  return (
    <section className="dashboard-view active-view">
      <div className="glass-card rounded-4 p-4 border border-secondary border-opacity-25">
        <div className="d-flex flex-column flex-md-row justify-content-between align-items-md-center gap-3 mb-4">
          <div>
            <h3 className="text-white fw-bold mb-1"><i className="bi bi-grid-fill text-role me-2"></i> Browse Freelancer Services</h3>
            <p className="text-secondary fs-7 mb-0">Find a freelancer for your next project and message them directly.</p>
          </div>
        </div>

        <div className="d-flex flex-column flex-md-row gap-3 mb-4">
          <select
            className="form-select bg-secondary bg-opacity-25 border-secondary text-white py-2"
            style={{ maxWidth: 280 }}
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          >
            <option value="">All Categories</option>
            {categories.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
          </select>

          <div className="position-relative search-nav-box flex-grow-1">
            <i className="bi bi-search search-icon text-secondary"></i>
            <input
              type="search"
              className="form-control nav-search-input"
              placeholder="Search services or freelancers..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
        </div>

        {error && <p className="text-danger fs-7 text-center py-4 mb-0">{error}</p>}
        {!error && services === null && <p className="text-secondary fs-7 text-center py-4 mb-0">Loading services...</p>}
        {!error && services !== null && filtered.length === 0 && (
          <p className="text-secondary fs-7 text-center py-4 mb-0">No services found yet.</p>
        )}

        <div className="row g-4">
          {filtered.map((s) => {
            const meta = getCategory(s.category);
            const freelancerName = s.freelancer?.full_name || s.freelancer?.username || "Freelancer";
            return (
              <div className="col-md-6 col-lg-4" key={s.id}>
                <div className="glass-card rounded-4 h-100 border border-secondary border-opacity-25 overflow-hidden hover-lift d-flex flex-column">
                  {s.image_url ? (
                    s.media_type === "video"
                      ? <video src={s.image_url} controls preload="metadata" style={mediaStyle} />
                      : <img src={s.image_url} alt={s.title} style={mediaStyle} />
                  ) : (
                    <div className="d-flex align-items-center justify-content-center bg-role-subtle" style={{ height: 140 }}>
                      <i className={`bi ${meta.icon} text-role`} style={{ fontSize: "2.75rem" }}></i>
                    </div>
                  )}
                  <div className="p-3 d-flex flex-column flex-grow-1">
                    <span className="badge bg-black text-light-50 align-self-start mb-2 fs-8">{meta.label}</span>
                    <h6 className="text-white fw-bold mb-1">{s.title}</h6>
                    <p className="fs-8 text-secondary mb-3 flex-grow-1">by {freelancerName}</p>
                    <div className="d-flex align-items-center justify-content-between gap-2">
                      <span className="fw-bold text-role fs-7">
                        {s.price ? `From ₱${Number(s.price).toLocaleString()}` : "Price on request"}
                      </span>
                      {isAdmin ? (
                        <button
                          type="button"
                          className="btn btn-sm btn-outline-danger rounded-pill px-3 fw-bold"
                          onClick={() => handleRemove(s)}
                        >
                          <i className="bi bi-trash me-1"></i> Remove
                        </button>
                      ) : (
                        <div className="d-flex gap-1">
                          {s.freelancer?.id !== currentUserId && (
                            <button
                              type="button"
                              className="btn btn-sm btn-dark text-secondary rounded-pill px-2"
                              title="Report this service"
                              aria-label="Report this service"
                              onClick={() => setReportTarget({ type: "service", id: s.id, name: s.title })}
                            >
                              <i className="bi bi-flag"></i>
                            </button>
                          )}
                          <button
                            type="button"
                            className="btn btn-sm btn-gradient-role rounded-pill px-3 fw-bold text-white"
                            onClick={() => openChat(s.freelancer?.id)}
                          >
                            <i className="bi bi-chat-dots-fill me-1"></i> Message
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <ReportDialog target={reportTarget} currentUserId={currentUserId} onClose={() => setReportTarget(null)} onDone={showToast} />
    </section>
  );
}
