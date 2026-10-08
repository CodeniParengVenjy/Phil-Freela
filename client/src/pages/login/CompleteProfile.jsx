import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "../../lib/supabaseClient";
import { MAX_NAME_LENGTH, dashboardRouteFor, resolvePostAuthRoute } from "../../lib/profile";
import { getFriendlyErrorMessage } from "../../lib/errors";
import "../../styles/auth.css";

// profiles.username is varchar(60) in the database.
const MAX_USERNAME_LENGTH = 60;

// Returns what's wrong with the form (the same rules as the sign-up form),
// or "" when everything is fine.
function findProblem(fullName, username, gender) {
  if (!fullName) return "Please enter your name.";
  if (fullName.length > MAX_NAME_LENGTH) return `Name must not exceed ${MAX_NAME_LENGTH} characters.`;
  if (!username) return "Please choose a username.";
  if (username.length > MAX_USERNAME_LENGTH) return `Username must not exceed ${MAX_USERNAME_LENGTH} characters.`;
  if (!["male", "female"].includes(gender)) return "Please choose Male or Female.";
  return "";
}

// Shown once to someone who is signed in but has no PhilFreela profile yet:
// mostly a first "Continue with Google" (Google gives a name and email, but
// not a username, gender or role). Saving creates the profiles row, the same
// one the email sign-up form creates.
export default function CompleteProfile() {
  const navigate = useNavigate();
  // The signed-in user, once we know they really need this page.
  const [user, setUser] = useState(null);
  const [form, setForm] = useState({ fullName: "", username: "", gender: "male", accountType: "client" });
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState({ text: "", type: "" });

  useEffect(() => {
    let active = true;

    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!active) return;
      if (!session) {
        navigate("/login", { replace: true });
        return;
      }

      // Admins, banned users (the appeal page) and people who already have a
      // profile are sent to their own page instead.
      let destination;
      try {
        destination = await resolvePostAuthRoute(session.user);
      } catch (error) {
        if (active) setMessage({ text: getFriendlyErrorMessage(error), type: "error" });
        return;
      }
      if (!active) return;
      if (destination !== "/complete-profile") {
        navigate(destination, { replace: true });
        return;
      }

      // Google gives the person's name, so fill it in for them.
      const meta = session.user.user_metadata || {};
      setForm((prev) => ({ ...prev, fullName: meta.full_name || meta.name || "" }));
      setUser(session.user);
    });

    return () => {
      active = false;
    };
  }, [navigate]);

  const updateField = (field) => (event) => {
    setForm((prev) => ({ ...prev, [field]: event.target.value }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    const fullName = form.fullName.trim();
    const username = form.username.trim();

    const problem = findProblem(fullName, username, form.gender);
    if (problem) {
      setMessage({ text: problem, type: "error" });
      return;
    }

    // Client is the default role, like on the sign-up form.
    const accountType = form.accountType === "freelancer" ? "freelancer" : "client";
    setSubmitting(true);
    setMessage({ text: "Saving your profile...", type: "" });

    // The database only lets a user create their OWN profile row (auth.uid() = id).
    const { error } = await supabase.from("profiles").insert({
      id: user.id,
      full_name: fullName,
      username,
      gender: form.gender,
      account_type: accountType
    });
    if (error) {
      setSubmitting(false);
      setMessage({ text: error.code === "23505" ? "That username is already taken." : getFriendlyErrorMessage(error), type: "error" });
      return;
    }

    // Keep the same details on the login account, like email sign up does
    // (the emails greet people by this full_name).
    await supabase.auth.updateUser({ data: { full_name: fullName, username, gender: form.gender, account_type: accountType } });
    navigate(dashboardRouteFor(accountType), { replace: true });
  };

  // "Not you?": sign out so they can pick another Google account.
  const handleUseAnotherAccount = async () => {
    await supabase.auth.signOut();
    navigate("/login", { replace: true });
  };

  const roleButton = (value) =>
    `btn flex-grow-1 rounded-3 fw-bold py-2 fs-7 ${form.accountType === value ? "btn-gradient-orange text-white" : "btn-outline-secondary text-white-50"}`;

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
            <h1 className="fw-black text-white h3 mb-1">Complete Your Profile</h1>
            <p className="text-secondary fs-7 mb-0">
              {user ? `Signed in as ${user.email}. Just a few details to finish your account.` : "Checking your account..."}
            </p>
          </div>

          {user && (
            <form className="d-flex flex-column gap-3" noValidate onSubmit={handleSubmit}>
              <div className="field">
                <label className="form-label text-white-50 fw-semibold fs-7 mb-1">I'm joining as a...</label>
                <div className="d-flex gap-2" role="radiogroup" aria-label="Account type">
                  <button type="button" role="radio" aria-checked={form.accountType === "freelancer"} className={roleButton("freelancer")} onClick={() => setForm((prev) => ({ ...prev, accountType: "freelancer" }))}>
                    <i className="bi bi-person-badge me-1"></i> Freelancer
                  </button>
                  <button type="button" role="radio" aria-checked={form.accountType === "client"} className={roleButton("client")} onClick={() => setForm((prev) => ({ ...prev, accountType: "client" }))}>
                    <i className="bi bi-briefcase me-1"></i> Client
                  </button>
                </div>
              </div>

              <div className="field">
                <label htmlFor="fullName" className="form-label text-white-50 fw-semibold fs-7 mb-1">Name</label>
                <div className="input-group">
                  <span className="input-group-text bg-secondary bg-opacity-25 border-secondary text-white-50"><i className="bi bi-person"></i></span>
                  <input
                    id="fullName"
                    type="text"
                    className="form-control bg-secondary bg-opacity-25 border-secondary text-white py-2"
                    placeholder="e.g. Keanne Obias"
                    maxLength={MAX_NAME_LENGTH}
                    autoComplete="name"
                    value={form.fullName}
                    onChange={updateField("fullName")}
                    required
                  />
                </div>
              </div>

              <div className="field">
                <label htmlFor="username" className="form-label text-white-50 fw-semibold fs-7 mb-1">Username</label>
                <div className="input-group">
                  <span className="input-group-text bg-secondary bg-opacity-25 border-secondary text-white-50"><i className="bi bi-at"></i></span>
                  <input
                    id="username"
                    type="text"
                    className="form-control bg-secondary bg-opacity-25 border-secondary text-white py-2"
                    placeholder="keanne_dev"
                    maxLength={MAX_USERNAME_LENGTH}
                    autoComplete="username"
                    value={form.username}
                    onChange={updateField("username")}
                    required
                  />
                </div>
              </div>

              <div className="field">
                <label htmlFor="gender" className="form-label text-white-50 fw-semibold fs-7 mb-1">Gender</label>
                <select
                  id="gender"
                  className="form-select bg-secondary bg-opacity-25 border-secondary text-white py-2"
                  value={form.gender}
                  onChange={updateField("gender")}
                >
                  <option value="male">Male</option>
                  <option value="female">Female</option>
                </select>
              </div>

              <button
                type="submit"
                className="btn btn-gradient-orange btn-lg w-100 rounded-3 fw-bold text-white shadow-glow py-2"
                disabled={submitting}
              >
                Save and Continue
              </button>
            </form>
          )}

          {message.text && (
            <p className={`auth-message mt-3 text-center fs-7 fw-semibold mb-0 ${message.type}`} aria-live="polite">
              {message.text}
            </p>
          )}

          <div className="text-center pt-4 mt-3 border-top border-secondary border-opacity-25">
            {user ? (
              <button type="button" className="btn btn-link text-white-50 text-decoration-none fs-7 hover-orange p-0" onClick={handleUseAnotherAccount} disabled={submitting}>
                <i className="bi bi-arrow-left me-1"></i> Use a different account
              </button>
            ) : (
              <Link to="/login" className="text-white-50 text-decoration-none fs-7 hover-orange">
                <i className="bi bi-arrow-left me-1"></i> Back to Sign In
              </Link>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}
