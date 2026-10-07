import { useEffect, useMemo, useState } from "react";
import { Link, useOutletContext } from "react-router-dom";
import { supabase } from "../../../lib/supabaseClient";
import { categories, getCategory } from "../../../lib/categories";
import { removeListing } from "../../../lib/adminListings";
import { useVerifiedIds } from "../../../lib/useVerifiedIds";
import { SLIDES_SELECT, isOriginalWork, itemSlides } from "../../../lib/slides";
import OriginalBadge from "../../../components/OriginalBadge";
import VerifiedBadge from "../../../components/VerifiedBadge";
import ReportDialog from "../components/ReportDialog";
import BookDialog from "../components/BookDialog";
import MediaCarousel from "../components/MediaCarousel";

export default function BrowseServicesView() {
  // isAdmin is only set when this page is shown inside the admin panel
  // (Browse Services): admins get a Remove button instead of Message.
  const { openChat, isAdmin, currentUserId, accountType, showToast } = useOutletContext();
  const [category, setCategory] = useState("");
  const [query, setQuery] = useState("");
  const [services, setServices] = useState(null);
  const [error, setError] = useState("");
  // The service being reported (null = Report popup closed).
  const [reportTarget, setReportTarget] = useState(null);
  // The service being booked (null = Book popup closed). Only clients book.
  const [bookTarget, setBookTarget] = useState(null);

  useEffect(() => {
    let active = true;

    supabase
      .from("services")
      .select(`id, title, category, price, image_url, media_type, created_at, freelancer:profiles!services_freelancer_id_fkey(id, full_name, username), ${SLIDES_SELECT}`)
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

  // The database only lists services from verified freelancers (plus your
  // own), so this is mostly for the check mark next to each name.
  const verifiedIds = useVerifiedIds((services || []).map((s) => s.freelancer?.id));

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
            className="category-filter form-select bg-secondary bg-opacity-25 border-secondary text-white py-2"
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
            const slides = itemSlides(s);
            return (
              // Three cards per row on laptops and big screens (the same as
              // "Recommended for you" above it), two on tablets and small
              // windows, one on phones. The expand button on each picture
              // still shows it full screen.
              <div className="col-sm-6 col-lg-4" key={s.id}>
                <div className="glass-card rounded-4 h-100 border border-secondary border-opacity-25 overflow-hidden hover-lift d-flex flex-column">
                  {/* The picture grows with the card (16:10) and shows the
                      whole photo ("contain"): trimming the edges used to cut
                      off the watermark in the photo's corner. It moves to the
                      next slide by itself every 4 seconds. A tap on a photo
                      (or the expand button) shows it big, full screen. */}
                  {slides.length > 0 ? (
                    <MediaCarousel
                      slides={slides}
                      aspectRatio="16 / 10"
                      fit="contain"
                      autoPlayMs={4000}
                      expandable
                      alt={s.title}
                      ownerName={s.freelancer?.username}
                    />
                  ) : (
                    <div className="d-flex align-items-center justify-content-center bg-role-subtle" style={{ aspectRatio: "16 / 10" }}>
                      <i className={`bi ${meta.icon} text-role`} style={{ fontSize: "2.75rem" }}></i>
                    </div>
                  )}
                  <div className="p-3 d-flex flex-column flex-grow-1">
                    <div className="d-flex flex-wrap align-items-center gap-1 mb-2">
                      <span className="badge bg-black text-light-50 fs-8">{meta.label}</span>
                      {/* Every file passed the AI copy check and carries the hidden watermark (step 10). */}
                      {isOriginalWork(s) && <OriginalBadge className="fs-8" />}
                    </div>
                    <h6 className="text-white fw-bold mb-1">{s.title}</h6>
                    <p className="fs-8 text-secondary mb-3 flex-grow-1">
                      by{" "}
                      {/* Opens their public portfolio page (admins stay in the admin panel). */}
                      {!isAdmin && s.freelancer?.id ? (
                        <Link to={`/dashboard/freelancers/${s.freelancer.id}`} className="text-secondary text-decoration-underline">
                          {freelancerName}
                        </Link>
                      ) : freelancerName}
                      <VerifiedBadge verified={verifiedIds.has(s.freelancer?.id)} />
                    </p>
                    <div className="d-flex flex-wrap align-items-center justify-content-between gap-2">
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
                        // In a narrow card (three per row with the menu open) the
                        // buttons may not fit on one line. flex-grow-1 on Book and
                        // Message makes each line fill the card's width then,
                        // instead of leaving ragged gaps; in a wide card it
                        // changes nothing.
                        <div className="d-flex flex-wrap gap-1 ms-auto">
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
                          {accountType === "client" && s.freelancer?.id && s.freelancer.id !== currentUserId && (
                            <button
                              type="button"
                              className="btn btn-sm btn-outline-role rounded-pill px-3 fw-bold flex-grow-1"
                              onClick={() => setBookTarget({ freelancerId: s.freelancer.id, freelancerName, service: { id: s.id, title: s.title } })}
                            >
                              <i className="bi bi-calendar-check me-1"></i> Book
                            </button>
                          )}
                          <button
                            type="button"
                            className="btn btn-sm btn-gradient-role rounded-pill px-3 fw-bold text-white flex-grow-1"
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

      <ReportDialog target={reportTarget} onClose={() => setReportTarget(null)} onDone={showToast} />
      <BookDialog
        key={bookTarget?.service?.id}
        target={bookTarget}
        onClose={() => setBookTarget(null)}
        onBooked={() => {
          showToast(`Booking sent to ${bookTarget.freelancerName}. You can follow it in Bookings.`);
          setBookTarget(null);
        }}
      />
    </section>
  );
}
