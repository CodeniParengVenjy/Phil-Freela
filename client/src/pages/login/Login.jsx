import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { isSupabaseConfigured, setRememberMe, supabase } from "../../lib/supabaseClient";
import { dashboardRouteFor, resolvePostAuthRoute } from "../../lib/profile";
import { EMAIL_PATTERN, getPasswordStrengthMessage } from "../../lib/validators";
import { getFriendlyErrorMessage } from "../../lib/errors";
import "../../styles/auth.css";

const initialForm = {
  fullName: "",
  username: "",
  email: "",
  password: "",
  confirmPassword: "",
  gender: "male",
  accountType: "client",
  keepLogin: false
};

export default function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const [mode, setMode] = useState(searchParams.get("mode") === "signup" ? "signup" : "signin");
  const [form, setForm] = useState(() => ({
    ...initialForm,
    accountType: searchParams.get("role") === "freelancer" ? "freelancer" : "client"
  }));
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [message, setMessage] = useState(() => {
    if (location.state?.justReset) {
      return { text: "Password updated. Sign in with your new password.", type: "success" };
    }
    // An expired or already-used confirmation link comes back here with the
    // reason after the # in the address.
    const linkError = new URLSearchParams(window.location.hash.slice(1)).get("error_description");
    if (linkError) {
      return { text: `${linkError}. Sign in below; if your email isn't confirmed yet, you can get a new link.`, type: "error" };
    }
    return { text: "", type: "" };
  });
  // The email that still needs confirming. While set, a "Resend
  // confirmation email" button shows under the message.
  const [resendEmail, setResendEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [googleSubmitting, setGoogleSubmitting] = useState(false);
  const cardRef = useRef(null);

  const isSignup = mode === "signup";

  useEffect(() => {
    let active = true;

    // Covers a Google sign-in landing back here with an active session
    // already, and anyone who is already signed in opening /login directly.
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!active || !session) return;
      try {
        const destination = await resolvePostAuthRoute(session.user);
        if (active) navigate(destination, { replace: true });
      } catch (error) {
        // e.g. a suspended user: resolvePostAuthRoute signed them out and
        // the error says why.
        if (active) setMessage({ text: error.message, type: "error" });
      }
    });

    return () => {
      active = false;
    };
  }, [navigate]);

  const handleGoogleSignIn = async () => {
    if (!isSupabaseConfigured) {
      setMessage({
        text: "Supabase isn't configured yet. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to client/.env.",
        type: "error"
      });
      return;
    }

    setGoogleSubmitting(true);
    setMessage({ text: "Redirecting to Google...", type: "" });

    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/login` }
    });

    if (error) {
      setMessage({ text: getFriendlyErrorMessage(error), type: "error" });
      setGoogleSubmitting(false);
    }
    // On success the browser navigates away to Google, so no further state
    // update happens here.
  };

  const updateField = (field) => (event) => {
    const value = field === "keepLogin" ? event.target.checked : event.target.value;
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleTilt = useCallback((event) => {
    const card = cardRef.current;
    if (!card) return;
    const rect = card.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    const mx = (x / rect.width - 0.5) * 2;
    const my = (y / rect.height - 0.5) * 2;
    card.style.transform = `perspective(1000px) rotateX(${my * -2.6}deg) rotateY(${mx * 2.6}deg)`;
  }, []);

  const resetTilt = useCallback(() => {
    if (cardRef.current) {
      cardRef.current.style.transform = "perspective(1000px) rotateX(0deg) rotateY(0deg)";
    }
  }, []);

  const handleSubmit = async (event) => {
    event.preventDefault();

    const normalizedEmail = form.email.trim().toLowerCase();

    if (!EMAIL_PATTERN.test(normalizedEmail)) {
      setMessage({ text: "Use a valid email format like name@example.com.", type: "error" });
      return;
    }

    if (isSignup && form.fullName.trim().length > 100) {
      setMessage({ text: "Full Name must not exceed 100 characters.", type: "error" });
      return;
    }

    if (isSignup && form.password !== form.confirmPassword) {
      setMessage({ text: "Passwords do not match.", type: "error" });
      return;
    }

    if (isSignup) {
      const strengthMessage = getPasswordStrengthMessage(form.password);
      if (strengthMessage) {
        setMessage({ text: strengthMessage, type: "error" });
        return;
      }
    }

    if (isSignup && !["male", "female"].includes(form.gender)) {
      setMessage({ text: "Please choose Male or Female.", type: "error" });
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
    setMessage({ text: isSignup ? "Creating account..." : "Signing in...", type: "" });
    setResendEmail("");
    setRememberMe(form.keepLogin);

    try {
      if (isSignup) {
        const { data, error } = await supabase.auth.signUp({
          email: normalizedEmail,
          password: form.password,
          options: {
            // The confirmation email's link opens this site's Login page,
            // which signs them in and sends them to their dashboard (see
            // the getSession() check at the top).
            emailRedirectTo: `${window.location.origin}/login`,
            data: {
              full_name: form.fullName.trim(),
              username: form.username.trim(),
              gender: form.gender,
              account_type: form.accountType
            }
          }
        });

        if (error) throw new Error(error.message);

        // With "Confirm email" on, Supabase doesn't report an email that's
        // already used. It returns a user with no identities and sends nothing.
        if (data.user?.identities?.length === 0) {
          throw new Error("That email already has an account. Sign in instead, or use Forgot Password.");
        }

        if (data.session) {
          const { error: profileError } = await supabase.from("profiles").insert({
            id: data.user.id,
            full_name: form.fullName.trim(),
            username: form.username.trim(),
            gender: form.gender,
            account_type: form.accountType
          });

          if (profileError) {
            throw new Error(profileError.code === "23505" ? "That username is already taken." : profileError.message);
          }

          setMessage({ text: "Account created successfully.", type: "success" });
          navigate(dashboardRouteFor(form.accountType), { replace: true });
          return;
        }

        // Email confirmation is required on this project: there's no session
        // yet, so the profile row is created on first sign-in instead (see
        // resolvePostAuthRoute), once user_metadata has full_name/username/gender.
        setMessage({ text: "Account created! Check your email and click the confirmation link to open your dashboard.", type: "success" });
        setResendEmail(normalizedEmail);
        setMode("signin");
      } else {
        const { data, error } = await supabase.auth.signInWithPassword({
          email: normalizedEmail,
          password: form.password
        });

        if (error) throw error;

        setMessage({ text: "Signed in successfully.", type: "success" });
        const destination = await resolvePostAuthRoute(data.user);
        navigate(destination, { replace: true });
      }
    } catch (error) {
      setMessage({ text: getFriendlyErrorMessage(error), type: "error" });
      if (error.message?.toLowerCase().includes("email not confirmed")) setResendEmail(normalizedEmail);
    } finally {
      setSubmitting(false);
    }
  };

  // Sends the confirmation email again, for someone who lost it or whose
  // link expired.
  const handleResend = async () => {
    setSubmitting(true);
    const { error } = await supabase.auth.resend({
      type: "signup",
      email: resendEmail,
      options: { emailRedirectTo: `${window.location.origin}/login` }
    });
    setSubmitting(false);

    setMessage(error
      ? { text: getFriendlyErrorMessage(error), type: "error" }
      : { text: `A new confirmation link was sent to ${resendEmail}. Check your inbox (and spam folder).`, type: "success" });
  };

  return (
    <div className="auth-page-body d-flex align-items-center justify-content-center min-vh-100 py-5">
      <main className={`auth-wrapper position-relative w-100 px-3 ${isSignup ? "max-w-900" : "max-w-500"}`}>
        <div className="auth-bg-glow glow-orange"></div>
        <div className="auth-bg-glow glow-cyan"></div>

        <section
          ref={cardRef}
          onMouseMove={handleTilt}
          onMouseLeave={resetTilt}
          className="auth-card glass-card p-4 p-sm-5 rounded-5 border border-secondary border-opacity-25 shadow-2xl position-relative z-2"
        >
          <div className="text-center mb-4">
            <Link to="/" className="d-inline-block mb-3">
              <img src="/logo-philfreela.svg" alt="PhilFreela" style={{ height: 46 }} className="logo-glow" />
            </Link>
            <p className="text-warning fw-extrabold tracking-widest fs-8 text-uppercase mb-1">PHILFREELA ACCESS PORTAL</p>
            <h1 className="fw-black text-white h3 mb-1">Work Without Limits</h1>
            <p className="text-secondary fs-7 mb-0">Sign in to your account or create one in seconds.</p>
          </div>

          {!isSupabaseConfigured && (
            <div className="config-warning">
              Supabase isn't configured yet. Copy <code>client/.env.example</code> to{" "}
              <code>client/.env</code> and fill in your project URL and anon key.
            </div>
          )}

          <div
            className="mode-switch-grid p-1 rounded-pill bg-black bg-opacity-50 border border-secondary border-opacity-25 mb-4 d-flex"
            role="tablist"
          >
            <button
              type="button"
              className={`mode-btn btn flex-grow-1 rounded-pill fw-bold py-2 fs-7 ${mode === "signin" ? "is-active text-white" : "text-white-50"}`}
              role="tab"
              aria-selected={mode === "signin"}
              onClick={() => { setMode("signin"); setMessage({ text: "", type: "" }); }}
            >
              <i className="bi bi-box-arrow-in-right me-1"></i> Sign In
            </button>
            <button
              type="button"
              className={`mode-btn btn flex-grow-1 rounded-pill fw-bold py-2 fs-7 ${isSignup ? "is-active text-white" : "text-white-50"}`}
              role="tab"
              aria-selected={isSignup}
              onClick={() => { setMode("signup"); setMessage({ text: "", type: "" }); }}
            >
              <i className="bi bi-person-plus me-1"></i> Create Account
            </button>
          </div>

          <form className="d-flex flex-column gap-3" noValidate onSubmit={handleSubmit}>
            {isSignup && (
              <div className="field">
                <label className="form-label text-white-50 fw-semibold fs-7 mb-1">I'm signing up as a...</label>
                <div className="d-flex gap-2" role="radiogroup" aria-label="Account type">
                  <button
                    type="button"
                    role="radio"
                    aria-checked={form.accountType === "freelancer"}
                    className={`btn flex-grow-1 rounded-3 fw-bold py-2 fs-7 ${form.accountType === "freelancer" ? "btn-gradient-orange text-white" : "btn-outline-secondary text-white-50"}`}
                    onClick={() => setForm((prev) => ({ ...prev, accountType: "freelancer" }))}
                  >
                    <i className="bi bi-person-badge me-1"></i> Freelancer
                  </button>
                  <button
                    type="button"
                    role="radio"
                    aria-checked={form.accountType === "client"}
                    className={`btn flex-grow-1 rounded-3 fw-bold py-2 fs-7 ${form.accountType === "client" ? "btn-gradient-orange text-white" : "btn-outline-secondary text-white-50"}`}
                    onClick={() => setForm((prev) => ({ ...prev, accountType: "client" }))}
                  >
                    <i className="bi bi-briefcase me-1"></i> Client
                  </button>
                </div>
              </div>
            )}

            {isSignup && (
              <div className="row g-3">
                <div className="col-md-6">
                  <div className="field">
                    <label htmlFor="fullName" className="form-label text-white-50 fw-semibold fs-7 mb-1">Full Name</label>
                    <div className="input-group">
                      <span className="input-group-text bg-secondary bg-opacity-25 border-secondary text-white-50"><i className="bi bi-person"></i></span>
                      <input
                        id="fullName"
                        type="text"
                        className="form-control bg-secondary bg-opacity-25 border-secondary text-white py-2"
                        placeholder="e.g. Keanne Obias"
                        maxLength={100}
                        autoComplete="name"
                        value={form.fullName}
                        onChange={updateField("fullName")}
                        required
                      />
                    </div>
                  </div>
                </div>

                <div className="col-md-6">
                  <div className="field">
                    <label htmlFor="username" className="form-label text-white-50 fw-semibold fs-7 mb-1">Username</label>
                    <div className="input-group">
                      <span className="input-group-text bg-secondary bg-opacity-25 border-secondary text-white-50"><i className="bi bi-at"></i></span>
                      <input
                        id="username"
                        type="text"
                        className="form-control bg-secondary bg-opacity-25 border-secondary text-white py-2"
                        placeholder="keanne_dev"
                        autoComplete="username"
                        value={form.username}
                        onChange={updateField("username")}
                        required
                      />
                    </div>
                  </div>
                </div>
              </div>
            )}

            <div className={isSignup ? "row g-3" : ""}>
              <div className={isSignup ? "col-md-6" : ""}>
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
                      value={form.email}
                      onChange={updateField("email")}
                      required
                    />
                  </div>
                </div>
              </div>

              {isSignup && (
                <div className="col-md-6">
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
                </div>
              )}
            </div>

            <div className={isSignup ? "row g-3" : ""}>
              <div className={isSignup ? "col-md-6" : ""}>
                <div className="field">
                  <div className="d-flex justify-content-between align-items-center mb-1">
                    <label htmlFor="password" className="form-label text-white-50 fw-semibold fs-7 mb-0">Password</label>
                    {!isSignup && (
                      <Link className="text-orange fs-8 text-decoration-none hover-orange fw-semibold" to="/forgot-password">
                        Forgot password?
                      </Link>
                    )}
                  </div>
                  <div className="input-group">
                    <span className="input-group-text bg-secondary bg-opacity-25 border-secondary text-white-50"><i className="bi bi-lock"></i></span>
                    <input
                      id="password"
                      type={showPassword ? "text" : "password"}
                      className="form-control bg-secondary bg-opacity-25 border-secondary text-white py-2"
                      autoComplete={isSignup ? "new-password" : "current-password"}
                      placeholder="••••••••"
                      value={form.password}
                      onChange={updateField("password")}
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
              </div>

              {isSignup && (
                <div className="col-md-6">
                  <div className="field">
                    <label htmlFor="confirmPassword" className="form-label text-white-50 fw-semibold fs-7 mb-1">Confirm Password</label>
                    <div className="input-group">
                      <span className="input-group-text bg-secondary bg-opacity-25 border-secondary text-white-50"><i className="bi bi-shield-lock"></i></span>
                      <input
                        id="confirmPassword"
                        type={showConfirmPassword ? "text" : "password"}
                        className="form-control bg-secondary bg-opacity-25 border-secondary text-white py-2"
                        autoComplete="new-password"
                        placeholder="••••••••"
                        value={form.confirmPassword}
                        onChange={updateField("confirmPassword")}
                        required
                      />
                      <button
                        type="button"
                        className="btn btn-outline-secondary border-secondary text-white-50 password-toggle"
                        aria-label={showConfirmPassword ? "Hide confirm password" : "Show confirm password"}
                        onClick={() => setShowConfirmPassword((prev) => !prev)}
                      >
                        <i className={`bi ${showConfirmPassword ? "bi-eye-slash" : "bi-eye"}`}></i>
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="d-flex align-items-center justify-content-between my-2">
              <div className="form-check">
                <input
                  id="keepLogin"
                  type="checkbox"
                  className="form-check-input bg-dark border-secondary"
                  checked={form.keepLogin}
                  onChange={updateField("keepLogin")}
                />
                <label className="form-check-label text-white-50 fs-8" htmlFor="keepLogin">Remember me on this device</label>
              </div>
            </div>

            <button
              type="submit"
              className="btn btn-gradient-orange btn-lg w-100 rounded-3 fw-bold text-white shadow-glow py-2"
              disabled={submitting}
            >
              {isSignup ? "Create Account" : "Sign In"}
            </button>
          </form>

          <div className="d-flex align-items-center gap-2 my-3">
            <hr className="flex-grow-1 border-secondary border-opacity-25 m-0" />
            <span className="text-secondary fs-8 text-uppercase fw-semibold">or</span>
            <hr className="flex-grow-1 border-secondary border-opacity-25 m-0" />
          </div>

          <button
            type="button"
            className="btn btn-outline-light w-100 rounded-3 fw-semibold py-2 d-flex align-items-center justify-content-center gap-2"
            onClick={handleGoogleSignIn}
            disabled={googleSubmitting}
          >
            <i className="bi bi-google"></i> Continue with Google
          </button>

          {message.text && (
            <p className={`auth-message mt-3 text-center fs-7 fw-semibold mb-0 ${message.type}`} aria-live="polite">
              {message.text}
            </p>
          )}

          {message.text && resendEmail && (
            <div className="text-center mt-2">
              <button type="button" className="btn btn-link text-orange fs-7 fw-semibold text-decoration-none p-0 hover-orange" onClick={handleResend} disabled={submitting}>
                <i className="bi bi-arrow-repeat me-1"></i> Resend confirmation email
              </button>
            </div>
          )}

          <div className="text-center pt-4 mt-3 border-top border-secondary border-opacity-25">
            <Link to="/" className="text-white-50 text-decoration-none fs-7 hover-orange">
              <i className="bi bi-arrow-left me-1"></i> Back to Homepage
            </Link>
          </div>
        </section>
      </main>
    </div>
  );
}
