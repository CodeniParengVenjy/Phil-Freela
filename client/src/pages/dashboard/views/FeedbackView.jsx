import { useEffect, useState } from "react";
import { Link, useNavigate, useOutletContext, useParams } from "react-router-dom";
import { MAX_FEEDBACK_LENGTH, getMyRating, getProject, personName, rateProject, ratingDeadline } from "../../../lib/projects";

// The interactive star picker used to choose a rating (not the read-only
// "★ 4.8 (5)" badge — that's components/StarRating.jsx). Each star is a
// button, so it also works with the keyboard and a screen reader.
function StarPicker({ value, onChange, label }) {
  const [hover, setHover] = useState(0);

  return (
    <div>
      <h5 className="text-white fw-semibold mb-2">{label}</h5>
      <div className="star-rating d-flex gap-3 fs-1" role="group" aria-label={label} onMouseLeave={() => setHover(0)}>
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            className="btn p-0 border-0 lh-1 text-warning star-icon"
            style={{ fontSize: "inherit" }}
            aria-label={`${n} ${n === 1 ? "star" : "stars"}`}
            aria-pressed={n === value}
            onClick={() => onChange(n)}
            onMouseOver={() => setHover(n)}
            onFocus={() => setHover(n)}
            onBlur={() => setHover(0)}
          >
            <i className={`bi ${n <= (hover || value) ? "bi-star-fill" : "bi-star"}`}></i>
          </button>
        ))}
      </div>
      <small className="text-secondary fs-8">{value ? `${value} / 5 stars selected` : "Select 1 to 5 stars"}</small>
    </div>
  );
}

// Ratings and Feedback (/dashboard/feedback/:projectId), reached from a Done
// project. Two different screens share this page, picked by who's rating:
//  - the client rates the freelancer's performance, with optional feedback (screen 4)
//  - the freelancer rates the client's trust and transaction, stars only (screen 5)
// See database/supabase_projects_schema.sql: one rating per person per
// project, only once it's Done, and it can't be edited after it's sent.
// Ratings are blind (database/supabase_blind_ratings_schema.sql): the other
// person can't see this rating until they have rated too, or until the time
// for rating is over. After that time this page no longer takes a rating.
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
  // When rating closes for this project (null if it isn't Done).
  const deadline = project?.status === "done" ? ratingDeadline(project) : null;

  // Can't rate: the project isn't found or isn't the user's, it isn't Done
  // yet, it's already been rated, or the time for rating is over.
  if (!project || project.status !== "done" || myRating || deadline?.ended) {
    let reason = "This project can't be rated right now.";
    if (myRating) reason = `You already rated this project ${myRating.stars}★. Thanks for the feedback!`;
    else if (deadline?.ended) reason = `The rating period for this project ended on ${deadline.day}.`;

    return (
      <section className="dashboard-view active-view">
        <div className="glass-card rounded-4 p-5 border border-secondary border-opacity-25 text-center max-w-850 mx-auto">
          <i className="bi bi-star text-secondary" style={{ fontSize: "2.5rem" }}></i>
          <p className="text-secondary fs-7 mt-3 mb-3">{reason}</p>
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
        <h2 className="display-6 fw-bold text-white mb-2">Ratings and Feedback</h2>
        <p className="text-secondary fs-7 mb-4">Rate your experience working with <strong className="text-white">{otherName}</strong> on "{project.title}".</p>

        <form className="d-flex flex-column gap-4" onSubmit={handleSubmit}>
          {iAmClient && (
            <div>
              <label htmlFor="feedbackText" className="form-label h5 text-white fw-semibold mb-2">Give a feedback:</label>
              <textarea
                id="feedbackText"
                className="form-control feedback-box bg-secondary bg-opacity-25 border-secondary text-white p-3 fs-7"
                rows="5"
                maxLength={MAX_FEEDBACK_LENGTH}
                placeholder="(optional)"
                value={feedback}
                onChange={(e) => setFeedback(e.target.value)}
              ></textarea>
              <small className="text-secondary fs-8">{feedback.length}/{MAX_FEEDBACK_LENGTH}</small>
            </div>
          )}

          <StarPicker value={stars} onChange={setStars} label={iAmClient ? "Rate the performance:" : "Rate the trust and transaction:"} />

          {/* The blind rule, in one line, before they send it. */}
          <p className="text-white-50 fs-7 mb-0">
            <i className="bi bi-eye-slash-fill me-2"></i>
            Blind rating: {otherName} won't see this until they rate you too, or until {deadline.day}. It can't be changed after you send it.
          </p>

          <div className="text-center">
            <button type="submit" className="btn btn-gradient-orange btn-lg rounded-pill px-5 fw-bold text-white shadow-glow" disabled={sending || stars === 0}>
              {sending ? "Sending..." : "Submit"}
            </button>
          </div>
        </form>
      </div>
    </section>
  );
}
