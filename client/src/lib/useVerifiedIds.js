import { useEffect, useState } from "react";
import { fetchVerifiedIds } from "./verification";

// The verified users among userIds, as a Set of ids, for showing the Verified
// check next to names. Asks the database again only when the list of users
// on the page changes.
export function useVerifiedIds(userIds) {
  const key = [...new Set(userIds.filter(Boolean))].sort().join(",");
  const [verifiedIds, setVerifiedIds] = useState(() => new Set());

  useEffect(() => {
    if (!key) return undefined;
    let active = true;
    fetchVerifiedIds(key.split(",")).then((ids) => {
      if (active) setVerifiedIds(ids);
    });
    return () => {
      active = false;
    };
  }, [key]);

  return verifiedIds;
}
