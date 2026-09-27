import { useEffect, useState } from "react";
import { useOutletContext, useParams } from "react-router-dom";
import { supabase } from "../../../lib/supabaseClient";
import { fetchIsVerified } from "../../../lib/verification";
import VerifiedBadge from "../../../components/VerifiedBadge";
import Avatar from "../../../components/Avatar";
import PortfolioSection from "../components/PortfolioSection";

// A freelancer's public page (/dashboard/freelancers/:freelancerId): their
// name, Verified badge, a Message button, and their portfolio. Reached from
// "by <name>" on Browse Services. The freelancer's @username is shown faintly
// over their slides, so a screenshot still shows whose work it is.
export default function FreelancerPortfolioView() {
  const { freelancerId } = useParams();
  const { currentUserId, openChat } = useOutletContext();
  // undefined while loading, null when there's no such freelancer.
  const [freelancer, setFreelancer] = useState(undefined);
  const [verified, setVerified] = useState(false);
  const isOwnPage = freelancerId === currentUserId;

  useEffect(() => {
    let active = true;
    Promise.all([
      supabase.from("profiles").select("id, full_name, username, account_type, avatar_path").eq("id", freelancerId).maybeSingle(),
      fetchIsVerified(freelancerId)
    ]).then(([{ data }, isVerified]) => {
      if (!active) return;
      setFreelancer(data?.account_type === "freelancer" ? data : null);
      setVerified(isVerified);
    });
    return () => {
      active = false;
    };
  }, [freelancerId]);

  if (freelancer === undefined) {
    return <section className="dashboard-view active-view"><p className="text-secondary fs-7">Loading...</p></section>;
  }

  if (freelancer === null) {
    return (
      <section className="dashboard-view active-view">
        <div className="glass-card rounded-4 p-5 border border-secondary border-opacity-25 text-center">
          <i className="bi bi-person-x text-secondary" style={{ fontSize: "2.5rem" }}></i>
          <p className="text-secondary fs-7 mt-3 mb-0">This freelancer wasn't found.</p>
        </div>
      </section>
    );
  }

  return (
    <section className="dashboard-view active-view">
      <div className="glass-card rounded-4 p-4 border border-secondary border-opacity-25 mb-4 d-flex flex-column flex-sm-row align-items-sm-center gap-3">
        <Avatar path={freelancer.avatar_path} name={freelancer.full_name || freelancer.username} size={72} />
        <div className="flex-grow-1 overflow-hidden">
          <h3 className="text-white fw-bold mb-1 text-break">
            {freelancer.full_name}
            <VerifiedBadge verified={verified} showUnverified />
          </h3>
          <p className="text-secondary fs-7 mb-0">@{freelancer.username} • Freelancer</p>
        </div>
        {isOwnPage ? (
          <span className="text-secondary fs-8">This is how others see your portfolio.</span>
        ) : (
          <button type="button" className="btn btn-gradient-role rounded-pill px-4 fw-bold text-white flex-shrink-0" onClick={() => openChat(freelancer.id)}>
            <i className="bi bi-chat-dots-fill me-1"></i> Message
          </button>
        )}
      </div>

      <div className="glass-card rounded-4 p-4 border border-secondary border-opacity-25">
        {/* key: start fresh when moving from one freelancer's page to another's. */}
        <PortfolioSection key={freelancerId} freelancerId={freelancerId} ownerName={freelancer.username} />
      </div>
    </section>
  );
}
