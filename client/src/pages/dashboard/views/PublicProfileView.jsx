import { useEffect, useState } from "react";
import { useOutletContext, useParams } from "react-router-dom";
import { supabase } from "../../../lib/supabaseClient";
import { fetchIsVerified } from "../../../lib/verification";
import { countPortfolio } from "../../../lib/portfolio";
import { fetchProfileStats } from "../../../lib/profileStats";
import VerifiedBadge from "../../../components/VerifiedBadge";
import AvailabilityBadge from "../../../components/AvailabilityBadge";
import StarRating from "../../../components/StarRating";
import Avatar from "../../../components/Avatar";
import CoverPhoto from "../../../components/CoverPhoto";
import PictureViewer from "../../../components/PictureViewer";
import { avatarUrl, coverUrl } from "../../../lib/avatar";
import PortfolioSection from "../components/PortfolioSection";
import PerformanceBox from "../components/PerformanceBox";
import CompletedProjects from "../components/CompletedProjects";
import ReportDialog from "../components/ReportDialog";
import BookDialog from "../components/BookDialog";

const ROLE_LABELS = { freelancer: "Freelancer", client: "Client" };

// A person's public profile: ONE page for every account, whatever role they
// have today. Both addresses open it (/dashboard/freelancers/:userId and
// /dashboard/clients/:userId), so a link to a person keeps working after they
// switch roles. Reached from a person's name or picture anywhere on the site.
export default function PublicProfileView() {
  const { userId } = useParams();
  // key: start fresh (back to "Loading...") when moving from one person's page to another's.
  return <PublicProfile key={userId} userId={userId} />;
}

// The page itself: name, Verified check (or "Not verified"), the role they
// have today and their stars; Message and Report buttons (and Book, for a
// client looking at a freelancer); their description and skills; their track
// record (Feature 5, Profile transparency); and their portfolio. The person's
// @username is shown faintly over their slides, so a screenshot still shows
// whose work it is.
function PublicProfile({ userId }) {
  const { currentUserId, accountType, openChat, showToast } = useOutletContext();
  // undefined while loading, null when there's no such person.
  const [person, setPerson] = useState(undefined);
  const [verified, setVerified] = useState(false);
  // How many projects are in their portfolio. A freelancer's Portfolio box
  // always shows; a client's only when they have work in it (from the time
  // they were a freelancer).
  const [portfolioCount, setPortfolioCount] = useState(0);
  // The person being reported (null = Report popup closed).
  const [reportTarget, setReportTarget] = useState(null);
  // The freelancer being booked (null = Book popup closed). Only clients book.
  const [bookTarget, setBookTarget] = useState(null);
  // Which picture is open bigger: "picture", "cover", or null (none).
  const [viewing, setViewing] = useState(null);
  const isOwnPage = userId === currentUserId;

  useEffect(() => {
    let active = true;
    Promise.all([
      supabase.from("profiles").select("id, full_name, username, account_type, avatar_path, cover_path, description, skills, available_for_work").eq("id", userId).maybeSingle(),
      fetchIsVerified(userId),
      countPortfolio(userId)
    ]).then(([{ data }, isVerified, count]) => {
      if (!active) return;
      setPerson(data || null);
      setVerified(isVerified);
      setPortfolioCount(count);
    });
    return () => {
      active = false;
    };
  }, [userId]);

  if (person === undefined) {
    return <section className="dashboard-view active-view"><p className="text-secondary fs-7">Loading...</p></section>;
  }

  if (person === null) {
    return (
      <section className="dashboard-view active-view">
        <div className="glass-card rounded-4 p-5 border border-secondary border-opacity-25 text-center">
          <i className="bi bi-person-x text-secondary" style={{ fontSize: "2.5rem" }}></i>
          <p className="text-secondary fs-7 mt-3 mb-0">This profile wasn't found.</p>
        </div>
      </section>
    );
  }

  const name = person.full_name || person.username;
  // The role they have today (they can switch in the menu).
  const roleToday = person.account_type === "client" ? "client" : "freelancer";
  const isFreelancer = roleToday === "freelancer";
  // False when a freelancer switched "Available for work" off in Settings.
  const takingBookings = person.available_for_work !== false;

  // The Report button in the picture popup: closes it and opens the Report
  // form for that picture. The report keeps which file it was (reportedPath).
  const reportViewedPicture = () => {
    const isCover = viewing === "cover";
    setReportTarget({
      type: isCover ? "cover_photo" : "profile_picture",
      id: person.id,
      name: `${name}'s ${isCover ? "cover photo" : "profile picture"}`,
      reportedPath: isCover ? person.cover_path : person.avatar_path
    });
    setViewing(null);
  };

  return (
    <section className="dashboard-view active-view">
      <div className="glass-card rounded-4 border border-secondary border-opacity-25 mb-4 overflow-hidden">
        <CoverPhoto path={person.cover_path} name={name} onOpen={() => setViewing("cover")} />
        <div className="p-4 d-flex flex-column flex-sm-row align-items-sm-center gap-3">
          <Avatar path={person.avatar_path} name={name} size={72} onOpen={() => setViewing("picture")} />
          <div className="flex-grow-1 overflow-hidden">
            <h3 className="text-white fw-bold mb-1 text-break">
              {person.full_name}
              <VerifiedBadge verified={verified} showUnverified />
            </h3>
            <p className="text-secondary fs-7 mb-0 d-flex flex-wrap align-items-center gap-2">
              <span>@{person.username} • {ROLE_LABELS[roleToday]}</span>
              {/* Their average rating from completed projects (Feature 5, transparency). */}
              <StarRating userId={person.id} />
              {/* Whether they are taking new work (freelancers only). */}
              {isFreelancer && <AvailabilityBadge available={person.available_for_work} showAvailable className="fs-8" />}
            </p>
          </div>
          {isOwnPage ? (
            <span className="text-secondary fs-8">This is how others see your profile.</span>
          ) : (
            <div className="d-flex flex-wrap gap-2 flex-shrink-0">
              {/* A client can book a freelancer's service from here, unless the
                  freelancer isn't taking new work (the database refuses it too). */}
              {accountType === "client" && isFreelancer && takingBookings && (
                <button
                  type="button"
                  className="btn btn-outline-role rounded-pill px-4 fw-bold"
                  onClick={() => setBookTarget({ freelancerId: person.id, freelancerName: name, service: null })}
                >
                  <i className="bi bi-calendar-check me-1"></i> Book
                </button>
              )}
              <button type="button" className="btn btn-gradient-role rounded-pill px-4 fw-bold text-white" onClick={() => openChat(person.id)}>
                <i className="bi bi-chat-dots-fill me-1"></i> Message
              </button>
              <button
                type="button"
                className="btn btn-outline-secondary text-white-50 rounded-pill px-3"
                title={`Report this ${roleToday}`}
                aria-label={`Report this ${roleToday}`}
                onClick={() => setReportTarget({ type: "user", id: person.id, name })}
              >
                <i className="bi bi-flag-fill"></i>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Their own words about themselves (hidden until they write some). */}
      {person.description && (
        <div className="glass-card rounded-4 p-4 border border-secondary border-opacity-25 mb-4">
          <h5 className="text-white fw-bold mb-2"><i className="bi bi-text-paragraph text-orange me-2"></i> Description</h5>
          <p className="text-light-50 fs-7 mb-0 text-break" style={{ whiteSpace: "pre-line" }}>{person.description}</p>
        </div>
      )}

      {/* The skills they saved on their own Profile (hidden until they add some). */}
      {person.skills?.length > 0 && (
        <div className="glass-card rounded-4 p-4 border border-secondary border-opacity-25 mb-4">
          <h5 className="text-white fw-bold mb-3"><i className="bi bi-tools text-orange me-2"></i> Skills</h5>
          <div className="d-flex flex-wrap gap-2">
            {person.skills.map((skill) => (
              <span key={skill} className="badge bg-secondary bg-opacity-75 text-light px-3 py-2 rounded-pill fs-7">{skill}</span>
            ))}
          </div>
        </div>
      )}

      <TrackRecord userId={person.id} roleToday={roleToday} />

      {(isFreelancer || portfolioCount > 0) && (
        <div className="glass-card rounded-4 p-4 border border-secondary border-opacity-25">
          <PortfolioSection freelancerId={person.id} ownerName={person.username} />
        </div>
      )}

      {/* Their picture or cover, bigger. On your own page it has a Change link. */}
      <PictureViewer
        picture={viewing && {
          kind: viewing,
          src: viewing === "cover" ? coverUrl(person.cover_path) : avatarUrl(person.avatar_path),
          alt: viewing === "cover" ? `${name}'s cover photo` : `${name}'s profile picture`
        }}
        onClose={() => setViewing(null)}
        changeTo={isOwnPage ? "/dashboard/settings" : undefined}
        onReport={isOwnPage ? undefined : reportViewedPicture}
      />

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

// The person's real track record (Feature 5, Profile transparency): the
// Performance numbers and the projects marked Done. It is kept apart for the
// two roles, because the numbers mean different things (on-time delivery only
// makes sense for work done as a freelancer). The role they have today shows
// first. If they also have a record in the other role (they switched at some
// point), two tabs let the visitor see both.
function TrackRecord({ userId, roleToday }) {
  const otherRole = roleToday === "freelancer" ? "client" : "freelancer";
  // The role whose record is on screen.
  const [role, setRole] = useState(roleToday);
  // True once we know they did something in the other role too.
  const [hasOtherRecord, setHasOtherRecord] = useState(false);

  useEffect(() => {
    let active = true;
    // "Something" = a completed project, or a service / job post, in that role.
    fetchProfileStats(userId, otherRole).then((stats) => {
      if (active) setHasOtherRecord(Boolean(stats && (stats.completed_count > 0 || stats.listing_count > 0)));
    });
    return () => {
      active = false;
    };
  }, [userId, otherRole]);

  return (
    <div className="mb-4">
      {hasOtherRecord && (
        <div className="d-flex flex-wrap gap-2 mb-3" role="tablist" aria-label="Track record">
          {[roleToday, otherRole].map((value) => (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={role === value}
              className={`btn btn-sm rounded-pill px-3 fs-8 fw-semibold ${role === value ? "btn-gradient-role text-white" : "btn-outline-secondary text-white-50"}`}
              onClick={() => setRole(value)}
            >
              As a {value}
            </button>
          ))}
        </div>
      )}

      {/* key: start fresh when the other tab is picked. */}
      <div className="row g-4" key={role}>
        <div className="col-lg-4">
          <PerformanceBox userId={userId} role={role} className="h-100" />
        </div>
        <div className="col-lg-8">
          <div className="glass-card rounded-4 p-4 border border-secondary border-opacity-25 h-100">
            <CompletedProjects userId={userId} role={role} />
          </div>
        </div>
      </div>
    </div>
  );
}
