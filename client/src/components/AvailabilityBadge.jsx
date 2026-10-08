// Says whether a freelancer is taking new work (the "Available for work"
// switch in Settings > Profile Settings). When they switched it off, a grey
// "Not available right now" label shows wherever this is used. With
// showAvailable (their profile page), an available freelancer gets a green
// "Available for work" label too; service cards leave that out, since it is
// the usual case. "available" is the profile's available_for_work value.
export default function AvailabilityBadge({ available, showAvailable = false, className = "" }) {
  if (available === false) {
    return (
      <span
        className={`badge rounded-pill bg-secondary bg-opacity-50 text-white fw-semibold ${className}`}
        title="This freelancer isn't taking new bookings right now. You can still message them."
      >
        Not available right now
      </span>
    );
  }
  if (!showAvailable || available !== true) return null;
  return (
    <span className={`badge rounded-pill bg-success bg-opacity-25 text-success fw-normal ${className}`} title="This freelancer is taking new bookings">
      Available for work
    </span>
  );
}
