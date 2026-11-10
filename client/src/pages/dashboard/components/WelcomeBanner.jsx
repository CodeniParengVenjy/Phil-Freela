import { useEffect, useState } from "react";
import { useWelcomeRoles } from "../hooks/useWelcomeRoles";

// How long each job name stays before the next one (when there are 2 or more).
const SWITCH_MS = 4000;

// The banner at the top of the dashboard home, for both roles: "Welcome, Ana"
// as the heading, and the person's title in the small gray line under it (the
// user, 2026-11-10: the title goes in the gray line, not too big):
//   freelancer:   "A skillful Video Editor"
//   client:       "A thoughtful client looking for a Video Editor"
//   no job name:  no gray line
// With two or more job names the gray line shows them one after another.
// userId: the person's id, to look up their job names (leave it out and the
// banner only says "Welcome, Name"). isClient: read a client's open job posts
// instead of a freelancer's services and hires.
export default function WelcomeBanner({ displayName, userId = null, isClient = false }) {
  const picks = useWelcomeRoles(userId, isClient);
  const [shown, setShown] = useState(0);

  useEffect(() => {
    if (picks.length < 2) return undefined;
    const timer = setInterval(() => setShown((n) => (n + 1) % picks.length), SWITCH_MS);
    return () => clearInterval(timer);
  }, [picks]);

  const index = picks.length ? shown % picks.length : 0;

  return (
    <div className="welcome-banner glass-card p-3 p-md-4 rounded-4 mb-3 mb-md-4 border border-secondary border-opacity-25 d-flex flex-column flex-md-row align-items-md-center justify-content-between gap-2 gap-md-3">
      <div>
        {/* The tag is left out on a phone, so the cards below come into view sooner. */}
        <span className="badge bg-orange-subtle text-orange px-3 py-1 rounded-pill fw-bold text-uppercase fs-8 mb-2 d-none d-md-inline-block">PHILFREELA PORTAL</span>
        <h1 className="welcome-title h2 text-white mb-1">Welcome, {displayName}</h1>
        {/* welcome-stack: every title sits in the same spot, one on top of the other,
            and only the current one is visible. The banner keeps the height of the
            longest one, so the cards below don't move when the title changes. */}
        {picks.length > 0 && (
          <div className="welcome-stack">
            {picks.map((pick, i) => (
              // welcome-role fades the title in when it becomes the current one.
              <p key={i} className={`welcome-subtitle text-secondary mb-0 ${i === index ? "welcome-role" : "welcome-hidden"}`} aria-hidden={i !== index}>
                {capitalize(pick.phrase)}
              </p>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// "a skillful Video Editor" -> "A skillful Video Editor" (it starts the line now).
function capitalize(text) {
  return text.charAt(0).toUpperCase() + text.slice(1);
}
