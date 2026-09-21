import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { isSupabaseConfigured, supabase } from "../../lib/supabaseClient";
import { getPasswordStrengthMessage } from "../../lib/validators";
import { getFriendlyErrorMessage } from "../../lib/errors";
import "../../styles/auth.css";

export default function ResetPassword() {
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [ready, setReady] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState({ text: "", type: "" });

  useEffect(() => {
    if (!isSupabaseConfigured) return;
    let active = true;

    // Supabase parses the recovery link's URL fragment on load and fires this
    // event once it has set up the temporary session that unlocks
    // updateUser({ password }) below. getSession() covers the case where that
    // already happened before this listener was attached.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY" && active) setReady(true);
    });

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (active && session) setReady(true);
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  const handleSubmit = async (event) => {
    event.preventDefault();

    if (password !== confirmPassword) {
      setMessage({ text: "Passwords do not match.", type: "error" });
      return;
    }

    const strengthMessage = getPasswordStrengthMessage(password);
    if (strengthMessage) {
      setMessage({ text: strengthMessage, type: "error" });
      return;
    }

    setSubmitting(true);
    setMessage({ text: "Updating password...", type: "" });

    const { error } = await supabase.auth.updateUser({ password });

    if (error) {
      setMessage({ text: getFriendlyErrorMessage(error), type: "error" });
      setSubmitting(false);
      return;
    }

    await supabase.auth.signOut();
    navigate("/login", { replace: true, state: { justReset: true } });
  };

  return (
    <div className="auth-page-body d-flex align-items-center justify-content-center min-vh-100 py-5">
      <main className="auth-wrapper position-relative w-100 px-3 max-w-500">
        <div className="auth-bg-glow glow-orange"></div>
        <div className="auth-bg-glow glow-cyan"></div>

        <section className="auth-card glass-card p-4 p-sm-5 rounded-5 border border-secondary border-opacity-25 shadow-2xl position-relative z-2">
          <div className="text-center mb-4">
            <Link to="/" className="d-inline-block mb-3">
              <img src="/logo-philfreela.svg" alt="PhilFreela" style={{ height: 46 }} className="logo-glow" />
            </Link>
            <p className="text-warning fw-extrabold tracking-widest fs-8 text-uppercase mb-1">PHILFREELA ACCESS PORTAL</p>
            <h1 className="fw-black text-white h3 mb-1">Reset Password</h1>
            <p className="text-secondary fs-7 mb-0">Choose a new password for your account.</p>
          </div>

          {!isSupabaseConfigured && (
            <div className="config-warning">
              Supabase isn't configured yet. Copy <code>client/.env.example</code> to{" "}
              <code>client/.env</code> and fill in your project URL and anon key.
            </div>
          )}

          {isSupabaseConfigured && !ready && (
            <p className="auth-message text-center fs-7 fw-semibold mb-0" aria-live="polite">
              Verifying your reset link...
            </p>
          )}

          {isSupabaseConfigured && ready && (
            <form className="d-flex flex-column gap-3" noValidate onSubmit={handleSubmit}>
              <div className="field">
                <label htmlFor="password" className="form-label text-white-50 fw-semibold fs-7 mb-1">New Password</label>
                <div className="input-group">
                  <span className="input-group-text bg-secondary bg-opacity-25 border-secondary text-white-50"><i className="bi bi-lock"></i></span>
                  <input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    className="form-control bg-secondary bg-opacity-25 border-secondary text-white py-2"
                    autoComplete="new-password"
                    placeholder="••••••••"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    required
                  />
                  <button
                    type="button"
                    className="btn btn-outline-secondary border-secondary text-white-50 password-toggle"
                    aria-label={showPassword ? "Hide password" : "Show password"}
                    onClick={() => setShowPassword((prev) => !prev)}
                  >
                    <i className={`bi ${showPassword ? "bi-eye-slash" : "bi-eye"}`}></i>
                  </button>
                </div>
              </div>

              <div className="field">
                <label htmlFor="confirmPassword" className="form-label text-white-50 fw-semibold fs-7 mb-1">Confirm New Password</label>
                <div className="input-group">
                  <span className="input-group-text bg-secondary bg-opacity-25 border-secondary text-white-50"><i className="bi bi-shield-lock"></i></span>
                  <input
                    id="confirmPassword"
                    type={showPassword ? "text" : "password"}
                    className="form-control bg-secondary bg-opacity-25 border-secondary text-white py-2"
                    autoComplete="new-password"
                    placeholder="••••••••"
                    value={confirmPassword}
                    onChange={(event) => setConfirmPassword(event.target.value)}
                    required
                  />
                </div>
              </div>

              <button
                type="submit"
                className="btn btn-gradient-orange btn-lg w-100 rounded-3 fw-bold text-white shadow-glow py-2"
                disabled={submitting}
              >
                Update Password
              </button>
            </form>
          )}

          {message.text && (
            <p className={`auth-message mt-3 text-center fs-7 fw-semibold mb-0 ${message.type}`} aria-live="polite">
              {message.text}
            </p>
          )}

          <div className="text-center pt-4 mt-3 border-top border-secondary border-opacity-25">
            <Link to="/forgot-password" className="text-white-50 text-decoration-none fs-7 hover-orange">
              <i className="bi bi-arrow-left me-1"></i> Request a new link
            </Link>
          </div>
        </section>
      </main>
    </div>
  );
}
