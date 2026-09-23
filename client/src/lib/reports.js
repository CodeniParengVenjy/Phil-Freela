// The reasons a user can pick when reporting something. The values match the
// check on the reports table (database), so do not rename them.
export const reportReasons = [
  { value: "spam", label: "Spam" },
  { value: "scam", label: "Scam / Fraud" },
  { value: "inappropriate", label: "Inappropriate content" },
  { value: "harassment", label: "Harassment" },
  { value: "fake_profile", label: "Fake profile" },
  { value: "other", label: "Other" }
];

export function reportReasonLabel(value) {
  return reportReasons.find((r) => r.value === value)?.label || value;
}

// What was reported, in words (used on the admin Reports page).
export const reportTargetLabels = {
  user: "User",
  service: "Service",
  job_post: "Job Post"
};
