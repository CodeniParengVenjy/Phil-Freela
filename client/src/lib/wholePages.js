import { useEffect, useState } from "react";
import { supabase } from "./supabaseClient";
import { slideUrl } from "./slides";

// A PDF's pages as an admin should see them: the WHOLE pages from the private
// bucket (links that last an hour), because the public pages are blurred below
// the top of the document (document previews, step B5). A PDF saved before that
// has no private copy, and its public pages are whole, so they are the fallback.
// paths: page paths from slidePagePaths (lib/slides.js). Returns a function that
// gives the link of one of them, or null while the links are being made.
export function useWholePages(paths) {
  const key = paths.join("|");
  const [links, setLinks] = useState(null);
  useEffect(() => {
    if (!key) return undefined;
    let active = true;
    supabase.storage.from("slide-private").createSignedUrls(key.split("|"), 60 * 60).then(({ data }) => {
      if (active) setLinks(Object.fromEntries((data || []).filter((item) => item.signedUrl).map((item) => [item.path, item.signedUrl])));
    });
    return () => {
      active = false;
    };
  }, [key]);
  if (!key) return () => null;
  return (path) => (links === null ? null : links[path] || slideUrl(path));
}
