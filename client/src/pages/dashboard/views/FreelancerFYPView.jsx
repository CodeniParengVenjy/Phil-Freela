import FindJobsView from "./FindJobsView";

// "FYP for Freelancer" -- reachable from the top navbar's "Join as
// Freelancer" button. One list of client job openings with the jobs picked by
// the Hybrid recommendation system ("Recommended for you") merged in at the
// top, marked with why they were picked. Reuses FindJobsView's job_posts
// fetch/search/chat logic (still reachable as the plain list at
// /dashboard/find-jobs via the banner's "Find Jobs" button) instead of a
// second copy of the same query.
export default function FreelancerFYPView() {
  return <FindJobsView withRecommendations />;
}
