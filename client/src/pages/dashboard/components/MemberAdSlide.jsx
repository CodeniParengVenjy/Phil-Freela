import { Link } from "react-router-dom";
import CensoredText from "../../../components/CensoredText";
import ProBadge from "../../../components/ProBadge";
import VerifiedBadge from "../../../components/VerifiedBadge";
import "../memberAds.css";

// One member's ad (PLAN-community-billboard.md): the picture if it has one, "Ad by
// <name>" with the Verified and Premium badges, the headline, the message and the
// button that opens the poster's own offer, job post or profile. Used by the strip
// on the dashboard home (DashboardMemberAds) and by the preview on the Advertise
// page (small, and the button is only drawn, not pressable).
//   ad:      { title, message }
//   owner:   { name, verified, premium }
//   button:  { to, label } or null
export default function MemberAdSlide({ ad, owner, pictureUrl, button, small = false, previewOnly = false }) {
  const buttonClass = `btn ${small ? "btn-sm" : ""} btn-gradient-role rounded-pill ${small ? "px-3" : "px-4"} fw-bold text-white flex-shrink-0`;
  return (
    <div className="d-flex flex-column flex-md-row align-items-md-stretch">
      {pictureUrl && <img src={pictureUrl} alt="" className={small ? "member-ad-pic-sm" : "member-ad-pic"} />}
      <div className={`${small ? "p-3" : "px-3 py-3 p-md-4"} d-flex flex-column flex-md-row align-items-md-center gap-3 flex-grow-1`}>
        <div className="flex-grow-1 min-w-0">
          <span className="badge rounded-pill bg-role-subtle text-role fw-semibold mb-2 text-wrap text-start">
            <i className="bi bi-megaphone me-1"></i> Ad by {owner.name}
            <VerifiedBadge verified={owner.verified} />
            <ProBadge pro={owner.premium} />
          </span>
          <h2 className={`${small ? "h6" : "h5"} text-white fw-bold mb-1 text-break`}><CensoredText text={ad.title} /></h2>
          {ad.message && (
            <p className={`text-secondary ${small ? "fs-8" : "fs-7"} mb-0 text-break`} style={{ whiteSpace: "pre-line" }}>
              <CensoredText text={ad.message} />
            </p>
          )}
        </div>
        {button && (previewOnly ? (
          <span className={buttonClass}>{button.label} <i className="bi bi-arrow-right ms-1"></i></span>
        ) : (
          <Link to={button.to} className={buttonClass}>{button.label} <i className="bi bi-arrow-right ms-1"></i></Link>
        ))}
      </div>
    </div>
  );
}
