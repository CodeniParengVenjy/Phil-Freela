import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { fetchLatestVerification } from "../../../lib/verification";

// How each status looks on the card, and what the button says.
const STATUS_INFO = {
  none: { text: "Not verified", className: "text-secondary", icon: "bi-shield-exclamation", button: "Verify now" },
  pending: { text: "Waiting for review", className: "text-warning", icon: "bi-hourglass-split", button: "View status" },
  approved: { text: "Verified", className: "text-success", icon: "bi-patch-check-fill", button: null },
  rejected: { text: "Not approved", className: "text-danger", icon: "bi-x-circle-fill", button: "Try again" }
};

// Small card at the top of Settings → Profile Settings showing the user's
// identity verification status, with a button to the Verify Identity page.
export default function VerificationStatusCard({ userId }) {
  // undefined = still loading.
  const [status, setStatus] = useState(undefined);

  useEffect(() => {
    if (!userId) return;
    let active = true;

    fetchLatestVerification(userId).then(({ data }) => {
      if (active) setStatus(data?.status ?? "none");
    });

    return () => {
      active = false;
    };
  }, [userId]);

  const info = STATUS_INFO[status];

  return (
    <div className="bg-dark bg-opacity-50 p-3 rounded-3 border border-secondary border-opacity-25 d-flex align-items-center justify-content-between gap-3 flex-wrap mb-4">
      <div>
        <p className="text-white fw-bold fs-7 mb-1"><i className="bi bi-person-vcard me-2 text-info"></i>Identity verification</p>
        {info ? (
          <p className={`fs-7 fw-semibold mb-0 ${info.className}`}><i className={`bi ${info.icon} me-1`}></i>{info.text}</p>
        ) : (
          <p className="text-secondary fs-7 mb-0">Loading...</p>
        )}
      </div>
      {info?.button && (
        <Link to="/dashboard/verify-identity" className="btn btn-gradient-role rounded-pill px-4 fw-bold text-white">
          {info.button}
        </Link>
      )}
    </div>
  );
}
