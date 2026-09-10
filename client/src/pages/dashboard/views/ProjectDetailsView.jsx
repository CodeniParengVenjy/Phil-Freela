import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";

export default function ProjectDetailsView() {
  const [searchParams] = useSearchParams();
  const [status, setStatus] = useState(searchParams.get("status") || "Done");
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(35);
  const intervalRef = useRef(null);

  useEffect(() => () => clearInterval(intervalRef.current), []);

  const togglePlay = () => {
    setIsPlaying((prev) => {
      const next = !prev;
      if (next) {
        intervalRef.current = setInterval(() => setProgress((p) => (p + 2) % 100), 300);
      } else {
        clearInterval(intervalRef.current);
      }
      return next;
    });
  };

  const isDone = status === "Done";

  return (
    <section className="dashboard-view active-view">
      <div className="glass-card rounded-4 p-4 p-md-5 border border-secondary border-opacity-25 max-w-950 mx-auto position-relative">
        <div className="d-flex flex-column flex-md-row justify-content-between align-items-md-center gap-3 mb-4 pb-3 border-bottom border-secondary border-opacity-25">
          <div>
            <div className="d-flex align-items-center gap-2 mb-1">
              <h2 className="display-6 fw-bold text-white mb-0">Advertising Video Project</h2>
              <Link to="/dashboard/chat" className="text-orange fs-4 ms-2" title="Open Chat"><i className="bi bi-chat-dots-fill"></i></Link>
            </div>
            <div className="d-flex align-items-center gap-2 text-white-50 fs-7">
              <div className="avatar-circle-sm bg-secondary text-white fw-bold d-inline-flex align-items-center justify-content-center" style={{ width: 24, height: 24, fontSize: "0.75rem" }}>
                <i className="bi bi-building"></i>
              </div>
              <span>Client: <strong className="text-white">Coffee Company.</strong></span>
            </div>
          </div>

          <div className="d-flex align-items-center gap-2 bg-dark bg-opacity-75 p-1 rounded-pill border border-secondary border-opacity-25">
            <button
              type="button"
              className={`btn btn-sm rounded-pill fw-bold px-3 py-1 status-tab-btn ${!isDone ? "active-tab text-white" : "text-white-50"}`}
              onClick={() => setStatus("Started")}
            >
              🟡 Status: Started
            </button>
            <button
              type="button"
              className={`btn btn-sm rounded-pill fw-bold px-3 py-1 status-tab-btn ${isDone ? "active-tab text-white" : "text-white-50"}`}
              onClick={() => setStatus("Done")}
            >
              🟢 Status: Done
            </button>
          </div>
        </div>

        <div className="row g-4 mb-4">
          <div className="col-md-6">
            <div className="p-3 bg-dark bg-opacity-50 rounded-3 border border-secondary border-opacity-25">
              <span className="text-secondary fs-8 d-block mb-1">Project Status</span>
              <span className={`badge px-3 py-2 rounded-pill fw-bold fs-7 ${isDone ? "bg-success text-white" : "bg-warning text-dark"}`}>{status}</span>
            </div>
          </div>

          <div className="col-md-6">
            <div className="p-3 bg-dark bg-opacity-50 rounded-3 border border-secondary border-opacity-25 d-flex justify-content-between align-items-center">
              <div>
                <span className="text-secondary fs-8 d-block mb-1">Project Files Submission</span>
                <span className="text-white fw-semibold fs-7">Attach deliverables</span>
              </div>
              <Link to="/dashboard/submit-project" className="btn btn-outline-warning btn-sm rounded-pill fw-bold px-3 py-2">
                <i className="bi bi-plus-lg me-1"></i> Attach your files
              </Link>
            </div>
          </div>

          <div className="col-md-6">
            <div className="p-3 bg-dark bg-opacity-50 rounded-3 border border-secondary border-opacity-25">
              <span className="text-secondary fs-8 d-block mb-1">Date Started</span>
              <span className="text-white fw-bold fs-6"><i className="bi bi-calendar-event me-2 text-info"></i>05/11/2026</span>
            </div>
          </div>

          <div className="col-md-6">
            <div className="p-3 bg-dark bg-opacity-50 rounded-3 border border-secondary border-opacity-25">
              <span className="text-secondary fs-8 d-block mb-1">Due Date</span>
              <span className="text-warning fw-bold fs-6"><i className="bi bi-clock-history me-2 text-warning"></i>06/03/2026</span>
            </div>
          </div>

          <div className="col-12">
            <div className="p-3 bg-dark bg-opacity-50 rounded-3 border border-secondary border-opacity-25">
              <span className="text-secondary fs-8 d-block mb-1">Note / Requirements:</span>
              <p className="text-white-50 fs-7 mb-0 fw-medium">"The video must be 1 minute duration and have a realistic transition."</p>
            </div>
          </div>
        </div>

        <div className="pt-4 border-top border-secondary border-opacity-25">
          <div className="d-flex align-items-center justify-content-between mb-3">
            <div className="d-flex align-items-center gap-2">
              <span className="badge bg-success text-white px-3 py-1 rounded-pill">Completed Deliverable</span>
              <span className="text-white-50 fs-7">Submitted by: <strong className="text-white">Peter Cruz</strong></span>
            </div>
            <span className="badge bg-black text-light fs-8">Duration: 01:00</span>
          </div>

          <div className="video-player-card glass-card rounded-4 p-3 bg-black border border-secondary border-opacity-50 text-center position-relative mb-4">
            <div className="video-screen rounded-3 bg-dark bg-opacity-75 d-flex flex-column align-items-center justify-content-center p-5 border border-secondary border-opacity-25 position-relative overflow-hidden" style={{ minHeight: 280 }}>
              <div className="video-overlay text-center">
                <button className="btn btn-gradient-orange btn-lg rounded-circle p-4 text-white shadow-glow mb-3" style={{ width: 80, height: 80 }} onClick={togglePlay}>
                  <i className={`bi ${isPlaying ? "bi-pause-fill" : "bi-play-fill"} fs-1`}></i>
                </button>
                <h6 className="text-white fw-bold mb-1">Advertising_Video_Final.mp4</h6>
                <small className="text-secondary fs-8">0:00 / 1:00 • 1080p 60fps Render</small>
              </div>
            </div>

            <div className="progress mt-3 bg-secondary bg-opacity-25" style={{ height: 6 }}>
              <div className="progress-bar bg-orange" role="progressbar" style={{ width: `${progress}%` }}></div>
            </div>
          </div>

          <div className="text-center">
            <Link to="/dashboard/feedback" className="btn btn-gradient-orange btn-lg rounded-pill px-5 py-3 fw-bold text-white shadow-glow">
              <i className="bi bi-star-fill me-2"></i> Add your ratings and feedback
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
