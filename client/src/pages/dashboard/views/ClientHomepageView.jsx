import BrowseServicesView from "./BrowseServicesView";

// "Homepage for Client" -- the client's dashboard home. One list of freelancer
// services with the services picked by the Hybrid recommendation system
// ("Recommended for you") merged in at the top, marked with why they were
// picked. Reuses BrowseServicesView's services fetch/filter logic (still what
// the admin panel's Browse Services shows as the plain list) instead of a
// second copy of the same query.
export default function ClientHomepageView() {
  return <BrowseServicesView withRecommendations />;
}
