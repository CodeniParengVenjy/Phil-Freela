// The small blue check next to a verified user's name: an admin approved
// their identity verification. With showUnverified, users who aren't
// verified get a grey "Not verified" label instead (used for clients on job
// posts, so freelancers know who they're dealing with).
export default function VerifiedBadge({ verified, showUnverified = false }) {
  if (verified) {
    return (
      <i
        className="bi bi-patch-check-fill ms-1"
        style={{ color: "#1d9bf0" }}
        title="Identity verified"
        role="img"
        aria-label="Identity verified"
      ></i>
    );
  }
  if (!showUnverified) return null;
  return (
    <span
      className="badge rounded-pill bg-secondary bg-opacity-25 text-secondary fw-normal ms-1"
      title="This user hasn't verified their identity yet"
    >
      Not verified
    </span>
  );
}
