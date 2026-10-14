import { useEffect, useState } from "react";
import { fetchServiceRatings } from "./serviceReviews";

// The ratings of the offers in serviceIds, as a Map of offer id -> { count,
// average }, for showing "★ 4.5 (2)" on their cards. An offer with no ratings
// isn't in it. Asks the database again only when the list of offers on the page
// changes (like useVerifiedIds does for the Verified check).
export function useServiceRatings(serviceIds) {
  const key = [...new Set(serviceIds.filter(Boolean))].sort().join(",");
  const [ratings, setRatings] = useState(() => new Map());

  useEffect(() => {
    if (!key) return undefined;
    let active = true;
    fetchServiceRatings(key.split(",")).then((found) => {
      if (active) setRatings(found);
    });
    return () => {
      active = false;
    };
  }, [key]);

  return ratings;
}
