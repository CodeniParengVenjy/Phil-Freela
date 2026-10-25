import FindJobsView from "./FindJobsView";

// "FYP for Freelancer" -- the freelancer's dashboard home. One list of client
// job openings with the jobs picked by the Hybrid recommendation system
// ("Recommended for you") merged in at the top, marked with why they were
// picked. Reuses FindJobsView's job_posts fetch/search logic (the plain list
// is still at /dashboard/find-jobs) instead of a second copy of the same query.
export default function FreelancerFYPView() {
  return <FindJobsView withRecommendations />;
}
