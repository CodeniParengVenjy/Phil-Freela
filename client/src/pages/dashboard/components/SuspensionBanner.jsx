import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { formatEndDate, restrictionText, suspensionStatus } from "../../../lib/suspensions";
import { getAppealFor } from "../../../lib/appeals";

// Button text on the banner, by what happened to the user's appeal.
const appealButtonText = {
  none: "Appeal",
  pending: "Appeal pending",
  rejected: "View appeal"
};

// Shown at the top of every dashboard page while the user is suspended: what
// they can't do, until when, and why, with a button to the appeal page.
// (Banned users can't use the dashboard; they're sent to the appeal page.)
export default function SuspensionBanner({ suspension }) {
  const suspended = suspensionStatus(suspension) === "suspended";
  // "none", "pending" or "rejected", once loaded.
  const [appealState, setAppealState] = useState("none");

  useEffect(() => {
    if (!suspended) return undefined;
    let active = true;
    getAppealFor(suspension).then((appeal) => {
      if (active) setAppealState(appeal ? appeal.status : "none");
    });
    return () => { active = false; };
  }, [suspended, suspension]);

  if (!suspended) return null;

  return (
    <div className="glass-card rounded-4 p-3 mb-4 border border-warning border-opacity-50 d-flex flex-wrap align-items-center gap-3" role="alert">
      <i className="bi bi-exclamation-triangle-fill text-warning fs-4"></i>
      <div className="flex-grow-1" style={{ minWidth: 220 }}>
        <p className="text-white fw-bold mb-1">
          Your account is suspended until {formatEndDate(suspension.ends_at)}.
        </p>
        <p className="text-secondary fs-7 mb-0">
          Until then you {restrictionText(suspension.blocks_posting, suspension.blocks_messaging)}. Reason: {suspension.reason}
        </p>
      </div>
      <Link to="/appeal" className="btn btn-outline-warning btn-sm rounded-pill px-3 fw-bold">
        <i className="bi bi-envelope-paper me-1"></i> {appealButtonText[appealState] || "View appeal"}
      </Link>
    </div>
  );
}
