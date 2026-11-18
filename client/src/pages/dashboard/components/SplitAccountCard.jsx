import { useEffect, useState } from "react";
import { SIDE_NAMES, countsText, getSplitSummary, groupedCode, splitErrorText, startSplit } from "../../../lib/accountSplit";
import { Busy } from "../../../components/Loaders";

// "Hide" is remembered in this browser only (a per-person convenience).
const hiddenKey = (userId) => `philfreela-split-hidden-${userId}`;
const readHidden = (userId) => {
  try { return localStorage.getItem(hiddenKey(userId)) === "1"; } catch { return false; }
};

// "Split your account" on the dashboard home (PLAN-separate-accounts.md, Step 5).
// Only for an account made before Freelancer and Client were separated that
// still has the other side's work. Nothing is deleted: this account keeps its
// role, and the other side's work moves to a new account made with another
// email, using a one-time move code shown here. Hidden for everyone else.
export default function SplitAccountCard({ userId }) {
  // undefined while loading, null when there is nothing to show.
  const [summary, setSummary] = useState(undefined);
  const [code, setCode] = useState(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [hiddenFor, setHiddenFor] = useState(null);
  const hidden = hiddenFor === userId || readHidden(userId);

  useEffect(() => {
    if (!userId) return undefined;
    let active = true;
    getSplitSummary().then((found) => {
      if (!active) return;
      setSummary(found && found.total > 0 ? found : null);
      // A code made earlier and still open is shown again.
      if (found?.code) setCode({ code: found.code, expires_at: found.expires_at });
    }).catch(() => {
      if (active) setSummary(null);
    });
    return () => { active = false; };
  }, [userId]);

  if (!summary || hidden) return null;

  const keep = SIDE_NAMES[summary.keep_side];
  const move = SIDE_NAMES[summary.move_side];

  const getCode = async () => {
    setBusy(true);
    setMessage("");
    try {
      setCode(await startSplit());
    } catch (error) {
      setMessage(splitErrorText(error));
    } finally {
      setBusy(false);
    }
  };

  const copyCode = async () => {
    try {
      await navigator.clipboard.writeText(code.code);
      setMessage("Code copied.");
    } catch {
      setMessage("Couldn't copy. Write the code down instead.");
    }
  };

  const hide = () => {
    try { localStorage.setItem(hiddenKey(userId), "1"); } catch { /* still hides for now */ }
    setHiddenFor(userId);
  };

  return (
    <section className="glass-card rounded-4 p-3 p-md-4 mb-3 mb-md-4 border border-secondary border-opacity-25" aria-labelledby="split-title">
      <div className="d-flex align-items-start justify-content-between gap-2 mb-2">
        <h2 id="split-title" className="h5 text-white fw-bold mb-0">
          <i className="bi bi-signpost-split text-role me-2"></i>Split your account
        </h2>
        <button type="button" className="btn btn-link text-secondary fs-8 p-0 text-decoration-none flex-shrink-0" onClick={hide}>Hide</button>
      </div>

      <p className="text-secondary fs-7 mb-3">
        Freelancer and Client accounts are separate now. This {keep} account still has {move} work
        from before: <span className="text-white fw-semibold">{countsText(summary.counts)}</span>.
        Nothing is deleted: move it to a separate {move} account.
      </p>

      <ol className="fs-7 text-secondary ps-3 mb-3 d-flex flex-column gap-1">
        <li>Make a {move} account with another email (sign out, then Create Account, I'm a {move}).</li>
        <li>Get your move code here.</li>
        <li>Sign in to the new account and enter the code in Settings, Account Security, "Move work from an old account".</li>
      </ol>

      {code ? (
        <div className="bg-role-subtle rounded-3 p-3 d-flex flex-wrap align-items-center justify-content-between gap-2">
          <div>
            <p className="text-secondary fs-8 mb-1">Your move code</p>
            <p className="text-white fw-bold fs-4 mb-0 font-monospace" style={{ letterSpacing: "0.15em" }}>{groupedCode(code.code)}</p>
            <p className="text-secondary fs-8 mb-0">
              Works once, until {new Date(code.expires_at).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}. Don't share it.
            </p>
          </div>
          <button type="button" className="btn btn-outline-secondary btn-sm rounded-pill px-3 text-white" onClick={copyCode}>
            <i className="bi bi-clipboard me-1"></i> Copy
          </button>
        </div>
      ) : (
        <button type="button" className="btn btn-gradient-role btn-sm rounded-pill px-3 fw-bold text-white" onClick={getCode} disabled={busy}>
          {busy ? <Busy>Making your code</Busy> : <><i className="bi bi-key me-1"></i> Get my move code</>}
        </button>
      )}

      {message && <p className="text-secondary fs-8 mt-2 mb-0" aria-live="polite">{message}</p>}

      <p className="text-secondary fs-8 mt-3 mb-0">
        <i className="bi bi-info-circle me-1"></i>
        Stays with this account: chats, notifications, your profile picture, your ID check and Premium.
        A job application with a resume file and a payment with a receipt picture also stay.
      </p>
    </section>
  );
}
