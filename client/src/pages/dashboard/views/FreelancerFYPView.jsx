import FindJobsView from "./FindJobsView";
import RecommendedForYou from "../components/RecommendedForYou";

// "FYP for Freelancer" -- reachable from the top navbar's "Join as
// Freelancer" button. Jobs recommended by the Hybrid recommendation system
// ("Recommended for you") come first, then the client job feed. Reuses
// FindJobsView's job_posts fetch/search/chat logic (already correct, still
// reachable at /dashboard/find-jobs via the banner's "Find Jobs" button)
// instead of a second copy of the same query.
export default function FreelancerFYPView() {
  return (
    <>
      <RecommendedForYou />
      <FindJobsView />
    </>
  );
}
