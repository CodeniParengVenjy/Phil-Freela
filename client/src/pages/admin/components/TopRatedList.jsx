import { useState } from "react";
import { Link } from "react-router-dom";
import { avatarUrl } from "../../../lib/avatar";

// A round picture, or the first letter of the name when there is no picture (or
// it fails to load). The letter circle is the admin one, so it matches the panel.
function Picture({ path, name }) {
  const src = avatarUrl(path);
  const [failedSrc, setFailedSrc] = useState(null);

  if (src && src !== failedSrc) {
    return (
      <img
        src={src}
        alt=""
        width={42}
        height={42}
        className="rounded-circle object-fit-cover flex-shrink-0"
        onError={() => setFailedSrc(src)}
      />
    );
  }
  return <span className="admin-role-avatar" aria-hidden="true">{(name || "?").trim().charAt(0).toUpperCase()}</span>;
}

// The best rated people of one kind, best first (admin_top_rated()). Each row
// shows the average AND how many ratings it comes from, so one 5-star rating is
// not mistaken for many, and opens the Users page already searching for them.
//
// Props:
//   title      the heading, e.g. "Top freelancers"
//   people     [{ id, full_name, username, avatar_path, average, count }]
//   emptyText  what to say with nobody to list, e.g. "No rated freelancers yet."
export default function TopRatedList({ title, people, emptyText }) {
  return (
    <div className="admin-card rounded-4 p-3 h-100">
      <h3 className="h6 fw-bold text-white mb-3">{title}</h3>

      {people.length === 0 ? (
        <p className="text-secondary fs-7 mb-0">{emptyText}</p>
      ) : (
        <ol className="list-unstyled d-grid gap-2 mb-0">
          {people.map((person, index) => (
            <li key={person.id}>
              <Link
                to={`/admin/users?search=${encodeURIComponent(person.username)}`}
                className="admin-top-row admin-stat-link"
                aria-label={`${index + 1}. ${person.full_name}, ${Number(person.average).toFixed(1)} stars from ${person.count} ${person.count === 1 ? "rating" : "ratings"}. Open in Users.`}
              >
                <span className="admin-top-rank" aria-hidden="true">{index + 1}</span>
                <Picture path={person.avatar_path} name={person.full_name} />
                <span className="admin-top-who">
                  <span className="fw-semibold text-white d-block text-truncate">{person.full_name}</span>
                  <span className="text-secondary fs-8 d-block text-truncate">@{person.username}</span>
                </span>
                <span className="admin-top-score" aria-hidden="true">
                  <strong className="text-white">{Number(person.average).toFixed(1)}</strong>
                  <i className="bi bi-star-fill text-warning ms-1 fs-8"></i>
                  <span className="text-secondary fs-8 d-block">{person.count} {person.count === 1 ? "rating" : "ratings"}</span>
                </span>
              </Link>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
