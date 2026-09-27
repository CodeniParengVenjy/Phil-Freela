import { formatEndDate, restrictionText, suspensionStatus } from "../../../lib/suspensions";

// Shown at the top of every dashboard page while the user is suspended: what
// they can't do, until when, and why. (Banned users can't log in at all.)
export default function SuspensionBanner({ suspension }) {
  if (suspensionStatus(suspension) !== "suspended") return null;

  return (
    <div className="glass-card rounded-4 p-3 mb-4 border border-warning border-opacity-50 d-flex align-items-start gap-3" role="alert">
      <i className="bi bi-exclamation-triangle-fill text-warning fs-4"></i>
      <div>
        <p className="text-white fw-bold mb-1">
          Your account is suspended until {formatEndDate(suspension.ends_at)}.
        </p>
        <p className="text-secondary fs-7 mb-0">
          Until then you {restrictionText(suspension.blocks_posting, suspension.blocks_messaging)}. Reason: {suspension.reason}
        </p>
      </div>
    </div>
  );
}
