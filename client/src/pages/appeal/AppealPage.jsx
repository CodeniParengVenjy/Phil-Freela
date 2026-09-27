import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "../../lib/supabaseClient";
import { getActiveSuspension, resolvePostAuthRoute } from "../../lib/profile";
import { banDeletionDay, formatEndDate, restrictionText, suspensionStatus } from "../../lib/suspensions";
import { getViolation } from "../../lib/violations";
import { APPEAL_MAX_LENGTH, APPEAL_MIN_LENGTH, getAppealFor, sendAppeal } from "../../lib/appeals";
import "../../styles/auth.css";

// Where suspended and banned users appeal. Banned users are sent here after
// logging in, since it's the only page they can use; suspended users come
// from the dashboard banner or their suspension notification. It shows the
// penalty, then either the appeal form or what happened to their appeal.
export default function AppealPage() {
  const navigate = useNavigate();
  const [userId, setUserId] = useState(null);
  // undefined = still loading, null = no penalty in effect, otherwise the
  // user's user_suspensions row.
  const [suspension, setSuspension] = useState(undefined);
  // undefined = still loading, null = not sent yet.
  const [appeal, setAppeal] = useState(undefined);
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;

    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        navigate("/login", { replace: true });
        return;
      }
      const current = await getActiveSuspension(session.user.id);
      const sent = current ? await getAppealFor(current) : null;
      if (!active) return;
      setUserId(session.user.id);
      setSuspension(current);
      setAppeal(sent);
    })();

    return () => { active = false; };
  }, [navigate]);

  const banned = suspensionStatus(suspension) === "banned";
  const trimmed = message.trim();

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (trimmed.length < APPEAL_MIN_LENGTH) return;

    setSending(true);
    setError("");
    const { data, error: sendError } = await sendAppeal(userId, trimmed);
    setSending(false);

    if (sendError) {
      setError(sendError);
      return;
    }
    setAppeal(data);
  };

  // Back to the right dashboard (freelancer or client).
  const goToDashboard = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    navigate(session ? await resolvePostAuthRoute(session.user) : "/login", { replace: true });
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    navigate("/login", { replace: true });
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
            {suspension && (
              <>
                <i className={`bi ${banned ? "bi-slash-circle-fill text-danger" : "bi-exclamation-triangle-fill text-warning"} fs-1 d-block mb-2`}></i>
                <h1 className="fw-black text-white h3 mb-1">{banned ? "Account banned" : "Account suspended"}</h1>
                <p className="text-secondary fs-7 mb-0">
                  {banned ? "You can't use PhilFreela until an admin lifts the ban." : "You can still use PhilFreela, with some limits until the end date."}
                </p>
              </>
            )}
          </div>

          {suspension === undefined && <p className="text-secondary text-center mb-0">Loading...</p>}

          {suspension === null && (
            <div className="text-center">
              <p className="text-white mb-3">Your account has no active suspension or ban.</p>
              <button type="button" className="btn btn-gradient-orange rounded-pill px-4 fw-bold text-white" onClick={goToDashboard}>
                Go to dashboard
              </button>
            </div>
          )}

          {suspension && (
            <>
              {/* The penalty, the same way the admin sees it. */}
              <div className="rounded-3 p-3 mb-4 bg-dark bg-opacity-50 border border-secondary border-opacity-25 fs-7 text-white d-flex flex-column gap-1">
                <div><span className="text-white-50">Violation: </span>{getViolation(suspension.violation)?.label || "Other"}</div>
                <div><span className="text-white-50">Until: </span>{banned ? "An admin lifts it" : formatEndDate(suspension.ends_at)}</div>
                {!banned && (
                  <div><span className="text-white-50">Restrictions: </span>You {restrictionText(suspension.blocks_posting, suspension.blocks_messaging)}</div>
                )}
                <div style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}><span className="text-white-50">Reason: </span>{suspension.reason}</div>
              </div>

              {/* Banned accounts are deleted after 100 days (a daily database
                  job), but never while an appeal is waiting for review. */}
              {banned && appeal !== undefined && (
                <p className="rounded-3 p-3 mb-4 fs-7 text-white border border-danger border-opacity-50">
                  <i className="bi bi-exclamation-octagon-fill text-danger me-2"></i>
                  {appeal?.status === "pending"
                    ? "Your account won't be deleted while your appeal is waiting for review."
                    : `If the ban isn't lifted by ${banDeletionDay(suspension)}, your account and everything in it will be deleted for good.`}
                </p>
              )}

              {appeal === undefined && <p className="text-secondary text-center mb-0">Loading...</p>}

              {/* Not appealed yet: the form. */}
              {appeal === null && (
                <form className="d-flex flex-column gap-2" onSubmit={handleSubmit}>
                  <label htmlFor="appealMessage" className="form-label text-white fw-semibold fs-7 mb-0">
                    Think this is a mistake? Tell an admin why.
                  </label>
                  <textarea
                    id="appealMessage"
                    className="form-control bg-secondary bg-opacity-25 border-secondary text-white p-3"
                    rows={5}
                    maxLength={APPEAL_MAX_LENGTH}
                    placeholder="Explain what happened and why the penalty should be lifted..."
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    required
                  />
                  <div className="d-flex justify-content-between text-secondary fs-8">
                    <span>You can appeal once. {banned ? "You'll see the result here when you log in." : "You'll get a notification with the result."}</span>
                    <span>{message.length}/{APPEAL_MAX_LENGTH}</span>
                  </div>
                  {error && <p className="auth-message error text-center fs-7 fw-semibold mb-0">{error}</p>}
                  <button
                    type="submit"
                    className="btn btn-gradient-orange w-100 rounded-3 fw-bold text-white py-2 mt-1"
                    disabled={sending || trimmed.length < APPEAL_MIN_LENGTH}
                  >
                    {sending ? "Sending..." : "Send appeal"}
                  </button>
                </form>
              )}

              {/* Already appealed: what happened to it. */}
              {appeal && (
                <div className={`rounded-3 p-3 fs-7 border ${appeal.status === "rejected" ? "border-danger" : "border-warning"} border-opacity-50`}>
                  <p className="text-white fw-bold mb-1">
                    <i className={`bi ${appeal.status === "rejected" ? "bi-x-circle-fill text-danger" : "bi-hourglass-split text-warning"} me-2`}></i>
                    {appeal.status === "rejected" ? "Appeal not accepted" : "Appeal sent. Waiting for an admin."}
                  </p>
                  <p className="text-secondary fs-8 mb-2">Sent {new Date(appeal.created_at).toLocaleString()}</p>
                  <p className="text-white-50 mb-0" style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>"{appeal.message}"</p>
                  {appeal.status === "rejected" && (
                    <p className="text-white mt-2 mb-0" style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>
                      <span className="text-white-50">Admin's note: </span>{appeal.admin_note}
                    </p>
                  )}
                </div>
              )}

              {/* Banned users can only sign out; suspended users go back. */}
              <div className="text-center pt-4 mt-4 border-top border-secondary border-opacity-25">
                {banned ? (
                  <button type="button" className="btn btn-link text-white-50 text-decoration-none fs-7 hover-orange" onClick={signOut}>
                    <i className="bi bi-box-arrow-right me-1"></i> Sign out
                  </button>
                ) : (
                  <button type="button" className="btn btn-link text-white-50 text-decoration-none fs-7 hover-orange" onClick={goToDashboard}>
                    <i className="bi bi-arrow-left me-1"></i> Back to dashboard
                  </button>
                )}
              </div>
            </>
          )}
        </section>
      </main>
    </div>
  );
}
