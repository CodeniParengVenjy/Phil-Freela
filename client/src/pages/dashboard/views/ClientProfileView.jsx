import { useEffect, useState } from "react";
import { Navigate, useOutletContext, useParams } from "react-router-dom";
import { supabase } from "../../../lib/supabaseClient";
import { fetchIsVerified } from "../../../lib/verification";
import VerifiedBadge from "../../../components/VerifiedBadge";
import StarRating from "../../../components/StarRating";
import Avatar from "../../../components/Avatar";
import PerformanceBox from "../components/PerformanceBox";
import CompletedProjects from "../components/CompletedProjects";
import ReportDialog from "../components/ReportDialog";

// A client's public page (/dashboard/clients/:clientId), the counterpart of a
// freelancer's page (Feature 5, Profile transparency): a freelancer can check a
// client's track record before applying to their job or accepting a booking.
// Name, Verified check (or "Not verified"), Message and Report buttons, their
// description, the real Performance numbers and the projects they completed.
// Reached from a client's name on job posts, projects, bookings and the
// Completed Projects lists.
export default function ClientProfileView() {
  const { clientId } = useParams();
  const { currentUserId, openChat, showToast } = useOutletContext();
  // undefined while loading, null when there's no such person.
  const [client, setClient] = useState(undefined);
  const [verified, setVerified] = useState(false);
  // The client being reported (null = Report popup closed).
  const [reportTarget, setReportTarget] = useState(null);
  const isOwnPage = clientId === currentUserId;

  useEffect(() => {
    let active = true;
    Promise.all([
      supabase.from("profiles").select("id, full_name, username, account_type, avatar_path, description").eq("id", clientId).maybeSingle(),
      fetchIsVerified(clientId)
    ]).then(([{ data }, isVerified]) => {
      if (!active) return;
      setClient(data || null);
      setVerified(isVerified);
    });
    return () => {
      active = false;
    };
  }, [clientId]);

  if (client === undefined) {
    return <section className="dashboard-view active-view"><p className="text-secondary fs-7">Loading...</p></section>;
  }

  if (client === null) {
    return (
      <section className="dashboard-view active-view">
        <div className="glass-card rounded-4 p-5 border border-secondary border-opacity-25 text-center">
          <i className="bi bi-person-x text-secondary" style={{ fontSize: "2.5rem" }}></i>
          <p className="text-secondary fs-7 mt-3 mb-0">This client wasn't found.</p>
        </div>
      </section>
    );
  }

  // The person exists but is a freelancer today: they switched roles after
  // posting a job, and the link on that job still points here. Send the
  // visitor to their freelancer page instead of saying "not found". (replace:
  // the Back button then skips this address instead of bouncing forward again.)
  if (client.account_type === "freelancer") {
    return <Navigate to={`/dashboard/freelancers/${client.id}`} replace />;
  }

  const name = client.full_name || client.username;

  return (
    <section className="dashboard-view active-view">
      <div className="glass-card rounded-4 p-4 border border-secondary border-opacity-25 mb-4 d-flex flex-column flex-sm-row align-items-sm-center gap-3">
        <Avatar path={client.avatar_path} name={name} size={72} />
        <div className="flex-grow-1 overflow-hidden">
          <h3 className="text-white fw-bold mb-1 text-break">
            {client.full_name}
            <VerifiedBadge verified={verified} showUnverified />
          </h3>
          <p className="text-secondary fs-7 mb-0 d-flex align-items-center gap-2">
            <span>@{client.username} • Client</span>
            {/* Their average rating from completed projects (Feature 5, transparency). */}
            <StarRating userId={client.id} />
          </p>
        </div>
        {isOwnPage ? (
          <span className="text-secondary fs-8">This is how others see your profile.</span>
        ) : (
          <div className="d-flex flex-wrap gap-2 flex-shrink-0">
            <button type="button" className="btn btn-gradient-role rounded-pill px-4 fw-bold text-white" onClick={() => openChat(client.id)}>
              <i className="bi bi-chat-dots-fill me-1"></i> Message
            </button>
            <button
              type="button"
              className="btn btn-outline-secondary text-white-50 rounded-pill px-3"
              title="Report this client"
              aria-label="Report this client"
              onClick={() => setReportTarget({ type: "user", id: client.id, name })}
            >
              <i className="bi bi-flag-fill"></i>
            </button>
          </div>
        )}
      </div>

      {/* The client's own words about themselves (hidden until they write some). */}
      {client.description && (
        <div className="glass-card rounded-4 p-4 border border-secondary border-opacity-25 mb-4">
          <h5 className="text-white fw-bold mb-2"><i className="bi bi-text-paragraph text-orange me-2"></i> Description</h5>
          <p className="text-light-50 fs-7 mb-0 text-break" style={{ whiteSpace: "pre-line" }}>{client.description}</p>
        </div>
      )}

      {/* Their real track record: the numbers and the projects freelancers did for them.
          key: start fresh when moving from one client's page to another's. */}
      <div className="row g-4" key={clientId}>
        <div className="col-lg-4">
          <PerformanceBox userId={clientId} role="client" className="h-100" />
        </div>
        <div className="col-lg-8">
          <div className="glass-card rounded-4 p-4 border border-secondary border-opacity-25 h-100">
            <CompletedProjects userId={clientId} role="client" />
          </div>
        </div>
      </div>

      <ReportDialog target={reportTarget} onClose={() => setReportTarget(null)} onDone={showToast} />
    </section>
  );
}
