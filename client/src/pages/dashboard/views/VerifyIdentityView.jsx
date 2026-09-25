import { Link } from "react-router-dom";
import IdentityVerification from "../components/IdentityVerification";

// Its own page (opened from the card in Settings → Profile Settings), so the
// step-by-step form has room: ID type, front, back, selfie, consent.
export default function VerifyIdentityView() {
  return (
    <section className="dashboard-view active-view">
      <div className="glass-card rounded-4 p-4 p-md-5 border border-secondary border-opacity-25 mx-auto" style={{ maxWidth: 820 }}>
        <Link to="/dashboard/settings" className="text-secondary fs-7 text-decoration-none hover-role">
          <i className="bi bi-arrow-left me-1"></i> Back to Settings
        </Link>
        <h3 className="text-white fw-bold mt-3 mb-4">
          <i className="bi bi-shield-check text-success me-2"></i> Verify Your Identity
        </h3>
        <IdentityVerification />
      </div>
    </section>
  );
}
