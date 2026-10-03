import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { fetchProfileHistory, profilePath } from "../../../lib/profileStats";
import Avatar from "../../../components/Avatar";

// How many show before "Show all".
const SHOWN_AT_FIRST = 5;

// The Completed Projects list on a profile (Feature 5, the transaction
// history): each project the client marked Done, newest first, with the other
// person and the stars and feedback this person got for it. It never shows a
// project's note, files or links. On your own page a row also has "Open
// project" (the database only sends a project's id for projects you are on).
// role is "freelancer" or "client", the role this person had on those projects.
export default function CompletedProjects({ userId, role }) {
  // undefined while loading, null when it couldn't load, else the list.
  const [rows, setRows] = useState(undefined);
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    if (!userId) return undefined;
    let active = true;

    fetchProfileHistory(userId, role).then((result) => {
      if (active) setRows(result);
    });

    return () => {
      active = false;
    };
  }, [userId, role]);

  const shown = rows && !showAll ? rows.slice(0, SHOWN_AT_FIRST) : rows;

  return (
    <div>
      <h5 className="text-white fw-bold mb-3"><i className="bi bi-check2-circle text-success me-2"></i> Completed Projects</h5>

      {rows === undefined && <p className="text-secondary fs-7 mb-0">Loading...</p>}
      {rows === null && <p className="text-secondary fs-7 mb-0">Couldn't load the completed projects right now.</p>}
      {rows?.length === 0 && <p className="text-secondary fs-7 mb-0">No completed projects yet.</p>}

      <div className="d-flex flex-column gap-2">
        {shown?.map((row, index) => {
          const otherName = row.other_name || row.other_username || (role === "freelancer" ? "Client" : "Freelancer");
          const path = profilePath(row.other_account_type, row.other_id);
          return (
            // The list has no id of its own, so the position keeps the keys apart.
            <div key={`${row.completed_at}-${index}`} className="p-3 rounded-3 bg-dark bg-opacity-50 border border-secondary border-opacity-25">
              <div className="d-flex align-items-start gap-3">
                <Avatar path={row.other_avatar_path} name={otherName} size={44} />
                <div className="flex-grow-1 overflow-hidden">
                  <h6 className="text-white fw-bold mb-1 text-break">{row.title}</h6>
                  <p className="text-white-50 fs-8 mb-1 text-break">
                    {role === "freelancer" ? "Client" : "Freelancer"}:{" "}
                    {path
                      ? <Link to={path} className="text-white fw-semibold text-decoration-none hover-role">{otherName}</Link>
                      : <strong className="text-white">{otherName}</strong>}
                    {" "}• Finished {new Date(row.completed_at).toLocaleDateString()}
                  </p>
                  {row.stars ? (
                    <p className="fs-8 mb-0 text-break">
                      <span className="text-warning fw-bold"><i className="bi bi-star-fill me-1"></i>{row.stars}/5</span>
                      {row.feedback && <span className="text-light-50 fst-italic"> "{row.feedback}"</span>}
                    </p>
                  ) : (
                    <p className="text-secondary fs-8 mb-0">Not rated yet</p>
                  )}
                </div>
                {row.project_id && (
                  <Link to={`/dashboard/project-details/${row.project_id}`} className="btn btn-sm btn-dark border border-secondary text-white rounded-pill px-3 fs-8 fw-bold flex-shrink-0">
                    Open project
                  </Link>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {rows && rows.length > SHOWN_AT_FIRST && (
        <button type="button" className="btn btn-sm btn-outline-secondary text-white-50 rounded-pill px-3 mt-3" onClick={() => setShowAll((value) => !value)}>
          {showAll ? "Show fewer" : `Show all (${rows.length})`}
        </button>
      )}
    </div>
  );
}
