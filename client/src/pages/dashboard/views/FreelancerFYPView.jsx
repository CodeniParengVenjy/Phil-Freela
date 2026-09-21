import MessagesView from "./MessagesView";

// "FYP for Freelancer" -- reachable from the top navbar's "Join as
// Freelancer" button. Shows the client job feed. Reuses MessagesView's
// job_posts fetch/search/chat logic (already correct, still reachable at
// /dashboard/messages via the sidebar's "Find Jobs" link) instead of a
// second copy of the same query.
export default function FreelancerFYPView() {
  return <MessagesView />;
}
