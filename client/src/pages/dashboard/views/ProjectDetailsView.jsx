import { useEffect, useState } from "react";
import { Link, useOutletContext, useParams } from "react-router-dom";
import {
  deliverableIcon, deliverableKind, formatDay, getDeliverableLink, getMyRating, getProject, getRatingOfMe, isBlenderFile, markProjectDone,
  openDeliverable, personName, projectStatuses, ratingDeadline, ratingStep, requestProjectChanges, todayInManila
} from "../../../lib/projects";
import { profilePath } from "../../../lib/profileStats";
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
  // undefined while loading (or not Done yet), null = hasn't rated, else the rating.
  const [myRating, setMyRating] = useState(undefined);
  // The other person's rating of the signed-in user. Ratings are blind, so
  // this stays null until the database lets it be seen (both sides rated, or
  // the time for rating is over).
  const [theirRating, setTheirRating] = useState(null);

  useEffect(() => {
    let active = true;
    getProject(projectId).then((data) => {
      if (active) setProject(data);
    });
    return () => {
      active = false;
    };
  }, [projectId]);

  // Once it's Done, check whether the signed-in user already rated it
  // (screen 4/5 unlock the "Add your ratings and feedback" button), and
  // whether the other person's rating of them can be seen yet.
  useEffect(() => {
    if (project?.status !== "done" || !currentUserId) return undefined;
    let active = true;
    Promise.all([getMyRating(currentUserId, project.id), getRatingOfMe(currentUserId, project.id)]).then(([mine, theirs]) => {
      if (!active) return;
      setMyRating(mine);
      setTheirRating(theirs);
    });
    return () => {
      active = false;
    };
  }, [project?.status, project?.id, currentUserId]);

  // A submitted video or photo is shown right on the page ("video" /
  // "image"); other files ("file": PDF, ZIP, Blender) only get the View button.
  const submissionPath = project?.submission_path;
  const mediaKind = deliverableKind(submissionPath);
  // The private link the player or photo uses, kept with the file it is for:
  // { path, link }, where link is null when it couldn't be made.
  const [media, setMedia] = useState(null);
  // The file the browser couldn't play or show (e.g. some .mov videos).
  const [failedPath, setFailedPath] = useState(null);

  useEffect(() => {
    if (!submissionPath || mediaKind === "file") return undefined;
    let active = true;
    getDeliverableLink(submissionPath).then((link) => {
      if (active) setMedia({ path: submissionPath, link });
    });
    return () => {
      active = false;
    };
  }, [submissionPath, mediaKind]);

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
  // Both have a public page: a freelancer's portfolio, a client's record. The
  // picture and the name link to it.
  const otherPath = other?.id ? profilePath(iAmClient ? "freelancer" : "client", other.id) : null;
  const status = projectStatuses[project.status];
  const overdue = project.status !== "done" && project.due_date < todayInManila();
  const hasSubmission = Boolean(project.submission_path || project.submission_link);
  // undefined while the link is loading, null when it couldn't be made.
  const mediaLink = media?.path === submissionPath ? media.link : undefined;
  const mediaWord = mediaKind === "video" ? "video" : "photo";
  const mediaBroken = mediaLink === null || failedPath === submissionPath;
  // When rating closes for a Done project (null until it's Done).
  const deadline = project.status === "done" ? ratingDeadline(project) : null;
  // The rating step shown beside "Done" in the Status box (null until it's
  // Done, and while the ratings are still loading).
  const rating = myRating === undefined ? null : ratingStep(project, Boolean(myRating), Boolean(theirRating));

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
          <Avatar path={other?.avatar_path} name={otherName} size={36} to={otherPath} />
          <span className="text-white-50 fs-7">
            {iAmClient ? "Freelancer" : "Client"}:{" "}
            {otherPath ? (
              <Link to={otherPath} className="text-white fw-semibold text-decoration-none hover-role">{otherName}</Link>
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
              {/* Once it's Done the rating step shows next to it: ratings
                  are blind, and this says where the two of you are in it. */}
              <div className="d-flex flex-wrap align-items-center gap-2">
                <span className={`badge px-3 py-2 rounded-pill fw-bold fs-7 ${status.className}`}>{status.label}</span>
                {rating && (
                  <span className={`badge px-3 py-2 rounded-pill fw-semibold text-wrap text-start ${rating.badgeClass}`}>
                    <i className={`bi ${rating.icon} me-1`}></i>{rating.label}
                  </span>
                )}
              </div>
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

            {/* A submitted video plays right here, and a photo shows here. The
                file row below (with View) stays for every kind of file. */}
            {project.submission_path && mediaKind !== "file" && (
              <div className="mb-3">
                {mediaLink === undefined && <p className="text-secondary fs-7 mb-0">Loading the {mediaWord}...</p>}
                {mediaBroken && (
                  <p className="text-white-50 fs-7 mb-0">
                    <i className="bi bi-exclamation-circle me-1"></i>This {mediaWord} can't be {mediaKind === "video" ? "played" : "shown"} here. Use View to open it.
                  </p>
                )}
                {mediaLink && !mediaBroken && mediaKind === "video" && (
                  // preload="metadata": only the length and the first picture
                  // load until Play is pressed (kind to mobile data).
                  <video
                    src={mediaLink}
                    controls
                    preload="metadata"
                    aria-label={`Submitted video for ${project.title}`}
                    className="w-100 d-block rounded-3 bg-black"
                    style={{ maxHeight: 480 }}
                    onError={() => setFailedPath(submissionPath)}
                  ></video>
                )}
                {mediaLink && !mediaBroken && mediaKind === "image" && (
                  <img
                    src={mediaLink}
                    alt={`Submitted work for ${project.title}`}
                    className="d-block mx-auto rounded-3"
                    style={{ maxWidth: "100%", maxHeight: 480 }}
                    onError={() => setFailedPath(submissionPath)}
                  />
                )}
              </div>
            )}

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

            {/* A Blender file can't be shown in the browser, and it can carry
                scripts, so the page says how to open it safely. */}
            {isBlenderFile(project.submission_path) && (
              <p className="text-white-50 fs-7 mb-3">
                <i className="bi bi-shield-exclamation me-1"></i>
                This is a Blender file. View downloads it. Open it in Blender and keep "Auto Run Python Scripts" off.
              </p>
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

            {/* Once it's Done, each side rates the other once (screen 4/5).
                Ratings are blind: a rating is hidden from the other person
                until both have rated, or until the time for rating is over. */}
            {project.status === "done" && (
              <div className="text-center pt-2">
                {myRating === undefined && <p className="text-secondary fs-7 mb-0">Loading your rating...</p>}
                {myRating === null && !deadline?.ended && (
                  <>
                    <Link to={`/dashboard/feedback/${project.id}`} className="btn btn-gradient-orange btn-lg rounded-pill px-5 py-3 fw-bold text-white shadow-glow">
                      <i className="bi bi-star-fill me-2"></i> Add your ratings and feedback
                    </Link>
                    <p className="text-white-50 fs-8 mt-3 mb-0">
                      <i className="bi bi-eye-slash-fill me-1"></i> Ratings are blind: neither of you sees the other's rating until you have both rated. Rating closes on {deadline?.day}.
                    </p>
                  </>
                )}
                {myRating === null && deadline?.ended && (
                  <p className="text-white-50 fs-7 mb-0">The rating period for this project ended on {deadline.day}.</p>
                )}
                {myRating && (
                  <p className="text-white-50 fs-7 mb-0">
                    <i className="bi bi-star-fill text-warning me-1"></i> You rated {otherName} {myRating.stars}/5.
                    {!theirRating && !deadline?.ended && (
                      <span className="d-block fs-8 mt-1">
                        <i className="bi bi-eye-slash-fill me-1"></i> Hidden from {otherName} until they rate you too, or until {deadline?.day}.
                      </span>
                    )}
                  </p>
                )}
                {myRating !== undefined && theirRating && (
                  <p className="text-white-50 fs-7 mt-2 mb-0 text-break">
                    <i className="bi bi-star-fill text-warning me-1"></i> {otherName} rated you {theirRating.stars}/5.
                    {theirRating.feedback && <span className="d-block fst-italic mt-1">"{theirRating.feedback}"</span>}
                  </p>
                )}
                {myRating !== undefined && !theirRating && deadline?.ended && (
                  <p className="text-secondary fs-8 mt-2 mb-0">{otherName} didn't rate this project.</p>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
