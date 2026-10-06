import { useEffect, useState } from "react";
import { Link, useOutletContext } from "react-router-dom";
import { supabase } from "../../../lib/supabaseClient";
import { getRecommendations } from "../../../lib/aiService";
import { getCategory } from "../../../lib/categories";
import { profilePath } from "../../../lib/profileStats";
import { useVerifiedIds } from "../../../lib/useVerifiedIds";
import VerifiedBadge from "../../../components/VerifiedBadge";
import BookDialog from "./BookDialog";

const SHOW = 8;
const SERVICE_COLUMNS = "id, title, category, price, freelancer:profiles!services_freelancer_id_fkey(id, full_name, username)";
const JOB_COLUMNS = "id, title, category, budget, client:profiles!job_posts_client_id_fkey(id, full_name, username)";

// The reasons the AI service gives, in words (freelancers see jobs, clients
// see services).
const REASONS = {
  match: { icon: "bi-stars", jobs: "Matches your work", services: "Matches what you need" },
  similar_users: { icon: "bi-people-fill", jobs: "Freelancers like you applied", services: "Clients like you contacted them" },
  // The owner's record from completed projects (Feature 5), used by the ranking.
  rated: { icon: "bi-star-fill", text: "Highly rated" },
  experienced: { icon: "bi-trophy-fill", text: "5+ projects done" },
  verified: { icon: "bi-patch-check-fill", text: "Verified" },
  fast_reply: { icon: "bi-lightning-charge-fill", text: "Replies within an hour" },
  new: { icon: "bi-clock-fill", text: "New" }
};

// "Recommended for you" on the dashboard home: PhilFreela's Hybrid
// recommendation system (content-based filtering + collaborative filtering +
// ranking, see ai-service/recommendations.py). The AI service picks and
// orders the posts; this loads them under the normal database rules (hidden
// posts are left out) and keeps the AI's order.
export default function RecommendedForYou() {
  const { accountType, currentUserId, openChat, showToast } = useOutletContext();
  const want = accountType === "freelancer" ? "jobs" : "services";
  const [state, setState] = useState({ loading: true, personalized: false, items: [], error: false });
  // The service being booked (null = Book popup closed). Only clients book.
  const [bookTarget, setBookTarget] = useState(null);

  useEffect(() => {
    let active = true;

    (async () => {
      try {
        const { personalized, results = [] } = await getRecommendations();
        const ids = results.map((r) => r.id);
        let rows = [];
        if (ids.length) {
          const { data, error } = want === "jobs"
            ? await supabase.from("job_posts").select(JOB_COLUMNS).in("id", ids)
            : await supabase.from("services").select(SERVICE_COLUMNS).in("id", ids);
          if (error) throw error;
          rows = data || [];
        }
        const byId = Object.fromEntries(rows.map((row) => [row.id, row]));
        const items = results
          .filter((r) => byId[r.id])
          .slice(0, SHOW)
          .map((r) => ({ ...byId[r.id], reasons: r.reasons }));
        if (active) setState({ loading: false, personalized, items, error: false });
      } catch {
        if (active) setState({ loading: false, personalized: false, items: [], error: true });
      }
    })();

    return () => {
      active = false;
    };
  }, [want]);

  const ownerOf = (item) => (want === "jobs" ? item.client : item.freelancer);
  const verifiedIds = useVerifiedIds(state.items.map((item) => ownerOf(item)?.id));

  // Nothing to recommend yet: the home page shows only its usual list.
  if (!state.loading && !state.error && state.items.length === 0) return null;

  const title = state.loading || state.personalized ? "Recommended for you" : "New and trusted on PhilFreela";
  const subtitle = state.personalized
    ? (want === "jobs"
      ? "Picked by PhilFreela's AI from your profile and services, the jobs freelancers like you applied to, and how reliable each client's record is."
      : "Picked by PhilFreela's AI from your profile and projects, the freelancers clients like you contacted, and who has a strong record and replies fast.")
    : (want === "jobs"
      ? "Write a profile description in Settings or post a service to get jobs that match your work."
      : "Write a profile description in Settings or post a project to get freelancers that match what you need.");

  return (
    <section className="dashboard-view active-view mb-4">
      <div className="glass-card rounded-4 p-4 border border-secondary border-opacity-25">
        <h4 className="text-white fw-bold mb-1"><i className="bi bi-stars text-role me-2"></i> {title}</h4>
        {!state.loading && <p className="text-secondary fs-7 mb-3">{subtitle}</p>}

        {state.loading && (
          <p className="text-secondary fs-7 py-3 mb-0">
            <span className="spinner-border spinner-border-sm me-2" aria-hidden="true"></span>Finding recommendations...
          </p>
        )}
        {state.error && <p className="text-secondary fs-7 mb-0">Recommendations aren't available right now.</p>}

        <div className="row g-3">
          {state.items.map((item) => (
            <div className="col-sm-6 col-xl-3" key={item.id}>
              <RecommendationCard
                item={item}
                want={want}
                owner={ownerOf(item)}
                verified={verifiedIds.has(ownerOf(item)?.id)}
                isMine={ownerOf(item)?.id === currentUserId}
                onMessage={openChat}
                canBook={accountType === "client"}
                onBook={setBookTarget}
              />
            </div>
          ))}
        </div>
      </div>

      <BookDialog
        key={bookTarget?.service?.id}
        target={bookTarget}
        onClose={() => setBookTarget(null)}
        onBooked={() => {
          showToast(`Booking sent to ${bookTarget.freelancerName}. You can follow it in Bookings.`);
          setBookTarget(null);
        }}
      />
    </section>
  );
}

// One recommended job post or service, with the reasons it was picked. A
// client can book a recommended service right here (canBook).
function RecommendationCard({ item, want, owner, verified, isMine, onMessage, canBook, onBook }) {
  const category = getCategory(item.category);
  const ownerName = owner?.full_name || owner?.username || (want === "jobs" ? "Client" : "Freelancer");
  const amount = want === "jobs" ? item.budget : item.price;

  return (
    <div className="p-3 rounded-3 bg-dark bg-opacity-50 border border-secondary border-opacity-25 h-100 d-flex flex-column gap-2 hover-lift">
      <div className="d-flex align-items-start gap-2">
        <div className="rounded-3 bg-role-subtle text-role d-flex align-items-center justify-content-center flex-shrink-0 fs-5" style={{ width: 40, height: 40 }}>
          <i className={`bi ${category.icon}`}></i>
        </div>
        <div className="overflow-hidden">
          <h6 className="text-white fw-bold mb-1 text-break">{item.title}</h6>
          <div className="fs-8 text-white-50">
            {/* Opens the owner's public page: a freelancer's portfolio, a client's record. */}
            {owner?.id ? (
              <Link to={profilePath(want === "jobs" ? "client" : "freelancer", owner.id)} className="text-white-50">{ownerName}</Link>
            ) : ownerName}
            <VerifiedBadge verified={verified} />
          </div>
        </div>
      </div>

      <div className="d-flex align-items-center gap-2 fs-8 flex-wrap">
        {amount && <span className="text-warning">₱{Number(amount).toLocaleString()}</span>}
        <span className="badge bg-black text-light-50 text-wrap text-start">{category.label}</span>
      </div>

      {/* Why the AI picked it. */}
      <div className="d-flex flex-wrap gap-1">
        {item.reasons.map((code) => {
          const reason = REASONS[code];
          if (!reason) return null;
          return (
            <span key={code} className="badge rounded-pill bg-role-subtle text-role fw-semibold">
              <i className={`bi ${reason.icon} me-1`}></i>{reason.text || reason[want]}
            </span>
          );
        })}
      </div>

      <div className="mt-auto pt-1">
        {want === "jobs" ? (
          <Link to={`/dashboard/job-details/${item.id}`} className="btn btn-sm btn-gradient-role rounded-pill px-3 fw-bold text-white w-100">
            View job
          </Link>
        ) : !isMine && owner?.id && (
          <div className="d-flex gap-2">
            {canBook && (
              <button
                type="button"
                className="btn btn-sm btn-outline-role rounded-pill px-3 fw-bold flex-grow-1"
                onClick={() => onBook({ freelancerId: owner.id, freelancerName: ownerName, service: { id: item.id, title: item.title } })}
              >
                <i className="bi bi-calendar-check me-1"></i> Book
              </button>
            )}
            <button type="button" className="btn btn-sm btn-gradient-role rounded-pill px-3 fw-bold text-white flex-grow-1" onClick={() => onMessage(owner.id)}>
              <i className="bi bi-chat-dots me-1"></i> Message
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
