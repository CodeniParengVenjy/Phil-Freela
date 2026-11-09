import { useEffect, useMemo, useState } from "react";
import { fetchVerifiedIds } from "./verification";

// The verified users among userIds, as a Set of ids, for showing the Verified
// check next to names. Asks the database again only when the list of users
// on the page changes.
// The Set also has `ready`: false until the answer for the users on the page
// now has come back. Pages show the grey "Not verified" label only when it is
// true, so a verified person never looks unverified while the page loads
// (found in the live test, 2026-11-09).
export function useVerifiedIds(userIds) {
  const key = [...new Set(userIds.filter(Boolean))].sort().join(",");
  // The verified ids, and the list of users they were looked up for.
  const [found, setFound] = useState(() => ({ key: "", ids: new Set() }));

  useEffect(() => {
    if (!key) return undefined;
    let active = true;
    fetchVerifiedIds(key.split(",")).then((ids) => {
      if (active) setFound({ key, ids });
    });
    return () => {
      active = false;
    };
  }, [key]);

  return useMemo(() => Object.assign(new Set(found.ids), { ready: !key || found.key === key }), [found, key]);
}
