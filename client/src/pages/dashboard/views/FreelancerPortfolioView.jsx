import { useEffect, useState } from "react";
import { useOutletContext, useParams } from "react-router-dom";
import { supabase } from "../../../lib/supabaseClient";
import { fetchIsVerified } from "../../../lib/verification";
import VerifiedBadge from "../../../components/VerifiedBadge";
import StarRating from "../../../components/StarRating";
import Avatar from "../../../components/Avatar";
import PortfolioSection from "../components/PortfolioSection";
import PerformanceBox from "../components/PerformanceBox";
import CompletedProjects from "../components/CompletedProjects";
import ReportDialog from "../components/ReportDialog";
import BookDialog from "../components/BookDialog";

// A freelancer's public page (/dashboard/freelancers/:freelancerId): their
// name, Verified badge, Book (clients only), Message and Report buttons, their description, and their portfolio. Reached from
// "by <name>" on Browse Services. The freelancer's @username is shown faintly
// over their slides, so a screenshot still shows whose work it is.
export default function FreelancerPortfolioView() {
  const { freelancerId } = useParams();
  const { currentUserId, accountType, openChat, showToast } = useOutletContext();
  // undefined while loading, null when there's no such freelancer.
  const [freelancer, setFreelancer] = useState(undefined);
  const [verified, setVerified] = useState(false);
  // The freelancer being reported (null = Report popup closed).
  const [reportTarget, setReportTarget] = useState(null);
  // The freelancer being booked (null = Book popup closed). Only clients book.
  const [bookTarget, setBookTarget] = useState(null);
  const isOwnPage = freelancerId === currentUserId;

  useEffect(() => {
    let active = true;
    Promise.all([
      supabase.from("profiles").select("id, full_name, username, account_type, avatar_path, description, skills").eq("id", freelancerId).maybeSingle(),
      fetchIsVerified(freelancerId)
    ]).then(([{ data }, isVerified]) => {
      if (!active) return;
      setFreelancer(data?.account_type === "freelancer" ? data : null);
      setVerified(isVerified);
    });
    return () => {
      active = false;
    };
  }, [freelancerId]);

  if (freelancer === undefined) {
    return <section className="dashboard-view active-view"><p className="text-secondary fs-7">Loading...</p></section>;
  }

  if (freelancer === null) {
    return (
      <section className="dashboard-view active-view">
        <div className="glass-card rounded-4 p-5 border border-secondary border-opacity-25 text-center">
          <i className="bi bi-person-x text-secondary" style={{ fontSize: "2.5rem" }}></i>
          <p className="text-secondary fs-7 mt-3 mb-0">This freelancer wasn't found.</p>
        </div>
      </section>
    );
  }

  return (
    <section className="dashboard-view active-view">
      <div className="glass-card rounded-4 p-4 border border-secondary border-opacity-25 mb-4 d-flex flex-column flex-sm-row align-items-sm-center gap-3">
        <Avatar path={freelancer.avatar_path} name={freelancer.full_name || freelancer.username} size={72} />
        <div className="flex-grow-1 overflow-hidden">
          <h3 className="text-white fw-bold mb-1 text-break">
            {freelancer.full_name}
            <VerifiedBadge verified={verified} showUnverified />
          </h3>
          <p className="text-secondary fs-7 mb-0 d-flex align-items-center gap-2">
            <span>@{freelancer.username} • Freelancer</span>
            {/* Their average rating from completed projects (Feature 5, transparency). */}
            <StarRating userId={freelancer.id} />
          </p>
        </div>
        {isOwnPage ? (
          <span className="text-secondary fs-8">This is how others see your portfolio.</span>
        ) : (
          <div className="d-flex flex-wrap gap-2 flex-shrink-0">
            {accountType === "client" && (
              <button
                type="button"
                className="btn btn-outline-role rounded-pill px-4 fw-bold"
                onClick={() => setBookTarget({ freelancerId: freelancer.id, freelancerName: freelancer.full_name || freelancer.username, service: null })}
              >
                <i className="bi bi-calendar-check me-1"></i> Book
              </button>
            )}
            <button type="button" className="btn btn-gradient-role rounded-pill px-4 fw-bold text-white" onClick={() => openChat(freelancer.id)}>
              <i className="bi bi-chat-dots-fill me-1"></i> Message
            </button>
            <button
              type="button"
              className="btn btn-outline-secondary text-white-50 rounded-pill px-3"
              title="Report this freelancer"
              aria-label="Report this freelancer"
              onClick={() => setReportTarget({ type: "user", id: freelancer.id, name: freelancer.full_name || freelancer.username })}
            >
              <i className="bi bi-flag-fill"></i>
            </button>
          </div>
        )}
      </div>

      {/* The freelancer's own words about themselves (hidden until they write some). */}
      {freelancer.description && (
        <div className="glass-card rounded-4 p-4 border border-secondary border-opacity-25 mb-4">
          <h5 className="text-white fw-bold mb-2"><i className="bi bi-text-paragraph text-orange me-2"></i> Description</h5>
          <p className="text-light-50 fs-7 mb-0 text-break" style={{ whiteSpace: "pre-line" }}>{freelancer.description}</p>
        </div>
      )}

      {/* The skills the freelancer saved on their own Profile (hidden until they add some). */}
      {freelancer.skills?.length > 0 && (
        <div className="glass-card rounded-4 p-4 border border-secondary border-opacity-25 mb-4">
          <h5 className="text-white fw-bold mb-3"><i className="bi bi-tools text-orange me-2"></i> Skills</h5>
          <div className="d-flex flex-wrap gap-2">
            {freelancer.skills.map((skill) => (
              <span key={skill} className="badge bg-secondary bg-opacity-75 text-light px-3 py-2 rounded-pill fs-7">{skill}</span>
            ))}
          </div>
        </div>
      )}

      {/* Their real track record (Feature 5, Profile transparency): the numbers
          and the projects clients marked Done. key: start fresh when moving
          from one freelancer's page to another's. */}
      <div className="row g-4 mb-4" key={`record-${freelancerId}`}>
        <div className="col-lg-4">
          <PerformanceBox userId={freelancerId} role="freelancer" className="h-100" />
        </div>
        <div className="col-lg-8">
          <div className="glass-card rounded-4 p-4 border border-secondary border-opacity-25 h-100">
            <CompletedProjects userId={freelancerId} role="freelancer" />
          </div>
        </div>
      </div>

      <div className="glass-card rounded-4 p-4 border border-secondary border-opacity-25">
        {/* key: start fresh when moving from one freelancer's page to another's. */}
        <PortfolioSection key={freelancerId} freelancerId={freelancerId} ownerName={freelancer.username} />
      </div>

      <ReportDialog target={reportTarget} onClose={() => setReportTarget(null)} onDone={showToast} />
      <BookDialog
        key={bookTarget?.freelancerId}
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
