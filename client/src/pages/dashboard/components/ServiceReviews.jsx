import { useState } from "react";
import Avatar from "../../../components/Avatar";
import { profilePath } from "../../../lib/profileStats";
import { MAX_REVIEW_COMMENT_LENGTH, addServiceReview, fetchServiceReviews, removeOwnReview, summarizeReviews } from "../../../lib/serviceReviews";
import DeleteConfirmDialog from "./DeleteConfirmDialog";

// 1 to 5 small stars, read-only.
function Stars({ value }) {
  return (
    <span className="text-warning" role="img" aria-label={`${value} out of 5 stars`}>
      {[1, 2, 3, 4, 5].map((n) => <i key={n} className={`bi ${n <= value ? "bi-star-fill" : "bi-star"}`}></i>)}
    </span>
  );
}

// The "Ratings and comments" part of an offer's page (Service Details). The
// average and the list are for everyone; a signed-in client who hasn't rated
// this offer yet also gets the box to pick stars and write a comment (see
// lib/serviceReviews.js and database/supabase_service_reviews_schema.sql).
//   reviews: the list (null while loading); onReviewsChange(list): the page keeps it
//   isOwnOffer: this is the viewer's own offer (nobody rates their own)
//   onReport(review): the flag on somebody else's comment
export default function ServiceReviews({ serviceId, reviews, loadError, onReviewsChange, currentUserId, accountType, isOwnOffer, onReport, showToast }) {
  const [stars, setStars] = useState(0);
  // The star the mouse is over, so the stars light up before the click.
  const [hover, setHover] = useState(0);
  const [comment, setComment] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  // The rating being removed (null = Remove popup closed).
  const [toRemove, setToRemove] = useState(null);
  const [removing, setRemoving] = useState(false);

  const list = reviews || [];
  const { count, average } = summarizeReviews(list);
  const mine = list.find((review) => review.author_id === currentUserId);
  const canRate = accountType === "client" && !isOwnOffer && !mine;

  // Loads the list again after a change, so it shows what the database has.
  const reload = async () => {
    const result = await fetchServiceReviews(serviceId);
    if (result.reviews) onReviewsChange(result.reviews);
  };

  const handlePost = async (event) => {
    event.preventDefault();
    if (sending) return;
    setSending(true);
    setError("");
    const { error: problem } = await addServiceReview(serviceId, stars, comment);
    if (problem) {
      setSending(false);
      setError(problem);
      return;
    }
    await reload();
    setSending(false);
    setStars(0);
    setHover(0);
    setComment("");
    showToast("Thanks! Your rating is posted.");
  };

  const handleRemove = async () => {
    setRemoving(true);
    const removed = await removeOwnReview(toRemove.id);
    if (removed) await reload();
    setRemoving(false);
    setToRemove(null);
    showToast(removed ? "Your rating was removed." : "Couldn't remove it. Please try again.");
  };

  return (
    <div id="offer-ratings">
      <div className="d-flex flex-wrap align-items-baseline justify-content-between gap-2 mb-3">
        <h4 className="text-white fw-bold mb-0"><i className="bi bi-star-half text-role me-2"></i> Ratings and comments</h4>
        {count > 0 && (
          <span className="text-warning fw-bold">
            <i className="bi bi-star-fill me-1"></i>{average.toFixed(1)}
            <span className="text-secondary fw-normal fs-7"> ({count} {count === 1 ? "rating" : "ratings"})</span>
          </span>
        )}
      </div>

      {/* Who can rate: signed-in clients, once per offer. */}
      {canRate && (
        <form className="bg-dark bg-opacity-50 p-3 p-md-4 rounded-4 border border-secondary border-opacity-25 mb-3" onSubmit={handlePost}>
          <p className="text-white fw-semibold fs-7 mb-2">Rate this offer</p>
          <div role="radiogroup" aria-label="Your rating" className="d-flex gap-1 mb-2" onMouseLeave={() => setHover(0)}>
            {[1, 2, 3, 4, 5].map((value) => (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={stars === value}
                aria-label={`${value} ${value === 1 ? "star" : "stars"}`}
                className="btn btn-link p-0 text-warning fs-3 lh-1"
                disabled={sending}
                onMouseEnter={() => setHover(value)}
                onClick={() => setStars(value)}
              >
                <i className={`bi ${value <= (hover || stars) ? "bi-star-fill" : "bi-star"}`}></i>
              </button>
            ))}
          </div>
          <textarea
            className="form-control bg-secondary bg-opacity-25 border-secondary text-white fs-7 mb-1"
            rows="3"
            maxLength={MAX_REVIEW_COMMENT_LENGTH}
            placeholder="Write a comment (optional): what was it like, and what should others know?"
            aria-label="Your comment (optional)"
            value={comment}
            disabled={sending}
            onChange={(event) => setComment(event.target.value)}
          ></textarea>
          <small className="text-secondary fs-8 d-block mb-2">{comment.length}/{MAX_REVIEW_COMMENT_LENGTH}</small>
          {error && <p className="text-danger fs-7 mb-2">{error}</p>}
          <button type="submit" className="btn btn-gradient-role rounded-pill px-4 fw-bold text-white" disabled={sending || stars === 0}>
            <i className="bi bi-send me-1"></i>{sending ? "Posting..." : "Post rating"}
          </button>
        </form>
      )}
      {!canRate && accountType !== "client" && (
        <p className="text-secondary fs-8 mb-3">Only client accounts can rate and comment on an offer.</p>
      )}
      {isOwnOffer && accountType === "client" && (
        <p className="text-secondary fs-8 mb-3">This is your offer. Clients rate it here.</p>
      )}

      {reviews === null && !loadError && <p className="text-secondary fs-7 mb-0">Loading ratings...</p>}
      {loadError && <p className="text-danger fs-7 mb-0">{loadError}</p>}
      {reviews !== null && list.length === 0 && (
        <p className="text-secondary fs-7 mb-0">No ratings yet.{canRate && " Be the first to rate this offer."}</p>
      )}

      {list.map((review) => {
        const name = review.author?.full_name || review.author?.username || "A client";
        const isMine = review.author_id === currentUserId;
        return (
          <div key={review.id} className="d-flex gap-3 py-3 border-top border-secondary border-opacity-25">
            <Avatar path={review.author?.avatar_path} name={name} size={40} to={review.author?.id ? profilePath("client", review.author.id) : undefined} />
            <div className="flex-grow-1 min-w-0">
              <div className="d-flex flex-wrap align-items-center gap-2">
                <span className="text-white fw-semibold text-break">{name}{isMine && <span className="text-secondary fw-normal fs-8"> (you)</span>}</span>
                <Stars value={review.stars} />
                <small className="text-secondary">{new Date(review.created_at).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })}</small>
              </div>
              {review.comment && <p className="text-light-50 fs-7 mb-0 mt-1 text-break" style={{ whiteSpace: "pre-wrap" }}>{review.comment}</p>}
            </div>
            <div className="flex-shrink-0">
              {isMine ? (
                <button type="button" className="btn btn-sm btn-outline-secondary text-white-50 rounded-pill px-3" onClick={() => setToRemove(review)}>
                  Remove
                </button>
              ) : onReport && (
                <button
                  type="button"
                  className="btn btn-sm btn-dark text-secondary rounded-pill px-2"
                  title="Report this comment"
                  aria-label="Report this comment"
                  onClick={() => onReport(review)}
                >
                  <i className="bi bi-flag"></i>
                </button>
              )}
            </div>
          </div>
        );
      })}

      <DeleteConfirmDialog
        open={Boolean(toRemove)}
        title="Remove your rating?"
        message="Your stars and comment will be removed from this offer. You can write a new rating afterwards."
        busy={removing}
        confirmLabel="Remove"
        busyLabel="Removing..."
        cancelLabel="Keep it"
        onConfirm={handleRemove}
        onCancel={() => setToRemove(null)}
      />
    </div>
  );
}
