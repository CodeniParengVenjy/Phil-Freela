import { useState } from "react";
import { Link } from "react-router-dom";
import { isSupabaseConfigured, supabase } from "../../lib/supabaseClient";
import { EMAIL_PATTERN } from "../../lib/validators";
import { getFriendlyErrorMessage } from "../../lib/errors";
import "../../styles/auth.css";

export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState({ text: "", type: "" });

  const handleSubmit = async (event) => {
    event.preventDefault();

    const normalizedEmail = email.trim().toLowerCase();

    if (!EMAIL_PATTERN.test(normalizedEmail)) {
      setMessage({ text: "Use a valid email format like name@example.com.", type: "error" });
      return;
    }

    if (!isSupabaseConfigured) {
      setMessage({
        text: "Supabase isn't configured yet. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to client/.env.",
        type: "error"
      });
      return;
    }

    setSubmitting(true);
    setMessage({ text: "Sending reset link...", type: "" });

    const { error } = await supabase.auth.resetPasswordForEmail(normalizedEmail, {
      redirectTo: `${window.location.origin}/reset-password`
    });

    if (error) {
      setMessage({ text: getFriendlyErrorMessage(error), type: "error" });
      setSubmitting(false);
      return;
    }

    setMessage({
      text: "If an account exists for that email, a reset link is on its way. Check your inbox (and spam folder).",
      type: "success"
    });
    setSubmitting(false);
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
            <h1 className="fw-black text-white h3 mb-1">Forgot Password</h1>
            <p className="text-secondary fs-7 mb-0">Enter your email and we'll send you a reset link.</p>
          </div>

          {!isSupabaseConfigured && (
            <div className="config-warning">
              Supabase isn't configured yet. Copy <code>client/.env.example</code> to{" "}
              <code>client/.env</code> and fill in your project URL and anon key.
            </div>
          )}

          <form className="d-flex flex-column gap-3" noValidate onSubmit={handleSubmit}>
            <div className="field">
              <label htmlFor="email" className="form-label text-white-50 fw-semibold fs-7 mb-1">Email Address</label>
              <div className="input-group">
                <span className="input-group-text bg-secondary bg-opacity-25 border-secondary text-white-50"><i className="bi bi-envelope"></i></span>
                <input
                  id="email"
                  type="email"
                  className="form-control bg-secondary bg-opacity-25 border-secondary text-white py-2"
                  autoComplete="email"
                  inputMode="email"
                  placeholder="name@example.com"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  required
                />
              </div>
            </div>

            <button
              type="submit"
              className="btn btn-gradient-orange btn-lg w-100 rounded-3 fw-bold text-white shadow-glow py-2"
              disabled={submitting}
            >
              Send Reset Link
            </button>
          </form>

          {message.text && (
            <p className={`auth-message mt-3 text-center fs-7 fw-semibold mb-0 ${message.type}`} aria-live="polite">
              {message.text}
            </p>
          )}

          <div className="text-center pt-4 mt-3 border-top border-secondary border-opacity-25">
            <Link to="/login" className="text-white-50 text-decoration-none fs-7 hover-orange">
              <i className="bi bi-arrow-left me-1"></i> Back to Sign In
            </Link>
          </div>
        </section>
      </main>
    </div>
  );
}
