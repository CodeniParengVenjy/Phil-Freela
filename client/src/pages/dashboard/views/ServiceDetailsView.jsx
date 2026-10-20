import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate, useOutletContext, useParams } from "react-router-dom";
import { supabase } from "../../../lib/supabaseClient";
import { getCategory } from "../../../lib/categories";
import { skillLabel } from "../../../lib/serviceSkills";
import { SLIDES_SELECT, isOriginalWork, itemSlides } from "../../../lib/slides";
import { fetchProfileStats, formatReplyTime } from "../../../lib/profileStats";
import { fetchServiceReviews, summarizeReviews } from "../../../lib/serviceReviews";
import { useVerifiedIds } from "../../../lib/useVerifiedIds";
import Avatar from "../../../components/Avatar";
import VerifiedBadge from "../../../components/VerifiedBadge";
import AvailabilityBadge from "../../../components/AvailabilityBadge";
import OriginalBadge, { ORIGINAL_EXPLANATION } from "../../../components/OriginalBadge";
import RatingChip from "../../../components/RatingChip";
import StarRating from "../../../components/StarRating";
import BookDialog from "../components/BookDialog";
import DeletePostDialog from "../components/DeletePostDialog";
import MediaCarousel from "../components/MediaCarousel";
import ReportDialog from "../components/ReportDialog";
import ServiceReviews from "../components/ServiceReviews";

// One service offer (a "project offer"), opened from a card on Browse Services
// or the AI search results, or from a freelancer's page. This is the only place
// a client can book: they see the title, who the freelancer is (with their
// stars), the work on offer and the description first, then the Book box at
// the bottom. Same layout as Job Details (the page freelancers read before
// applying).
export default function ServiceDetailsView() {
  const { serviceId } = useParams();
  // key: start fresh (back to "Loading...") when moving from one offer to another.
  return <ServiceDetails key={serviceId} serviceId={serviceId} />;
}

function ServiceDetails({ serviceId }) {
  const { currentUserId, accountType, openChat, showToast } = useOutletContext();
  const navigate = useNavigate();
  const location = useLocation();
  // undefined while loading, null when there's no such offer (or it isn't shown
  // to this user: the database leaves out offers from unverified freelancers).
  const [service, setService] = useState(undefined);
  // The freelancer's real numbers from finished projects (null = not loaded).
  const [stats, setStats] = useState(null);
  // The ratings and comments clients wrote on this offer (null = loading).
  const [reviews, setReviews] = useState(null);
  const [reviewsError, setReviewsError] = useState("");
  // The offer being reported, and the offer being booked (null = popup closed).
  const [reportTarget, setReportTarget] = useState(null);
  const [bookTarget, setBookTarget] = useState(null);
  // The offer waiting in the "Delete this service?" pop-up (only the owner can open it).
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    let active = true;

    supabase
      .from("services")
      .select(`id, title, category, description, price, skill, image_url, created_at, updated_at, freelancer:profiles!services_freelancer_id_fkey(id, full_name, username, avatar_path, available_for_work, skills), ${SLIDES_SELECT}`)
      .eq("id", serviceId)
      .maybeSingle()
      .then(({ data }) => {
        if (active) setService(data || null);
      });

    return () => {
      active = false;
    };
  }, [serviceId]);

  const freelancerId = service?.freelancer?.id;

  useEffect(() => {
    if (!freelancerId) return undefined;
    let active = true;

    fetchProfileStats(freelancerId, "freelancer").then((result) => {
      if (active) setStats(result);
    });

    return () => {
      active = false;
    };
  }, [freelancerId]);

  const serviceKey = service?.id;

  useEffect(() => {
    if (!serviceKey) return undefined;
    let active = true;

    fetchServiceReviews(serviceKey).then((result) => {
      if (!active) return;
      if (result.error) setReviewsError(result.error);
      else setReviews(result.reviews);
    });

    return () => {
      active = false;
    };
  }, [serviceKey]);

  const verifiedIds = useVerifiedIds([freelancerId]);

  // Back goes to wherever they came from (Browse Services, a search, a
  // freelancer's page). Opened from a pasted link there is nothing to go back
  // to, so it goes to their dashboard.
  const goBack = () => {
    if (location.key === "default") navigate(accountType === "client" ? "/dashboard-client" : "/dashboard-freelancer");
    else navigate(-1);
  };

  const backButton = (
    <button type="button" className="btn btn-link p-0 text-white-50 text-decoration-none fs-7 hover-role d-inline-block mb-3" onClick={goBack}>
      <i className="bi bi-arrow-left me-1"></i> Back
    </button>
  );

  if (service === undefined) {
    return <section className="dashboard-view active-view"><p className="text-secondary fs-7">Loading offer...</p></section>;
  }

  if (service === null) {
    return (
      <section className="dashboard-view active-view">
        <div className="glass-card rounded-4 p-5 border border-secondary border-opacity-25 text-center">
          <i className="bi bi-grid text-secondary" style={{ fontSize: "2.5rem" }}></i>
          <p className="text-secondary fs-7 mt-3 mb-3">This offer wasn't found. It may have been removed.</p>
          <button type="button" className="btn btn-outline-role rounded-pill px-4 fw-bold" onClick={goBack}>Go back</button>
        </div>
      </section>
    );
  }

  const freelancer = service.freelancer;
  const freelancerName = freelancer?.full_name || freelancer?.username || "Freelancer";
  const freelancerPath = freelancer?.id ? `/dashboard/freelancers/${freelancer.id}` : undefined;
  const isOwnOffer = freelancer?.id === currentUserId;
  const category = getCategory(service.category);
  const reviewSummary = summarizeReviews(reviews || []);
  const postedOn = new Date(service.created_at).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
  const slides = itemSlides(service);
  // The offer's own skill and the skills on the freelancer's profile.
  const skills = [...new Set([skillLabel(service.skill), ...(freelancer?.skills || [])].filter(Boolean))];

  // The freelancer's record, from projects the client marked Done (the same
  // numbers as the Performance box on their profile). Only what exists shows.
  const record = [];
  if (stats?.completed_count > 0) {
    record.push(`${stats.completed_count} ${stats.completed_count === 1 ? "project" : "projects"} done`);
    if (stats.on_time_count !== null && stats.on_time_count !== undefined) {
      record.push(`${Math.round((stats.on_time_count / stats.completed_count) * 100)}% on time`);
    }
  }
  if (stats && stats.reply_minutes !== null && stats.reply_minutes !== undefined) {
    record.push(`Replies ${formatReplyTime(stats.reply_minutes).toLowerCase()}`);
  }

  // What the Book box says: the button, or why there isn't one.
  const renderBookSection = () => {
    if (isOwnOffer) {
      return <p className="text-secondary fs-7 mb-0">This is your offer. Clients who book it show up in <Link to="/dashboard/bookings" className="text-role fw-bold text-decoration-none">Bookings</Link>.</p>;
    }
    if (accountType !== "client") {
      return <p className="text-secondary fs-7 mb-0">Only client accounts can book. Use "Become a Client" at the top to switch.</p>;
    }
    if (freelancer?.available_for_work === false) {
      return <p className="text-secondary fs-7 mb-0">{freelancerName} isn't taking new work right now. You can still message them.</p>;
    }
    return (
      <div className="d-flex flex-column flex-sm-row align-items-sm-center justify-content-between gap-3">
        <p className="text-secondary fs-7 mb-0">
          Read the description above, then send your booking. {freelancerName} can accept or decline it, and if they accept, a project starts. Talk about the price in chat.
        </p>
        <button
          type="button"
          className="btn btn-gradient-role rounded-pill px-5 py-2 fw-bold text-white shadow-glow-role flex-shrink-0"
          onClick={() => setBookTarget({ freelancerId: freelancer.id, freelancerName, service: { id: service.id, title: service.title } })}
        >
          <i className="bi bi-calendar-check me-2"></i>Book this offer
        </button>
      </div>
    );
  };

  return (
    <section className="dashboard-view active-view">
      <div className="glass-card rounded-4 p-4 p-md-5 border border-secondary border-opacity-25 max-w-950 mx-auto">
        {backButton}

        {/* Title, then who is offering it, with their stars and record. */}
        <div className="d-flex flex-column flex-md-row align-items-md-center gap-4 mb-4 pb-4 border-bottom border-secondary border-opacity-25">
          <Avatar path={freelancer?.avatar_path} name={freelancerName} size={80} to={freelancerPath} />
          <div className="flex-grow-1 overflow-hidden">
            <h2 className="h3 fw-bold text-white mb-1 text-break">{service.title}</h2>
            <p className="text-white-50 fs-7 mb-1 d-flex flex-wrap align-items-center gap-2">
              <span>
                by{" "}
                {/* Opens their public page: their record and portfolio. */}
                {freelancerPath
                  ? <Link to={freelancerPath} className="text-white fw-semibold text-decoration-none hover-role">{freelancerName}</Link>
                  : <span className="text-white fw-semibold">{freelancerName}</span>}
                <VerifiedBadge verified={verifiedIds.has(freelancer?.id)} />
              </span>
              {/* Their average rating from finished projects (Feature 5, transparency). */}
              <StarRating userId={freelancer?.id} />
              <AvailabilityBadge available={freelancer?.available_for_work} className="fs-8" />
            </p>
            {/* The day the freelancer uploaded this offer. */}
            <p className="text-secondary fs-8 mb-1">
              <i className="bi bi-calendar3 me-1"></i>Posted {postedOn}
              {/* Shown once the freelancer changed the offer, so a booking isn't made on old words. */}
              {service.updated_at && ` • Edited ${new Date(service.updated_at).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" })}`}
            </p>
            {record.length > 0 && <p className="text-secondary fs-8 mb-0">{record.join(" • ")}</p>}
            {stats && record.length === 0 && <p className="text-secondary fs-8 mb-0">New here: no finished projects yet.</p>}
          </div>
          {isOwnOffer && (
            <div className="d-flex gap-2 flex-shrink-0">
              <Link to={`/dashboard/services?edit=${service.id}`} className="btn btn-outline-role rounded-pill px-4 fw-bold">
                <i className="bi bi-pencil-fill me-1"></i> Edit
              </Link>
              <button type="button" className="btn btn-outline-danger rounded-pill px-4 fw-bold" onClick={() => setConfirmDelete(true)}>
                <i className="bi bi-trash3-fill me-1"></i> Delete
              </button>
            </div>
          )}
          {!isOwnOffer && freelancer && (
            <div className="d-flex gap-2 flex-shrink-0">
              <button type="button" className="btn btn-dark border border-secondary text-white rounded-pill px-4 fw-bold" onClick={() => openChat(freelancer.id)}>
                <i className="bi bi-chat-dots-fill me-1"></i> Message
              </button>
              <button
                type="button"
                className="btn btn-outline-secondary text-white-50 rounded-pill px-3"
                title="Report this service"
                aria-label="Report this service"
                onClick={() => setReportTarget({ type: "service", id: service.id, name: service.title })}
              >
                <i className="bi bi-flag-fill"></i>
              </button>
            </div>
          )}
        </div>

        {/* The work on offer: its photos, videos and documents, then the facts. */}
        <h4 className="text-white fw-bold mb-3"><i className="bi bi-briefcase-fill text-role me-2"></i> Project offer</h4>
        {slides.length > 0 ? (
          <div className="rounded-4 overflow-hidden border border-secondary border-opacity-25 mb-3">
            <MediaCarousel
              slides={slides}
              aspectRatio="16 / 9"
              fit="contain"
              expandable
              alt={service.title}
              ownerName={freelancer?.username}
            />
          </div>
        ) : (
          <div className="d-flex align-items-center justify-content-center bg-role-subtle rounded-4 mb-3" style={{ aspectRatio: "16 / 9" }}>
            <i className={`bi ${category.icon} text-role`} style={{ fontSize: "3rem" }}></i>
          </div>
        )}
        <div className="mb-4">
          <div className="d-flex flex-wrap align-items-center gap-2">
            <span className="badge bg-role text-white px-3 py-2 rounded-pill"><i className={`bi ${category.icon} me-1`}></i>{category.label}</span>
            <span className="badge bg-secondary bg-opacity-50 text-warning px-3 py-2 rounded-pill">
              {service.price ? `Starting at ₱${Number(service.price).toLocaleString()}` : "Price on request"}
            </span>
            {isOriginalWork(service) && <OriginalBadge className="px-3 py-2" />}
            {/* What clients rated this offer (from the box further down). */}
            <RatingChip rating={reviewSummary} className="px-3 py-2" />
          </div>
          {isOriginalWork(service) && <p className="text-secondary fs-9 mt-2 mb-0">{ORIGINAL_EXPLANATION}</p>}
        </div>

        <h4 className="text-white fw-bold mb-3"><i className="bi bi-card-text text-role me-2"></i> Description</h4>
        <div className="bg-dark bg-opacity-50 p-4 rounded-4 border border-secondary border-opacity-25 text-light-50 fs-7 lh-lg mb-4 text-break" style={{ whiteSpace: "pre-wrap" }}>
          {service.description}
        </div>

        {/* The offer's skill and the freelancer's profile skills (hidden when there are none). */}
        {skills.length > 0 && (
          <>
            <h4 className="text-white fw-bold mb-3"><i className="bi bi-tools text-role me-2"></i> Skills</h4>
            <div className="d-flex flex-wrap gap-2 mb-4">
              {skills.map((skill) => (
                <span key={skill} className="badge bg-secondary bg-opacity-50 text-white px-3 py-2 rounded-pill fw-semibold">{skill}</span>
              ))}
            </div>
          </>
        )}

        {/* Ratings and comments from clients, read before booking. */}
        <div className="mb-4">
          <ServiceReviews
            serviceId={service.id}
            reviews={reviews}
            loadError={reviewsError}
            onReviewsChange={setReviews}
            currentUserId={currentUserId}
            accountType={accountType}
            isOwnOffer={isOwnOffer}
            showToast={showToast}
            onReport={(review) => setReportTarget({
              type: "service_review",
              id: review.id,
              name: `${review.author?.full_name || review.author?.username || "A client"}'s comment`
            })}
          />
        </div>

        <h4 className="text-white fw-bold mb-3"><i className="bi bi-calendar-check text-role me-2"></i> Book this offer</h4>
        <div className="bg-dark bg-opacity-50 p-4 rounded-4 border border-secondary border-opacity-25">
          {renderBookSection()}
        </div>
      </div>

      <ReportDialog target={reportTarget} onClose={() => setReportTarget(null)} onDone={showToast} />
      <DeletePostDialog
        kind="service"
        post={confirmDelete ? service : null}
        showToast={showToast}
        onCancel={() => setConfirmDelete(false)}
        // The offer is gone, so go to the page that lists your services.
        onDeleted={() => navigate("/dashboard/services", { replace: true })}
      />
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
