import { useEffect, useState } from "react";
import { Link, useOutletContext, useParams } from "react-router-dom";
import {
  canPreview, deliverableIcon, deliverableKind, formatDay, getDeliverableLink, getMyRating, getPreviewLink, getProject, getRatingOfMe, isBlenderFile,
  isLocked, markProjectDone, openDeliverable, personName, projectStatuses, ratingDeadline, ratingReveal, ratingStep, requestProjectChanges, dueInfo
} from "../../../lib/projects";
import { makeDeliverablePreview } from "../../../lib/aiService";
import { unlocksWhenFullyPaid } from "../../../lib/payments";
import { profilePath } from "../../../lib/profileStats";
import { hasRatedOffer } from "../../../lib/serviceReviews";
import Avatar from "../../../components/Avatar";
import CensoredText from "../../../components/CensoredText";
import PaymentsSection from "../components/PaymentsSection";
import ProjectPriceBox from "../components/ProjectPriceBox";
import ReportDialog from "../components/ReportDialog";
import DueBadge from "../components/DueBadge";
import { Loader, Busy } from "../../../components/Loaders";

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
  // The Report popup for a payment answered "Not received" (null = closed).
  const [reportTarget, setReportTarget] = useState(null);

  useEffect(() => {
    let active = true;
    getProject(projectId).then((data) => {
      if (active) setProject(data);
    });
    return () => {
      active = false;
    };
  }, [projectId]);

  // Reads the project again (after a price was sent or agreed).
  const reloadProject = () => getProject(projectId).then((data) => {
    if (data) setProject(data);
  });

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

  // A Done and paid project from a booked offer: the client can now rate that
  // offer on its page too (the payment must be confirmed first, like the
  // project rating). undefined while checking, true / false = rated it or not
  // (null when it couldn't be checked: then no link).
  const offerId = project?.booking?.service_id;
  const clientOfDoneOffer = project?.status === "done" && project?.client_id === currentUserId && Boolean(offerId)
    && Boolean(project?.unlocked_at);
  const [offerRated, setOfferRated] = useState(undefined);

  useEffect(() => {
    if (!clientOfDoneOffer) return undefined;
    let active = true;
    hasRatedOffer(offerId, currentUserId).then((rated) => {
      if (active) setOfferRated(rated);
    });
    return () => {
      active = false;
    };
  }, [clientOfDoneOffer, offerId, currentUserId]);

  // A submitted video or photo is shown right on the page ("video" /
  // "image"); other files ("file": PDF, ZIP, Blender) only get the View button.
  const submissionPath = project?.submission_path;
  // Pay to unlock (PLAN-transaction-tracking.md, Step F): until a payment on
  // the project is confirmed, the client sees the watermarked preview (a video,
  // or a picture; a PDF's preview is a picture of its first pages) with no
  // download, never the original. The database refuses them the original anyway.
  const previewOnly = isLocked(project) && project?.client_id === currentUserId;
  // The file the player or picture shows: the preview, or the original.
  const shownPath = previewOnly ? project?.preview_path : submissionPath;
  const mediaKind = deliverableKind(shownPath);
  // The private link the player or photo uses, kept with the file it is for:
  // { path, link }, where link is null when it couldn't be made.
  const [media, setMedia] = useState(null);
  // The file the browser couldn't play or show (e.g. some .mov videos).
  const [failedPath, setFailedPath] = useState(null);
  // True while the freelancer's "Make the preview" is working.
  const [makingPreview, setMakingPreview] = useState(false);

  useEffect(() => {
    if (!shownPath || mediaKind === "file") return undefined;
    let active = true;
    (previewOnly ? getPreviewLink : getDeliverableLink)(shownPath).then((link) => {
      if (active) setMedia({ path: shownPath, link });
    });
    return () => {
      active = false;
    };
  }, [shownPath, mediaKind, previewOnly]);

  // The preview is still being made (or making it failed): read the project
  // again every 15 seconds until it is there.
  const waitingForPreview = isLocked(project) && canPreview(submissionPath) && !project?.preview_path;
  useEffect(() => {
    if (!waitingForPreview) return undefined;
    const timer = setInterval(() => {
      getProject(projectId).then((data) => {
        if (data) setProject(data);
      });
    }, 15000);
    return () => clearInterval(timer);
  }, [waitingForPreview, projectId]);

  // The freelancer asks for the preview again (it failed, or wasn't made).
  const handleMakePreview = async () => {
    setMakingPreview(true);
    try {
      await makeDeliverablePreview(project.id);
      await reloadProject();
      showToast(`The watermarked preview is ready. ${personName(project.client, "The client")} can watch it now.`);
    } catch (error) {
      showToast(error.message);
    }
    setMakingPreview(false);
  };

  // A payment on this project was just confirmed (live, or by the freelancer
  // here): the database may have unlocked the work, which also opens the
  // client's rating, so read the project again.
  const handlePaymentsChange = (list) => {
    if (!project.unlocked_at && list.some((payment) => payment.status === "confirmed")) reloadProject();
  };

  const scrollToPayments = () => {
    document.getElementById("payments-heading")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

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
    return <section className="dashboard-view active-view"><Loader size="lg" label="Loading project" /></section>;
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
  // Late, due soon, or neither (lib/projects.js dueInfo; Step N4 of PLAN-notifications.md).
  const due = dueInfo(project);
  const hasSubmission = Boolean(project.submission_path || project.submission_link);
  // undefined while the link is loading, null when it couldn't be made.
  const mediaLink = media?.path === shownPath ? media.link : undefined;
  const mediaWord = previewOnly ? "preview" : mediaKind === "video" ? "video" : "photo";
  const mediaBroken = mediaLink === null || failedPath === shownPath;
  // A PDF's preview is a tall picture of its first pages: it gets a box to
  // scroll in, at full width, instead of being shrunk to fit.
  const pagePreview = previewOnly && /\.pdf$/i.test(submissionPath || "");
  // Stops the easy ways to save the preview (right-click, dragging it out).
  // A screenshot can't be stopped; that is why the text covers the whole picture.
  const noSaving = previewOnly ? { onContextMenu: (event) => event.preventDefault(), draggable: false } : {};
  // When rating closes for a Done project (null until it's Done). The client's
  // opens only once the payment is confirmed (deadline.waitingForPayment until then).
  const deadline = project.status === "done" ? ratingDeadline(project, iAmClient) : null;
  // The same for the other person, and when a one-sided rating stops being hidden.
  const theirDeadline = project.status === "done" ? ratingDeadline(project, !iAmClient) : null;
  const reveal = project.status === "done" ? ratingReveal(project) : null;
  // A one-time agreed price must be paid in full before the client can rate.
  const fullPriceNeeded = project.price_status === "agreed" && project.price_basis === "project";
  // The rating step shown beside "Done" in the Status box (null until it's
  // Done, and while the ratings are still loading).
  const rating = myRating === undefined ? null : ratingStep(project, Boolean(myRating), Boolean(theirRating), iAmClient);

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
          <h2 className="h3 fw-bold text-white mb-0 text-break flex-grow-1"><CensoredText text={project.title} /></h2>
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

        {/* A late project says so at the top, and what to do next (the same
            words as the daily late notice, Step N4 of PLAN-notifications.md). */}
        {due?.late && (
          <div className="alert alert-danger fs-7 py-2 mb-4" role="status">
            <i className="bi bi-exclamation-triangle-fill me-1"></i> This project is {due.days} day{due.days === 1 ? "" : "s"} late.{" "}
            {iAmClient ? `Message ${otherName} to ask about it.` : "Submit your work or message the client."}
          </div>
        )}

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
              <span className={`fw-bold fs-6 ${due?.late ? "text-danger" : "text-warning"}`}>
                <i className="bi bi-clock-history me-2"></i>{formatDay(project.due_date)}
              </span>
              <DueBadge project={project} className="ms-2 align-middle" />
            </div>
          </div>

          {/* The one price payments will come from (PLAN-transaction-tracking.md). */}
          <div className="col-12">
            <ProjectPriceBox project={project} currentUserId={currentUserId} otherName={otherName} showToast={showToast} onChanged={reloadProject} />
          </div>

          <div className="col-12">
            <div className="p-3 bg-dark bg-opacity-50 rounded-3 border border-secondary border-opacity-25">
              <span className="text-secondary fs-8 d-block mb-1">Note from the client</span>
              <p className="text-white-50 fs-7 mb-0 text-break" style={{ whiteSpace: "pre-wrap" }}>{project.note ? <CensoredText text={project.note} /> : "No note."}</p>
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

            {/* Pay to unlock, the client's side: what they see is a preview, and
                how to get the original. */}
            {previewOnly && (
              <div className="p-3 rounded-3 border border-warning border-opacity-50 bg-warning bg-opacity-10 d-flex gap-2 align-items-start mb-3" data-locked-notice>
                <i className="bi bi-lock-fill text-warning fs-5 flex-shrink-0"></i>
                <div>
                  <p className="text-white fw-semibold fs-7 mb-1">{canPreview(submissionPath) ? "Preview only" : "Locked until you pay"}</p>
                  <p className="text-white-50 fs-7 mb-2">
                    {canPreview(submissionPath)
                      ? "This is a watermarked preview. The original file unlocks, to open and download, "
                      : "This kind of file can't be previewed. It unlocks, to open and download, "}
                    {/* A one-time project with an agreed price opens only when fully
                        paid (PLAN-short-payment.md); others on any confirmed payment. */}
                    {unlocksWhenFullyPaid(project)
                      ? `when the agreed price is fully paid and ${otherName} has confirmed it.`
                      : `when ${otherName} confirms your payment.`}
                  </p>
                  <button type="button" className="btn btn-link text-role p-0 fs-7 fw-semibold text-decoration-none" onClick={scrollToPayments}>
                    <i className="bi bi-arrow-down-circle me-1"></i>Go to Payments
                  </button>
                </div>
              </div>
            )}

            {/* Pay to unlock, the freelancer's side. */}
            {!iAmClient && isLocked(project) && (
              <div className="p-3 rounded-3 border border-secondary border-opacity-25 bg-dark bg-opacity-50 d-flex gap-2 align-items-start mb-3" data-locked-note>
                <i className="bi bi-lock-fill text-warning fs-5 flex-shrink-0"></i>
                <div>
                  <p className="text-white-50 fs-7 mb-0">
                    {otherName} sees only {canPreview(submissionPath) ? "a watermarked preview of your file" : "the name of your file"}, with no download,{" "}
                    {unlocksWhenFullyPaid(project) ? "until the agreed price is fully paid (what you confirm)." : "until you confirm a payment on this project."}
                  </p>
                  {waitingForPreview && (
                    <div className="mt-2">
                      <p className="text-white-50 fs-7 mb-2">The preview isn't ready yet, so {otherName} can't see your work.</p>
                      <button type="button" className="btn btn-outline-role rounded-pill px-3 py-1 fs-7 fw-bold" onClick={handleMakePreview} disabled={makingPreview}>
                        {makingPreview ? <Busy kind="ai">Making the preview</Busy> : <><i className="bi bi-magic me-1"></i>Make the preview</>}
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* A submitted video plays right here, and a photo shows here. The
                file row below (with View) stays for every kind of file. */}
            {previewOnly && waitingForPreview && (
              <p className="text-secondary fs-7 mb-3"><i className="bi bi-hourglass-split me-1"></i>The watermarked preview is being made. It shows here in a minute.</p>
            )}
            {shownPath && mediaKind !== "file" && (
              <div className="mb-3">
                {mediaLink === undefined && <p className="text-secondary fs-7 mb-0">Loading the {mediaWord}...</p>}
                {mediaBroken && (
                  <p className="text-white-50 fs-7 mb-0">
                    <i className="bi bi-exclamation-circle me-1"></i>
                    {previewOnly
                      ? "The preview can't be shown here right now. Please reload the page."
                      : `This ${mediaWord} can't be ${mediaKind === "video" ? "played" : "shown"} here. Use View to open it.`}
                  </p>
                )}
                {mediaLink && !mediaBroken && mediaKind === "video" && (
                  // preload="metadata": only the length and the first picture
                  // load until Play is pressed (kind to mobile data). The
                  // preview's player has no Download, picture-in-picture or cast.
                  <video
                    src={mediaLink}
                    controls
                    preload="metadata"
                    aria-label={previewOnly ? `Watermarked preview of the work for ${project.title}` : `Submitted video for ${project.title}`}
                    className="w-100 d-block rounded-3 bg-black"
                    style={{ maxHeight: 480 }}
                    onError={() => setFailedPath(shownPath)}
                    {...(previewOnly ? { controlsList: "nodownload noremoteplayback", disablePictureInPicture: true, disableRemotePlayback: true } : {})}
                    {...noSaving}
                  ></video>
                )}
                {mediaLink && !mediaBroken && mediaKind === "image" && (
                  <div className={pagePreview ? "rounded-3 bg-black" : undefined} style={pagePreview ? { maxHeight: 640, overflowY: "auto" } : undefined}>
                    <img
                      src={mediaLink}
                      alt={previewOnly ? `Watermarked preview of the work for ${project.title}` : `Submitted work for ${project.title}`}
                      className={`d-block mx-auto rounded-3${previewOnly ? " user-select-none" : ""}`}
                      style={pagePreview ? { width: "100%" } : { maxWidth: "100%", maxHeight: 480 }}
                      onError={() => setFailedPath(shownPath)}
                      {...noSaving}
                    />
                  </div>
                )}
              </div>
            )}

            {project.submission_path && (
              <div className="p-3 rounded-3 bg-black bg-opacity-50 border border-secondary border-opacity-50 d-flex align-items-center justify-content-between gap-3 mb-3">
                <div className="d-flex align-items-center gap-3 overflow-hidden min-w-0">
                  <i className={`bi ${deliverableIcon(project.submission_path)} text-orange fs-2`}></i>
                  {/* One line ending in "..." (on a phone the long saved name used to
                      break across three lines); the whole name shows on hover. */}
                  <span className="text-white fw-semibold text-truncate min-w-0" title={project.submission_path.split("/").pop()}>{project.submission_path.split("/").pop()}</span>
                </div>
                {previewOnly ? (
                  <span className="badge rounded-pill bg-secondary text-white px-3 py-2 fs-8 flex-shrink-0" data-locked-badge>
                    <i className="bi bi-lock-fill me-1"></i> Locked
                  </span>
                ) : (
                  <button type="button" className="btn btn-gradient-orange text-white rounded-pill px-3 fs-7 fw-bold flex-shrink-0" onClick={handleViewDeliverable}>
                    <i className="bi bi-box-arrow-up-right me-1"></i> View
                  </button>
                )}
              </div>
            )}

            {/* A Blender file can't be shown in the browser, and it can carry
                scripts, so the page says how to open it safely (once it can be
                opened). */}
            {isBlenderFile(project.submission_path) && !previewOnly && (
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
              <p className="text-white-50 fs-7 fst-italic text-break mb-3">"<CensoredText text={project.submission_message} />"</p>
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
                {myRating === undefined && <Loader size="sm" label="Loading your rating" />}
                {/* The client rates only after a successful payment
                    (database/supabase_rating_after_payment_schema.sql). */}
                {myRating === null && deadline?.waitingForPayment && (
                  <>
                    <p className="text-white-50 fs-7 mb-3">
                      <i className="bi bi-hourglass-split text-warning me-1"></i>
                      {fullPriceNeeded
                        ? `You can rate ${otherName} once the agreed price is fully paid and ${otherName} confirms it.`
                        : `You can rate ${otherName} once ${otherName} confirms your payment.`}
                    </p>
                    <button type="button" className="btn btn-outline-role rounded-pill px-4 fw-bold" onClick={scrollToPayments}>
                      <i className="bi bi-cash-coin me-1"></i> Go to payment
                    </button>
                  </>
                )}
                {myRating === null && !deadline?.waitingForPayment && !deadline?.ended && (
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
                    {!theirRating && reveal && !reveal.ended && (
                      <span className="d-block fs-8 mt-1">
                        <i className="bi bi-eye-slash-fill me-1"></i> Hidden from {otherName} until they rate you too, or until {reveal.day}.
                      </span>
                    )}
                  </p>
                )}
                {myRating !== undefined && theirRating && (
                  <p className="text-white-50 fs-7 mt-2 mb-0 text-break">
                    <i className="bi bi-star-fill text-warning me-1"></i> {otherName} rated you {theirRating.stars}/5.
                    {theirRating.feedback && <span className="d-block fst-italic mt-1">"<CensoredText text={theirRating.feedback} />"</span>}
                  </p>
                )}
                {/* The freelancer's side: the client can rate only once their payment is confirmed. */}
                {myRating !== undefined && !theirRating && theirDeadline?.waitingForPayment && (
                  <p className="text-secondary fs-8 mt-2 mb-0">{otherName} can rate you once you confirm their payment.</p>
                )}
                {myRating !== undefined && !theirRating && theirDeadline?.ended && reveal?.ended && (
                  <p className="text-secondary fs-8 mt-2 mb-0">{otherName} didn't rate this project.</p>
                )}
                {/* The offer the client booked can be rated now that the work is done
                    (PLAN-offer-reviews.md, step 3). No time limit, unlike the blind ratings. */}
                {clientOfDoneOffer && offerRated === false && (
                  <div className="mt-3 pt-3 border-top border-secondary border-opacity-25">
                    <Link to={`/dashboard/service-details/${offerId}#offer-ratings`} className="btn btn-outline-role rounded-pill px-4 fw-bold">
                      <i className="bi bi-chat-square-text me-1"></i> Rate this offer
                    </Link>
                    <p className="text-white-50 fs-8 mt-2 mb-0">Your project is done, so you can now rate and comment on the offer you booked. Other clients read it before they book.</p>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Payments (PLAN-gcash-payments.md): the client pays in the GCash app and
            records it here; the freelancer confirms after checking their own GCash. */}
        <PaymentsSection
          project={project}
          iAmClient={iAmClient}
          currentUserId={currentUserId}
          otherName={otherName}
          otherId={other?.id}
          showToast={showToast}
          openChat={openChat}
          onReport={(payment) => setReportTarget({ type: "user", id: other?.id, name: otherName, payment })}
          onPaymentsChange={handlePaymentsChange}
        />
      </div>

      {/* Reporting the other person about a payment: the popup offers to send the
          payment (amount, reference and receipt) with the report. */}
      <ReportDialog target={reportTarget} onClose={() => setReportTarget(null)} onDone={showToast} />
    </section>
  );
}
