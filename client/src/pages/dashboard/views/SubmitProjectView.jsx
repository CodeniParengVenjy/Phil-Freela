import { useState } from "react";
import { useNavigate, useOutletContext } from "react-router-dom";

export default function SubmitProjectView() {
  const { showToast } = useOutletContext();
  const navigate = useNavigate();
  const [fileName, setFileName] = useState("");
  const [portfolioUrl, setPortfolioUrl] = useState("");
  const [notes, setNotes] = useState("");
  const [dragOver, setDragOver] = useState(false);

  const acceptFile = (file) => {
    if (!file) return;
    setFileName(`${file.name} (${(file.size / (1024 * 1024)).toFixed(2)} MB)`);
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    showToast("Upload complete! Your deliverable has been submitted.");
    setTimeout(() => navigate("/dashboard/project-details?status=Done"), 1500);
  };

  return (
    <section className="dashboard-view active-view">
      <div className="glass-card rounded-4 p-4 p-md-5 border border-secondary border-opacity-25 max-w-900 mx-auto">
        <div className="mb-4 text-center">
          <span className="badge bg-warning text-dark rounded-pill px-3 py-1 fw-bold fs-8 mb-2">PROJECT DELIVERABLE</span>
          <h2 className="display-6 fw-bold text-white mb-2">Submit Your Project</h2>
          <p className="text-secondary fs-7">Upload your completed deliverables or paste your portfolio URL for client review.</p>
        </div>

        <form className="d-flex flex-column gap-4" onSubmit={handleSubmit}>
          <div
            className={`dropzone-box p-5 rounded-4 border-2 border-dashed border-secondary border-opacity-50 text-center position-relative cursor-pointer bg-dark bg-opacity-50${dragOver ? " dragover" : ""}`}
            onDragEnter={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={(e) => { e.preventDefault(); setDragOver(false); }}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              acceptFile(e.dataTransfer.files?.[0]);
            }}
          >
            <input
              type="file"
              className="position-absolute top-0 start-0 opacity-0 cursor-pointer w-100 h-100"
              multiple
              onChange={(e) => acceptFile(e.target.files?.[0])}
            />

            <div className="dropzone-content py-3" style={{ pointerEvents: "none" }}>
              <div className="icon-circle mx-auto mb-3 bg-orange bg-opacity-10 text-orange rounded-circle d-flex align-items-center justify-content-center" style={{ width: 72, height: 72 }}>
                <i className="bi bi-cloud-arrow-up-fill fs-1"></i>
              </div>
              <h5 className="text-white fw-bold mb-2">{fileName ? `Selected: ${fileName}` : "Drop your file or Paste your portfolio"}</h5>
              <p className="text-secondary fs-7 mb-0">Supports MP4, MOV, ZIP, PDF, PNG, JPG (Max 500MB)</p>
            </div>

            {fileName && (
              <div className="text-success fw-bold mt-2">
                <i className="bi bi-file-earmark-check-fill me-1"></i> <span>{fileName}</span>
              </div>
            )}
          </div>

          <div>
            <label htmlFor="portfolioUrl" className="form-label text-white-50 fw-semibold fs-7 mb-1">Or Paste Portfolio Link / Google Drive / Figma URL:</label>
            <div className="input-group">
              <span className="input-group-text bg-secondary bg-opacity-25 border-secondary text-white-50"><i className="bi bi-link-45deg"></i></span>
              <input
                type="url"
                id="portfolioUrl"
                className="form-control bg-secondary bg-opacity-25 border-secondary text-white py-2"
                placeholder="https://drive.google.com/file/d/..."
                value={portfolioUrl}
                onChange={(e) => setPortfolioUrl(e.target.value)}
              />
            </div>
          </div>

          <div>
            <label htmlFor="deliveryNotes" className="form-label text-white-50 fw-semibold fs-7 mb-1">Deliverable Notes (Optional):</label>
            <textarea
              id="deliveryNotes"
              className="form-control bg-secondary bg-opacity-25 border-secondary text-white p-3"
              rows="3"
              placeholder="Add any comments or instructions for the client..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            ></textarea>
          </div>

          <div className="text-center pt-2">
            <button type="submit" className="btn btn-gradient-orange btn-lg rounded-pill px-5 py-3 fw-bold text-white shadow-glow">
              <i className="bi bi-upload me-2"></i> Upload Project Deliverable
            </button>
          </div>
        </form>
      </div>
    </section>
  );
}
