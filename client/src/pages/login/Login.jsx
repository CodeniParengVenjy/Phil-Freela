import { useCallback, useEffect, useRef, useState } from "react";
import { Link, Navigate, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { isSupabaseConfigured, setRememberMe, supabase } from "../../lib/supabaseClient";
import {
  MAX_NAME_LENGTH, checkName, checkNameWords, cleanName, dashboardRouteFor, resolvePostAuthRoute, noAutofill,
  roleOfRoute, rememberChosenRole, chosenRole, forgetChosenRole
} from "../../lib/profile";
import { EMAIL_PATTERN, getPasswordStrengthMessage } from "../../lib/validators";
import { getFriendlyErrorMessage } from "../../lib/errors";
import { renderGoogleButton } from "../../lib/googleSignIn";
import "../../styles/auth.css";
import { MessageText } from "../../components/Loaders";

const initialForm = {
  fullName: "",
  username: "",
  email: "",
  password: "",
  confirmPassword: "",
  gender: "male",
  keepLogin: false,
  agreedToTerms: false
};

// Freelancer and Client accounts are separate (PLAN-separate-accounts.md).
// One email = one role, forever. The pages:
//   /login              Sign In, with a Freelancer | Client picker
//   /signup             two cards: I'm a Freelancer / I'm a Client
//   /signup/freelancer  the Freelancer sign-up form (no role toggle)
//   /signup/client      the Client sign-up form
const ROLE_TEXT = {
  freelancer: {
    name: "Freelancer",
    other: "client",
    icon: "bi-person-workspace",
    pitch: "Find work and get hired for your skills.",
    points: ["Post your offers and portfolio", "Apply to clients' job posts", "Get paid straight to your GCash"],
    alsoDo: "hire people"
  },
  client: {
    name: "Client",
    other: "freelancer",
    icon: "bi-briefcase",
    pitch: "Hire Filipino freelancers for your projects.",
    points: ["Post jobs and projects", "Book freelancers' offers", "Pay and rate when the work is done"],
    alsoDo: "work as a freelancer"
  }
};

// The Sign In side last used on this device, so most people never touch the picker.
const SIGN_IN_SIDE_KEY = "philfreela.signInSide";

function savedSignInSide() {
  try {
    return localStorage.getItem(SIGN_IN_SIDE_KEY) === "client" ? "client" : "freelancer";
  } catch {
    return "freelancer";
  }
}

// An error that belongs to one box of the form. It is shown right under that
// box instead of at the bottom of the card.
function fieldError(field, text) {
  const error = new Error(text);
  error.field = field;
  return error;
}

// The red line under a box. Draws nothing unless the current message is an
// error for this box.
function FieldError({ message, field }) {
  if (message.type !== "error" || message.field !== field) return null;
  return (
    <p className="field-error" role="alert">
      <i className="bi bi-exclamation-circle me-1"></i>{message.text}
    </p>
  );
}

export default function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  // Which page this is comes from the address (see ROLE_TEXT above).
  const isSignup = location.pathname.startsWith("/signup");
  const signupRole = location.pathname === "/signup/freelancer" ? "freelancer"
    : location.pathname === "/signup/client" ? "client" : null;
  const choosingRole = isSignup && !signupRole;
  // The Sign In picker: which kind of account they are signing in to.
  const [side, setSide] = useState(savedSignInSide);
  // The role this page is about: the sign-up page's role, or the Sign In side.
  const pageRole = isSignup ? signupRole : side;
  // Set when someone signed in on the wrong side: { actual, picked }.
  const [wrongSide, setWrongSide] = useState(null);
  const [form, setForm] = useState(initialForm);
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
  // Google's own button: "loading" while its script loads, "ready" once it's
  // drawn, or "fallback" to show the older redirect button instead.
  const [googleButtonState, setGoogleButtonState] = useState(isSupabaseConfigured ? "loading" : "fallback");
  const googleButtonRef = useRef(null);
  const cardRef = useRef(null);
  const formRef = useRef(null);
  // Always the latest values, for the Google button's callback (drawn once)
  // and for "Sign in as Client" re-sending the form right away.
  const pageRoleRef = useRef(pageRole);
  const sideRef = useRef(side);
  useEffect(() => {
    pageRoleRef.current = pageRole;
    sideRef.current = side;
  }, [pageRole, side]);

  // The last step of every sign-in (email and password, Google's button,
  // Google's redirect). A Freelancer account can't be opened from the Client
  // side or the other way round: it is signed out again and told where to go.
  // picked = the side they chose, or null when unknown (then no check).
  const finishSignIn = useCallback(async (user, picked) => {
    // Kept for Complete Profile, in case this is a first Google sign-in.
    rememberChosenRole(picked);
    const destination = await resolvePostAuthRoute(user);
    const actual = roleOfRoute(destination);
    if (picked && actual && actual !== picked) {
      await supabase.auth.signOut();
      forgetChosenRole();
      setWrongSide({ actual, picked });
      setMessage({
        text: `This email has a ${ROLE_TEXT[actual].name} account, not a ${ROLE_TEXT[picked].name} account. Sign in on the ${ROLE_TEXT[actual].name} side.`,
        type: "error"
      });
      return;
    }
    if (destination !== "/complete-profile") forgetChosenRole();
    navigate(destination, { replace: true });
  }, [navigate]);

  useEffect(() => {
    let active = true;

    // Covers a Google sign-in landing back here with an active session
    // already, and anyone who is already signed in opening /login directly.
    // chosenRole() is only set while a Google redirect is under way.
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!active || !session) return;
      try {
        await finishSignIn(session.user, chosenRole());
      } catch (error) {
        // If the account checks fail, say why instead of doing nothing.
        // (Banned users aren't an error: they're sent to /appeal.)
        if (active) setMessage({ text: error.message, type: "error" });
      }
    });

    return () => {
      active = false;
    };
  }, [finishSignIn]);

  // Draws Google's own "Continue with Google" button (lib/googleSignIn.js), so
  // Google's window names phil-freela.pages.dev instead of the Supabase address.
  // Not on the "Freelancer or Client?" page: the button only appears once a
  // side is picked (Google can't draw into a hidden box).
  useEffect(() => {
    if (!isSupabaseConfigured || choosingRole) return undefined;
    let active = true;

    renderGoogleButton(googleButtonRef.current, {
      onSignedIn: async (user) => {
        setMessage({ text: "Signed in with Google.", type: "success" });
        try {
          // Same next page as any sign-in: Complete Profile the first time,
          // otherwise their dashboard (if this page's side is right).
          await finishSignIn(user, pageRoleRef.current);
        } catch (error) {
          setMessage({ text: error.message, type: "error" });
        }
      },
      onError: (error) => setMessage({ text: getFriendlyErrorMessage(error), type: "error" })
    })
      .then(() => {
        if (active) setGoogleButtonState("ready");
      })
      .catch(() => {
        if (active) setGoogleButtonState("fallback");
      });

    return () => {
      active = false;
    };
  }, [finishSignIn, choosingRole]);

  // The Sign In picker. The choice is remembered on this device.
  const chooseSide = (value) => {
    setSide(value);
    sideRef.current = value;
    setWrongSide(null);
    try {
      localStorage.setItem(SIGN_IN_SIDE_KEY, value);
    } catch {
      // not remembered, that's all
    }
  };

  // The Sign In / Create Account tabs open their own address.
  const openTab = (path) => {
    setMessage({ text: "", type: "" });
    setWrongSide(null);
    navigate(path);
  };

  // "Sign in as Client" after signing in on the wrong side: picks the right
  // side and, when the email and password are still filled in, signs in again.
  const goToRightSide = () => {
    const target = wrongSide.actual;
    chooseSide(target);
    if (isSignup) navigate("/login");
    if (!isSignup && form.email && form.password) {
      formRef.current?.requestSubmit();
    } else {
      setMessage({ text: `Now sign in on the ${ROLE_TEXT[target].name} side.`, type: "" });
    }
  };

  // The older redirect sign-in (Google's window shows the Supabase address).
  // Only used when Google's own button can't load.
  const handleGoogleSignIn = async () => {
    if (!isSupabaseConfigured) {
      setMessage({
        text: "Supabase isn't configured yet. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to client/.env.",
        type: "error"
      });
      return;
    }

    setGoogleSubmitting(true);
    setMessage({ text: "Redirecting to Google...", type: "", kind: "go" });
    // The side is checked when Google sends them back here (finishSignIn).
    rememberChosenRole(pageRoleRef.current);

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
    const value = field === "keepLogin" || field === "agreedToTerms" ? event.target.checked : event.target.value;
    setForm((prev) => ({ ...prev, [field]: value }));
    // Typing in a box clears the error shown under it.
    setMessage((prev) => (prev.field === field ? { text: "", type: "" } : prev));
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

    // Each check names the box it is about ("field"), so the error shows
    // right under that box.
    if (!EMAIL_PATTERN.test(normalizedEmail)) {
      setMessage({ text: "Use a valid email format like name@example.com.", type: "error", field: "email" });
      return;
    }

    // The Name policy: required, 2-50 characters, letters only (lib/profile.js).
    const nameProblem = isSignup ? checkName(form.fullName) : "";
    if (nameProblem) {
      setMessage({ text: nameProblem, type: "error", field: "fullName" });
      return;
    }

    if (isSignup && form.password !== form.confirmPassword) {
      setMessage({ text: "Passwords do not match.", type: "error", field: "confirmPassword" });
      return;
    }

    if (isSignup) {
      const strengthMessage = getPasswordStrengthMessage(form.password);
      if (strengthMessage) {
        setMessage({ text: strengthMessage, type: "error", field: "password" });
        return;
      }
    }

    if (isSignup && !["male", "female"].includes(form.gender)) {
      setMessage({ text: "Please choose Male or Female.", type: "error", field: "gender" });
      return;
    }

    if (isSignup && !form.agreedToTerms) {
      setMessage({ text: "Please agree to the Terms of Service and Privacy Policy to create an account.", type: "error", field: "agreedToTerms" });
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
    setWrongSide(null);
    setRememberMe(form.keepLogin);

    try {
      if (isSignup) {
        // A name or username with a bad word is refused before the account is
        // made (the database refuses it too, but only at first sign-in).
        const wordProblem = await checkNameWords(form.fullName, form.username);
        if (wordProblem) throw fieldError(wordProblem.field, wordProblem.text);

        const { data, error } = await supabase.auth.signUp({
          email: normalizedEmail,
          password: form.password,
          options: {
            // The confirmation email's link opens this site's Login page,
            // which signs them in and sends them to their dashboard (see
            // the getSession() check at the top).
            emailRedirectTo: `${window.location.origin}/login`,
            data: {
              full_name: cleanName(form.fullName),
              username: form.username.trim(),
              gender: form.gender,
              // Fixed by the page (/signup/freelancer or /signup/client).
              account_type: signupRole
            }
          }
        });

        if (error) throw new Error(error.message);

        // With "Confirm email" on, Supabase doesn't report an email that's
        // already used. It returns a user with no identities and sends nothing.
        if (data.user?.identities?.length === 0) {
          throw fieldError("email", "That email already has an account. Sign in instead, or use Forgot Password.");
        }

        if (data.session) {
          const { error: profileError } = await supabase.from("profiles").insert({
            id: data.user.id,
            full_name: cleanName(form.fullName),
            username: form.username.trim(),
            gender: form.gender,
            account_type: signupRole
          });

          if (profileError) {
            if (profileError.code === "23505") throw fieldError("username", "That username is already taken.");
            throw new Error(profileError.message);
          }

          setMessage({ text: "Account created successfully.", type: "success" });
          navigate(dashboardRouteFor(signupRole), { replace: true });
          return;
        }

        // Email confirmation is required on this project: there's no session
        // yet, so the profile row is created on first sign-in instead (see
        // resolvePostAuthRoute), once user_metadata has full_name/username/gender.
        setMessage({ text: "Account created! Check your email and click the confirmation link to open your dashboard. Can't find it? Look in your Spam or Promotions folder, and if it's there, mark it \"Not spam\".", type: "success" });
        setResendEmail(normalizedEmail);
        // Sign In opens on the side of the account just made.
        chooseSide(signupRole);
        navigate("/login");
      } else {
        const { data, error } = await supabase.auth.signInWithPassword({
          email: normalizedEmail,
          password: form.password
        });

        if (error) {
          // Supabase says "Invalid login credentials" both for a wrong
          // password and for an account that doesn't exist. If this email's
          // account was deleted after a ban, say that instead (the database
          // only answers yes/no).
          if (error.code === "invalid_credentials" || /invalid login credentials/i.test(error.message || "")) {
            const { data: wasDeleted } = await supabase.rpc("was_deleted_after_ban", { email: normalizedEmail });
            if (wasDeleted) {
              throw new Error("This account was deleted after a ban and can no longer be used. You can create a new account with this email.");
            }
            // The same sentence for every email: this page no longer tells
            // anyone whether an email belongs to an admin. (Admins use the
            // "Admin? Sign in here" link below, where "Forgot password?" is.)
            // A wrong email or password shows under the Password box.
            throw fieldError("password", "Incorrect email or password.");
          }
          throw error;
        }

        setMessage({ text: "Signed in successfully.", type: "success" });
        // sideRef: "Sign in as Client" re-sends the form before the new side is drawn.
        await finishSignIn(data.user, sideRef.current);
      }
    } catch (error) {
      // error.field is only set by fieldError(); any other error stays at the
      // bottom of the card.
      setMessage({ text: getFriendlyErrorMessage(error), type: "error", field: error.field });
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

  // Old links (/login?mode=signup&role=client) open the new sign-up pages.
  if (location.pathname === "/login" && searchParams.get("mode") === "signup") {
    const oldRole = searchParams.get("role");
    return <Navigate to={oldRole === "freelancer" || oldRole === "client" ? `/signup/${oldRole}` : "/signup"} replace />;
  }

  // The words at the top of the card, for each page.
  const heading = choosingRole
    ? { eyebrow: "CREATE AN ACCOUNT", title: "How will you use PhilFreela?", text: "Pick one. Freelancer and Client accounts are separate." }
    : signupRole
      ? { eyebrow: `${ROLE_TEXT[signupRole].name.toUpperCase()} ACCOUNT`, title: `Create your ${ROLE_TEXT[signupRole].name} account`, text: ROLE_TEXT[signupRole].pitch }
      : { eyebrow: "PHILFREELA ACCESS PORTAL", title: "Work Without Limits", text: "Sign in to your Freelancer or Client account." };
  // Client pages use cyan, Freelancer pages orange (like the homepage cards).
  const accentText = pageRole === "client" ? "text-info" : "text-warning";
  const submitClass = pageRole === "client" ? "btn-gradient-cyan" : "btn-gradient-orange";

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
            <p className={`${choosingRole ? "text-warning" : accentText} fw-extrabold tracking-widest fs-8 text-uppercase mb-1`}>{heading.eyebrow}</p>
            <h1 className="fw-black text-white h3 mb-1">{heading.title}</h1>
            <p className="text-secondary fs-7 mb-0">{heading.text}</p>
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
              className={`mode-btn btn flex-grow-1 rounded-pill fw-bold py-2 fs-7 ${!isSignup ? "is-active text-white" : "text-white-50"}`}
              role="tab"
              aria-selected={!isSignup}
              onClick={() => openTab("/login")}
            >
              <i className="bi bi-box-arrow-in-right me-1"></i> Sign In
            </button>
            <button
              type="button"
              className={`mode-btn btn flex-grow-1 rounded-pill fw-bold py-2 fs-7 ${isSignup ? "is-active text-white" : "text-white-50"}`}
              role="tab"
              aria-selected={isSignup}
              onClick={() => openTab("/signup")}
            >
              <i className="bi bi-person-plus me-1"></i> Create Account
            </button>
          </div>

          {/* /signup: two big cards, each opens its own sign-up page. */}
          {choosingRole && (
            <>
              <div className="row g-3">
                {["freelancer", "client"].map((role) => (
                  <div className="col-md-6" key={role}>
                    <Link to={`/signup/${role}`} className={`role-card role-card-${role} d-flex flex-column h-100 text-decoration-none rounded-4 p-4`}>
                      <span className="role-card-icon"><i className={`bi ${ROLE_TEXT[role].icon}`}></i></span>
                      <h2 className="h5 fw-bold text-white mt-3 mb-1">I'm a {ROLE_TEXT[role].name}</h2>
                      <p className="text-secondary fs-7 mb-3">{ROLE_TEXT[role].pitch}</p>
                      <ul className="list-unstyled fs-8 text-white-50 d-flex flex-column gap-1 mb-4">
                        {ROLE_TEXT[role].points.map((point) => (
                          <li key={point}><i className="bi bi-check2 role-card-accent me-2"></i>{point}</li>
                        ))}
                      </ul>
                      <span className="role-card-accent fw-bold fs-7 mt-auto">
                        Create a {ROLE_TEXT[role].name} account <i className="bi bi-arrow-right ms-1"></i>
                      </span>
                    </Link>
                  </div>
                ))}
              </div>
              <p className="text-center text-white-50 fs-8 mt-3 mb-0">
                <i className="bi bi-info-circle me-1"></i>
                To work and hire, make one of each with two different emails.
              </p>
            </>
          )}

          {!choosingRole && (
          <form ref={formRef} className="d-flex flex-column gap-3" noValidate onSubmit={handleSubmit}>
            {/* Sign In: which kind of account. The wrong side is refused (finishSignIn). */}
            {!isSignup && (
              <div className="field">
                <label className="form-label text-white-50 fw-semibold fs-7 mb-1">Sign in as</label>
                <div className="d-flex gap-2" role="radiogroup" aria-label="Sign in as">
                  {["freelancer", "client"].map((role) => (
                    <button
                      key={role}
                      type="button"
                      role="radio"
                      aria-checked={side === role}
                      className={`btn flex-grow-1 rounded-3 fw-bold py-2 fs-7 ${side === role ? `${role === "client" ? "btn-gradient-cyan" : "btn-gradient-orange"} text-white` : "btn-outline-secondary text-white-50"}`}
                      onClick={() => chooseSide(role)}
                    >
                      <i className={`bi ${ROLE_TEXT[role].icon} me-1`}></i> {ROLE_TEXT[role].name}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Sign-up page: the role is fixed by the page, not a toggle. */}
            {signupRole && (
              <div className={`role-note role-note-${signupRole} rounded-3 px-3 py-2 fs-8`}>
                <i className={`bi ${ROLE_TEXT[signupRole].icon} me-2`}></i>
                This will always be a <strong>{ROLE_TEXT[signupRole].name}</strong> account. To {ROLE_TEXT[signupRole].alsoDo} too,
                make a separate {ROLE_TEXT[ROLE_TEXT[signupRole].other].name} account with another email.{" "}
                <Link to={`/signup/${ROLE_TEXT[signupRole].other}`} className="fw-semibold text-decoration-none role-note-link">
                  Make a {ROLE_TEXT[ROLE_TEXT[signupRole].other].name} account instead
                </Link>
              </div>
            )}

            {isSignup && (
              <div className="row g-3">
                <div className="col-md-6">
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
                        {...noAutofill("su1")}
                        value={form.fullName}
                        onChange={updateField("fullName")}
                        required
                      />
                    </div>
                    <FieldError message={message} field="fullName" />
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
                        {...noAutofill("su2")}
                        value={form.username}
                        onChange={updateField("username")}
                        required
                      />
                    </div>
                    <FieldError message={message} field="username" />
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
                  <FieldError message={message} field="email" />
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
                    <FieldError message={message} field="gender" />
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
                  <FieldError message={message} field="password" />
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
                    <FieldError message={message} field="confirmPassword" />
                  </div>
                </div>
              )}
            </div>

            {isSignup && (
              <div className="form-check my-2">
                <input
                  id="agreedToTerms"
                  type="checkbox"
                  className="form-check-input bg-dark border-secondary"
                  checked={form.agreedToTerms}
                  onChange={updateField("agreedToTerms")}
                />
                <label className="form-check-label text-white-50 fs-8" htmlFor="agreedToTerms">
                  I agree to PhilFreela's{" "}
                  <a href="/terms" target="_blank" rel="noopener noreferrer" className="hover-orange">Terms of Service</a>{" "}
                  and{" "}
                  <a href="/privacy" target="_blank" rel="noopener noreferrer" className="hover-orange">Privacy Policy</a>
                </label>
                <FieldError message={message} field="agreedToTerms" />
              </div>
            )}

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
              className={`btn ${submitClass} btn-lg w-100 rounded-3 fw-bold text-white shadow-glow py-2`}
              disabled={submitting}
            >
              {isSignup ? `Create ${ROLE_TEXT[signupRole].name} Account` : `Sign In as ${ROLE_TEXT[side].name}`}
            </button>
          </form>
          )}

          {/* Kept in the page (only hidden) on the cards page, so Google's
              button box stays the same one when a side is picked. */}
          <div className={`align-items-center gap-2 my-3 ${choosingRole ? "d-none" : "d-flex"}`}>
            <hr className="flex-grow-1 border-secondary border-opacity-25 m-0" />
            <span className="text-secondary fs-8 text-uppercase fw-semibold">or</span>
            <hr className="flex-grow-1 border-secondary border-opacity-25 m-0" />
          </div>

          {/* Google draws its own button in here (see the effect above). */}
          <div
            ref={googleButtonRef}
            className={`justify-content-center ${googleButtonState === "fallback" || choosingRole ? "d-none" : "d-flex"}`}
            style={{ minHeight: 44 }}
          ></div>

          {googleButtonState === "fallback" && !choosingRole && (
            <button
              type="button"
              className="btn btn-outline-light w-100 rounded-3 fw-semibold py-2 d-flex align-items-center justify-content-center gap-2"
              onClick={handleGoogleSignIn}
              disabled={googleSubmitting}
            >
              <i className="bi bi-google"></i> Continue with Google
            </button>
          )}

          {/* Messages that aren't about one box (signing in, account created,
              no internet). Box errors are drawn by <FieldError> above. */}
          {message.text && !message.field && (
            <p className={`auth-message mt-3 text-center fs-7 fw-semibold mb-0 ${message.type}`} aria-live="polite">
              <MessageText message={message} />
            </p>
          )}

          {/* Signed in on the wrong side: one button to the right one. */}
          {message.text && !message.field && wrongSide && (
            <div className="text-center mt-2">
              <button
                type="button"
                className={`btn btn-sm rounded-pill fw-bold px-3 text-white ${wrongSide.actual === "client" ? "btn-gradient-cyan" : "btn-gradient-orange"}`}
                onClick={goToRightSide}
                disabled={submitting}
              >
                <i className={`bi ${ROLE_TEXT[wrongSide.actual].icon} me-1`}></i> Sign in as {ROLE_TEXT[wrongSide.actual].name}
              </button>
            </div>
          )}

          {message.text && !message.field && resendEmail && (
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
            {!isSignup && (
              <p className="mt-2 mb-0 fs-8 text-white-50">
                Admin?{" "}
                <Link
                  to="/admin/login"
                  state={form.email.trim() ? { prefill: form.email.trim().toLowerCase() } : undefined}
                  className="text-orange text-decoration-none hover-orange fw-semibold"
                >
                  Sign in here
                </Link>
              </p>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}
