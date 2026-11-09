import { dueInfo } from "../../../lib/projects";

// A small pill next to a project's due date (PLAN-notifications.md, Step N4):
// red "Overdue: 2 days late", or yellow "Due today" / "Due tomorrow" /
// "Due in 3 days". Nothing for Done or Submitted projects, or when the due
// date is more than 3 days away (lib/projects.js dueInfo).
// today: today's date in the Philippines ("YYYY-MM-DD"); worked out if left out.
export default function DueBadge({ project, today, className = "" }) {
  const due = dueInfo(project, today);
  if (!due) return null;
  return (
    <span className={`badge rounded-pill ${due.late ? "bg-danger text-white" : "bg-warning text-dark"} ${className}`}>
      <i className={`bi ${due.late ? "bi-exclamation-triangle-fill" : "bi-alarm"} me-1`}></i>{due.text}
    </span>
  );
}
