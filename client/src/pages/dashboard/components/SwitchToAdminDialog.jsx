import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { rememberOtherAccount, switchToOtherAccount } from "../../../lib/accountSwitch";

// "Switch to admin" when this browser doesn't have the admin login stored yet
// (a new browser, or it ran out): asks for the admin email and password once,
// then switches. After this the Switch to admin button is one click. Only
// shown to an account that a database link ties to an admin (lib/accountSwitch.js).
export default function SwitchToAdminDialog({ open, link, onClose }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  // Escape closes the popup, unless it is busy.
  useEffect(() => {
    if (!open) return undefined;
    const handleKeyDown = (event) => {
      if (event.key === "Escape" && !busy) onClose();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open, busy, onClose]);

  if (!open) return null;

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    const problem = await rememberOtherAccount(link, email, password);
    if (problem) {
      setBusy(false);
      setError(problem);
      return;
    }
    const result = await switchToOtherAccount(link);
    // On success the page changes. If it didn't, show why.
    setBusy(false);
    if (result.error || result.needsPassword) setError(result.error || "Couldn't switch. Please try again.");
  };

  return createPortal(
    <div
      className="role-confirm-backdrop"
      style={{ position: "fixed", inset: 0, zIndex: 1300, background: "rgba(0,0,0,0.65)", display: "flex", alignItems: "center", justifyContent: "center", padding: "1rem" }}
      onClick={busy ? undefined : onClose}
    >
      <form
        role="dialog"
        aria-modal="true"
        aria-labelledby="switch-admin-title"
        className="role-confirm-card bg-dark text-white border border-secondary border-opacity-25 rounded-4 p-4"
        style={{ maxWidth: 420, width: "100%" }}
        onClick={(event) => event.stopPropagation()}
        onSubmit={handleSubmit}
        noValidate
      >
        <div className="role-confirm-icon bg-role-subtle text-role rounded-circle d-flex align-items-center justify-content-center mx-auto mb-3" style={{ width: 56, height: 56 }}>
          <i className="bi bi-shield-lock-fill fs-4"></i>
        </div>
        <h5 id="switch-admin-title" className="fw-bold mb-2 text-center">Switch to your admin account</h5>
        <p className="text-secondary fs-7 mb-3 text-center">
          This browser doesn't have your admin login saved yet. Type it once, and switching will be one click after this.
        </p>
        <div className="mb-3">
          <label htmlFor="switchAdminEmail" className="form-label text-white-50 fw-semibold fs-7">Admin email</label>
          <input id="switchAdminEmail" type="email" className="form-control bg-secondary bg-opacity-25 border-secondary text-white py-2" autoComplete="off" value={email} onChange={(e) => setEmail(e.target.value)} disabled={busy} />
        </div>
        <div className="mb-3">
          <label htmlFor="switchAdminPassword" className="form-label text-white-50 fw-semibold fs-7">Admin password</label>
          <input id="switchAdminPassword" type="password" className="form-control bg-secondary bg-opacity-25 border-secondary text-white py-2" autoComplete="off" value={password} onChange={(e) => setPassword(e.target.value)} disabled={busy} />
        </div>
        {error && <p className="text-danger fs-7 fw-semibold" role="alert">{error}</p>}
        <div className="d-flex gap-2 justify-content-center">
          <button type="button" className="btn btn-outline-secondary text-white-50 rounded-pill px-4 py-2 fw-bold" onClick={onClose} disabled={busy}>Cancel</button>
          <button type="submit" className="btn btn-gradient-role rounded-pill px-4 py-2 fw-bold text-white" disabled={busy || !email.trim() || !password}>
            {busy ? "Switching..." : "Switch"}
          </button>
        </div>
      </form>
    </div>,
    document.body
  );
}
