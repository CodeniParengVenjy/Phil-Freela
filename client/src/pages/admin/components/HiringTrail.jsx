import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../../../lib/supabaseClient";
import { avatarUrl } from "../../../lib/avatar";
import { formatDay, projectStatuses } from "../../../lib/projects";

// A round picture, or the first letter of the name when there is no picture (or
// it fails to load).
function Picture({ path, name }) {
  const src = avatarUrl(path);
  const [failedSrc, setFailedSrc] = useState(null);

  if (src && src !== failedSrc) {
    return (
      <img src={src} alt="" width={36} height={36} className="rounded-circle object-fit-cover flex-shrink-0" onError={() => setFailedSrc(src)} />
    );
  }
  return <span className="admin-role-avatar admin-trail-avatar" aria-hidden="true">{(name || "?").trim().charAt(0).toUpperCase()}</span>;
}

// "Hiring trail" of one job post (admin_job_trail()): everyone who applied, the
// hired ones first, with the status of the project each hire started. Only names
// and statuses come back, never a resume (a resume is personal data and stays
// between the freelancer and the client).
//
// Props:
//   jobId  the job post to look up. The parent gives the component a `key` of
//          the post, so opening another post starts it fresh.
export default function HiringTrail({ jobId }) {
  const [trail, setTrail] = useState(null); // null = still loading
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;

    (async () => {
      // rpc() calls a database function; it checks on the server that the
      // caller is an admin.
      const { data, error } = await supabase.rpc("admin_job_trail", { target_job: jobId });
      if (!active) return;
      if (error) {
        console.error("Loading the hiring trail failed:", error);
        setFailed(true);
        return;
      }
      setTrail(data || []);
    })();

    return () => { active = false; };
  }, [jobId]);

  return (
    <div className="mb-4">
      <h3 className="h6 fw-bold text-white mb-2">Hiring trail</h3>

      {failed && <p className="text-secondary fs-7 mb-0">Couldn't load who applied. Please try again.</p>}
      {!failed && trail === null && <p className="text-secondary fs-7 mb-0">Loading...</p>}
      {!failed && trail?.length === 0 && <p className="text-secondary fs-7 mb-0">Nobody has applied to this post yet.</p>}

      {!failed && trail?.length > 0 && (
        <ul className="list-unstyled admin-trail-list mb-0">
          {trail.map((person) => {
            const hired = Boolean(person.project_id);
            const status = projectStatuses[person.project_status];
            return (
              <li key={person.application_id} className="admin-trail-row">
                <Picture path={person.avatar_path} name={person.full_name} />
                <div className="admin-top-who">
                  {/* Opens Users already searching for them, like the Top rated lists. */}
                  <Link to={`/admin/users?search=${encodeURIComponent(person.username)}`} className="fw-semibold text-white text-decoration-none d-block text-truncate">
                    {person.full_name}
                  </Link>
                  <span className="text-secondary fs-8 d-block text-truncate">
                    @{person.username}
                    {person.archived && <span className="badge bg-secondary fw-normal ms-2">Archived</span>}
                  </span>
                </div>
                <div className="admin-trail-status">
                  <div className="admin-trail-badges">
                    {hired ? <span className="badge bg-success">Hired</span> : <span className="badge bg-dark border border-secondary">Applied</span>}
                    {hired && status && <span className={`badge ${status.className}`}>{status.label}</span>}
                  </div>
                  <span className="text-secondary fs-8 d-block mt-1">
                    {hired
                      ? `Hired ${new Date(person.hired_at).toLocaleDateString()} • due ${formatDay(person.due_date)}`
                      : `Applied ${new Date(person.applied_at).toLocaleDateString()}`}
                  </span>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
