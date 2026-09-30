import { useEffect, useState } from "react";
import { Link, useOutletContext, useParams } from "react-router-dom";
import { supabase } from "../../../lib/supabaseClient";
import { getCategory } from "../../../lib/categories";
import { fetchIsVerified } from "../../../lib/verification";
import { isPostingBlocked } from "../../../lib/suspensions";
import { useVerifiedIds } from "../../../lib/useVerifiedIds";
import { MAX_NOTE_LENGTH, applyToJob, getMyApplicationForJob, openResume, withdrawApplication } from "../../../lib/applications";
import Avatar from "../../../components/Avatar";
import VerifiedBadge from "../../../components/VerifiedBadge";
import StarRating from "../../../components/StarRating";
import BlockedNotice from "../components/BlockedNotice";
import DeleteConfirmDialog from "../components/DeleteConfirmDialog";
import ReportDialog from "../components/ReportDialog";

// One client job post (opened from Find Jobs). Freelancers apply here with a
// PDF resume and an optional note; the client then sees them in Projects &
// Resumes. Clients have no public page of their own, so this is also where
// a freelancer can report the client.
export default function JobDetailsView() {
  const { jobId } = useParams();
  const { currentUserId, accountType, suspension, showToast, openChat } = useOutletContext();
  // undefined while loading, null when the job doesn't exist (or was removed).
  const [job, setJob] = useState(undefined);
  // The signed-in freelancer's application for this job (null = not applied).
  const [application, setApplication] = useState(null);
  // null while checking, then true/false (approved identity verification).
  const [iAmVerified, setIAmVerified] = useState(null);
  const [resumeFile, setResumeFile] = useState(null);
  const [note, setNote] = useState("");
  const [sending, setSending] = useState(false);
  const [confirmWithdraw, setConfirmWithdraw] = useState(false);
  const [withdrawing, setWithdrawing] = useState(false);
  // The client being reported (null = Report popup closed).
  const [reportTarget, setReportTarget] = useState(null);

  useEffect(() => {
    if (!currentUserId) return undefined;
    let active = true;

    Promise.all([
      supabase
        .from("job_posts")
        .select("id, title, category, description, budget, skills, created_at, client:profiles!job_posts_client_id_fkey(id, full_name, username, avatar_path)")
        .eq("id", jobId)
        .maybeSingle(),
      getMyApplicationForJob(currentUserId, jobId),
      fetchIsVerified(currentUserId)
    ]).then(([{ data }, myApplication, verified]) => {
      if (!active) return;
      setJob(data);
      setApplication(myApplication);
      setIAmVerified(verified);
    });

    return () => {
      active = false;
    };
  }, [jobId, currentUserId]);

  const clientVerified = useVerifiedIds([job?.client?.id]).has(job?.client?.id);

  const handleApply = async (event) => {
    event.preventDefault();
    if (sending) return;
    setSending(true);
    const { error } = await applyToJob(currentUserId, job.id, resumeFile, note);
    if (error) {
      setSending(false);
      showToast(error);
      return;
    }
    setApplication(await getMyApplicationForJob(currentUserId, job.id));
    setSending(false);
    setResumeFile(null);
    setNote("");
    showToast("Application sent! The client can now view your resume.");
  };

  const handleWithdraw = async () => {
    setWithdrawing(true);
    const problem = await withdrawApplication(application);
    setWithdrawing(false);
    setConfirmWithdraw(false);
    if (problem) {
      showToast(problem);
      return;
    }
    setApplication(null);
    showToast("Your application was withdrawn.");
  };

  const handleViewResume = async () => {
    const problem = await openResume(application.resume_path);
    if (problem) showToast(problem);
  };

  if (job === undefined) {
    return <section className="dashboard-view active-view"><p className="text-secondary fs-7">Loading job...</p></section>;
  }

  if (job === null) {
    return (
      <section className="dashboard-view active-view">
        <div className="glass-card rounded-4 p-5 border border-secondary border-opacity-25 text-center">
          <i className="bi bi-briefcase text-secondary" style={{ fontSize: "2.5rem" }}></i>
          <p className="text-secondary fs-7 mt-3 mb-3">This job post wasn't found. It may have been removed.</p>
          <Link to="/dashboard/find-jobs" className="btn btn-outline-role rounded-pill px-4 fw-bold">Back to Find Jobs</Link>
        </div>
      </section>
    );
  }

  const clientName = job.client?.full_name || job.client?.username || "Client";
  const isOwnJob = job.client?.id === currentUserId;
  const category = getCategory(job.category);

  // Which box shows at the bottom: the apply form, or why they can't apply.
  const renderApplySection = () => {
    if (isOwnJob) {
      return <p className="text-secondary fs-7 mb-0">This is your job post. Freelancers who apply show up in <Link to="/dashboard/projects" className="text-role fw-bold text-decoration-none">Projects & Resumes</Link>.</p>;
    }
    // Hired: the application became a project, so it can't be withdrawn anymore.
    if (application?.project) {
      return (
        <div className="d-flex flex-column flex-sm-row align-items-sm-center justify-content-between gap-3">
          <div>
            <p className="text-success fw-bold mb-1"><i className="bi bi-briefcase-fill me-2"></i>You were hired for this job</p>
            <p className="text-secondary fs-7 mb-0">The project has started. Open it to read the client's note and the due date.</p>
          </div>
          <Link to={`/dashboard/project-details/${application.project.id}`} className="btn btn-gradient-role text-white rounded-pill px-4 fs-7 fw-bold flex-shrink-0">
            Open project
          </Link>
        </div>
      );
    }
    if (application) {
      return (
        <div className="d-flex flex-column flex-sm-row align-items-sm-center justify-content-between gap-3">
          <div>
            <p className="text-success fw-bold mb-1"><i className="bi bi-check-circle-fill me-2"></i>Applied</p>
            <p className="text-secondary fs-7 mb-0">Sent on {new Date(application.created_at).toLocaleDateString()}. The client can view your resume.</p>
          </div>
          <div className="d-flex gap-2 flex-shrink-0">
            <button type="button" className="btn btn-dark border border-secondary text-white rounded-pill px-3 fs-7 fw-bold" onClick={handleViewResume}>
              <i className="bi bi-file-earmark-pdf me-1"></i> My resume
            </button>
            <button type="button" className="btn btn-outline-danger rounded-pill px-3 fs-7 fw-bold" onClick={() => setConfirmWithdraw(true)}>
              Withdraw
            </button>
          </div>
        </div>
      );
    }
    if (accountType !== "freelancer") {
      return <p className="text-secondary fs-7 mb-0">Only freelancer accounts can apply. Use "Join as Freelancer" at the top to switch.</p>;
    }
    if (isPostingBlocked(suspension)) {
      return <BlockedNotice suspension={suspension} what="apply to jobs" compact />;
    }
    if (iAmVerified === false) {
      return (
        <p className="text-secondary fs-7 mb-0">
          <i className="bi bi-shield-exclamation me-1"></i> Only verified freelancers can apply.{" "}
          <Link to="/dashboard/verify-identity" className="text-role fw-bold text-decoration-none">Verify your identity</Link>
        </p>
      );
    }

    return (
      <form className="d-flex flex-column gap-3" onSubmit={handleApply}>
        <div>
          <label htmlFor="resumeFile" className="form-label text-white-50 fw-semibold fs-7">Your resume (PDF, up to 5 MB)</label>
          <input
            id="resumeFile"
            type="file"
            className="form-control bg-secondary bg-opacity-25 border-secondary text-white"
            accept="application/pdf,.pdf"
            onChange={(event) => setResumeFile(event.target.files?.[0] || null)}
            required
          />
        </div>
        <div>
          <label htmlFor="coverNote" className="form-label text-white-50 fw-semibold fs-7">Note to the client (optional)</label>
          <textarea
            id="coverNote"
            className="form-control bg-secondary bg-opacity-25 border-secondary text-white"
            rows="3"
            maxLength={MAX_NOTE_LENGTH}
            placeholder={`Why are you a great fit for "${job.title}"?`}
            value={note}
            onChange={(event) => setNote(event.target.value)}
          ></textarea>
          <small className="text-secondary fs-8">{note.length}/{MAX_NOTE_LENGTH}</small>
        </div>
        <div>
          <button type="submit" className="btn btn-gradient-role rounded-pill px-5 py-2 fw-bold text-white shadow-glow-role" disabled={sending || iAmVerified === null}>
            <i className="bi bi-send me-2"></i>{sending ? "Sending..." : "Send Application"}
          </button>
        </div>
      </form>
    );
  };

  return (
    <section className="dashboard-view active-view">
      <div className="glass-card rounded-4 p-4 p-md-5 border border-secondary border-opacity-25 max-w-950 mx-auto">
        <Link to="/dashboard/find-jobs" className="text-white-50 text-decoration-none fs-7 hover-role d-inline-block mb-3">
          <i className="bi bi-arrow-left me-1"></i> Back to Find Jobs
        </Link>

        <div className="d-flex flex-column flex-md-row align-items-md-center gap-4 mb-4 pb-4 border-bottom border-secondary border-opacity-25">
          <Avatar path={job.client?.avatar_path} name={clientName} size={80} />
          <div className="flex-grow-1 overflow-hidden">
            <h2 className="h3 fw-bold text-white mb-1 text-break">{job.title}</h2>
            <p className="text-white-50 fs-7 mb-2 d-flex flex-wrap align-items-center gap-2">
              Posted by <span className="text-white fw-semibold">{clientName}</span>
              <VerifiedBadge verified={clientVerified} showUnverified />
              {/* The client's average rating from past projects (Feature 5, transparency). */}
              <StarRating userId={job.client?.id} />
              <span>• {new Date(job.created_at).toLocaleDateString()}</span>
            </p>
            <div className="d-flex flex-wrap align-items-center gap-2">
              <span className="badge bg-role text-white px-3 py-2 rounded-pill"><i className={`bi ${category.icon} me-1`}></i>{category.label}</span>
              {job.budget && <span className="badge bg-secondary bg-opacity-50 text-warning px-3 py-2 rounded-pill">Budget: ₱{Number(job.budget).toLocaleString()}</span>}
            </div>
          </div>
          {!isOwnJob && job.client && (
            <div className="d-flex gap-2 flex-shrink-0">
              <button type="button" className="btn btn-dark border border-secondary text-white rounded-pill px-4 fw-bold" onClick={() => openChat(job.client.id)}>
                <i className="bi bi-chat-dots-fill me-1"></i> Message
              </button>
              <button
                type="button"
                className="btn btn-outline-secondary text-white-50 rounded-pill px-3"
                title="Report this client"
                aria-label="Report this client"
                onClick={() => setReportTarget({ type: "user", id: job.client.id, name: clientName })}
              >
                <i className="bi bi-flag-fill"></i>
              </button>
            </div>
          )}
        </div>

        <h4 className="text-white fw-bold mb-3"><i className="bi bi-card-text text-role me-2"></i> Description</h4>
        <div className="bg-dark bg-opacity-50 p-4 rounded-4 border border-secondary border-opacity-25 text-light-50 fs-7 lh-lg mb-4" style={{ whiteSpace: "pre-wrap" }}>
          {job.description}
        </div>

        {/* The skills the client listed when posting (hidden when there are none). */}
        {job.skills?.length > 0 && (
          <>
            <h4 className="text-white fw-bold mb-3"><i className="bi bi-tools text-role me-2"></i> Required Skills</h4>
            <div className="d-flex flex-wrap gap-2 mb-4">
              {job.skills.map((skill) => (
                <span key={skill} className="badge bg-secondary bg-opacity-50 text-white px-3 py-2 rounded-pill fw-semibold">{skill}</span>
              ))}
            </div>
          </>
        )}

        <h4 className="text-white fw-bold mb-3"><i className="bi bi-file-earmark-person-fill text-role me-2"></i> Apply for this job</h4>
        <div className="bg-dark bg-opacity-50 p-4 rounded-4 border border-secondary border-opacity-25">
          {renderApplySection()}
        </div>
      </div>

      <DeleteConfirmDialog
        open={confirmWithdraw}
        title="Withdraw your application?"
        message={`Your resume will be removed from "${job.title}", and the client won't see your application anymore.`}
        busy={withdrawing}
        confirmLabel="Withdraw"
        busyLabel="Withdrawing..."
        onConfirm={handleWithdraw}
        onCancel={() => setConfirmWithdraw(false)}
      />

      <ReportDialog target={reportTarget} onClose={() => setReportTarget(null)} onDone={showToast} />
    </section>
  );
}
