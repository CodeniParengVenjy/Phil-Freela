import { formatEndDate } from "../../../lib/suspensions";

// Shown in place of a form the user can't use while suspended, e.g.
// what = "post services". The database blocks it too; this just explains why.
export default function BlockedNotice({ suspension, what, compact = false }) {
  if (compact) {
    return (
      <p className="text-warning fs-7 mb-0 text-center">
        <i className="bi bi-slash-circle me-1"></i>
        You can't {what} until {formatEndDate(suspension.ends_at)} because your account is suspended.
      </p>
    );
  }

  return (
    <div className="text-center py-4">
      <i className="bi bi-slash-circle text-warning fs-1"></i>
      <h5 className="text-white fw-bold mt-3 mb-2">You can't {what} right now</h5>
      <p className="text-secondary fs-7 mb-0">
        Your account is suspended until {formatEndDate(suspension.ends_at)}. Reason: {suspension.reason}
      </p>
    </div>
  );
}
