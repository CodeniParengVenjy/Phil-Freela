import { useState } from "react";
import { supabase } from "../../../lib/supabaseClient";
import { getPasswordStrengthMessage } from "../../../lib/validators";
import { getFriendlyErrorMessage } from "../../../lib/errors";
import { DEFAULT_ADMIN_PASSWORD } from "../../../lib/adminPassword";
import "../../../styles/auth.css";

// Shown instead of the Admin Panel while a new admin is still on the default
// password. onDone re-reads their admin row and answers true once the
// database has switched its "must change password" flag off.
export default function AdminCreatePassword({ adminName, onDone, onSignOut }) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [message, setMessage] = useState({ text: "", type: "" });
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (event) => {
    event.preventDefault();

    const strengthMessage = getPasswordStrengthMessage(password);
    if (strengthMessage) {
      setMessage({ text: strengthMessage, type: "error" });
      return;
    }
    if (password === DEFAULT_ADMIN_PASSWORD) {
      setMessage({ text: "Choose a password that is different from the default one.", type: "error" });
      return;
    }
    if (password !== confirm) {
      setMessage({ text: "The two passwords don't match.", type: "error" });
      return;
    }

    setSubmitting(true);
    setMessage({ text: "Saving your password...", type: "" });

    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;

      // The database switches the flag off by itself when the password really
      // changes. When it has, the Admin Panel replaces this screen.
      const unlocked = await onDone();
      if (!unlocked) throw new Error("That password couldn't be used. Please choose a different one.");
    } catch (error) {
      setMessage({ text: getFriendlyErrorMessage(error), type: "error" });
      setSubmitting(false);
    }
  };

  return (
    <div className="auth-page-body d-flex align-items-center justify-content-center min-vh-100 py-5">
      <main className="auth-wrapper position-relative w-100 px-3 max-w-500">
        <div className="auth-bg-glow glow-orange"></div>
        <div className="auth-bg-glow glow-cyan"></div>

        <section className="auth-card glass-card p-4 p-sm-5 rounded-5 border border-secondary border-opacity-25 shadow-2xl position-relative z-2">
          <div className="text-center mb-4">
            <img src="/logo-philfreela.svg" alt="PhilFreela" style={{ height: 46 }} className="logo-glow mb-3" />
            <p className="text-warning fw-extrabold tracking-widest fs-8 text-uppercase mb-1">ADMIN PORTAL</p>
            <h1 className="fw-black text-white h3 mb-1">Create Your Password</h1>
            <p className="text-secondary fs-7 mb-0">
              Welcome, {adminName}. You signed in with the default password. Choose your own to open the Admin Panel.
            </p>
          </div>

          <form className="d-flex flex-column gap-3" noValidate onSubmit={handleSubmit}>
            <div className="field">
              <label htmlFor="newPassword" className="form-label text-white-50 fw-semibold fs-7 mb-1">New Password</label>
              <div className="input-group">
                <span className="input-group-text bg-secondary bg-opacity-25 border-secondary text-white-50"><i className="bi bi-lock"></i></span>
                <input id="newPassword" type="password" autoComplete="new-password" className="form-control bg-secondary bg-opacity-25 border-secondary text-white py-2" placeholder="Min 8 chars, upper/lower/number" value={password} onChange={(e) => setPassword(e.target.value)} required />
              </div>
            </div>
            <div className="field">
              <label htmlFor="confirmPassword" className="form-label text-white-50 fw-semibold fs-7 mb-1">Confirm Password</label>
              <div className="input-group">
                <span className="input-group-text bg-secondary bg-opacity-25 border-secondary text-white-50"><i className="bi bi-lock-fill"></i></span>
                <input id="confirmPassword" type="password" autoComplete="new-password" className="form-control bg-secondary bg-opacity-25 border-secondary text-white py-2" value={confirm} onChange={(e) => setConfirm(e.target.value)} required />
              </div>
            </div>
            <button type="submit" className="btn btn-gradient-orange btn-lg w-100 rounded-3 fw-bold text-white shadow-glow py-2" disabled={submitting}>
              Save Password
            </button>
          </form>

          {message.text && (
            <p className={`auth-message mt-3 text-center fs-7 fw-semibold mb-0 ${message.type}`} aria-live="polite">{message.text}</p>
          )}

          <div className="text-center pt-4 mt-3 border-top border-secondary border-opacity-25">
            <button type="button" className="btn btn-link text-white-50 text-decoration-none fs-7 hover-orange p-0" onClick={onSignOut}>
              <i className="bi bi-box-arrow-right me-1"></i> Sign Out
            </button>
          </div>
        </section>
      </main>
    </div>
  );
}
