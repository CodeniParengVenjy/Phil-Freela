import { useEffect, useState } from "react";
import { useOutletContext, useParams } from "react-router-dom";
import { supabase } from "../../../lib/supabaseClient";
import { fetchIsVerified } from "../../../lib/verification";
import { countPortfolio } from "../../../lib/portfolio";
import { fetchSocialLabels, fetchSocialLinks, fetchVerifiedLinks } from "../../../lib/profile";
import { fetchProfileStats } from "../../../lib/profileStats";
import { SLIDES_SELECT } from "../../../lib/slides";
import { useServiceRatings } from "../../../lib/useServiceRatings";
import { recordView, useProIds } from "../../../lib/pro";
import VerifiedBadge from "../../../components/VerifiedBadge";
import ProBadge from "../../../components/ProBadge";
import AvailabilityBadge from "../../../components/AvailabilityBadge";
import { TrustBadge } from "../../../components/TrustRing";
import Avatar from "../../../components/Avatar";
import CoverPhoto from "../../../components/CoverPhoto";
import PictureViewer from "../../../components/PictureViewer";
import { avatarUrl, coverUrl } from "../../../lib/avatar";
import PortfolioSection from "../components/PortfolioSection";
import PerformanceBox from "../components/PerformanceBox";
import CompletedProjects from "../components/CompletedProjects";
import ReportDialog from "../components/ReportDialog";
import ServiceCard from "../components/ServiceCard";
import { SocialAccountsRow } from "../components/SocialAccounts";
import CensoredText from "../../../components/CensoredText";
import { Loader } from "../../../components/Loaders";
import HighlightsButton from "../../../components/highlights/HighlightsButton";

const ROLE_LABELS = { freelancer: "Freelancer", client: "Client" };

// A person's public profile: ONE page for every account, freelancer or
// client. Both addresses open it (/dashboard/freelancers/:userId and
// /dashboard/clients/:userId), so an old link with the other address still works. Reached from a person's name or picture anywhere on the site.
export default function PublicProfileView() {
  const { userId } = useParams();
  // key: start fresh (back to the loading animation) when moving from one person's page to another's.
  return <PublicProfile key={userId} userId={userId} />;
}

// The page itself: name, Verified check (or "Not verified"), the role they
// have today and their stars; Message and Report buttons; their description
// and skills; a freelancer's services (each opens its own page, where a client
// reads the description and books); their track record (Feature 5, Profile
// transparency); and their portfolio. The person's @username is shown faintly
// over their slides, so a screenshot still shows whose work it is.
function PublicProfile({ userId }) {
  const { currentUserId, openChat, showToast } = useOutletContext();
  // undefined while loading, null when there's no such person.
  const [person, setPerson] = useState(undefined);
  const [verified, setVerified] = useState(false);
  // How many projects are in their portfolio. A freelancer's Portfolio box
  // always shows; a client's only when they have work in it (from the time
  // they were a freelancer).
  const [portfolioCount, setPortfolioCount] = useState(0);
  // { [link]: verified_at }: their portfolio links with a Verified owner badge.
  const [verifiedLinks, setVerifiedLinks] = useState({});
  // { [platform]: link }: their Facebook, Instagram, TikTok... pages (stays {} when none, or when they couldn't be
  // loaded, so the rest of the page never depends on it).
  const [socialLinks, setSocialLinks] = useState({});
  // { [platform]: name }: the names they typed for those accounts (read on its own too, {} when none).
  const [socialLabels, setSocialLabels] = useState({});
  // The person being reported (null = Report popup closed).
  const [reportTarget, setReportTarget] = useState(null);
  // Which picture is open bigger: "picture", "cover", or null (none).
  const [viewing, setViewing] = useState(null);
  const isOwnPage = userId === currentUserId;
  // Who has Premium right now: the gold Premium badge by the name (clients and freelancers).
  const proIds = useProIds();

  // Counts this visit for the person (Premium shows them how many people
  // opened their profile; your own page doesn't count).
  useEffect(() => {
    if (!isOwnPage) recordView("profile", userId);
  }, [userId, isOwnPage]);

  useEffect(() => {
    let active = true;
    Promise.all([
      supabase.from("profiles").select("id, full_name, username, account_type, avatar_path, cover_path, description, skills, available_for_work, portfolio_links").eq("id", userId).maybeSingle(),
      fetchIsVerified(userId),
      countPortfolio(userId),
      fetchVerifiedLinks(userId),
      fetchSocialLinks(userId),
      fetchSocialLabels(userId)
    ]).then(([{ data }, isVerified, count, siteBadges, social, names]) => {
      if (!active) return;
      setPerson(data || null);
      setVerified(isVerified);
      setPortfolioCount(count);
      setVerifiedLinks(siteBadges);
      setSocialLinks(social || {});
      setSocialLabels(names || {});
    });
    return () => {
      active = false;
    };
  }, [userId]);

  if (person === undefined) {
    return <section className="dashboard-view active-view"><Loader size="lg" label="Loading profile" /></section>;
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
  // The account's role (it never changes: PLAN-separate-accounts.md).
  const roleToday = person.account_type === "client" ? "client" : "freelancer";
  const isFreelancer = roleToday === "freelancer";

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
              <ProBadge pro={proIds.has(person.id)} />
            </h3>
            <p className="text-secondary fs-7 mb-0 d-flex flex-wrap align-items-center gap-2">
              <span>@{person.username} • {ROLE_LABELS[roleToday]}</span>
              {/* Their Trust score: the average rating from completed projects (Feature 5, transparency). */}
              <TrustBadge userId={person.id} />
              {/* Whether they are taking new work (freelancers only). */}
              {isFreelancer && <AvailabilityBadge available={person.available_for_work} showAvailable className="fs-8" />}
            </p>
            {/* Their Facebook, Instagram, TikTok... pages as round logo buttons (hidden until they add some). */}
            <SocialAccountsRow links={socialLinks} labels={socialLabels} name={name} />
          </div>
          {isOwnPage ? (
            // (Your own highlight is the Portfolio box further down: HighlightsPoster.jsx.)
            <span className="text-secondary fs-8">This is how others see your profile.</span>
          ) : (
            <div className="d-flex flex-wrap gap-2 flex-shrink-0">
              {/* A freelancer's highlight: their profile as a short film (PLAN-highlights.md). */}
              {isFreelancer && (
                <HighlightsButton
                  userId={person.id}
                  username={person.username}
                  onMessage={() => openChat(person.id)}
                  onReport={(item) => setReportTarget({ type: "portfolio_item", id: item.id, name: item.title })}
                  reportOpen={Boolean(reportTarget)}
                />
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
          <p className="text-light-50 fs-7 mb-0 text-break" style={{ whiteSpace: "pre-line" }}><CensoredText text={person.description} /></p>
        </div>
      )}

      {/* The skills they saved on their own Profile (hidden until they add some). */}
      {person.skills?.length > 0 && (
        <div className="glass-card rounded-4 p-4 border border-secondary border-opacity-25 mb-4">
          <h5 className="text-white fw-bold mb-3"><i className="bi bi-tools text-orange me-2"></i> Skills</h5>
          <div className="d-flex flex-wrap gap-2">
            {person.skills.map((skill) => (
              <span key={skill} className="badge bg-secondary bg-opacity-75 text-light px-3 py-2 rounded-pill fs-7"><CensoredText text={skill} /></span>
            ))}
          </div>
        </div>
      )}

      {/* (Their links to work on other sites sit inside the Portfolio card below, under the poster: PLAN-portfolio-links-merge.md.) */}

      {/* A freelancer's services: the way to a booking is through one of them. */}
      {isFreelancer && <ServicesOffered freelancerId={person.id} />}

      <TrackRecord userId={person.id} roleToday={roleToday} />

      {(isFreelancer || portfolioCount > 0) && (
        <div className="glass-card rounded-4 p-4 border border-secondary border-opacity-25">
          {/* A freelancer's portfolio is their highlight (PLAN-highlights.md); a client's old work stays a grid. */}
          <PortfolioSection
            freelancerId={person.id}
            ownerName={person.username}
            asHighlights={isFreelancer}
            ownerDisplayName={name}
            coverPath={person.cover_path}
            portfolioLinks={person.portfolio_links}
            verifiedLinks={verifiedLinks}
          />
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
    </section>
  );
}

// The freelancer's services, each opening its own page (Service Details): the
// description is there, and so is the Book button, so a client reads it before
// booking. The database only lists the services a visitor may see (a verified
// freelancer's, not blocked). Hidden when there are none.
function ServicesOffered({ freelancerId }) {
  // null while loading.
  const [services, setServices] = useState(null);
  // What clients rated each of them, for the "★ 4.5 (2)" on its card.
  const ratings = useServiceRatings((services || []).map((s) => s.id));

  useEffect(() => {
    let active = true;

    supabase
      .from("services")
      .select(`id, title, category, price, currency, image_url, media_type, created_at, updated_at, ${SLIDES_SELECT}`)
      .eq("freelancer_id", freelancerId)
      .order("created_at", { ascending: false })
      .then(({ data }) => {
        if (active) setServices(data || []);
      });

    return () => {
      active = false;
    };
  }, [freelancerId]);

  if (!services?.length) return null;

  return (
    // (id: the highlight's "See services" button scrolls here)
    <div id="profile-services" className="glass-card rounded-4 p-4 border border-secondary border-opacity-25 mb-4">
      <h5 className="text-white fw-bold mb-3"><i className="bi bi-grid-fill text-orange me-2"></i> Services offered</h5>
      <div className="row g-3">
        {services.map((service) => (
          <div className="col-md-6" key={service.id}>
            <ServiceCard service={service} to={`/dashboard/service-details/${service.id}`} rating={ratings.get(service.id)} />
          </div>
        ))}
      </div>
    </div>
  );
}

// The person's real track record (Feature 5, Profile transparency): the
// Performance numbers and the projects marked Done. It is kept apart for the
// two roles, because the numbers mean different things (on-time delivery only
// makes sense for work done as a freelancer). The role they have today shows
// first. If they also have a record in the other role (from before accounts
// were separated, PLAN-separate-accounts.md), two tabs let the visitor see both.
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
