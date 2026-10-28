import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useVerifiedIds } from "../../../lib/useVerifiedIds";
import { adButton, adImageUrl, useRunningAds } from "../../../lib/memberAds";
import { useProIds } from "../../../lib/pro";
import MemberAdSlide from "./MemberAdSlide";
import "../memberAds.css";

// How long each ad shows before the next one, like the Billboard above it.
const TURN_MS = 8000;

// The Community Billboard on the dashboard home, under the Billboard (PLAN-community-
// billboard.md): ads that members paid for, each tagged "Ad by <name>". The database
// only sends the ones that are running and meant for this person, so an ad
// disappears by itself after its last day. With none running nothing is drawn.
export default function DashboardMemberAds() {
  const ads = useRunningAds();
  const verifiedIds = useVerifiedIds(ads.map((ad) => ad.owner_id));
  const proIds = useProIds();
  const [index, setIndex] = useState(0);
  // Pointing at an ad (or tabbing into it) holds it still, so there is time to read it.
  const [paused, setPaused] = useState(false);

  // Several ads take turns. People who asked their device for less motion keep the
  // first one and use the dots instead.
  useEffect(() => {
    if (ads.length < 2 || paused) return undefined;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return undefined;
    const timer = setInterval(() => setIndex((current) => (current + 1) % ads.length), TURN_MS);
    return () => clearInterval(timer);
  }, [ads.length, paused]);

  if (ads.length === 0) return null;
  const ad = ads[index % ads.length];

  return (
    <section
      data-tour="community-billboard"
      className="community-billboard glass-card rounded-4 mb-3 mb-md-4 border border-secondary border-opacity-25 overflow-hidden"
      aria-label="Community Billboard"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      <div className="d-flex align-items-center justify-content-between gap-2 px-3 pt-2 pb-1">
        <span className="text-white-50 fs-8 fw-semibold text-uppercase" style={{ letterSpacing: "0.06em" }}>
          <i className="bi bi-people-fill text-role me-1"></i> Community Billboard
        </span>
        <Link to="/dashboard/advertise" className="text-role fs-8 fw-semibold text-decoration-none">
          Advertise here <i className="bi bi-arrow-right"></i>
        </Link>
      </div>

      {/* The key makes each ad fade in when it takes its turn. */}
      <div className="dashboard-billboard-slide" key={ad.id}>
        <MemberAdSlide
          ad={ad}
          owner={{ name: ad.owner?.full_name || "a member", verified: verifiedIds.has(ad.owner_id), premium: proIds.has(ad.owner_id) }}
          pictureUrl={adImageUrl(ad.image_path)}
          button={adButton(ad)}
        />
      </div>

      {ads.length > 1 && (
        <div className="dashboard-billboard-dots">
          {ads.map((item, position) => (
            <button
              key={item.id}
              type="button"
              className={`dashboard-billboard-dot${position === index ? " is-current" : ""}`}
              aria-label={`Show ad ${position + 1} of ${ads.length}`}
              aria-current={position === index}
              onClick={() => setIndex(position)}
            ></button>
          ))}
        </div>
      )}
    </section>
  );
}
