import { lazy, Suspense, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Loader } from "../Loaders";

// The player (with its film and styles) is only downloaded the first time someone opens a highlight.
const HighlightsPlayer = lazy(() => import("./HighlightsPlayer"));

// A dark screen while the player itself downloads (its own styles aren't there yet, so plain Bootstrap ones).
function Downloading() {
  return (
    <div className="position-fixed top-0 start-0 w-100 h-100 d-grid text-light" style={{ placeItems: "center", zIndex: 1080, background: "#05060a" }} role="status">
      <Loader size="lg" label="Loading highlights" />
    </div>
  );
}

// The player with the site's own actions wired in, used by the button below and by the Portfolio's poster
// (HighlightsPoster.jsx). Each of the film's buttons closes the player first:
//   Message opens the chat, a service card opens that offer's page (where Book is), See services goes to the
//   services (visitors: the list further down the profile; you: your own Services page).
//   userId, username  whose highlight (username: drawn over project files in the project viewer)
//   isOwn             your own highlight (no Message button, no Report)
//   levelPick         the owner previewing another level's style (null = the real level)
//   stylePick         the owner previewing a highlight style (null = the style visitors see)
//   onMessage, onReport(item), reportOpen: chat, Report on a project, and whether that form is open
export function HighlightsOverlay({ userId, username, isOwn = false, levelPick = null, stylePick = null, onMessage, onReport, reportOpen = false, onClose }) {
  const navigate = useNavigate();
  return (
    <Suspense fallback={<Downloading />}>
      <HighlightsPlayer
        userId={userId}
        levelPick={levelPick}
        stylePick={stylePick}
        ownerName={username}
        onClose={onClose}
        onMessage={isOwn || !onMessage ? undefined : () => { onClose(); onMessage(); }}
        onOpenService={(id) => { onClose(); navigate(`/dashboard/service-details/${id}`); }}
        onSeeServices={() => {
          onClose();
          if (isOwn) navigate("/dashboard/services");
          else document.getElementById("profile-services")?.scrollIntoView({ behavior: "smooth", block: "start" });
        }}
        onReport={isOwn ? undefined : onReport}
        reportOpen={reportOpen}
      />
    </Suspense>
  );
}

// The owner's level switch: visitors always get the real level, but you can try how the other levels'
// styles look (handy for a demo).
export function LevelSwitch({ value, onChange, className = "" }) {
  return (
    <select
      className={`form-select form-select-sm rounded-pill w-auto ${className}`}
      aria-label="Preview another level's style"
      title="Visitors always see your real level"
      value={value}
      onChange={(event) => onChange(event.target.value)}
    >
      <option value="">My real level</option>
      <option value="beginner">Beginner style</option>
      <option value="average">Average style</option>
      <option value="intermediate">Intermediate style</option>
      <option value="advanced">Advanced style</option>
    </select>
  );
}

// The "Watch highlights" button next to Message on a freelancer's profile (PLAN-highlights.md, Step 3), and the
// player it opens. (On your own profile the highlight is the Portfolio box itself: HighlightsPoster.jsx.)
export default function HighlightsButton({ userId, username, isOwn = false, onMessage, onReport, reportOpen = false, className = "" }) {
  const [open, setOpen] = useState(false);
  // Owner only: "" = their real level, else the level whose style to preview.
  const [levelPick, setLevelPick] = useState("");

  return (
    <>
      <div className={`d-inline-flex flex-wrap align-items-center gap-2 ${className}`}>
        <button type="button" className="btn btn-outline-role rounded-pill px-3 fw-bold" onClick={() => setOpen(true)}>
          <i className="bi bi-play-circle-fill me-1"></i> {isOwn ? "Preview my highlights" : "Watch highlights"}
        </button>
        {isOwn && <LevelSwitch value={levelPick} onChange={setLevelPick} />}
      </div>
      {open && (
        <HighlightsOverlay
          userId={userId}
          username={username}
          isOwn={isOwn}
          levelPick={levelPick || null}
          onMessage={onMessage}
          onReport={onReport}
          reportOpen={reportOpen}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}
