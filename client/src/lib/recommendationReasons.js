// The reasons the AI service gives for a recommendation, in words (freelancers
// see jobs, clients see services). Shared by "Recommended for you" on the
// client dashboard and the freelancer dashboard's job list.
export const REASONS = {
  match: { icon: "bi-stars", jobs: "Matches your work", services: "Matches what you need" },
  similar_users: { icon: "bi-people-fill", jobs: "Freelancers like you applied", services: "Clients like you contacted them" },
  // The owner's record from completed projects (Feature 5), used by the ranking.
  rated: { icon: "bi-star-fill", text: "Highly rated" },
  experienced: { icon: "bi-trophy-fill", text: "5+ projects done" },
  verified: { icon: "bi-patch-check-fill", text: "Verified" },
  fast_reply: { icon: "bi-lightning-charge-fill", text: "Replies within an hour" },
  new: { icon: "bi-clock-fill", text: "New" }
};
