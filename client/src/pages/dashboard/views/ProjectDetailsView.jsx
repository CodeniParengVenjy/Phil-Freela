import { useEffect, useState } from "react";
import { Link, useOutletContext, useParams } from "react-router-dom";
import {
  deliverableIcon, formatDay, getProject, markProjectDone, openDeliverable,
  personName, projectStatuses, requestProjectChanges, todayInManila
} from "../../../lib/projects";
import Avatar from "../../../components/Avatar";

// One project (/dashboard/project-details/:projectId), opened from a card in
// My Projects or from a project notification. Both people on the project use
// this page; what they see depends on their side:
//  - freelancer: the client's note, the dates and "Attach your files"
//  - client: the same details, plus Mark as Done / Request changes once the
//    freelancer submits
export default function ProjectDetailsView() {
  const { projectId } = useParams();
  const { currentUserId, openChat, showToast } = useOutletContext();
  // undefined while loading, null when it doesn't exist or isn't the user's.
  const [project, setProject] = useState(undefined);
  const [working, setWorking] = useState(false);

  useEffect(() => {
    let active = true;
    getProject(projectId).then((data) => {
      if (active) setProject(data);
    });
    return () => {
      active = false;
    };
  }, [projectId]);

  const handleViewDeliverable = async () => {
    const problem = await openDeliverable(project.submission_path);
    if (problem) showToast(problem);
  };

  const handleMarkDone = async () => {
    setWorking(true);
    const problem = await markProjectDone(project.id);
    setWorking(false);
    if (problem) {
      showToast(problem);
      return;
    }
    setProject((prev) => ({ ...prev, status: "done", completed_at: new Date().toISOString() }));
    showToast("Marked as done! It now shows on both your histories.");
  };

  const handleRequestChanges = async () => {
    setWorking(true);
    const problem = await requestProjectChanges(project.id);
    setWorking(false);
    if (problem) {
      showToast(problem);
      return;
    }
    setProject((prev) => ({ ...prev, status: "started" }));
    showToast("Changes requested. Explain what's needed in chat.");
  };

  if (project === undefined) {
    return <section className="dashboard-view active-view"><p className="text-secondary fs-7">Loading project...</p></section>;
  }

  if (project === null) {
    return (
      <section className="dashboard-view active-view">
        <div className="glass-card rounded-4 p-5 border border-secondary border-opacity-25 text-center">
          <i className="bi bi-kanban text-secondary" style={{ fontSize: "2.5rem" }}></i>
          <p className="text-secondary fs-7 mt-3 mb-3">This project wasn't found.</p>
          <Link to="/dashboard/projects" className="btn btn-outline-role rounded-pill px-4 fw-bold">Back to Projects</Link>
        </div>
      </section>
    );
  }

  const iAmClient = project.client_id === currentUserId;
  // The other person on the project.
  const other = iAmClient ? project.freelancer : project.client;
  const otherName = personName(other, iAmClient ? "Freelancer" : "Client");
  const status = projectStatuses[project.status];
  const overdue = project.status !== "done" && project.due_date < todayInManila();
  const hasSubmission = Boolean(project.submission_path || project.submission_link);

  // The "Project" box: short status of the work, or where to attach it.
  const renderWorkBox = () => {
    if (project.status === "started" && !iAmClient) {
      return (
        <Link to={`/dashboard/submit-project/${project.id}`} className="btn btn-outline-warning rounded-pill fw-bold px-3 py-2">
          <i className="bi bi-plus-lg me-1"></i> Attach your files
        </Link>
      );
    }
    if (project.status === "started") {
      return <p className="text-white-50 fs-7 mb-0">Waiting for {otherName} to send the work.</p>;
    }
    return <p className="text-white-50 fs-7 mb-0">See the submitted work below.</p>;
  };

  return (
    <section className="dashboard-view active-view">
      <div className="glass-card rounded-4 p-4 p-md-5 border border-secondary border-opacity-25 max-w-950 mx-auto">
        <Link to="/dashboard/projects" className="text-white-50 text-decoration-none fs-7 hover-role d-inline-block mb-3">
          <i className="bi bi-arrow-left me-1"></i> Back to Projects
        </Link>

        <div className="d-flex align-items-start gap-3 mb-2">
          <h2 className="h3 fw-bold text-white mb-0 text-break flex-grow-1">{project.title}</h2>
          <button
            type="button"
            className="btn btn-dark border border-secondary text-orange rounded-3 px-3 py-2 flex-shrink-0"
            title={`Message ${otherName}`}
            aria-label={`Message ${otherName}`}
            onClick={() => openChat(other?.id)}
          >
            <i className="bi bi-chat-dots-fill fs-5"></i>
          </button>
        </div>

        <div className="d-flex align-items-center gap-2 mb-4 pb-4 border-bottom border-secondary border-opacity-25">
          <Avatar path={other?.avatar_path} name={otherName} size={36} />
          <span className="text-white-50 fs-7">
            {iAmClient ? "Freelancer" : "Client"}:{" "}
            {/* Freelancers have a public portfolio page; clients don't yet. */}
            {iAmClient && other?.id ? (
              <Link to={`/dashboard/freelancers/${other.id}`} className="text-white fw-semibold text-decoration-none hover-role">{otherName}</Link>
            ) : (
              <strong className="text-white">{otherName}</strong>
            )}
          </span>
          {project.job_post_id && (
            <Link to={`/dashboard/job-details/${project.job_post_id}`} className="text-role fs-7 fw-semibold text-decoration-none ms-auto text-nowrap">
              View job post
            </Link>
          )}
        </div>

        <div className="row g-3">
          <div className="col-md-6">
            <div className="p-3 bg-dark bg-opacity-50 rounded-3 border border-secondary border-opacity-25 h-100">
              <span className="text-secondary fs-8 d-block mb-2">Status</span>
              <span className={`badge px-3 py-2 rounded-pill fw-bold fs-7 ${status.className}`}>{status.label}</span>
            </div>
          </div>

          <div className="col-md-6">
            <div className="p-3 bg-dark bg-opacity-50 rounded-3 border border-secondary border-opacity-25 h-100">
              <span className="text-secondary fs-8 d-block mb-2">Project</span>
              {renderWorkBox()}
            </div>
          </div>

          <div className="col-md-6">
            <div className="p-3 bg-dark bg-opacity-50 rounded-3 border border-secondary border-opacity-25 h-100">
              <span className="text-secondary fs-8 d-block mb-1">Date Started</span>
              <span className="text-white fw-bold fs-6"><i className="bi bi-calendar-event me-2 text-info"></i>{new Date(project.started_at).toLocaleDateString()}</span>
            </div>
          </div>

          <div className="col-md-6">
            <div className="p-3 bg-dark bg-opacity-50 rounded-3 border border-secondary border-opacity-25 h-100">
              <span className="text-secondary fs-8 d-block mb-1">Due Date</span>
              <span className={`fw-bold fs-6 ${overdue ? "text-danger" : "text-warning"}`}>
                <i className="bi bi-clock-history me-2"></i>{formatDay(project.due_date)}{overdue && " (overdue)"}
              </span>
            </div>
          </div>

          <div className="col-12">
            <div className="p-3 bg-dark bg-opacity-50 rounded-3 border border-secondary border-opacity-25">
              <span className="text-secondary fs-8 d-block mb-1">Note from the client</span>
              <p className="text-white-50 fs-7 mb-0 text-break" style={{ whiteSpace: "pre-wrap" }}>{project.note || "No note."}</p>
            </div>
          </div>
        </div>

        {/* The freelancer's submitted work (screen 3): shown once there's
            something to show, even after "Request changes" sends the status
            back to Started, so both people can still see what was sent. */}
        {hasSubmission && (
          <div className="pt-4 mt-4 border-top border-secondary border-opacity-25">
            <div className="d-flex flex-wrap align-items-center justify-content-between gap-2 mb-3">
              <span className={`badge px-3 py-1 rounded-pill ${project.status === "done" ? "bg-success text-white" : "bg-info text-dark"}`}>
                {project.status === "done" ? "Completed Deliverable" : "Submitted Deliverable"}
              </span>
              <span className="text-white-50 fs-7">Sent by <strong className="text-white">{personName(project.freelancer, "the freelancer")}</strong> on {new Date(project.submitted_at).toLocaleDateString()}</span>
            </div>

            {project.submission_path && (
              <div className="p-3 rounded-3 bg-black bg-opacity-50 border border-secondary border-opacity-50 d-flex align-items-center justify-content-between gap-3 mb-3">
                <div className="d-flex align-items-center gap-3 overflow-hidden">
                  <i className={`bi ${deliverableIcon(project.submission_path)} text-orange fs-2`}></i>
                  <span className="text-white fw-semibold text-break">{project.submission_path.split("/").pop()}</span>
                </div>
                <button type="button" className="btn btn-gradient-orange text-white rounded-pill px-3 fs-7 fw-bold flex-shrink-0" onClick={handleViewDeliverable}>
                  <i className="bi bi-box-arrow-up-right me-1"></i> View
                </button>
              </div>
            )}

            {project.submission_link && (
              <p className="mb-3">
                <i className="bi bi-link-45deg text-orange me-1"></i>
                <a href={project.submission_link} target="_blank" rel="noopener noreferrer" className="text-role text-break">{project.submission_link}</a>
              </p>
            )}

            {project.submission_message && (
              <p className="text-white-50 fs-7 fst-italic text-break mb-3">"{project.submission_message}"</p>
            )}

            {iAmClient && project.status === "submitted" && (
              <div className="d-flex flex-wrap gap-2">
                <button type="button" className="btn btn-gradient-role text-white rounded-pill px-4 fw-bold" onClick={handleMarkDone} disabled={working}>
                  <i className="bi bi-check2-circle me-1"></i> Mark as Done
                </button>
                <button type="button" className="btn btn-dark border border-secondary text-white rounded-pill px-4 fw-bold" onClick={handleRequestChanges} disabled={working}>
                  <i className="bi bi-arrow-repeat me-1"></i> Request Changes
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
