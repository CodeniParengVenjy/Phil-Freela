import { useState } from "react";
import { useNavigate, useOutletContext } from "react-router-dom";

function StarRating({ value, onChange, label }) {
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

export default function FeedbackView() {
  const { showToast } = useOutletContext();
  const navigate = useNavigate();
  const [text, setText] = useState("");
  const [performance, setPerformance] = useState(0);
  const [trust, setTrust] = useState(0);

  const handleSubmit = (event) => {
    event.preventDefault();
    showToast("Thank you! Your feedback has been submitted successfully.");
    setTimeout(() => navigate("/dashboard/projects"), 1500);
  };

  return (
    <section className="dashboard-view active-view">
      <div className="glass-card rounded-4 p-4 p-md-5 border border-secondary border-opacity-25 max-w-850 mx-auto">
        <div className="mb-4 text-center">
          <span className="badge bg-orange text-white px-3 py-1 rounded-pill fw-bold fs-8 mb-2">CONTRACT EVALUATION</span>
          <h2 className="display-6 fw-bold text-white mb-2">Ratings and Feedback</h2>
          <p className="text-secondary fs-7">Rate your experience working with <strong className="text-white">Coffee Company</strong> on the Advertising Video project.</p>
        </div>

        <form className="d-flex flex-column gap-4" onSubmit={handleSubmit}>
          <div>
            <label htmlFor="feedbackText" className="form-label text-white fw-semibold fs-6 mb-2">
              <i className="bi bi-chat-quote-fill text-orange me-2"></i> Give a feedback (optional):
            </label>
            <textarea
              id="feedbackText"
              className="form-control bg-secondary bg-opacity-25 border-secondary text-white p-3 fs-7"
              rows="4"
              placeholder="Write your feedback here..."
              value={text}
              onChange={(e) => setText(e.target.value)}
            ></textarea>
          </div>

          <StarRating value={performance} onChange={setPerformance} label="Rate the performance:" />
          <StarRating value={trust} onChange={setTrust} label="Rate the trust and transaction:" />

          <div className="text-center pt-2">
            <button type="submit" className="btn btn-gradient-orange btn-lg rounded-pill px-5 py-3 fw-bold text-white shadow-glow">
              <i className="bi bi-check-circle-fill me-2"></i> Submit Feedback
            </button>
          </div>
        </form>
      </div>
    </section>
  );
}
