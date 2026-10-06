import { useEffect, useState } from "react";
import { Link, useNavigate, useOutletContext, useSearchParams } from "react-router-dom";
import { supabase } from "../../../lib/supabaseClient";
import { searchListings } from "../../../lib/aiService";
import { getCategory } from "../../../lib/categories";
import { searchPeople } from "../../../lib/profile";
import { profilePath } from "../../../lib/profileStats";
import { useVerifiedIds } from "../../../lib/useVerifiedIds";
import VerifiedBadge from "../../../components/VerifiedBadge";
import Avatar from "../../../components/Avatar";
import BookDialog from "../components/BookDialog";

const SERVICE_COLUMNS = "id, title, category, price, freelancer:profiles!services_freelancer_id_fkey(id, full_name, username)";
const JOB_COLUMNS = "id, title, category, budget, client:profiles!job_posts_client_id_fkey(id, full_name, username)";

// The AI search box's results page: the content-based filtering part of the
// Hybrid recommendation system (see ai-service/listing_search.py). The AI
// service says which posts match the search's meaning and how closely; this
// page loads those posts from the database, whose rules leave out hidden
// ones (suspended users, unverified freelancers), and shows them best first.
// The same search also looks for people by their name or @username. That part
// is a plain database search (lib/profile.js, searchPeople) that runs at the
// same time, so people still show when the AI service is offline.
export default function SearchResultsView() {
  const [params] = useSearchParams();
  const query = (params.get("q") || "").trim();
  const navigate = useNavigate();
  const { accountType, currentUserId, openChat, showToast } = useOutletContext();
  // The search these results belong to (still loading while it's not `query`).
  const [result, setResult] = useState({ query: null, services: [], jobs: [], error: "" });
  // The people found, and the search they belong to (same idea as `result`).
  const [people, setPeople] = useState({ query: null, rows: [] });
  // The service being booked (null = Book popup closed). Only clients book.
  const [bookTarget, setBookTarget] = useState(null);

  useEffect(() => {
    if (query.length < 2) return undefined;
    let active = true;

    (async () => {
      try {
        const matches = await searchListings(query);
        const matchOf = Object.fromEntries(matches.map((m) => [m.id, m]));
        const idsOf = (type) => matches.filter((m) => m.type === type).map((m) => m.id);
        const load = (table, columns, ids) =>
          ids.length ? supabase.from(table).select(columns).in("id", ids) : Promise.resolve({ data: [] });

        const [services, jobs] = await Promise.all([
          load("services", SERVICE_COLUMNS, idsOf("service")),
          load("job_posts", JOB_COLUMNS, idsOf("job"))
        ]);
        if (services.error || jobs.error) throw new Error("Couldn't load the results. Please try again.");

        // Best match first (the database returns them in any order).
        const ranked = (rows) => rows
          .map((row) => ({ ...row, match: matchOf[row.id] }))
          .sort((a, b) => b.match.score - a.match.score);
        if (active) setResult({ query, services: ranked(services.data), jobs: ranked(jobs.data), error: "" });
      } catch (error) {
        if (active) setResult({ query, services: [], jobs: [], error: error.message });
      }
    })();

    return () => {
      active = false;
    };
  }, [query]);

  // The people search: its own request, so it doesn't wait for the AI service.
  useEffect(() => {
    if (query.length < 2) return undefined;
    let active = true;

    searchPeople(query).then((rows) => {
      // null = couldn't load: the page then just has no People section.
      if (active) setPeople({ query, rows: rows || [] });
    });

    return () => {
      active = false;
    };
  }, [query]);

  const loading = query.length >= 2 && result.query !== query;
  const total = result.services.length + result.jobs.length;
  // Only the people found for the words in the box now (not an older search's).
  const peopleReady = query.length >= 2 && people.query === query;
  const foundPeople = peopleReady ? people.rows : [];
  const verifiedIds = useVerifiedIds([
    ...result.services.map((s) => s.freelancer?.id),
    ...result.jobs.map((j) => j.client?.id),
    ...foundPeople.map((person) => person.id)
  ]);

  // Clients look for services first, freelancers for jobs.
  const sections = [
    { key: "services", title: "Services", icon: "bi-grid-fill", items: result.services },
    { key: "jobs", title: "Jobs", icon: "bi-briefcase-fill", items: result.jobs }
  ];
  if (accountType === "freelancer") sections.reverse();

  const handleSubmit = (event) => {
    event.preventDefault();
    const text = String(new FormData(event.currentTarget).get("q") || "").trim();
    if (text) navigate(`/dashboard/search?q=${encodeURIComponent(text)}`);
  };

  return (
    <section className="dashboard-view active-view">
      <div className="glass-card rounded-4 p-4 border border-secondary border-opacity-25">
        <h3 className="text-white fw-bold mb-1"><i className="bi bi-search text-role me-2"></i> Search</h3>
        <p className="text-secondary fs-7 mb-3">
          Finds people by their name or @username, and services and jobs by meaning, not only the exact words: "logo" also finds "brand identity design".
        </p>

        {/* key: a new search from the top bar refills this box too. */}
        <form key={query} className="d-flex gap-2 mb-4" onSubmit={handleSubmit} role="search">
          <div className="position-relative search-nav-box flex-grow-1">
            <i className="bi bi-search search-icon text-secondary"></i>
            <input
              name="q"
              type="search"
              className="form-control nav-search-input"
              placeholder="Search people, services and jobs..."
              aria-label="Search people, services and jobs"
              defaultValue={query}
              minLength={2}
              maxLength={200}
              autoFocus={!query}
            />
          </div>
          <button type="submit" className="btn btn-gradient-role rounded-pill px-4 fw-bold text-white">Search</button>
        </form>

        {query.length < 2 && (
          <p className="text-secondary fs-7 text-center py-4 mb-0">Type at least 2 characters, then press Enter.</p>
        )}

        {/* People first: they show as soon as the database answers, even
            while the services and jobs are still being searched. */}
        {foundPeople.length > 0 && (
          <div className="mb-4">
            <h6 className="text-white fw-bold mb-3">
              <i className="bi bi-people-fill text-role me-2"></i>
              People <span className="text-secondary fw-normal">({foundPeople.length})</span>
            </h6>
            <div className="d-flex flex-column gap-3">
              {foundPeople.map((person) => (
                <PersonCard key={person.id} person={person} verified={verifiedIds.has(person.id)} onMessage={openChat} />
              ))}
            </div>
          </div>
        )}

        {loading && (
          <p className="text-secondary fs-7 text-center py-4 mb-0">
            <span className="spinner-border spinner-border-sm me-2" aria-hidden="true"></span>Searching...
          </p>
        )}
        {!loading && result.error && <p className="text-danger fs-7 text-center py-4 mb-0">{result.error}</p>}
        {!loading && !result.error && peopleReady && total === 0 && foundPeople.length === 0 && (
          <p className="text-secondary fs-7 text-center py-4 mb-0">
            No matches for "{query}". Try describing the work in other words, or check the spelling of the name.
          </p>
        )}

        {!loading && !result.error && sections.filter((section) => section.items.length > 0).map((section) => (
          <div key={section.key} className="mb-4">
            <h6 className="text-white fw-bold mb-3">
              <i className={`bi ${section.icon} text-role me-2`}></i>
              {section.title} <span className="text-secondary fw-normal">({section.items.length})</span>
            </h6>
            <div className="d-flex flex-column gap-3">
              {section.items.map((item) => (
                <ResultCard
                  key={item.id}
                  item={item}
                  isService={section.key === "services"}
                  verifiedIds={verifiedIds}
                  currentUserId={currentUserId}
                  onMessage={openChat}
                  canBook={accountType === "client"}
                  onBook={setBookTarget}
                />
              ))}
            </div>
          </div>
        ))}
      </div>

      <BookDialog
        key={bookTarget?.service?.id}
        target={bookTarget}
        onClose={() => setBookTarget(null)}
        onBooked={() => {
          showToast(`Booking sent to ${bookTarget.freelancerName}. You can follow it in Bookings.`);
          setBookTarget(null);
        }}
      />
    </section>
  );
}

// One matching person. Their picture and name open their public page (a
// freelancer's portfolio or a client's record, by the role they have today).
function PersonCard({ person, verified, onMessage }) {
  const name = person.full_name || person.username;
  const path = profilePath(person.account_type, person.id);

  return (
    <div className="p-3 rounded-3 bg-dark bg-opacity-50 border border-secondary border-opacity-25 d-flex align-items-center gap-3 hover-lift">
      <Avatar path={person.avatar_path} name={name} size={52} to={path} />
      {/* min-w-0: a long name ends in "..." so the button stays beside it. */}
      <div className="flex-grow-1 min-w-0">
        <h6 className="text-white fw-bold mb-1 text-truncate">
          <Link to={path} className="text-white text-decoration-none hover-role">{name}</Link>
          <VerifiedBadge verified={verified} />
        </h6>
        <p className="text-white-50 fs-8 mb-0 text-truncate">
          @{person.username} • {person.account_type === "client" ? "Client" : "Freelancer"}
        </p>
      </div>
      {/* On a phone the button is just the icon, to leave room for the name. */}
      <button
        type="button"
        className="btn btn-gradient-role rounded-pill px-3 py-2 fw-bold text-white text-nowrap fs-7 flex-shrink-0"
        title={`Message ${name}`}
        aria-label={`Message ${name}`}
        onClick={() => onMessage(person.id)}
      >
        <i className="bi bi-chat-dots"></i><span className="d-none d-sm-inline ms-1">Message</span>
      </button>
    </div>
  );
}

// One matching service or job post. A client can book a service right here
// (canBook); the popup opens with that service already chosen.
function ResultCard({ item, isService, verifiedIds, currentUserId, onMessage, canBook, onBook }) {
  const owner = isService ? item.freelancer : item.client;
  const ownerName = owner?.full_name || owner?.username || (isService ? "Freelancer" : "Client");
  const category = getCategory(item.category);
  const amount = isService ? item.price : item.budget;
  const isMine = owner?.id === currentUserId;

  return (
    <div className="p-3 rounded-3 bg-dark bg-opacity-50 border border-secondary border-opacity-25 d-flex flex-wrap align-items-center gap-3 hover-lift">
      <div className="rounded-3 bg-role-subtle text-role d-flex align-items-center justify-content-center flex-shrink-0 fs-4" style={{ width: 52, height: 52 }}>
        <i className={`bi ${category.icon}`}></i>
      </div>

      {/* flexBasis: on a phone the buttons drop under the text instead of squeezing it. */}
      <div className="flex-grow-1 overflow-hidden" style={{ flexBasis: 200 }}>
        <div className="d-flex align-items-center gap-2 flex-wrap mb-1">
          <h6 className="text-white fw-bold mb-0 text-break">{item.title}</h6>
          {/* How close its meaning is to the search (see listing_search.py). */}
          <span className={`badge rounded-pill fw-semibold ${item.match.strong ? "bg-success" : "bg-secondary bg-opacity-50"}`}>
            {item.match.strong ? "Strong match" : "Related"}
          </span>
        </div>
        <div className="d-flex align-items-center gap-2 fs-8 flex-wrap">
          <span className="text-white-50">
            {/* Opens the owner's public page: a freelancer's portfolio, a client's record. */}
            {owner?.id ? (
              <Link to={profilePath(isService ? "freelancer" : "client", owner.id)} className="text-white-50">{ownerName}</Link>
            ) : ownerName}
            <VerifiedBadge verified={verifiedIds.has(owner?.id)} showUnverified={!isService} />
          </span>
          {amount && <span className="text-warning">₱{Number(amount).toLocaleString()}</span>}
          <span className="badge bg-black text-light-50 text-wrap text-start">{category.label}</span>
        </div>
      </div>

      {isMine ? (
        <span className="badge bg-secondary bg-opacity-25 text-secondary flex-shrink-0">Your post</span>
      ) : owner?.id && (
        <div className="d-flex gap-2 flex-shrink-0 ms-auto">
          {isService && canBook && (
            <button
              type="button"
              className="btn btn-outline-role rounded-pill px-3 py-2 fw-bold text-nowrap fs-7"
              onClick={() => onBook({ freelancerId: owner.id, freelancerName: ownerName, service: { id: item.id, title: item.title } })}
            >
              <i className="bi bi-calendar-check me-1"></i> Book
            </button>
          )}
          <button
            type="button"
            className="btn btn-gradient-role rounded-pill px-3 py-2 fw-bold text-white text-nowrap fs-7"
            onClick={() => onMessage(owner.id)}
          >
            <i className="bi bi-chat-dots me-1"></i> Message
          </button>
        </div>
      )}
    </div>
  );
}
