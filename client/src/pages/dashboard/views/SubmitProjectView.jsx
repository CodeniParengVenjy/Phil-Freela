import { useEffect, useState } from "react";
import { Link, useNavigate, useOutletContext, useParams } from "react-router-dom";
import { MAX_SUBMISSION_MESSAGE_LENGTH, canPreview, getProject, personName, submitProject } from "../../../lib/projects";
import { makeDeliverablePreview } from "../../../lib/aiService";
import CensoredText from "../../../components/CensoredText";

// "Attach your files" (screen 6), at /dashboard/submit-project/:projectId.
// The freelancer sends the finished work: a file, a link, or both, plus an
// optional message. This turns the project to Submitted and notifies the
// client (see submit_project in database/supabase_projects_schema.sql).
// Pay to unlock (PLAN-transaction-tracking.md, Step F): a file stays locked
// until the freelancer confirms a payment on the project; until then the client
// sees only the watermarked preview made here right after sending.
export default function SubmitProjectView() {
  const { projectId } = useParams();
  const { currentUserId, showToast } = useOutletContext();
  const navigate = useNavigate();
  // undefined while loading, null when it doesn't exist or isn't the user's.
  const [project, setProject] = useState(undefined);
  const [file, setFile] = useState(null);
  const [link, setLink] = useState("");
  const [message, setMessage] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  // True while the AI service makes the client's watermarked preview.
  const [makingPreview, setMakingPreview] = useState(false);

  useEffect(() => {
    let active = true;
    getProject(projectId).then((data) => {
      if (active) setProject(data);
    });
    return () => {
      active = false;
    };
  }, [projectId]);

  const acceptFile = (picked) => {
    if (picked) setFile(picked);
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    const { error } = await submitProject(currentUserId, projectId, file, link, message);
    if (error) {
      setSubmitting(false);
      showToast(error);
      return;
    }
    const clientName = personName(project.client, "The client");
    if (file && canPreview(file.name) && !project.unlocked_at) {
      // The work is sent; now the preview the client sees until they pay. If it
      // fails, the work stays sent and the project page offers "Make the preview".
      setMakingPreview(true);
      try {
        await makeDeliverablePreview(projectId);
        showToast(`Your work was sent! ${clientName} sees a watermarked preview until you confirm their payment.`);
      } catch {
        showToast("Your work was sent, but the watermarked preview isn't ready yet. Open the project and press Make the preview.");
      }
    } else if (file && !project.unlocked_at) {
      showToast(`Your work was sent! ${clientName} can open the file once you confirm their payment.`);
    } else {
      showToast("Your work was sent! The client will review it.");
    }
    navigate(`/dashboard/project-details/${projectId}`);
  };

  if (project === undefined) {
    return <section className="dashboard-view active-view"><p className="text-secondary fs-7">Loading project...</p></section>;
  }

  const notMine = project === null || project.freelancer_id !== currentUserId;
  if (notMine || project.status !== "started") {
    return (
      <section className="dashboard-view active-view">
        <div className="glass-card rounded-4 p-5 border border-secondary border-opacity-25 text-center">
          <i className="bi bi-cloud-arrow-up text-secondary" style={{ fontSize: "2.5rem" }}></i>
          <p className="text-secondary fs-7 mt-3 mb-3">
            {notMine ? "This project wasn't found." : "This project already has submitted work waiting for the client."}
          </p>
          <Link to="/dashboard/projects" className="btn btn-outline-role rounded-pill px-4 fw-bold">Back to Projects</Link>
        </div>
      </section>
    );
  }

  return (
    <section className="dashboard-view active-view">
      <div className="glass-card rounded-4 p-4 p-md-5 border border-secondary border-opacity-25 max-w-900 mx-auto">
        <div className="mb-4 text-center">
          <span className="badge bg-warning text-dark rounded-pill px-3 py-1 fw-bold fs-8 mb-2">PROJECT DELIVERABLE</span>
          <h2 className="display-6 fw-bold text-white mb-2">Submit Your Project</h2>
          <p className="text-secondary fs-7">"<CensoredText text={project.title} />" — upload your completed deliverable or paste your portfolio URL for client review.</p>
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
              accept=".mp4,.webm,.mov,.jpg,.jpeg,.png,.webp,.pdf,.zip,.blend"
              onChange={(e) => acceptFile(e.target.files?.[0])}
            />

            <div className="dropzone-content py-3" style={{ pointerEvents: "none" }}>
              {/* A pale circle with the icon in the accent color. (It used to be a
                  solid orange circle with an orange icon, so the icon couldn't be seen.) */}
              <div className="icon-circle mx-auto mb-3 bg-orange-subtle text-orange rounded-circle d-flex align-items-center justify-content-center" style={{ width: 72, height: 72 }}>
                <i className="bi bi-cloud-arrow-up-fill fs-1"></i>
              </div>
              <h5 className="text-white fw-bold mb-2">{file ? `Selected: ${file.name}` : "Drop your file or Paste your portfolio"}</h5>
              <p className="text-secondary fs-7 mb-0">Supports MP4, WebM, MOV, JPG, PNG, WebP, PDF, ZIP, BLEND (Max 50MB)</p>
            </div>

            {file && (
              <div className="text-success fw-bold mt-2">
                <i className="bi bi-file-earmark-check-fill me-1"></i> <span>{file.name} ({(file.size / (1024 * 1024)).toFixed(2)} MB)</span>
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
                value={link}
                onChange={(e) => setLink(e.target.value)}
              />
            </div>
          </div>

          <div>
            <label htmlFor="deliveryNotes" className="form-label text-white-50 fw-semibold fs-7 mb-1">Deliverable Notes (Optional):</label>
            <textarea
              id="deliveryNotes"
              className="form-control bg-secondary bg-opacity-25 border-secondary text-white p-3"
              rows="3"
              maxLength={MAX_SUBMISSION_MESSAGE_LENGTH}
              placeholder="Add any comments or instructions for the client..."
              value={message}
              onChange={(e) => setMessage(e.target.value)}
            ></textarea>
            <small className="text-secondary fs-8">{message.length}/{MAX_SUBMISSION_MESSAGE_LENGTH}</small>
          </div>

          {/* Pay to unlock: what the client gets before and after paying. */}
          <div className="p-3 rounded-3 border border-secondary border-opacity-25 bg-dark bg-opacity-50 d-flex gap-2 align-items-start" data-lock-note>
            <i className="bi bi-lock-fill text-warning fs-5 flex-shrink-0"></i>
            <p className="text-white-50 fs-7 mb-0">
              {project.unlocked_at
                ? `${personName(project.client, "The client")} already paid on this project, so they can open and download your file right away.`
                : `Your file stays locked until ${personName(project.client, "the client")} pays and you confirm the payment. Until then they see only a watermarked preview and can't download it: a video's first 3 minutes, a photo, or a PDF's first 3 pages. ZIP and BLEND files can't be previewed, so they see only the file name. A link you paste is shown to them as it is.`}
            </p>
          </div>

          <div className="text-center pt-2">
            <button type="submit" className="btn btn-gradient-orange btn-lg rounded-pill px-5 py-3 fw-bold text-white shadow-glow" disabled={submitting}>
              <i className="bi bi-upload me-2"></i>
              {makingPreview ? "Making the watermarked preview..." : submitting ? "Uploading..." : "Upload Project Deliverable"}
            </button>
          </div>
        </form>
      </div>
    </section>
  );
}
