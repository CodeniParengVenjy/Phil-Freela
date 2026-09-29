import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { getApplicantsForMyJobs, getMyApplications, openResume } from "../../../lib/applications";
import { useVerifiedIds } from "../../../lib/useVerifiedIds";
import Avatar from "../../../components/Avatar";
import VerifiedBadge from "../../../components/VerifiedBadge";

// Longest part of a cover note shown in the list.
const NOTE_PREVIEW_LENGTH = 160;

// The "Applications & Resumes" box on the Projects page. Clients see who
// applied to their job posts; freelancers see the jobs they applied to.
export default function ApplicationsPanel({ isFreelancer, currentUserId, openChat, showToast }) {
  // null while loading, then the list.
  const [rows, setRows] = useState(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!currentUserId) return undefined;
    let active = true;

    const request = isFreelancer ? getMyApplications(currentUserId) : getApplicantsForMyJobs(currentUserId);
    request.then(({ data, error }) => {
      if (!active) return;
      if (error) setFailed(true);
      else setRows(data);
    });

    return () => {
      active = false;
    };
  }, [isFreelancer, currentUserId]);

  const verifiedIds = useVerifiedIds((rows || []).map((row) => row.freelancer?.id));

  const handleViewResume = async (resumePath) => {
    const problem = await openResume(resumePath);
    if (problem) showToast(problem);
  };

  return (
    <div className="glass-card rounded-4 p-4 border border-secondary border-opacity-25 h-100">
      <h4 className="text-white fw-bold mb-3">
        <i className="bi bi-file-earmark-person-fill text-info me-2"></i> {isFreelancer ? "My Applications" : "Applications & Resumes"}
      </h4>
      <p className="text-secondary fs-7 mb-4">
        {isFreelancer ? "Jobs you sent your resume to." : "Freelancers who sent a resume to your job posts."}
      </p>

      {failed && <p className="text-danger fs-7 mb-0">Couldn't load applications right now.</p>}
      {!failed && rows === null && <p className="text-secondary fs-7 mb-0">Loading...</p>}
      {!failed && rows?.length === 0 && (
        <p className="text-secondary fs-7 mb-0">
          {isFreelancer
            ? <>You haven't applied to a job yet. <Link to="/dashboard/find-jobs" className="text-role fw-bold text-decoration-none">Find Jobs</Link></>
            : "No one has applied to your job posts yet."}
        </p>
      )}

      <div className="d-flex flex-column gap-3">
        {rows?.map((row) => {
          const sentOn = new Date(row.created_at).toLocaleDateString();
          const jobLink = <Link to={`/dashboard/job-details/${row.job?.id}`} className="text-role fw-semibold text-decoration-none">{row.job?.title}</Link>;

          if (isFreelancer) {
            const clientName = row.job?.client?.full_name || row.job?.client?.username || "Client";
            return (
              <div key={row.id} className="p-3 rounded-3 bg-dark bg-opacity-50 border border-secondary border-opacity-25 d-flex flex-column flex-sm-row align-items-sm-center justify-content-between gap-3">
                <div className="overflow-hidden">
                  <h6 className="fw-bold mb-1 text-break">{jobLink}</h6>
                  <p className="text-white-50 fs-7 mb-0">{clientName} • sent {sentOn}</p>
                </div>
                <button type="button" className="btn btn-dark border border-secondary text-white rounded-pill px-3 fs-7 fw-bold flex-shrink-0" onClick={() => handleViewResume(row.resume_path)}>
                  <i className="bi bi-file-earmark-pdf me-1"></i> My resume
                </button>
              </div>
            );
          }

          const freelancer = row.freelancer;
          const name = freelancer?.full_name || freelancer?.username || "Freelancer";
          const note = row.cover_note || "";
          return (
            <div key={row.id} className="p-3 rounded-3 bg-dark bg-opacity-50 border border-secondary border-opacity-25">
              <div className="d-flex align-items-center gap-3 mb-2">
                <Avatar path={freelancer?.avatar_path} name={name} size={48} />
                <div className="overflow-hidden">
                  <h6 className="text-white fw-bold mb-0 text-break">
                    <Link to={`/dashboard/freelancers/${freelancer?.id}`} className="text-white text-decoration-none hover-role">{name}</Link>
                    <VerifiedBadge verified={verifiedIds.has(freelancer?.id)} />
                  </h6>
                  <p className="text-white-50 fs-7 mb-0 text-break">Applied to {jobLink} • {sentOn}</p>
                </div>
              </div>
              {note && (
                <p className="text-light-50 fs-7 fst-italic mb-2 text-break" title={note}>
                  "{note.length > NOTE_PREVIEW_LENGTH ? `${note.slice(0, NOTE_PREVIEW_LENGTH)}...` : note}"
                </p>
              )}
              <div className="d-flex flex-wrap gap-2">
                <button type="button" className="btn btn-gradient-role text-white rounded-pill px-3 fs-7 fw-bold" onClick={() => handleViewResume(row.resume_path)}>
                  <i className="bi bi-file-earmark-pdf me-1"></i> View resume
                </button>
                <button type="button" className="btn btn-dark border border-secondary text-white rounded-pill px-3 fs-7 fw-bold" onClick={() => openChat(freelancer?.id)}>
                  <i className="bi bi-chat-dots-fill me-1"></i> Message
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
