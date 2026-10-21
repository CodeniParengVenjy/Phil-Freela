import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "../../lib/supabaseClient";
import { archiveDeletionDay, getMyArchive } from "../../lib/archives";
import { resolvePostAuthRoute } from "../../lib/profile";
import "../../styles/auth.css";

// Where an archived account lands after logging in (see resolvePostAuthRoute
// and the dashboard's own check). An admin archived it, so it can't use anything
// else: this page says so, when it will be deleted, and has a Sign out button.
// Someone who isn't archived is sent on to their dashboard instead.
export default function ArchivedPage() {
  const navigate = useNavigate();
  // undefined while loading, otherwise the user's archive row.
  const [archive, setArchive] = useState(undefined);

  useEffect(() => {
    let active = true;

    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        navigate("/login", { replace: true });
        return;
      }
      const mine = await getMyArchive(session.user.id);
      if (!active) return;
      if (!mine) {
        navigate(await resolvePostAuthRoute(session.user), { replace: true });
        return;
      }
      setArchive(mine);
    })();

    return () => { active = false; };
  }, [navigate]);

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
          <div className="text-center">
            <Link to="/" className="d-inline-block mb-3">
              <img src="/logo-philfreela.svg" alt="PhilFreela" style={{ height: 46 }} className="logo-glow" />
            </Link>

            {archive === undefined ? (
              <p className="text-secondary mb-0">Loading...</p>
            ) : (
              <>
                <i className="bi bi-archive-fill text-warning fs-1 d-block mb-2"></i>
                <h1 className="fw-black text-white h3 mb-2">Account archived</h1>
                <p className="text-secondary fs-7 mb-3">
                  An admin has archived your account, so you can't use PhilFreela right now. Nothing has been deleted yet.
                </p>
                <p className="rounded-3 p-3 mb-3 fs-7 text-white border border-warning border-opacity-50">
                  <i className="bi bi-exclamation-triangle-fill text-warning me-2"></i>
                  If an admin doesn't restore it by {archiveDeletionDay(archive.archived_at)}, your account and everything in it will be deleted for good.
                </p>
                <p className="text-secondary fs-8 mb-0">Think this is a mistake? Please contact the PhilFreela team.</p>

                <div className="pt-4 mt-4 border-top border-secondary border-opacity-25">
                  <button type="button" className="btn btn-link text-white-50 text-decoration-none fs-7 hover-orange" onClick={signOut}>
                    <i className="bi bi-box-arrow-right me-1"></i> Sign out
                  </button>
                </div>
              </>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}
