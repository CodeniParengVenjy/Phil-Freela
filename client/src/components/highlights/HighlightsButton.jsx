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

// The "Watch highlights" button on a freelancer's profile (PLAN-highlights.md, Step 3), and the player it opens.
// On your own profile it reads "Preview my highlights", with a level switch only you see: visitors always get
// your real level, but you can try how the other levels' styles look (handy for a demo).
//   userId, username  whose highlight (username: drawn over project files in the project viewer)
//   isOwn             your own profile
//   onMessage         opens the chat with them (visitors only)
//   onReport(item), reportOpen: Report on a project in the project viewer, and whether that form is open
export default function HighlightsButton({ userId, username, isOwn = false, onMessage, onReport, reportOpen = false, className = "" }) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  // Owner only: "" = their real level, else the level whose style to preview.
  const [levelPick, setLevelPick] = useState("");
  const close = () => setOpen(false);

  return (
    <>
      <div className={`d-inline-flex flex-wrap align-items-center gap-2 ${className}`}>
        <button type="button" className="btn btn-outline-role rounded-pill px-3 fw-bold" onClick={() => setOpen(true)}>
          <i className="bi bi-play-circle-fill me-1"></i> {isOwn ? "Preview my highlights" : "Watch highlights"}
        </button>
        {isOwn && (
          <select
            className="form-select form-select-sm rounded-pill w-auto"
            aria-label="Preview another level's style"
            title="Visitors always see your real level"
            value={levelPick}
            onChange={(event) => setLevelPick(event.target.value)}
          >
            <option value="">My real level</option>
            <option value="beginner">Beginner style</option>
            <option value="average">Average style</option>
            <option value="intermediate">Intermediate style</option>
            <option value="advanced">Advanced style</option>
          </select>
        )}
      </div>
      {open && (
        <Suspense fallback={<Downloading />}>
        <HighlightsPlayer
          userId={userId}
          levelPick={levelPick || null}
          ownerName={username}
          onClose={close}
          // The film's buttons: each closes the player first.
          onMessage={isOwn || !onMessage ? undefined : () => { close(); onMessage(); }}
          onOpenService={(id) => { close(); navigate(`/dashboard/service-details/${id}`); }}
          onSeeServices={() => {
            close();
            if (isOwn) navigate("/dashboard/services");
            else document.getElementById("profile-services")?.scrollIntoView({ behavior: "smooth", block: "start" });
          }}
          onReport={isOwn ? undefined : onReport}
          reportOpen={reportOpen}
        />
        </Suspense>
      )}
    </>
  );
}
