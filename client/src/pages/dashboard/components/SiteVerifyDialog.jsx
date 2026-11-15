import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Busy, Loader } from "../../../components/Loaders";
import { checkSite, getSiteCode } from "../../../lib/aiService";
import { VERIFY_DAYS, isFreshlyVerified, linkLabel, verifiedDateText } from "../../../lib/profile";

// Verified owner badge (PLAN-site-verification.md): the pop-up behind the
// Verify button on a portfolio link to the freelancer's own website.
// 1. It asks the AI service for the freelancer's code for this link.
// 2. The freelancer copies the line and pastes it into their website.
// 3. Check now: the AI service visits the page and looks for the code
//    (ai-service/site_check.py). Only the AI service can save the badge.
// The parent renders it with key={link}, so every link starts fresh.
export default function SiteVerifyDialog({ link, onClose, onVerified }) {
  // undefined while loading, null when the code couldn't be loaded.
  const [code, setCode] = useState(undefined);
  const [loadError, setLoadError] = useState("");
  const [verifiedAt, setVerifiedAt] = useState(null);
  // "copied", "selected" (copying isn't allowed here: the text is selected for Ctrl+C) or "".
  const [copied, setCopied] = useState("");
  const [checking, setChecking] = useState(false);
  // null, { ok: true } or { ok: false, message }.
  const [result, setResult] = useState(null);
  const codeRef = useRef(null);

  useEffect(() => {
    let active = true;
    getSiteCode(link)
      .then((answer) => {
        if (!active) return;
        setCode(answer.code);
        setVerifiedAt(answer.verified_at || null);
      })
      .catch((error) => {
        if (!active) return;
        setCode(null);
        setLoadError(error.message);
      });
    return () => { active = false; };
  }, [link]);

  // Escape closes the pop-up, unless a check is running.
  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === "Escape" && !checking) onClose();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [checking, onClose]);

  const line = code ? `<meta name="philfreela-verification" content="${code}">` : "";
  const fresh = isFreshlyVerified(verifiedAt);

  const selectLine = () => {
    if (!codeRef.current) return;
    const range = document.createRange();
    range.selectNodeContents(codeRef.current);
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
    setCopied("selected");
  };

  const copy = () => {
    if (!navigator.clipboard?.writeText) {
      selectLine();
      return;
    }
    navigator.clipboard.writeText(line).then(() => setCopied("copied"), selectLine);
  };

  const check = async () => {
    setChecking(true);
    setResult(null);
    try {
      const answer = await checkSite(link);
      if (answer.verified) {
        setVerifiedAt(answer.verified_at);
        setResult({ ok: true });
        onVerified(link, answer.verified_at);
      } else {
        setResult({ ok: false, message: answer.message });
      }
    } catch (error) {
      setResult({ ok: false, message: error.message });
    }
    setChecking(false);
  };

  const until = verifiedAt ? verifiedDateText(new Date(new Date(verifiedAt).getTime() + VERIFY_DAYS * 24 * 60 * 60 * 1000)) : "";

  return createPortal(
    <div
      className="role-confirm-backdrop"
      style={{
        position: "fixed", inset: 0, zIndex: 1300,
        background: "rgba(0,0,0,0.65)",
        display: "flex", alignItems: "center", justifyContent: "center", padding: "1rem"
      }}
      onClick={checking ? undefined : onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="site-verify-title"
        className="role-confirm-card bg-dark text-white border border-secondary border-opacity-25 rounded-4 p-4 text-start"
        style={{ maxWidth: 520, width: "100%", maxHeight: "calc(100dvh - 2rem)", overflowY: "auto" }}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="d-flex align-items-center gap-3 mb-3">
          <div className="bg-secondary bg-opacity-25 rounded-circle d-flex align-items-center justify-content-center flex-shrink-0" style={{ width: 48, height: 48 }}>
            <i className="bi bi-patch-check-fill text-orange fs-4"></i>
          </div>
          <div style={{ minWidth: 0 }}>
            <h5 id="site-verify-title" className="fw-bold mb-0">Verify your website</h5>
            <p className="text-secondary fs-7 mb-0 text-truncate"><i className="bi bi-globe2 me-1"></i>{linkLabel(link)}</p>
          </div>
        </div>

        {fresh && !result && (
          <div className="alert alert-success py-2 px-3 fs-7 mb-3" role="status">
            <i className="bi bi-patch-check-fill me-2"></i>
            Verified owner since {verifiedDateText(verifiedAt)}. The badge lasts until {until}; check again any time to renew it.
          </div>
        )}

        {code === undefined && <Loader size="sm" label="Getting your code" />}

        {code === null && (
          <p className="text-warning fs-7 mb-3"><i className="bi bi-exclamation-triangle-fill me-1"></i>{loadError}</p>
        )}

        {code && (
          <ol className="ps-3 mb-3 fs-7 d-grid gap-3">
            <li>
              <span className="fw-semibold">Copy this line.</span> It&apos;s your own code, made only for this link.
              <div className="d-flex gap-2 align-items-center mt-2 p-2 rounded-3 border border-secondary border-opacity-50 bg-secondary bg-opacity-25">
                <code ref={codeRef} className="flex-grow-1 text-light text-break" style={{ fontSize: "0.78rem" }}>{line}</code>
                <button type="button" className="btn btn-sm btn-outline-warning rounded-pill fw-bold flex-shrink-0" onClick={copy}>
                  {copied === "copied" ? <><i className="bi bi-check2 me-1"></i>Copied</> : "Copy"}
                </button>
              </div>
              {copied === "selected" && <p className="text-secondary fs-8 mt-1 mb-0">The line is selected. Press Ctrl+C to copy it.</p>}
            </li>
            <li>
              Paste it inside the <code className="text-light">&lt;head&gt;</code> of the page at{" "}
              <span className="fw-semibold text-break">{link}</span>, then publish the change. Visitors won&apos;t see it.
            </li>
            <li>
              Click <span className="fw-semibold">Check now</span>. PhilFreela visits the page and looks for your code.
            </li>
          </ol>
        )}

        {result?.ok && (
          <div className="alert alert-success py-2 px-3 fs-7 mb-3" role="status">
            <i className="bi bi-patch-check-fill me-2"></i>
            Verified! Clients now see a Verified owner badge on this link until {until}.
          </div>
        )}
        {result && !result.ok && (
          <div className="alert alert-warning py-2 px-3 fs-7 mb-3" role="alert">
            <i className="bi bi-exclamation-triangle-fill me-2"></i>{result.message}
          </div>
        )}

        {code && (
          <p className="text-secondary fs-8 mb-3">
            Put the line in the page&apos;s HTML file itself (like index.html), not added later by JavaScript. You can check
            once every 30 seconds. Keep the line on your site: the badge lasts {VERIFY_DAYS} days, then you check again.
          </p>
        )}

        <div className="d-flex gap-2 justify-content-end flex-wrap">
          <button type="button" className="btn btn-outline-secondary text-white-50 rounded-pill px-4 py-2 fw-bold" onClick={onClose} disabled={checking}>
            Close
          </button>
          {code && (
            <button type="button" className="btn btn-gradient-role rounded-pill px-4 py-2 fw-bold text-white" onClick={check} disabled={checking}>
              {checking ? <Busy>Checking...</Busy> : fresh || result ? "Check again" : "Check now"}
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
