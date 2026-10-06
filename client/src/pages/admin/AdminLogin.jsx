import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { isSupabaseConfigured, supabase } from "../../lib/supabaseClient";
import { getFriendlyErrorMessage } from "../../lib/errors";
import "../../styles/auth.css";

export default function AdminLogin() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  // True when this page was opened by a confirmation link that no longer
  // works: the reason comes back after the # in the address.
  const [deadLink] = useState(() => Boolean(new URLSearchParams(window.location.hash.slice(1)).get("error_description")));
  const [message, setMessage] = useState(() => (deadLink
    ? { text: "That confirmation link no longer works. A new email cancels the links in older ones, and links also expire. Type your admin email below and send a new one, then use the link in the newest email.", type: "error" }
    : { text: "", type: "" }));
  // Shows the "Resend confirmation email" button: after a dead link, or when
  // signing in fails because the email isn't confirmed yet.
  const [canResend, setCanResend] = useState(deadLink);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (event) => {
    event.preventDefault();

    if (!isSupabaseConfigured) {
      setMessage({ text: "Supabase isn't configured yet. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to client/.env.", type: "error" });
      return;
    }

    setSubmitting(true);
    setMessage({ text: "Signing in...", type: "" });

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim().toLowerCase(),
        password
      });

      if (error) throw error;

      const { data: adminRow, error: adminError } = await supabase
        .from("admins")
        .select("id")
        .eq("id", data.user.id)
        .maybeSingle();

      if (adminError || !adminRow) {
        await supabase.auth.signOut();
        throw new Error("This account is not an admin.");
      }

      setMessage({ text: "Signed in! Redirecting...", type: "success" });
      navigate("/admin");
    } catch (error) {
      setMessage({ text: getFriendlyErrorMessage(error), type: "error" });
      if (error.message?.toLowerCase().includes("email not confirmed")) setCanResend(true);
    } finally {
      setSubmitting(false);
    }
  };

  // Sends the confirmation email again, for a new admin who lost it or whose
  // link no longer works. The link in it opens this page.
  const handleResend = async () => {
    const address = email.trim().toLowerCase();
    if (!address) {
      setMessage({ text: "Type your admin email above first.", type: "error" });
      return;
    }

    setSubmitting(true);
    const { error } = await supabase.auth.resend({
      type: "signup",
      email: address,
      options: { emailRedirectTo: `${window.location.origin}/admin/login` }
    });
    setSubmitting(false);

    setMessage(error
      ? { text: getFriendlyErrorMessage(error), type: "error" }
      : { text: `If that account still needs confirming, a new link was sent to ${address}. Use the link in the newest email (older links stop working), and check your spam folder too.`, type: "success" });
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
            <h1 className="fw-black text-white h3 mb-1">Admin Sign In</h1>
            <p className="text-secondary fs-7 mb-0">Restricted access for PhilFreela administrators.</p>
          </div>

          {!isSupabaseConfigured && (
            <div className="config-warning">
              Supabase isn't configured yet. Copy <code>client/.env.example</code> to <code>client/.env</code> and fill in your project URL and anon key.
            </div>
          )}

          <form className="d-flex flex-column gap-3" noValidate onSubmit={handleSubmit}>
            <div className="field">
              <label htmlFor="email" className="form-label text-white-50 fw-semibold fs-7 mb-1">Email Address</label>
              <div className="input-group">
                <span className="input-group-text bg-secondary bg-opacity-25 border-secondary text-white-50"><i className="bi bi-envelope"></i></span>
                <input id="email" type="email" className="form-control bg-secondary bg-opacity-25 border-secondary text-white py-2" value={email} onChange={(e) => setEmail(e.target.value)} required />
              </div>
              {/* An admin login is separate from the person's own account (lib/adminEmail.js). */}
              <div className="form-text text-white-50 fs-8">For Gmail, your admin email ends in +admin, like name+admin@gmail.com.</div>
            </div>
            <div className="field">
              <label htmlFor="password" className="form-label text-white-50 fw-semibold fs-7 mb-1">Password</label>
              <div className="input-group">
                <span className="input-group-text bg-secondary bg-opacity-25 border-secondary text-white-50"><i className="bi bi-lock"></i></span>
                <input id="password" type="password" className="form-control bg-secondary bg-opacity-25 border-secondary text-white py-2" value={password} onChange={(e) => setPassword(e.target.value)} required />
              </div>
            </div>
            <button type="submit" className="btn btn-gradient-orange btn-lg w-100 rounded-3 fw-bold text-white shadow-glow py-2" disabled={submitting}>
              Sign In
            </button>
          </form>

          {message.text && (
            <p className={`auth-message mt-3 text-center fs-7 fw-semibold mb-0 ${message.type}`} aria-live="polite">{message.text}</p>
          )}

          {canResend && (
            <div className="text-center mt-2">
              <button type="button" className="btn btn-link text-orange fs-7 fw-semibold text-decoration-none p-0 hover-orange" onClick={handleResend} disabled={submitting}>
                <i className="bi bi-arrow-repeat me-1"></i> Resend confirmation email
              </button>
            </div>
          )}

          <div className="text-center pt-4 mt-3 border-top border-secondary border-opacity-25">
            <Link to="/" className="text-white-50 text-decoration-none fs-7 hover-orange"><i className="bi bi-arrow-left me-1"></i> Back to Homepage</Link>
          </div>
        </section>
      </main>
    </div>
  );
}
