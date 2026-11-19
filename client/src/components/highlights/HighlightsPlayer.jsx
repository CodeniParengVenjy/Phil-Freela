import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { loadHighlight } from "../../lib/highlights";
import PortfolioViewer from "../../pages/dashboard/components/PortfolioViewer";
import { Loader } from "../Loaders";
import { startHighlights } from "./highlightsEngine";
import "./highlights.css";

// Space Mono (the film's small monospace labels) is the one font the site doesn't load already; it is
// fetched the first time a highlight opens, so other pages don't pay for it.
function loadFilmFont() {
  if (document.getElementById("hl-font")) return;
  const link = document.createElement("link");
  link.id = "hl-font";
  link.rel = "stylesheet";
  link.href = "https://fonts.googleapis.com/css2?family=Space+Mono:wght@400;700&display=swap";
  document.head.appendChild(link);
}

// The Highlights player (PLAN-highlights.md): a freelancer's highlight, full screen over the page. It loads
// their data (lib/highlights.js), then runs the film (highlightsEngine.js) in an empty box here.
//   userId      whose highlight
//   levelPick   the owner previewing another level's style (null = their real level)
//   ownerName   their @username, drawn over project files in the project viewer
//   onClose     closes the player
//   onMessage, onSeeServices, onOpenService(id): the film's buttons (the page closes the player first);
//               onMessage is left out on your own highlight, so the film has no Message button
//   onReport(item), reportOpen: the Report button of the project viewer, and whether that form is open
export default function HighlightsPlayer({ userId, levelPick = null, ownerName, onClose, onMessage, onSeeServices, onOpenService, onReport, reportOpen = false }) {
  const hostRef = useRef(null);
  const engineRef = useRef(null);
  // { data, items } once loaded, or { error }.
  const [loaded, setLoaded] = useState(null);
  // The project open in the project viewer (null = none).
  const [viewing, setViewing] = useState(null);
  // The latest buttons, so the film (started once) always calls the current ones (kept up to date after
  // every render, before the film starts).
  const actions = useRef({});
  useLayoutEffect(() => {
    actions.current = { onClose, onMessage, onSeeServices, onOpenService };
  });
  const hasMessage = Boolean(onMessage);

  // The page behind doesn't scroll while it is open; the button that opened it gets the focus back after.
  useEffect(() => {
    loadFilmFont();
    const opener = document.activeElement;
    const html = document.documentElement;
    const before = html.style.overflow;
    html.style.overflow = "hidden";
    return () => {
      html.style.overflow = before;
      if (opener && opener.focus) opener.focus({ preventScroll: true });
    };
  }, []);

  // Their data.
  useEffect(() => {
    let active = true;
    loadHighlight(userId)
      .then((result) => active && setLoaded(result))
      .catch(() => active && setLoaded({ error: "Couldn't load the highlights right now." }));
    return () => {
      active = false;
    };
  }, [userId]);

  // The film starts once the data is there and stops (music, videos and all) when the player closes.
  useEffect(() => {
    if (!loaded?.data || !hostRef.current) return undefined;
    const items = loaded.items;
    const engine = startHighlights(hostRef.current, loaded.data, {
      levelPick,
      onClose: () => actions.current.onClose?.(),
      onMessage: hasMessage ? () => actions.current.onMessage?.() : undefined,
      onSeeServices: () => actions.current.onSeeServices?.(),
      onOpenService: (id) => actions.current.onOpenService?.(id),
      onOpenProject: (id) => setViewing(items.find((item) => item.id === id) || null),
      // Read-only state for the automatic screenshot checks (only in development, with ?hltest).
      debug: import.meta.env.DEV && new URLSearchParams(window.location.search).has("hltest")
    });
    engineRef.current = engine;
    return () => {
      engine.stop();
      engineRef.current = null;
    };
  }, [loaded, levelPick, hasMessage]);

  // Escape closes it while it is still loading (once the film runs, the film handles its own keys).
  useEffect(() => {
    if (loaded?.data) return undefined;
    const handleKeyDown = (event) => {
      if (event.key === "Escape") actions.current.onClose?.();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [loaded]);

  // The project viewer closed: the film carries on. (While the Report form is open on top, Escape closes only that form.)
  const closeViewer = () => {
    if (reportOpen) return;
    setViewing(null);
    engineRef.current?.viewerClosed();
  };

  return createPortal(
    <>
      <div ref={hostRef} />
      {!loaded?.data && (
        <div className="hl-loading" role="status">
          {loaded?.error ? (
            <>
              <p className="mb-0">{loaded.error}</p>
              <button type="button" className="btn btn-outline-light rounded-pill px-4" onClick={onClose}>Close</button>
            </>
          ) : (
            <Loader size="lg" label="Loading highlights" />
          )}
        </div>
      )}
      <PortfolioViewer item={viewing} ownerName={ownerName} onReport={onReport} onClose={closeViewer} />
    </>,
    document.body
  );
}
