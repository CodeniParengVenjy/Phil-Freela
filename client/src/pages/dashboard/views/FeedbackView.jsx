import { useEffect, useState } from "react";
import { Link, useNavigate, useOutletContext, useParams } from "react-router-dom";
import { MAX_FEEDBACK_LENGTH, getMyRating, getProject, personName, rateProject } from "../../../lib/projects";

// The interactive star picker used to choose a rating (not the read-only
// "★ 4.8 (5)" badge — that's components/StarRating.jsx).
function StarPicker({ value, onChange, label }) {
  const [hover, setHover] = useState(0);

  return (
    <div className="p-4 bg-dark bg-opacity-50 rounded-4 border border-secondary border-opacity-25 text-center">
      <h5 className="text-white fw-bold mb-2">{label}</h5>
      <div className="star-rating d-flex justify-content-center gap-2 fs-2 my-3">
        {[1, 2, 3, 4, 5].map((n) => (
          <i
            key={n}
            className={`bi ${n <= (hover || value) ? "bi-star-fill" : "bi-star"} star-icon cursor-pointer text-warning`}
            onClick={() => onChange(n)}
            onMouseOver={() => setHover(n)}
            onMouseLeave={() => setHover(0)}
          ></i>
        ))}
      </div>
      <small className="text-secondary fs-8">{value ? `${value} / 5 Stars Selected` : "Select 1 to 5 stars"}</small>
    </div>
  );
}

// Ratings and Feedback (/dashboard/feedback/:projectId), reached from a Done
// project. Two different screens share this page, picked by who's rating:
//  - the client rates the freelancer's performance, with optional feedback (screen 4)
//  - the freelancer rates the client's trust and transaction, stars only (screen 5)
// See database/supabase_projects_schema.sql: one rating per person per
// project, only once it's Done, and it can't be edited after it's sent.
export default function FeedbackView() {
  const { projectId } = useParams();
  const { currentUserId, showToast } = useOutletContext();
  const navigate = useNavigate();
  // undefined while loading.
  const [project, setProject] = useState(undefined);
  const [myRating, setMyRating] = useState(undefined);
  const [feedback, setFeedback] = useState("");
  const [stars, setStars] = useState(0);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (!currentUserId) return undefined;
    let active = true;
    Promise.all([getProject(projectId), getMyRating(currentUserId, projectId)]).then(([proj, rating]) => {
      if (!active) return;
      setProject(proj);
      setMyRating(rating);
    });
    return () => {
      active = false;
    };
  }, [projectId, currentUserId]);

  if (project === undefined || myRating === undefined) {
    return <section className="dashboard-view active-view"><p className="text-secondary fs-7">Loading...</p></section>;
  }

  const iAmClient = project?.client_id === currentUserId;
  const other = project && (iAmClient ? project.freelancer : project.client);
  const otherName = personName(other, iAmClient ? "the freelancer" : "the client");

  // Can't rate: the project isn't found or isn't the user's, it isn't Done
  // yet, or it's already been rated.
  if (!project || project.status !== "done" || myRating) {
    return (
      <section className="dashboard-view active-view">
        <div className="glass-card rounded-4 p-5 border border-secondary border-opacity-25 text-center max-w-850 mx-auto">
          <i className="bi bi-star text-secondary" style={{ fontSize: "2.5rem" }}></i>
          <p className="text-secondary fs-7 mt-3 mb-3">
            {myRating
              ? `You already rated this project ${myRating.stars}★. Thanks for the feedback!`
              : "This project can't be rated right now."}
          </p>
          <Link to={project ? `/dashboard/project-details/${projectId}` : "/dashboard/projects"} className="btn btn-outline-role rounded-pill px-4 fw-bold">
            Back to Project
          </Link>
        </div>
      </section>
    );
  }

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (sending) return;
    setSending(true);
    const { error } = await rateProject(currentUserId, projectId, other.id, stars, iAmClient ? feedback : "");
    setSending(false);
    if (error) {
      showToast(error);
      return;
    }
    showToast("Thank you! Your rating has been sent.");
    navigate(`/dashboard/project-details/${projectId}`);
  };

  return (
    <section className="dashboard-view active-view">
      <div className="glass-card rounded-4 p-4 p-md-5 border border-secondary border-opacity-25 max-w-850 mx-auto">
        <div className="mb-4 text-center">
          <span className="badge bg-orange text-white px-3 py-1 rounded-pill fw-bold fs-8 mb-2">CONTRACT EVALUATION</span>
          <h2 className="display-6 fw-bold text-white mb-2">Ratings and Feedback</h2>
          <p className="text-secondary fs-7">Rate your experience working with <strong className="text-white">{otherName}</strong> on "{project.title}".</p>
        </div>

        <form className="d-flex flex-column gap-4" onSubmit={handleSubmit}>
          {iAmClient && (
            <div>
              <label htmlFor="feedbackText" className="form-label text-white fw-semibold fs-6 mb-2">
                <i className="bi bi-chat-quote-fill text-orange me-2"></i> Give a feedback (optional):
              </label>
              <textarea
                id="feedbackText"
                className="form-control bg-secondary bg-opacity-25 border-secondary text-white p-3 fs-7"
                rows="4"
                maxLength={MAX_FEEDBACK_LENGTH}
                placeholder="Write your feedback here..."
                value={feedback}
                onChange={(e) => setFeedback(e.target.value)}
              ></textarea>
              <small className="text-secondary fs-8">{feedback.length}/{MAX_FEEDBACK_LENGTH}</small>
            </div>
          )}

          <StarPicker value={stars} onChange={setStars} label={iAmClient ? "Rate the performance:" : "Rate the trust and transaction:"} />

          <div className="text-center pt-2">
            <button type="submit" className="btn btn-gradient-orange btn-lg rounded-pill px-5 py-3 fw-bold text-white shadow-glow" disabled={sending || stars === 0}>
              <i className="bi bi-check-circle-fill me-2"></i>{sending ? "Sending..." : "Submit Feedback"}
            </button>
          </div>
        </form>
      </div>
    </section>
  );
}
