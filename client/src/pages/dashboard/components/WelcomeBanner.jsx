import { useEffect, useState } from "react";
import { article } from "../../../lib/welcomeTitles";
import { useWelcomeRoles } from "../hooks/useWelcomeRoles";

// How long each job name stays before the next one (when there are 2 or more).
const SWITCH_MS = 4000;

// The banner at the top of the dashboard home, for both roles:
//   no job name:  "Welcome, Ana"
//   a job name:   "Welcome, Ana, a skillful Video Editor" + a line that fits it
// With two or more job names the banner shows them one after another.
// userId: pass the freelancer's id to look up their job names; leave it out
// (clients) and the banner only says "Welcome, Name".
export default function WelcomeBanner({ displayName, userId = null }) {
  const picks = useWelcomeRoles(userId);
  const [shown, setShown] = useState(0);

  useEffect(() => {
    if (picks.length < 2) return undefined;
    const timer = setInterval(() => setShown((n) => (n + 1) % picks.length), SWITCH_MS);
    return () => clearInterval(timer);
  }, [picks]);

  const index = picks.length ? shown % picks.length : 0;
  // One slot for each job name; a single slot with no name when there is none.
  const slots = picks.length ? picks : [null];

  return (
    <div className="welcome-banner glass-card p-3 p-md-4 rounded-4 mb-3 mb-md-4 border border-secondary border-opacity-25 d-flex flex-column flex-md-row align-items-md-center justify-content-between gap-2 gap-md-3">
      <div>
        {/* The tag and the line under the name are left out on a phone, so the cards below come into view sooner. */}
        <span className="badge bg-orange-subtle text-orange px-3 py-1 rounded-pill fw-bold text-uppercase fs-8 mb-2 d-none d-md-inline-block">PHILFREELA PORTAL</span>
        {/* welcome-stack: every job name's title and line sit in the same spot, one on
            top of the other, and only the current one is visible. The banner keeps the
            height of the tallest one, so the cards below don't move when the name changes. */}
        <div className="welcome-stack">
          {slots.map((pick, i) => (
            <div key={i} className={i === index ? undefined : "welcome-hidden"} aria-hidden={i !== index}>
              <h1 className="welcome-title h2 text-white mb-1">
                Welcome, {displayName}
                {/* welcome-role fades the job name in when it becomes the current one. */}
                {pick && <span className={i === index ? "welcome-role" : undefined}>, {article(pick.compliment)} {pick.compliment} {pick.role}</span>}
              </h1>
              {pick && <p className={`text-secondary mb-0 fs-7 d-none d-md-block${i === index ? " welcome-role" : ""}`}>{pick.line}</p>}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
