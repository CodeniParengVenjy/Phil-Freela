import { Link } from "react-router-dom";
import Avatar from "../../../components/Avatar";
import { projectStatuses } from "../../../lib/projects";

// The freelancers a client hired from one of their job posts (lib/jobTerms.js
// HIRES_FIELD / hiresOf): picture, name (opens their public page), the status of
// the project the hire started, and a button to open that project. It shows on
// Your Active Listings and on the owner's own view of the job.
//
// Props:
//   hires      [{ id, status, started_at, freelancer: { id, full_name, username, avatar_path } }]
//   showEmpty  say "Nobody hired yet." when there is no one (the listing card
//              already has "0 of 3 hired", so it leaves this off)
export default function HiredFreelancers({ hires, showEmpty = false }) {
  if (hires.length === 0) {
    return showEmpty ? <p className="text-secondary fs-8 mb-0 mt-2">Nobody hired yet.</p> : null;
  }

  return (
    <div className="mt-2">
      <p className="text-white-50 fs-8 fw-semibold mb-1">Hired freelancers</p>
      <ul className="list-unstyled d-flex flex-column gap-2 mb-0">
        {hires.map((hire) => {
          const person = hire.freelancer;
          const name = person?.full_name || person?.username || "Freelancer";
          const status = projectStatuses[hire.status];
          return (
            <li key={hire.id} className="d-flex align-items-center gap-2 p-2 rounded-3 bg-dark bg-opacity-50 border border-secondary border-opacity-25">
              <Avatar path={person?.avatar_path} name={name} size={32} to={person?.id ? `/dashboard/freelancers/${person.id}` : undefined} />
              <div className="flex-grow-1 overflow-hidden">
                {person?.id ? (
                  <Link to={`/dashboard/freelancers/${person.id}`} className="text-white fs-7 fw-semibold text-decoration-none hover-role d-block text-truncate">{name}</Link>
                ) : (
                  <span className="text-white fs-7 fw-semibold d-block text-truncate">{name}</span>
                )}
                <span className="text-white-50 fs-8 d-block text-truncate">Hired {new Date(hire.started_at).toLocaleDateString()}</span>
              </div>
              {status && <span className={`badge ${status.className} fs-8 flex-shrink-0`}>{status.label}</span>}
              <Link
                to={`/dashboard/project-details/${hire.id}`}
                className="btn btn-sm btn-outline-role rounded-circle d-flex align-items-center justify-content-center flex-shrink-0"
                style={{ width: 30, height: 30 }}
                title="Open project"
                aria-label={`Open the project with ${name}`}
              >
                <i className="bi bi-box-arrow-up-right"></i>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
