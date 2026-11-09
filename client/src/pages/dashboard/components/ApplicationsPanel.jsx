import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useOutletContext, useSearchParams } from "react-router-dom";
import { getApplicantsForMyJobs, getMyApplications, getNewApplicants, markApplicantsSeen, openResume, resumeIcon } from "../../../lib/applications";
import { getBestFit } from "../../../lib/aiService";
import { useVerifiedIds } from "../../../lib/useVerifiedIds";
import Avatar from "../../../components/Avatar";
import VerifiedBadge from "../../../components/VerifiedBadge";
import HireDialog from "./HireDialog";
import CensoredText from "../../../components/CensoredText";
import { Busy, Loader } from "../../../components/Loaders";

// Longest part of a cover note shown in the list.
const NOTE_PREVIEW_LENGTH = 160;

// How the client's list of applicants is ordered. "Best fit" is the AI's
// ranking; "First applied" is the fair fallback (never newest first, which
// buried the early applicants: the user, 2026-11-10).
const SORTS = [
  { value: "fit", label: "Best fit", icon: "bi-stars" },
  { value: "first", label: "First applied", icon: "bi-clock-history" }
];

// The first time a job's applicants are ranked, the AI reads every resume; a
// picture takes a few seconds. While some are still being read, it asks again
// this often, this many times at most.
const ASK_AGAIN_MS = 3000;
const ASK_AGAIN_TIMES = 8;

const plural = (count, word) => `${count} ${word}${count === 1 ? "" : "s"}`;

// A "Hired" badge and a link to the project the hire started.
function HiredLink({ project }) {
  return (
    <Link to={`/dashboard/project-details/${project.id}`} className="btn btn-dark border border-success text-success rounded-pill px-3 fs-7 fw-bold">
      <i className="bi bi-check-circle-fill me-1"></i> Hired • Open project
    </Link>
  );
}

// Why the AI put an applicant where it did (ai-service/best_fit.py sends the
// facts; the words are made here).
function FitReasons({ pick }) {
  const reasons = [];
  if (pick.read === "pending") reasons.push({ icon: "bi-hourglass-split", text: "The AI is still reading this resume" });
  if (pick.read === "unreadable") reasons.push({ icon: "bi-exclamation-circle", tone: "text-warning", text: "The AI couldn't read this resume. Open it to check" });
  if (pick.resume_match) reasons.push({ icon: "bi-file-earmark-check", tone: "text-success", text: "Resume matches the job" });
  if (pick.skills_total > 0) {
    reasons.push({
      icon: "bi-tools",
      // "(1 related)": a skill of the same kind of work, not the skill itself (it counts half).
      text: `Has ${pick.skills_matched.length} of ${plural(pick.skills_total, "skill")}${pick.skills_related ? ` (${pick.skills_related} related)` : ""}`,
      title: pick.skills_matched.length ? `Has: ${pick.skills_matched.join(", ")}` : "None of the required skills were found"
    });
  }
  if (pick.rating_count > 0) reasons.push({ icon: "bi-star-fill", tone: "text-warning", text: `${pick.avg_stars.toFixed(1)} from ${plural(pick.rating_count, "rating")}` });
  if (pick.completed > 0) reasons.push({ icon: "bi-check2-circle", text: `${plural(pick.completed, "project")} done` });
  if (pick.rating_count === 0 && pick.completed === 0) reasons.push({ icon: "bi-person", text: "No ratings yet" });
  if (pick.fast_reply) reasons.push({ icon: "bi-lightning-charge-fill", tone: "text-info", text: "Replies within an hour" });

  return (
    <div className="d-flex flex-wrap column-gap-3 row-gap-1 fs-8 text-white-50 mb-2">
      {reasons.map((reason) => (
        <span key={reason.text} title={reason.title}>
          <i className={`bi ${reason.icon} me-1 ${reason.tone || ""}`}></i>{reason.text}
        </span>
      ))}
    </div>
  );
}

// The "Applications & Resumes" box on the Projects page. Clients see who
// applied to their job posts, one post at a time, ranked by the AI (Best fit
// applicants, part of the Hybrid recommendation system), and can hire them
// (which starts a project); freelancers see the jobs they applied to.
export default function ApplicationsPanel({ isFreelancer, currentUserId, openChat, showToast, onHired }) {
  // null while loading, then the list (newest first).
  const [rows, setRows] = useState(null);
  const [failed, setFailed] = useState(false);
  // The applicant in the Hire popup (null = closed).
  const [hireTarget, setHireTarget] = useState(null);
  // What the client typed in the search box above their resumes list.
  const [query, setQuery] = useState("");
  // ?job=<id> in the address (from a job post, the client's listings or a
  // notification) opens that post's applicants.
  const [searchParams] = useSearchParams();
  const askedJob = searchParams.get("job");
  // The post picked in the drop-down, remembered with the ?job= it was picked
  // under, so a new ?job= (another link) wins over an older pick.
  const [picked, setPicked] = useState({ asked: askedJob, jobId: null });
  const [sort, setSort] = useState("fit");
  // The AI's ranking: { jobId, picks: Map of application id -> pick (with
  // .position, 0 = best), pending, failed }, or null before the first answer.
  const [ranking, setRanking] = useState(null);
  const boxRef = useRef(null);
  // New applicants (PLAN-notifications.md, Step N1): the ones the client hadn't
  // opened yet when this box loaded. They keep their "New" tag for this visit,
  // even after they are marked as seen below.
  const [newIds, setNewIds] = useState(() => new Set());
  // The posts already marked as seen during this visit (so it happens once).
  const markedJobs = useRef(new Set());
  // Makes the number on the "Projects & Resumes" menu link count again.
  const { refreshNewApplicants } = useOutletContext() || {};

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

  // Which of the client's applicants are new (a separate request: before the
  // database part is added it fails, and nothing is marked New).
  useEffect(() => {
    if (isFreelancer || !currentUserId) return undefined;
    let active = true;
    getNewApplicants(currentUserId).then(({ data, error }) => {
      if (active && !error) setNewIds(new Set(data.map((row) => row.id)));
    });
    return () => {
      active = false;
    };
  }, [isFreelancer, currentUserId]);

  // The client's job posts that have applicants, the latest application first,
  // with how many applied to each and how many of them are new.
  const jobs = useMemo(() => {
    if (isFreelancer || !rows) return [];
    const byId = new Map();
    for (const row of rows) {
      if (!row.job?.id) continue;
      const entry = byId.get(row.job.id) || { id: row.job.id, title: row.job.title, count: 0, newCount: 0 };
      entry.count += 1;
      if (newIds.has(row.id)) entry.newCount += 1;
      byId.set(row.job.id, entry);
    }
    return [...byId.values()];
  }, [isFreelancer, rows, newIds]);

  // The post on screen: the one picked, else the one in ?job=, else the post
  // with the latest application.
  const chosen = picked.asked === askedJob ? picked.jobId : null;
  const jobId = [chosen, askedJob, jobs[0]?.id].find((id) => id && jobs.some((job) => job.id === id)) || null;
  const job = jobs.find((j) => j.id === jobId);

  // Came from a ?job= link: bring this box into view once the list is in.
  useEffect(() => {
    if (askedJob && rows?.length) boxRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [askedJob, rows]);

  // The post on screen has new applicants: the client has now seen them, so
  // mark them as seen in the database (once per post per visit) and let the
  // menu number go down. Their "New" tags stay until the page is left.
  const jobHasNew = (job?.newCount || 0) > 0;
  useEffect(() => {
    if (isFreelancer || !jobHasNew || markedJobs.current.has(jobId)) return;
    markedJobs.current.add(jobId);
    markApplicantsSeen(jobId).then(() => refreshNewApplicants?.());
  }, [isFreelancer, jobId, jobHasNew, refreshNewApplicants]);

  // Ask the AI to rank the post's applicants (ai-service/best_fit.py). While it
  // is still reading resumes for the first time, ask again a few times.
  useEffect(() => {
    if (isFreelancer || !jobId) return undefined;
    let active = true;
    let timer;
    let asked = 0;
    const ask = () => {
      asked += 1;
      getBestFit(jobId)
        .then(({ results = [], pending = 0 }) => {
          if (!active) return;
          const picks = new Map(results.map((pick, position) => [pick.application_id, { ...pick, position }]));
          setRanking({ jobId, picks, pending, failed: false });
          if (pending > 0 && asked < ASK_AGAIN_TIMES) timer = setTimeout(ask, ASK_AGAIN_MS);
        })
        .catch(() => {
          // The AI service is off or slow: the list stays first applied first.
          if (active) setRanking({ jobId, picks: new Map(), pending: 0, failed: true });
        });
    };
    ask();
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [isFreelancer, jobId]);

  const verifiedIds = useVerifiedIds((rows || []).map((row) => row.freelancer?.id));

  // ownerName names a downloaded Word file after the applicant (a client may open
  // several, and they would all be called "resume.docx").
  const handleViewResume = async (resumePath, ownerName) => {
    const problem = await openResume(resumePath, ownerName);
    if (problem) showToast(problem);
  };

  // The project started: mark that applicant as hired and let the Projects
  // page show the new project card.
  const handleHired = (projectId) => {
    setRows((prev) => prev.map((row) => (row.id === hireTarget.applicationId ? { ...row, project: { id: projectId, status: "started" } } : row)));
    showToast(`You hired ${hireTarget.freelancerName}! The project has started.`);
    setHireTarget(null);
    onHired?.();
  };

  // The AI's picks for the post on screen (null while it is ranking, or if it
  // couldn't).
  const rankingReady = ranking?.jobId === jobId;
  const picks = rankingReady && !ranking.failed ? ranking.picks : null;

  // The rows to show. A freelancer sees all their applications, newest first.
  // A client sees one post's applicants: first applied first, or in the AI's
  // order. The search keeps the ones whose name or job title has the typed words.
  const q = query.trim().toLowerCase();
  const matches = (row) => {
    const name = row.freelancer?.full_name || row.freelancer?.username || "";
    return `${name} ${row.job?.title || ""}`.toLowerCase().includes(q);
  };
  let shownRows;
  if (isFreelancer) {
    shownRows = rows || [];
  } else {
    shownRows = (rows || [])
      .filter((row) => row.job?.id === jobId && matches(row))
      .sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
    if (sort === "fit" && picks) {
      const place = (row) => picks.get(row.id)?.position ?? Number.MAX_SAFE_INTEGER;
      shownRows.sort((a, b) => place(a) - place(b));
    }
  }

  // The line under the order buttons: what the AI is doing, or why there is no ranking.
  const rankingNote = () => {
    if (!rankingReady) return <Busy kind="ai">Ranking applicants</Busy>;
    if (ranking.failed) return "The AI couldn't rank them right now, so they are shown first applied first.";
    if (ranking.pending > 0) return <Busy kind="ai">{`Reading ${plural(ranking.pending, "resume")}`}</Busy>;
    return "Ranked by PhilFreela's AI: how well each resume fits the job, the required skills, ratings, finished projects and reply speed.";
  };

  // (data-tour: parts the opening tour points at, components/WelcomeGuide.jsx)
  return (
    <div ref={boxRef} data-tour="applications" className="glass-card rounded-4 p-4 border border-secondary border-opacity-25 h-100" style={{ scrollMarginTop: 80 }}>
      <h4 className="text-white fw-bold mb-3">
        <i className="bi bi-file-earmark-person-fill text-info me-2"></i> {isFreelancer ? "My Applications" : "Applications & Resumes"}
      </h4>
      <p className="text-secondary fs-7 mb-4">
        {isFreelancer ? "Jobs you sent your resume to." : "Freelancers who sent a resume to your job posts, best fit first."}
      </p>

      {failed && <p className="text-danger fs-7 mb-0">Couldn't load applications right now.</p>}
      {!failed && rows === null && <Loader size="sm" />}
      {!failed && rows?.length === 0 && (
        <p className="text-secondary fs-7 mb-0">
          {isFreelancer
            ? <>You haven't applied to a job yet. <Link to="/dashboard/find-jobs" className="text-role fw-bold text-decoration-none">Find Jobs</Link></>
            : "No one has applied to your job posts yet."}
        </p>
      )}

      {/* The client's controls: which job post, the order, and the search box. */}
      {!isFreelancer && job && (
        <div className="d-flex flex-column gap-3 mb-3">
          {jobs.length > 1 ? (
            <select
              className="form-select bg-secondary bg-opacity-25 border-secondary text-white py-2"
              aria-label="Job post"
              value={jobId}
              onChange={(event) => setPicked({ asked: askedJob, jobId: event.target.value })}
            >
              {jobs.map((j) => (
                <option key={j.id} value={j.id}>{j.title} • {j.count} applied{j.newCount > 0 ? ` • ${j.newCount} new` : ""}</option>
              ))}
            </select>
          ) : (
            <p className="text-white-50 fs-7 mb-0 text-break">
              For <Link to={`/dashboard/job-details/${job.id}`} className="text-role fw-semibold text-decoration-none"><CensoredText text={job.title} /></Link> • {job.count} applied
              {job.newCount > 0 && <> • <span className="text-role fw-bold">{job.newCount} new</span></>}
            </p>
          )}

          <div>
            <div className="d-flex flex-wrap gap-2" role="group" aria-label="Order of applicants">
              {SORTS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  aria-pressed={sort === option.value}
                  className={`btn btn-sm rounded-pill px-3 fw-bold ${sort === option.value ? "btn-gradient-role text-white" : "btn-outline-secondary text-white-50"}`}
                  onClick={() => setSort(option.value)}
                >
                  <i className={`bi ${option.icon} me-1`}></i>{option.label}
                </button>
              ))}
            </div>
            {sort === "fit" && <p className="text-secondary fs-8 mb-0 mt-2">{rankingNote()}</p>}
          </div>

          <div className="position-relative search-nav-box">
            <i className="bi bi-search search-icon text-secondary"></i>
            <input
              type="search"
              className="form-control nav-search-input py-2"
              placeholder="Search..."
              aria-label="Search applicants by name"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </div>
        </div>
      )}
      {!isFreelancer && job && shownRows.length === 0 && q && (
        <p className="text-secondary fs-7 mb-0">No applicants match "{query.trim()}".</p>
      )}

      <div className="d-flex flex-column gap-3">
        {shownRows.map((row) => {
          const sentOn = new Date(row.created_at).toLocaleDateString();
          const jobLink = <Link to={`/dashboard/job-details/${row.job?.id}`} className="text-role fw-semibold text-decoration-none"><CensoredText text={row.job?.title} /></Link>;

          if (isFreelancer) {
            const clientName = row.job?.client?.full_name || row.job?.client?.username || "Client";
            return (
              <div key={row.id} className="p-3 rounded-3 bg-dark bg-opacity-50 border border-secondary border-opacity-25 d-flex flex-column flex-sm-row align-items-sm-center justify-content-between gap-3">
                <div className="overflow-hidden">
                  <h6 className="fw-bold mb-1 text-break">{jobLink}</h6>
                  <p className="text-white-50 fs-7 mb-0">
                    {/* Opens the client's public page: their record, to check before they answer. */}
                    {row.job?.client?.id
                      ? <Link to={`/dashboard/clients/${row.job.client.id}`} className="text-white-50 text-decoration-underline">{clientName}</Link>
                      : clientName}
                    {" "}• sent {sentOn}
                  </p>
                </div>
                <div className="d-flex flex-wrap gap-2 flex-shrink-0">
                  {row.project && <HiredLink project={row.project} />}
                  <button type="button" className="btn btn-dark border border-secondary text-white rounded-pill px-3 fs-7 fw-bold" onClick={() => handleViewResume(row.resume_path)}>
                    <i className={`bi ${resumeIcon(row.resume_path)} me-1`}></i> My resume
                  </button>
                </div>
              </div>
            );
          }

          const freelancer = row.freelancer;
          const name = freelancer?.full_name || freelancer?.username || "Freelancer";
          const note = row.cover_note || "";
          // The AI's pick for this applicant (undefined while ranking or without the AI).
          const pick = picks?.get(row.id);
          const isBest = pick?.position === 0 && job.count > 1;
          return (
            <div key={row.id} className={`p-3 rounded-3 bg-dark bg-opacity-50 border ${isBest ? "border-warning border-opacity-50" : "border-secondary border-opacity-25"}`}>
              {/* Picture, name and "Has sent a resume", with View (the resume) on the right. */}
              <div className="d-flex align-items-center gap-3 mb-2">
                <Avatar path={freelancer?.avatar_path} name={name} size={56} to={freelancer?.id ? `/dashboard/freelancers/${freelancer.id}` : undefined} />
                <div className="flex-grow-1 overflow-hidden">
                  <h6 className="text-white fw-bold mb-0 text-break">
                    <Link to={`/dashboard/freelancers/${freelancer?.id}`} className="text-white text-decoration-none hover-role">{name}</Link>
                    <VerifiedBadge verified={verifiedIds.has(freelancer?.id)} />
                    {/* Applied since the client last opened this post's applicants. */}
                    {newIds.has(row.id) && <span className="badge bg-warning text-dark fs-8 ms-2 align-middle">New</span>}
                  </h6>
                  <p className="text-white-50 fs-7 mb-0 text-break">Has sent a resume for {jobLink} • {sentOn}</p>
                </div>
                <button
                  type="button"
                  className="btn btn-outline-role rounded-pill px-4 fs-7 fw-bold flex-shrink-0"
                  aria-label={`View ${name}'s resume`}
                  onClick={() => handleViewResume(row.resume_path, name)}
                >
                  View
                </button>
              </div>
              {/* Where the AI ranked them, how well they fit, and why. */}
              {pick && (
                <>
                  <div className="d-flex flex-wrap align-items-center gap-2 mb-2">
                    {sort === "fit" && <span className="badge bg-secondary bg-opacity-50 text-white fs-8">#{pick.position + 1}</span>}
                    {isBest && <span className="badge bg-warning text-dark fs-8"><i className="bi bi-trophy-fill me-1"></i>Best fit</span>}
                    <span className="badge bg-role-subtle text-role fs-8" title="How well this applicant fits the job, out of 100">Fit {pick.fit}%</span>
                  </div>
                  <FitReasons pick={pick} />
                </>
              )}
              {note && (
                <p className="text-light-50 fs-7 fst-italic mb-2 text-break" title={note}>
                  "<CensoredText text={note.length > NOTE_PREVIEW_LENGTH ? `${note.slice(0, NOTE_PREVIEW_LENGTH)}...` : note} />"
                </p>
              )}
              <div className="d-flex flex-wrap gap-2">
                {row.project ? (
                  <HiredLink project={row.project} />
                ) : (
                  <button
                    type="button"
                    className="btn btn-gradient-role text-white rounded-pill px-3 fs-7 fw-bold"
                    onClick={() => setHireTarget({ applicationId: row.id, freelancerName: name, jobTitle: row.job?.title, jobDueDate: row.job?.due_date, jobBudget: row.job?.budget, jobBudgetType: row.job?.budget_type })}
                  >
                    <i className="bi bi-briefcase-fill me-1"></i> Hire
                  </button>
                )}
                <button type="button" className="btn btn-dark border border-secondary text-white rounded-pill px-3 fs-7 fw-bold" onClick={() => openChat(freelancer?.id)}>
                  <i className="bi bi-chat-dots-fill me-1"></i> Message
                </button>
              </div>
            </div>
          );
        })}
      </div>

      <HireDialog key={hireTarget?.applicationId} applicant={hireTarget} onClose={() => setHireTarget(null)} onHired={handleHired} />
    </div>
  );
}
