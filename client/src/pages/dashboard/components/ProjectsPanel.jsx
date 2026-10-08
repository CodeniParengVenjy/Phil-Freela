import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { formatDay, getMyProjects, personName, projectStatuses, ratingStep, todayInManila } from "../../../lib/projects";
import Avatar from "../../../components/Avatar";
import DueDateCalendar from "./DueDateCalendar";

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

  const today = todayInManila();

  return (
    <div className="glass-card rounded-4 p-4 border border-secondary border-opacity-25 h-100">
      <h4 className="text-white fw-bold mb-3"><i className="bi bi-kanban-fill text-warning me-2"></i> My Projects</h4>
      <p className="text-secondary fs-7 mb-4">
        {isFreelancer ? "Jobs you were hired for. Open one to see the details." : "Freelancers you hired. Open one to see how it's going."}
      </p>

      {failed && <p className="text-danger fs-7 mb-0">Couldn't load your projects right now.</p>}
      {!failed && projects === null && <p className="text-secondary fs-7 mb-0">Loading...</p>}
      {/* The due dates of the same projects, on a calendar. */}
      {!failed && projects !== null && <DueDateCalendar projects={projects} today={today} />}
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
          const overdue = p.status !== "done" && p.due_date < today;
          // The rating step of a Done project (null until it's Done). The
          // list only holds the ratings this user may see: their own, and the
          // other person's once it is no longer hidden.
          const ratings = p.ratings || [];
          const rating = ratingStep(p, ratings.some((r) => r.rater_id === currentUserId), ratings.some((r) => r.rater_id !== currentUserId));
          return (
            <Link
              key={p.id}
              to={`/dashboard/project-details/${p.id}`}
              className="p-3 rounded-3 bg-dark bg-opacity-50 border border-secondary border-opacity-25 d-flex align-items-center gap-3 hover-lift text-decoration-none"
            >
              <Avatar path={other?.avatar_path} name={otherName} size={48} />
              <div className="flex-grow-1 overflow-hidden">
                <h6 className="text-white fw-bold mb-1 text-break">{p.title}</h6>
                <p className="text-white-50 fs-7 mb-0 text-break">
                  {isFreelancer ? "Client" : "Freelancer"}: {otherName} •{" "}
                  <span className={overdue ? "text-danger" : ""}>Due {formatDay(p.due_date)}{overdue && " (overdue)"}</span>
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
