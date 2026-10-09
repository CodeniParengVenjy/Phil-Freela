import RecommendedForYou from "../components/RecommendedForYou";

// "FYP for Freelancer" -- reachable from the top navbar's "Join as
// Freelancer" button. The dashboard is the jobs recommended by the Hybrid
// recommendation system ("Recommended for you"); the full client job feed
// is still at /dashboard/find-jobs, from the banner's "Find Jobs" button.
export default function FreelancerFYPView() {
  return <RecommendedForYou showEmpty />;
}
