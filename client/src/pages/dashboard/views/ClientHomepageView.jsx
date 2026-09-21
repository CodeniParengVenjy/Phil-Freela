import BrowseServicesView from "./BrowseServicesView";

// "Homepage for Client" -- reachable from the top navbar's "Become a
// Client" button. Shows the freelancer services marketplace. Reuses
// BrowseServicesView's services fetch/filter/chat logic (already correct,
// still what a client sees by default on /dashboard) instead of a second
// copy of the same query.
export default function ClientHomepageView() {
  return <BrowseServicesView />;
}
