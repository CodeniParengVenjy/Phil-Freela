import { useState } from "react";
import { useNavigate, useOutletContext } from "react-router-dom";

export default function JobDetailsView() {
  const { showToast } = useOutletContext();
  const navigate = useNavigate();
  const [coverNote, setCoverNote] = useState("");

  const handleSubmit = (event) => {
    event.preventDefault();

    // Bootstrap's JS (loaded globally) owns this modal instance via data-bs-* attributes.
    const modalEl = document.getElementById("resumeUploadModal");
    const modal = window.bootstrap?.Modal.getInstance(modalEl);
    modal?.hide();

    showToast("Application and resume sent to Coffee Company!");
    setTimeout(() => navigate("/dashboard/project-details?status=Started"), 1500);
  };

  return (
    <section className="dashboard-view active-view">
      <div className="glass-card rounded-4 p-4 p-md-5 border border-secondary border-opacity-25 max-w-950 mx-auto">
        <div className="d-flex flex-column flex-md-row align-items-md-center gap-4 mb-4 pb-4 border-bottom border-secondary border-opacity-25">
          <div className="avatar-circle-lg bg-secondary text-white fw-bold d-flex align-items-center justify-content-center flex-shrink-0 shadow-lg" style={{ width: 100, height: 100, fontSize: "2.5rem" }}>
            <i className="bi bi-building"></i>
          </div>

          <div className="flex-grow-1">
            <div className="d-flex align-items-center gap-3 mb-1">
              <h2 className="display-6 fw-bold text-white mb-0">Coffee Company.</h2>
              <span className="badge bg-warning text-dark fw-bold fs-7"><i className="bi bi-star-fill"></i> 5.0 Verified Client</span>
            </div>

            <p className="fs-5 text-warning fw-semibold mb-2">Job Title: <span className="text-white">Hiring a video editor for advertisement</span></p>

            <div className="d-flex align-items-center gap-2">
              <span className="text-white-50 fs-7">Job Categories:</span>
              <span className="badge bg-orange text-white px-3 py-1 rounded-pill">Video Editor</span>
              <span className="badge bg-secondary bg-opacity-50 text-light px-3 py-1 rounded-pill">Marketing Ads</span>
            </div>
          </div>
        </div>

        <div className="mb-4">
          <h4 className="text-white fw-bold mb-3"><i className="bi bi-card-text text-orange me-2"></i> Description</h4>
          <div className="bg-dark bg-opacity-60 p-4 rounded-4 border border-secondary border-opacity-25 text-light-50 fs-7 lh-lg">
            <p>
              We are looking for a creative and detail-oriented Video Editor to join our growing coffee company team. The ideal candidate is passionate about storytelling, visual content, and coffee culture, with the ability to transform raw footage into engaging videos for social media, advertisements, promotions, and brand campaigns. You will collaborate closely with our marketing and creative teams to produce high-quality content that captures the warmth, energy, and personality of our brand. Proficiency in video editing software such as Adobe Premiere Pro, Final Cut Pro, or DaVinci Resolve is highly preferred, along with a strong sense of pacing, transitions, sound design, and color grading.
            </p>
            <p className="mb-0">
              As our Video Editor, you will help bring our products, cafes, and customer experiences to life through visually compelling content. Responsibilities include editing short-form and long-form videos, creating promotional reels, managing video assets, and ensuring all content aligns with brand identity and marketing goals. Candidates with experience in food, beverage, or lifestyle content creation are encouraged to apply. If you are imaginative, organized, and excited to work in a fast-paced coffee company environment, we would love to hear from you.
            </p>
          </div>
        </div>

        <div className="d-flex flex-column flex-md-row justify-content-between align-items-md-center gap-4 pt-3">
          <div>
            <h5 className="text-white fw-bold mb-2"><i className="bi bi-tools text-warning me-2"></i> Required Skills</h5>
            <div className="d-flex flex-wrap gap-2">
              <span className="badge bg-secondary bg-opacity-75 text-light px-3 py-2 rounded-pill fs-7">Computer Literate</span>
              <span className="badge bg-secondary bg-opacity-75 text-light px-3 py-2 rounded-pill fs-7">Creativity</span>
              <span className="badge bg-secondary bg-opacity-75 text-light px-3 py-2 rounded-pill fs-7">Video Editing</span>
              <span className="badge bg-secondary bg-opacity-75 text-light px-3 py-2 rounded-pill fs-7">Adobe Premiere</span>
            </div>
          </div>

          <div>
            <button className="btn btn-gradient-orange btn-lg rounded-pill px-5 py-3 fw-bold text-white shadow-glow" data-bs-toggle="modal" data-bs-target="#resumeUploadModal">
              <i className="bi bi-file-earmark-arrow-up me-2"></i> Send your resume to us
            </button>
          </div>
        </div>
      </div>

      <div className="modal fade" id="resumeUploadModal" tabIndex="-1" aria-hidden="true">
        <div className="modal-dialog modal-dialog-centered">
          <div className="modal-content bg-dark text-white border border-secondary border-opacity-25">
            <div className="modal-header border-bottom border-secondary border-opacity-25">
              <h5 className="modal-title fw-bold"><i className="bi bi-file-earmark-person-fill text-orange me-2"></i> Submit Application to Coffee Company</h5>
              <button type="button" className="btn-close btn-close-white" data-bs-dismiss="modal" aria-label="Close"></button>
            </div>
            <form onSubmit={handleSubmit}>
              <div className="modal-body p-4 d-flex flex-column gap-3">
                <div>
                  <label className="form-label text-white-50 fw-semibold fs-7">Upload Resume (PDF, DOCX):</label>
                  <input
                    type="file"
                    className="form-control bg-secondary bg-opacity-25 border-secondary text-white"
                    accept=".pdf,.doc,.docx"
                    required
                  />
                </div>
                <div>
                  <label className="form-label text-white-50 fw-semibold fs-7">Cover Note / Pitch:</label>
                  <textarea
                    className="form-control bg-secondary bg-opacity-25 border-secondary text-white"
                    rows="3"
                    placeholder="Explain why you're a great fit for Coffee Company..."
                    value={coverNote}
                    onChange={(e) => setCoverNote(e.target.value)}
                  ></textarea>
                </div>
              </div>
              <div className="modal-footer border-top border-secondary border-opacity-25">
                <button type="button" className="btn btn-dark border border-secondary text-white" data-bs-dismiss="modal">Cancel</button>
                <button type="submit" className="btn btn-gradient-orange rounded-pill px-4 text-white fw-bold">Send Application</button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </section>
  );
}
