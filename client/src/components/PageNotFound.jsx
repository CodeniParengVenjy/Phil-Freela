import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

const STORAGE_KEY = "reloadedForMissingPage";

// True if this tab already reloaded once for this page. If the browser blocks
// storage, it counts as "already tried" so the page can never reload in a loop.
function alreadyReloadedFor(path) {
  try {
    return sessionStorage.getItem(STORAGE_KEY) === path;
  } catch {
    return true;
  }
}

// Shown for a page this version of the site doesn't have. Usually that means
// the site was updated while this tab was open, so the tab still runs the old
// version (e.g. it doesn't know /appeal yet). It reloads once to get the
// newest version; if the page still doesn't exist after that, it says so.
export default function PageNotFound() {
  const path = window.location.pathname;
  const [tried] = useState(() => alreadyReloadedFor(path));

  useEffect(() => {
    if (tried) return;
    try {
      sessionStorage.setItem(STORAGE_KEY, path);
    } catch {
      return;
    }
    window.location.reload();
  }, [tried, path]);

  if (!tried) return null;

  return (
    <div className="d-flex flex-column align-items-center justify-content-center text-center text-white py-5">
      <i className="bi bi-signpost-split fs-1 text-warning mb-3"></i>
      <h1 className="h4 fw-bold mb-2">Page not found</h1>
      <p className="text-secondary fs-7 mb-3">This page doesn't exist or was moved.</p>
      <Link to="/" className="btn btn-outline-light rounded-pill px-4">Go to the homepage</Link>
    </div>
  );
}
