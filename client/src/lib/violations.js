// The penalty chart. The admin only picks which rule was broken; this decides
// how long the suspension lasts and what it blocks, so every user who breaks
// the same rule gets the same penalty. The values match the reasons users pick
// when reporting (lib/reports.js) and the check on the user_suspensions table
// (database), so do not rename them.
export const violations = [
  { value: "spam", label: "Spam", days: 3, blocksPosting: true, blocksMessaging: false },
  { value: "inappropriate", label: "Inappropriate content", days: 7, blocksPosting: true, blocksMessaging: false },
  { value: "harassment", label: "Harassment", days: 14, blocksPosting: false, blocksMessaging: true },
  // Posting someone else's work as their own (PLAN-stolen-work.md).
  { value: "stolen_work", label: "Stolen work", days: 14, blocksPosting: true, blocksMessaging: false },
  { value: "scam", label: "Scam / Fraud", days: 30, blocksPosting: true, blocksMessaging: true },
  // Ban only: a suspension can't fix a fake account.
  { value: "fake_profile", label: "Fake profile", banOnly: true },
  // The admin explains it and picks the length and what's blocked.
  { value: "other", label: "Other" }
];

// Lengths the admin can pick for "Other".
export const otherLengths = [3, 7, 14, 30];

// What the Suspend / Ban pop-up starts with.
export const emptyViolationFields = { violation: "", note: "", days: 7, blocksPosting: true, blocksMessaging: true };

export function getViolation(value) {
  return violations.find((v) => v.value === value);
}

// Turns the admin's choices into what gets saved: the reason shown to the
// user, when it ends (null = ban), and what it blocks. Returns null while the
// form isn't complete yet ("Other" needs an explanation and something blocked).
export function buildPenalty(kind, fields) {
  const violation = getViolation(fields.violation);
  if (!violation) return null;

  const note = fields.note.trim();
  if (violation.value === "other" && !note) return null;
  const reason = note ? `${violation.label}: ${note}` : violation.label;

  // A ban blocks everything and has no end date.
  if (kind === "ban") {
    return { violation: violation.value, reason, days: null, endsAt: null, blocksPosting: true, blocksMessaging: true };
  }

  const isOther = violation.value === "other";
  const days = isOther ? fields.days : violation.days;
  const blocksPosting = isOther ? fields.blocksPosting : violation.blocksPosting;
  const blocksMessaging = isOther ? fields.blocksMessaging : violation.blocksMessaging;
  if (!blocksPosting && !blocksMessaging) return null;

  const endsAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
  return { violation: violation.value, reason, days, endsAt, blocksPosting, blocksMessaging };
}
