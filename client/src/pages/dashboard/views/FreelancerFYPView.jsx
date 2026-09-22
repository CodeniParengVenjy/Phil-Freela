import FindJobsView from "./FindJobsView";

// "FYP for Freelancer" -- reachable from the top navbar's "Join as
// Freelancer" button. Shows the client job feed. Reuses FindJobsView's
// job_posts fetch/search/chat logic (already correct, still reachable at
// /dashboard/find-jobs via the banner's "Find Jobs" button) instead of a
// second copy of the same query.
export default function FreelancerFYPView() {
  return <FindJobsView />;
}
