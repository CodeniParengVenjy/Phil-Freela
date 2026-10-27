import { useEffect, useMemo, useState } from "react";
import { Link, useOutletContext } from "react-router-dom";
import { supabase } from "../../../lib/supabaseClient";
import { categories, getCategory } from "../../../lib/categories";
import { removeListing } from "../../../lib/adminListings";
import { byPick, useRecommendations } from "../../../lib/useRecommendations";
import { useVerifiedIds } from "../../../lib/useVerifiedIds";
import { useServiceRatings } from "../../../lib/useServiceRatings";
import { useFeatureStatus } from "../../../lib/featured";
import { useProIds } from "../../../lib/pro";
import { SLIDES_SELECT, isOriginalWork, itemSlides } from "../../../lib/slides";
import OriginalBadge from "../../../components/OriginalBadge";
import RatingChip from "../../../components/RatingChip";
import VerifiedBadge from "../../../components/VerifiedBadge";
import ProBadge from "../../../components/ProBadge";
import AvailabilityBadge from "../../../components/AvailabilityBadge";
import MediaCarousel from "../components/MediaCarousel";
import RecommendationMarks from "../components/RecommendationMarks";
import FeaturedHeading, { FeaturedBadge } from "../components/FeaturedMarks";
import CensoredText from "../../../components/CensoredText";

// withRecommendations (the client dashboard): the services the Hybrid
// recommendation system picked ("Recommended for you", see lib/aiService.js)
// are merged into this one list, first and in the AI's order, each marked with
// why it was picked; everything else follows, newest first. If the AI service
// can't be reached the list is simply the plain newest-first one.
export default function BrowseServicesView({ withRecommendations = false }) {
  // isAdmin is only set when this page is shown inside the admin panel
  // (Browse Services): admins get a Remove button instead of View offer.
  const { isAdmin } = useOutletContext();
  // The AI's picks (lib/useRecommendations.js): service id -> { position, reasons }.
  const recs = useRecommendations(withRecommendations);
  const picked = recs.picked;
  const [category, setCategory] = useState("");
  const [query, setQuery] = useState("");
  const [services, setServices] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;

    supabase
      .from("services")
      .select(`id, title, category, price, image_url, media_type, created_at, freelancer:profiles!services_freelancer_id_fkey(id, full_name, username, available_for_work), ${SLIDES_SELECT}`)
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
  // What clients rated each offer, for the "★ 4.5 (2)" on its card.
  const ratings = useServiceRatings((services || []).map((s) => s.id));
  // Which offers someone paid to feature (and are still running).
  const featured = useFeatureStatus();
  // Which freelancers have Premium right now (the gold Premium badge by their name).
  const proIds = useProIds();

  const filtered = useMemo(() => {
    if (!services) return [];
    const q = query.toLowerCase();
    const matching = services.filter((s) => {
      if (category && s.category !== category) return false;
      if (!q) return true;
      const freelancerName = s.freelancer?.full_name || s.freelancer?.username || "";
      return `${s.title} ${freelancerName}`.toLowerCase().includes(q);
    });
    // The AI's picks first, in its order; the rest stay newest first.
    return matching.sort(byPick(picked));
  }, [services, category, query, picked]);

  // Featured offers (PLAN-monetization.md, step 4) move out of the list into their own
  // row on top, in the same order, after the search and the category filter. The
  // admin's copy of this page stays one plain list.
  const featuredItems = isAdmin ? [] : filtered.filter((s) => featured.until.has(s.id));
  const rest = isAdmin ? filtered : filtered.filter((s) => !featured.until.has(s.id));

  // One card of the list. The Featured row and the normal list below it both use it.
  const renderService = (s, index, isFeatured) => {
    const meta = getCategory(s.category);
    const freelancerName = s.freelancer?.full_name || s.freelancer?.username || "Freelancer";
    const slides = itemSlides(s);
    return (
      // Three cards per row on laptops and big screens, two on tablets
      // and small windows, one on phones. The expand button on each
      // picture still shows it full screen.
      <div className="col-sm-6 col-lg-4" key={s.id}>
        {/* (data-tour: the opening tour points at the first card, components/WelcomeGuide.jsx) */}
        <div data-tour={index === 0 ? "first-item" : undefined} className={`glass-card rounded-4 h-100 border ${isFeatured ? "border-warning border-opacity-50" : "border-secondary border-opacity-25"} overflow-hidden hover-lift d-flex flex-column`}>
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
              videoControls={false}
              alt={s.title}
              ownerName={s.freelancer?.username}
            />
          ) : (
            <div className="d-flex align-items-center justify-content-center bg-role-subtle" style={{ aspectRatio: "16 / 10" }}>
              <i className={`bi ${meta.icon} text-role`} style={{ fontSize: "2.75rem" }}></i>
            </div>
          )}
          <div className="p-3 d-flex flex-column flex-grow-1">
            {/* Picked by the AI: marked, with why. */}
            {picked.has(s.id) && <RecommendationMarks pick={picked.get(s.id)} personalized={recs.personalized} want="services" className="mb-2 mt-0" />}
            <div className="d-flex flex-wrap align-items-center gap-1 mb-2">
              {isFeatured && <FeaturedBadge />}
              <span className="badge bg-black text-light-50 fs-8">{meta.label}</span>
              {/* Every file passed the AI copy check and carries the hidden watermark (step 10). */}
              {isOriginalWork(s) && <OriginalBadge className="fs-8" />}
              {/* The freelancer switched "Available for work" off in Settings. */}
              <AvailabilityBadge available={s.freelancer?.available_for_work} className="fs-8" />
              {/* The average of the clients' ratings of this offer. */}
              <RatingChip rating={ratings.get(s.id)} className="fs-8" />
            </div>
            <h6 className="text-white fw-bold mb-1">
              {/* Opens the offer's own page: its description and, for
                  clients, the Book button (admins stay in the panel). */}
              {isAdmin
                ? <CensoredText text={s.title} />
                : <Link to={`/dashboard/service-details/${s.id}`} className="text-white text-decoration-none hover-role"><CensoredText text={s.title} /></Link>}
            </h6>
            <p className="fs-8 text-secondary mb-3 flex-grow-1">
              by{" "}
              {/* Opens their public portfolio page (admins stay in the admin panel). */}
              {!isAdmin && s.freelancer?.id ? (
                <Link to={`/dashboard/freelancers/${s.freelancer.id}`} className="text-secondary text-decoration-underline">
                  {freelancerName}
                </Link>
              ) : freelancerName}
              <VerifiedBadge verified={verifiedIds.has(s.freelancer?.id)} />
              <ProBadge pro={proIds.has(s.freelancer?.id)} />
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
                // The card's one button. Book, Message and Report are on
                // the offer's page, after reading its description.
                <Link to={`/dashboard/service-details/${s.id}`} className="btn btn-sm btn-gradient-role rounded-pill px-3 fw-bold text-white ms-auto">
                  <i className="bi bi-eye me-1"></i> View offer
                </Link>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <section className="dashboard-view active-view">
      <div className="glass-card rounded-4 p-3 p-md-4 border border-secondary border-opacity-25">
        <div className="d-flex flex-column flex-md-row justify-content-between align-items-md-center gap-3 mb-3 mb-md-4">
          <div>
            <h3 className="view-title text-white fw-bold mb-1"><i className="bi bi-grid-fill text-role me-2"></i> Browse Freelancer Services</h3>
            {/* The line under the title is left out on a phone, so the cards start higher. */}
            <p className="text-secondary fs-7 mb-0 d-none d-md-block">
              {withRecommendations && picked.size > 0
                ? (recs.personalized
                  ? "Freelancers picked for you by PhilFreela's AI come first, then the newest services."
                  : "New and trusted freelancers come first, then the newest services. Write a profile description in Settings or post a project to get freelancers that match what you need.")
                : "Find a freelancer for your next project and message them directly."}
            </p>
            {recs.loading && (
              <p className="text-secondary fs-8 mb-0 mt-1">
                <span className="spinner-border spinner-border-sm me-2" aria-hidden="true"></span>Finding recommendations...
              </p>
            )}
          </div>
        </div>

        {/* (data-tour: parts the opening tour points at, components/WelcomeGuide.jsx) */}
        <div data-tour="services-filter" className="d-flex flex-column flex-md-row gap-2 gap-md-3 mb-3 mb-md-4">
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
          {featuredItems.length > 0 && (
            <div className="col-12">
              <FeaturedHeading />
            </div>
          )}
          {featuredItems.map((s, index) => renderService(s, index, true))}
          {featuredItems.length > 0 && rest.length > 0 && <div className="col-12"><hr className="border-secondary opacity-25 my-0" /></div>}
          {rest.map((s, index) => renderService(s, featuredItems.length + index, false))}
        </div>
      </div>
    </section>
  );
}
