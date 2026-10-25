import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { fetchGetStartedSteps } from "../../../lib/getStarted";

// "Hide" is remembered in this browser only (a per-person convenience, nothing
// is saved in the database).
const hiddenKey = (userId) => `philfreela-get-started-hidden-${userId}`;
const readHidden = (userId) => {
  try { return localStorage.getItem(hiddenKey(userId)) === "1"; } catch { return false; }
};

// The "Get started" checklist on the dashboard home, for new accounts: what to
// do first, one step at a time (the answer to "I made an account, now what?").
// Each step ticks itself (lib/getStarted.js). Only the NEXT step has a button,
// so the card adds one button, not one per step. It disappears when every step
// is done, or when the person hides it.
export default function GetStartedCard({ userId, accountType }) {
  // undefined while loading, null if it couldn't load, else the list of steps.
  const [steps, setSteps] = useState(undefined);
  // Whose card was just hidden (the saved "Hide" is read for whoever is signed in now).
  const [hiddenFor, setHiddenFor] = useState(null);
  const hidden = hiddenFor === userId || readHidden(userId);

  useEffect(() => {
    if (!userId || !accountType) return undefined;
    let active = true;
    fetchGetStartedSteps(userId, accountType).then((result) => {
      if (active) setSteps(result);
    }).catch(() => {
      if (active) setSteps(null);
    });
    return () => { active = false; };
  }, [userId, accountType]);

  // Shows nothing while loading, when it couldn't load, when hidden, and when all is done.
  if (!steps || hidden || steps.every((s) => s.done)) return null;

  const doneCount = steps.filter((s) => s.done).length;
  // The step to do now: the first one that isn't done and isn't just waiting for an admin.
  const next = steps.find((s) => !s.done && !s.waiting);

  const hide = () => {
    try { localStorage.setItem(hiddenKey(userId), "1"); } catch { /* still hides for now */ }
    setHiddenFor(userId);
  };

  return (
    <section data-tour="get-started" className="glass-card rounded-4 p-3 p-md-4 mb-3 mb-md-4 border border-secondary border-opacity-25" aria-labelledby="get-started-title">
      <div className="d-flex align-items-start justify-content-between gap-2 mb-2">
        <div>
          <h2 id="get-started-title" className="h5 text-white fw-bold mb-1">
            <i className="bi bi-rocket-takeoff text-role me-2"></i>Get started
          </h2>
          <p className="text-secondary fs-7 mb-0">{doneCount} of {steps.length} done. Finish these to get the most out of PhilFreela.</p>
        </div>
        <button type="button" className="btn btn-link text-secondary fs-8 p-0 text-decoration-none flex-shrink-0" onClick={hide}>Hide</button>
      </div>

      <div className="progress get-started-progress mb-3" style={{ height: 6 }} role="progressbar" aria-label="Steps done" aria-valuemin={0} aria-valuemax={steps.length} aria-valuenow={doneCount}>
        <div className="progress-bar bg-role" style={{ width: `${(doneCount / steps.length) * 100}%` }}></div>
      </div>

      <ol className="list-unstyled mb-0 d-flex flex-column gap-2">
        {steps.map((s) => {
          if (s === next) {
            // The step to do now: the only one with a button.
            return (
              <li key={s.key} className="bg-role-subtle rounded-3 p-3 d-flex flex-wrap align-items-center justify-content-between gap-2">
                <div className="d-flex align-items-start gap-2 min-w-0">
                  <i className="bi bi-arrow-right-circle-fill text-role mt-1"></i>
                  <div>
                    <p className="text-white fw-bold fs-7 mb-0">{s.title}</p>
                    <p className="text-secondary fs-8 mb-0">{s.hint}</p>
                  </div>
                </div>
                <Link to={s.to} className="btn btn-gradient-role btn-sm rounded-pill px-3 fw-bold text-white flex-shrink-0">{s.button}</Link>
              </li>
            );
          }
          const icon = s.done ? "bi-check-circle-fill text-success" : s.waiting ? "bi-hourglass-split text-warning" : "bi-circle text-secondary";
          return (
            <li key={s.key} className="d-flex align-items-start gap-2 px-3">
              <i className={`bi ${icon} mt-1`}></i>
              <div>
                <p className="text-secondary fs-7 mb-0">{s.title}</p>
                {/* A step waiting on an admin keeps its line of explanation. */}
                {s.waiting && !s.done && <p className="text-secondary fs-8 mb-0">{s.hint}</p>}
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
