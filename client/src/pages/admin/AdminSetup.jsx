import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { isSupabaseConfigured, supabase } from "../../lib/supabaseClient";
import { getPasswordStrengthMessage } from "../../lib/validators";
import "../../styles/auth.css";

export default function AdminSetup() {
  const navigate = useNavigate();
  const [form, setForm] = useState({ fullName: "", username: "", email: "", password: "" });
  const [message, setMessage] = useState({ text: "", type: "" });
  const [submitting, setSubmitting] = useState(false);

  const updateField = (field) => (event) => setForm((prev) => ({ ...prev, [field]: event.target.value }));

  const handleSubmit = async (event) => {
    event.preventDefault();

    const strengthMessage = getPasswordStrengthMessage(form.password);
    if (strengthMessage) {
      setMessage({ text: strengthMessage, type: "error" });
      return;
    }

    if (!isSupabaseConfigured) {
      setMessage({ text: "Supabase isn't configured yet. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to client/.env.", type: "error" });
      return;
    }

    setSubmitting(true);
    setMessage({ text: "Creating admin account...", type: "" });

    try {
      const { data, error } = await supabase.auth.signUp({
        email: form.email.trim().toLowerCase(),
        password: form.password,
        options: { data: { full_name: form.fullName.trim(), username: form.username.trim() } }
      });

      if (error) throw new Error(error.message);

      // Gated server-side: the "bootstrap first admin only" RLS policy only
      // admits this insert while the admins table is still empty.
      const { error: adminError } = await supabase.from("admins").insert({
        id: data.user.id,
        full_name: form.fullName.trim(),
        username: form.username.trim()
      });

      if (adminError) throw new Error("An admin account already exists. Setup is locked.");

      setMessage({ text: "Admin account created! Redirecting to sign in...", type: "success" });
      setTimeout(() => navigate("/admin/login"), 1200);
    } catch (error) {
      setMessage({ text: error.message, type: "error" });
    } finally {
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
            <p className="text-warning fw-extrabold tracking-widest fs-8 text-uppercase mb-1">ADMIN BOOTSTRAP</p>
            <h1 className="fw-black text-white h3 mb-1">Create the First Admin</h1>
            <p className="text-secondary fs-7 mb-0">This form only works once, while no admin account exists yet.</p>
          </div>

          {!isSupabaseConfigured && (
            <div className="config-warning">
              Supabase isn't configured yet. Copy <code>client/.env.example</code> to <code>client/.env</code> and fill in your project URL and anon key.
            </div>
          )}

          <form className="d-flex flex-column gap-3" noValidate onSubmit={handleSubmit}>
            <div className="field">
              <label htmlFor="fullName" className="form-label text-white-50 fw-semibold fs-7 mb-1">Full Name</label>
              <input id="fullName" type="text" className="form-control bg-secondary bg-opacity-25 border-secondary text-white py-2" value={form.fullName} onChange={updateField("fullName")} required />
            </div>
            <div className="field">
              <label htmlFor="username" className="form-label text-white-50 fw-semibold fs-7 mb-1">Username</label>
              <input id="username" type="text" className="form-control bg-secondary bg-opacity-25 border-secondary text-white py-2" value={form.username} onChange={updateField("username")} required />
            </div>
            <div className="field">
              <label htmlFor="email" className="form-label text-white-50 fw-semibold fs-7 mb-1">Email Address</label>
              <input id="email" type="email" className="form-control bg-secondary bg-opacity-25 border-secondary text-white py-2" value={form.email} onChange={updateField("email")} required />
            </div>
            <div className="field">
              <label htmlFor="password" className="form-label text-white-50 fw-semibold fs-7 mb-1">Password</label>
              <input id="password" type="password" className="form-control bg-secondary bg-opacity-25 border-secondary text-white py-2" placeholder="Min 8 chars, upper/lower/number" value={form.password} onChange={updateField("password")} required />
            </div>
            <button type="submit" className="btn btn-gradient-orange btn-lg w-100 rounded-3 fw-bold text-white shadow-glow py-2" disabled={submitting}>
              Create Admin Account
            </button>
          </form>

          {message.text && (
            <p className={`auth-message mt-3 text-center fs-7 fw-semibold mb-0 ${message.type}`} aria-live="polite">{message.text}</p>
          )}

          <div className="text-center pt-4 mt-3 border-top border-secondary border-opacity-25">
            <Link to="/admin/login" className="text-white-50 text-decoration-none fs-7 hover-orange"><i className="bi bi-arrow-left me-1"></i> Go to Admin Sign In</Link>
          </div>
        </section>
      </main>
    </div>
  );
}
