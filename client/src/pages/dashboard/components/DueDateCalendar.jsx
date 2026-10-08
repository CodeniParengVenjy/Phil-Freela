import { useState } from "react";
import { Link } from "react-router-dom";
import { formatDay, projectStatuses } from "../../../lib/projects";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
// At most this many dots under one day; a "+" follows when there are more.
const MAX_DOTS = 3;

const twoDigits = (n) => String(n).padStart(2, "0");

// The color of a project's dot: green when done, red when its due date has
// passed, the accent color for the rest.
function dotClass(project, today) {
  if (project.status === "done") return "bg-success";
  if (project.due_date < today) return "bg-danger";
  return "bg-role";
}

// The month calendar in the "My Projects" box: every day a project is due on
// carries a dot, and clicking that day lists its projects. It only draws the
// projects the box already loaded, so it asks the database for nothing.
// projects: [{ id, title, status, due_date }], due_date as "YYYY-MM-DD".
// today: today's date in the Philippines, in the same form (todayInManila).
export default function DueDateCalendar({ projects, today }) {
  const [todayYear, todayMonth] = today.split("-").map(Number);
  // The month on show (month counts from 1) and the clicked day (null = none).
  const [shown, setShown] = useState({ year: todayYear, month: todayMonth });
  const [selectedDay, setSelectedDay] = useState(null);

  // The projects due on each day: { "2026-10-12": [project, ...] }.
  const dueOn = {};
  for (const project of projects) {
    if (!project.due_date) continue;
    if (!dueOn[project.due_date]) dueOn[project.due_date] = [];
    dueOn[project.due_date].push(project);
  }

  // UTC keeps the day numbers the same in every time zone.
  const firstWeekday = new Date(Date.UTC(shown.year, shown.month - 1, 1)).getUTCDay();
  const daysInMonth = new Date(Date.UTC(shown.year, shown.month, 0)).getUTCDate();
  const monthTitle = new Date(Date.UTC(shown.year, shown.month - 1, 1))
    .toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
  const isThisMonth = shown.year === todayYear && shown.month === todayMonth;

  // Moves one month back (-1) or forward (+1); the clicked day is forgotten.
  const changeMonth = (step) => {
    setSelectedDay(null);
    setShown(({ year, month }) => {
      const next = month + step;
      if (next < 1) return { year: year - 1, month: 12 };
      if (next > 12) return { year: year + 1, month: 1 };
      return { year, month: next };
    });
  };

  const goToToday = () => {
    setSelectedDay(null);
    setShown({ year: todayYear, month: todayMonth });
  };

  const selectedProjects = selectedDay ? dueOn[selectedDay] || [] : [];

  return (
    <div className="due-calendar mb-4">
      <div className="d-flex align-items-center justify-content-between gap-2 mb-2">
        <h6 className="text-white fw-bold mb-0"><i className="bi bi-calendar3 text-role me-2"></i>{monthTitle}</h6>
        <div className="d-flex align-items-center gap-1">
          {!isThisMonth && (
            <button type="button" className="btn btn-sm btn-outline-role rounded-pill px-3 fw-bold" onClick={goToToday}>Today</button>
          )}
          <button type="button" className="btn btn-sm btn-dark text-secondary rounded-circle" aria-label="Previous month" title="Previous month" onClick={() => changeMonth(-1)}>
            <i className="bi bi-chevron-left"></i>
          </button>
          <button type="button" className="btn btn-sm btn-dark text-secondary rounded-circle" aria-label="Next month" title="Next month" onClick={() => changeMonth(1)}>
            <i className="bi bi-chevron-right"></i>
          </button>
        </div>
      </div>

      <div className="due-calendar-grid mb-1" aria-hidden="true">
        {WEEKDAYS.map((name) => <span key={name} className="text-secondary fs-8 fw-semibold text-center">{name}</span>)}
      </div>

      <div className="due-calendar-grid">
        {/* Empty boxes before the 1st, so it lands under its weekday. */}
        {Array.from({ length: firstWeekday }, (_, i) => <span key={`blank-${i}`}></span>)}

        {Array.from({ length: daysInMonth }, (_, i) => {
          const day = i + 1;
          const key = `${shown.year}-${twoDigits(shown.month)}-${twoDigits(day)}`;
          const due = dueOn[key] || [];
          const todayClass = key === today ? " is-today" : "";

          // A day with nothing due is plain text, not a button.
          if (due.length === 0) {
            return <span key={key} className={`due-calendar-day text-white-50${todayClass}`}>{day}</span>;
          }
          return (
            <button
              key={key}
              type="button"
              className={`due-calendar-day has-due text-white fw-bold${todayClass}${key === selectedDay ? " is-selected" : ""}`}
              aria-label={`${formatDay(key)}: ${due.length} due`}
              aria-pressed={key === selectedDay}
              onClick={() => setSelectedDay(key === selectedDay ? null : key)}
            >
              {day}
              <span className="due-calendar-dots">
                {due.slice(0, MAX_DOTS).map((project) => <span key={project.id} className={`due-calendar-dot ${dotClass(project, today)}`}></span>)}
                {due.length > MAX_DOTS && <span className="due-calendar-more">+</span>}
              </span>
            </button>
          );
        })}
      </div>

      {/* What the dot colors mean. */}
      <div className="d-flex flex-wrap gap-3 fs-8 text-secondary mt-2">
        <span><span className="due-calendar-dot bg-role me-1"></span>Due</span>
        <span><span className="due-calendar-dot bg-danger me-1"></span>Overdue</span>
        <span><span className="due-calendar-dot bg-success me-1"></span>Done</span>
      </div>

      {/* The projects due on the clicked day; each opens its project page. */}
      {selectedDay && (
        <div className="mt-3">
          <p className="text-white fw-semibold fs-7 mb-2">Due {formatDay(selectedDay)}</p>
          <div className="d-flex flex-column gap-2">
            {selectedProjects.map((project) => {
              const status = projectStatuses[project.status];
              const overdue = project.status !== "done" && project.due_date < today;
              return (
                <Link
                  key={project.id}
                  to={`/dashboard/project-details/${project.id}`}
                  className="p-2 px-3 rounded-3 bg-dark bg-opacity-50 border border-secondary border-opacity-25 d-flex align-items-center gap-2 hover-lift text-decoration-none"
                >
                  <span className="text-white fs-7 fw-semibold text-break flex-grow-1">{project.title}</span>
                  {overdue && <span className="text-danger fs-8 fw-semibold flex-shrink-0">Overdue</span>}
                  <span className={`badge rounded-pill flex-shrink-0 ${status.className}`}>{status.label}</span>
                </Link>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
