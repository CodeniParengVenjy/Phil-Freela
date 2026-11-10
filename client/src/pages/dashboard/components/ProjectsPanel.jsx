import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { formatDay, getMyProjects, personName, projectStatuses, ratingStep, todayInManila } from "../../../lib/projects";
import { listPaymentsOfProjects, paymentNearOrLate, projectMoney } from "../../../lib/payments";
import Avatar from "../../../components/Avatar";
import DueDateCalendar from "./DueDateCalendar";
import DueBadge from "./DueBadge";
import PayDueBadge from "./PayDueBadge";
import CensoredText from "../../../components/CensoredText";
import { Loader } from "../../../components/Loaders";

// The "My Projects" box on the Projects page. Each card opens its project
// page (the Project Details screen). Freelancers see the jobs they were hired
// for; clients see the freelancers they hired. reloadKey changes after a hire
// so the new project shows right away. A month calendar above the list marks
// the days the projects are due on.
export default function ProjectsPanel({ isFreelancer, currentUserId, reloadKey }) {
  // null while loading, then the list.
  const [projects, setProjects] = useState(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!currentUserId) return undefined;
    let active = true;

    getMyProjects(currentUserId, isFreelancer).then(({ data, error }) => {
      if (!active) return;
      if (error) setFailed(true);
      else setProjects(data);
    });

    return () => {
      active = false;
    };
  }, [isFreelancer, currentUserId, reloadKey]);

  // The payments of the Done projects whose payment is due soon or late, so their
  // cards can show a payment pill (PLAN-delays.md, Step 1). null until they are
  // read, and when they can't be read: then no pill shows, so a project is never
  // called late by mistake.
  const [paymentsById, setPaymentsById] = useState(null);
  useEffect(() => {
    if (!projects) return undefined;
    const ids = projects.filter((p) => paymentNearOrLate(p)).map((p) => p.id);
    if (!ids.length) return undefined;
    let active = true;

    listPaymentsOfProjects(ids).then(({ data }) => {
      if (active && data) setPaymentsById(data);
    });

    return () => {
      active = false;
    };
  }, [projects]);

  const today = todayInManila();

  // (data-tour: parts the opening tour points at, components/WelcomeGuide.jsx)
  return (
    <div data-tour="projects" className="glass-card rounded-4 p-4 border border-secondary border-opacity-25 h-100">
      <h4 className="text-white fw-bold mb-3"><i className="bi bi-kanban-fill text-warning me-2"></i> My Projects</h4>
      <p className="text-secondary fs-7 mb-4">
        {isFreelancer ? "Jobs you were hired for. Open one to see the details." : "Freelancers you hired. Open one to see how it's going."}
      </p>

      {failed && <p className="text-danger fs-7 mb-0">Couldn't load your projects right now.</p>}
      {!failed && projects === null && <Loader size="sm" />}
      {/* The due dates of the same projects, on a calendar. */}
      {/* An ended project (PLAN-end-project.md) has no date to look forward to. */}
      {!failed && projects !== null && <DueDateCalendar projects={projects.filter((p) => p.status !== "ended")} today={today} />}
      {!failed && projects?.length === 0 && (
        <p className="text-secondary fs-7 mb-0">
          {isFreelancer ? "No projects yet. When a client hires you, it shows here." : "No projects yet. Hire someone who applied to your job to start one."}
        </p>
      )}

      <div className="d-flex flex-column gap-3">
        {projects?.map((p) => {
          // The other person on the project.
          const other = isFreelancer ? p.client : p.freelancer;
          const otherName = personName(other, isFreelancer ? "Client" : "Freelancer");
          const status = projectStatuses[p.status];
          // The rating step of a Done project (null until it's Done). The
          // list only holds the ratings this user may see: their own, and the
          // other person's once it is no longer hidden. A client's rating opens
          // only once the payment is confirmed.
          const ratings = p.ratings || [];
          const rating = ratingStep(p, ratings.some((r) => r.rater_id === currentUserId), ratings.some((r) => r.rater_id !== currentUserId), !isFreelancer);
          return (
            <Link
              key={p.id}
              to={`/dashboard/project-details/${p.id}`}
              className="p-3 rounded-3 bg-dark bg-opacity-50 border border-secondary border-opacity-25 d-flex align-items-center gap-3 hover-lift text-decoration-none"
            >
              <Avatar path={other?.avatar_path} name={otherName} size={48} />
              <div className="flex-grow-1 overflow-hidden">
                <h6 className="text-white fw-bold mb-1 text-break"><CensoredText text={p.title} /></h6>
                <p className="text-white-50 fs-7 mb-0 text-break">
                  {isFreelancer ? "Client" : "Freelancer"}: {otherName} •{" "}
                  <span>Due {formatDay(p.due_date)}</span>
                  {/* "Overdue: 2 days late" or "Due in 3 days" (Step N4 of PLAN-notifications.md). */}
                  <DueBadge project={p} today={today} className="ms-2 align-middle" />
                  {/* "Payment 3 days late": a Done project with money still unpaid (Step 1 of PLAN-delays.md). */}
                  <PayDueBadge
                    project={p}
                    money={paymentsById ? projectMoney(p, paymentsById[p.id] || []) : null}
                    today={today}
                    iAmClient={!isFreelancer}
                    className="ms-2 align-middle"
                  />
                </p>
                {rating && (
                  <p className={`fs-8 fw-semibold mb-0 mt-1 ${rating.textClass}`}>
                    <i className={`bi ${rating.icon} me-1`}></i>{rating.label}
                  </p>
                )}
              </div>
              <span className={`badge rounded-pill px-3 py-2 flex-shrink-0 ${status.className}`}>{status.label}</span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
