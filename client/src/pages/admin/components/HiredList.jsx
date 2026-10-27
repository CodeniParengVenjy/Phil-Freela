import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../../../lib/supabaseClient";
import { JOB_STATES } from "../../../lib/jobTerms";
import { formatDay, projectStatuses } from "../../../lib/projects";
import { Picture } from "./HiringTrail";

// How many hires show before "Show all".
const FIRST_SHOWN = 10;

// Everyone who was hired from a job post (admin_job_hires()), newest hire first:
// the freelancer, the post they were hired for with how many of its places are
// filled, and where their project stands. A post that is Filled is hidden from
// freelancers, but it still shows here, and its title opens it in Listings. It
// loads on its own, so if it fails the numbers above it stay. The database sends
// names and statuses only, never a resume.
export default function HiredList() {
  const [hires, setHires] = useState(null); // null = still loading
  const [failed, setFailed] = useState(false);
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    let active = true;

    (async () => {
      // rpc() calls a database function; it checks on the server that the
      // caller is an admin.
      const { data, error } = await supabase.rpc("admin_job_hires");
      if (!active) return;
      if (error) {
        console.error("Loading the hired freelancers failed:", error);
        setFailed(true);
        return;
      }
      setHires(data || []);
    })();

    return () => { active = false; };
  }, []);

  const shown = hires && !showAll ? hires.slice(0, FIRST_SHOWN) : hires;

  return (
    <div className="admin-card rounded-4 p-3">
      <div className="d-flex justify-content-between align-items-baseline gap-3 mb-3">
        <h3 className="h6 fw-bold text-white mb-0">Hired freelancers</h3>
        {hires && <span className="text-secondary fs-7">{hires.length} in total</span>}
      </div>

      {failed && <p className="text-secondary fs-7 mb-0">Couldn't load the hired freelancers. Please try again.</p>}
      {!failed && hires === null && <p className="text-secondary fs-7 mb-0">Loading the hired freelancers...</p>}
      {!failed && hires?.length === 0 && <p className="text-secondary fs-7 mb-0">Nobody has been hired from a job post yet.</p>}

      {!failed && shown?.length > 0 && (
        <ul className="list-unstyled admin-trail-list mb-0">
          {shown.map((hire) => {
            const post = JOB_STATES[hire.job_state];
            const project = projectStatuses[hire.project_status];
            return (
              <li key={hire.project_id} className="admin-trail-row">
                <Picture path={hire.avatar_path} name={hire.full_name} />
                <div className="admin-top-who">
                  {/* Opens Users already searching for them, like the Top rated lists. */}
                  <Link to={`/admin/users?search=${encodeURIComponent(hire.username)}`} className="fw-semibold text-white text-decoration-none d-block text-truncate">
                    {hire.full_name}
                  </Link>
                  {/* Opens that post in Listings, with its hiring trail. */}
                  <Link to={`/admin/listings?post=${hire.job_post_id}`} className="text-secondary fs-8 d-block text-truncate">
                    {hire.job_title}
                  </Link>
                </div>
                <div className="admin-trail-status">
                  <div className="admin-trail-badges">
                    {project && <span className={`badge ${project.className}`}>{project.label}</span>}
                    {post && <span className={`badge ${post.className}`}>{post.label}</span>}
                  </div>
                  <span className="text-secondary fs-8 d-block mt-1">
                    {hire.hired} of {hire.needed} hired • {new Date(hire.hired_at).toLocaleDateString()}
                    {hire.due_date && ` • due ${formatDay(hire.due_date)}`}
                  </span>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {!failed && hires?.length > FIRST_SHOWN && (
        <div className="text-end mt-2">
          <button type="button" className="btn btn-link btn-sm text-secondary p-0" onClick={() => setShowAll(!showAll)}>
            {showAll ? "Show fewer" : `Show all (${hires.length})`}
          </button>
        </div>
      )}
    </div>
  );
}
