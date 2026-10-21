import { useEffect, useRef, useState } from "react";
import { supabase } from "../../../lib/supabaseClient";
import AdminPagination from "../components/AdminPagination";

// How many lines one page of the timeline shows.
const PAGE_SIZE = 10;

// The kinds of action the database logs (the "action" column of admin_log),
// with the words, icon and color shown for each. The tone picks the color of
// the dot on the timeline (the .tone-* classes in admin.css).
const ACTIONS = {
  suspend: { label: "Suspension", icon: "bi-pause-circle-fill", tone: "warning" },
  ban: { label: "Ban", icon: "bi-slash-circle-fill", tone: "danger" },
  lift: { label: "Penalty lifted", icon: "bi-unlock-fill", tone: "success" },
  report: { label: "Report", icon: "bi-flag-fill", tone: "orange" },
  verification: { label: "ID verification", icon: "bi-person-vcard-fill", tone: "info" },
  appeal: { label: "Appeal", icon: "bi-envelope-paper-fill", tone: "info" },
  announcement: { label: "Announcement", icon: "bi-megaphone-fill", tone: "orange" },
  flagged: { label: "Flagged content", icon: "bi-images", tone: "warning" },
  listing: { label: "Listing", icon: "bi-grid-fill", tone: "info" },
  admin: { label: "Admin", icon: "bi-shield-lock-fill", tone: "orange" },
  user_archive: { label: "Account archived", icon: "bi-archive-fill", tone: "warning" },
  user_restore: { label: "Account restored", icon: "bi-arrow-counterclockwise", tone: "success" },
  user_delete: { label: "Account deleted", icon: "bi-person-x-fill", tone: "danger" }
};

// e.g. "3:42 PM"
const formatTime = (value) => new Date(value).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });

// e.g. "Oct 5, 2026, 3:42 PM", shown when the time is hovered.
const formatWhen = (value) =>
  new Date(value).toLocaleString(undefined, { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });

// The heading above one day of the timeline: "Today", "Yesterday", or
// e.g. "Monday, Oct 5, 2026".
function dayHeading(value) {
  const day = new Date(value);
  const startOf = (date) => new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const daysAgo = Math.round((startOf(new Date()) - startOf(day)) / 86400000);
  if (daysAgo === 0) return "Today";
  if (daysAgo === 1) return "Yesterday";
  return day.toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric", year: "numeric" });
}

// Splits one page of lines (newest first) into days, keeping their order.
function groupByDay(lines) {
  const groups = [];
  lines.forEach((line) => {
    const key = new Date(line.created_at).toDateString();
    const last = groups[groups.length - 1];
    if (last && last.key === key) last.lines.push(line);
    else groups.push({ key, heading: dayHeading(line.created_at), lines: [line] });
  });
  return groups;
}

// One page of log lines, newest first, plus how many lines match in all (for
// the page numbers). The database applies the filters. id is only there so
// two lines with the same time can never swap places between pages.
function fetchLog({ search, action, adminId }, page) {
  const from = (page - 1) * PAGE_SIZE;
  let query = supabase
    .from("admin_log")
    .select("id, admin_name, action, message, created_at", { count: "exact" })
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .range(from, from + PAGE_SIZE - 1);
  if (action !== "all") query = query.eq("action", action);
  if (adminId !== "all") query = query.eq("admin_id", adminId);
  if (search) query = query.ilike("message", `%${search}%`);
  return query;
}

// The Activity Log: what every admin did and when, as a timeline with page
// numbers. The lines are written by database triggers
// (database/supabase_admin_log_schema.sql), not by the admin pages, so nothing
// can be skipped, and nobody can edit or delete a line.
export default function AdminLogView() {
  // The lines on screen, with the filters and page they were loaded for.
  const [loaded, setLoaded] = useState(null);
  const [loadError, setLoadError] = useState("");
  const [admins, setAdmins] = useState([]);
  const [search, setSearch] = useState("");
  // The search words the list is loaded for: they follow what is typed after a short wait.
  const [searchWords, setSearchWords] = useState("");
  const [action, setAction] = useState("all");
  const [adminId, setAdminId] = useState("all");
  const [page, setPage] = useState(1);
  const timelineRef = useRef(null);

  // The names for the "by admin" filter.
  useEffect(() => {
    let active = true;

    (async () => {
      const { data } = await supabase.from("admins").select("id, full_name").order("full_name", { ascending: true });
      if (active) setAdmins(data || []);
    })();

    return () => { active = false; };
  }, []);

  // The short wait means typing in the search box doesn't send a request for
  // every letter. A new search starts again from page 1.
  useEffect(() => {
    const timer = setTimeout(() => {
      const words = search.trim();
      if (words === searchWords) return;
      setSearchWords(words);
      setPage(1);
    }, 300);

    return () => clearTimeout(timer);
  }, [search, searchWords]);

  // Load the page asked for, and again whenever a filter or the page changes.
  useEffect(() => {
    let active = true;
    const filters = { search: searchWords, action, adminId };

    (async () => {
      const { data, error, count } = await fetchLog(filters, page);
      if (!active) return;

      if (error) {
        setLoadError("Failed to load the activity log.");
        return;
      }

      // A page past the end (fewer lines than before): go to the last one.
      const lastPage = Math.max(1, Math.ceil((count ?? 0) / PAGE_SIZE));
      if (data.length === 0 && page > lastPage) {
        setPage(lastPage);
        return;
      }

      setLoadError("");
      setLoaded({ key: `${searchWords}|${action}|${adminId}|${page}`, lines: data, total: count ?? data.length });
    })();

    return () => { active = false; };
  }, [searchWords, action, adminId, page]);

  const changeFilter = (setter) => (event) => {
    setter(event.target.value);
    setPage(1);
  };

  // Page numbers: go to the page, and bring the top of the timeline into view.
  const goToPage = (next) => {
    setPage(next);
    timelineRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const lines = loaded?.lines;
  const total = loaded?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  // True from a click until the new page arrives; the old lines stay, dimmed.
  const loading = loaded !== null && loaded.key !== `${searchWords}|${action}|${adminId}|${page}`;
  const isFiltered = searchWords !== "" || action !== "all" || adminId !== "all";
  const firstShown = (page - 1) * PAGE_SIZE + 1;

  return (
    <section>
      <h1 className="h4 fw-bold mb-1">Activity Log</h1>
      <p className="text-white-50 fs-7">
        Everything an admin does is written here by the database, with the date and time. Lines can't be edited or deleted.
      </p>

      <div className="admin-card rounded-4 p-3 mb-3">
        <div className="row g-2">
          <div className="col-12 col-lg-6">
            <input
              type="search"
              className="form-control admin-input"
              placeholder="Search the log (a name, a title...)"
              aria-label="Search the log"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="col-6 col-lg-3">
            <select className="form-select admin-input" value={adminId} onChange={changeFilter(setAdminId)} aria-label="Filter by admin">
              <option value="all">All admins</option>
              {admins.map((admin) => (
                <option key={admin.id} value={admin.id}>{admin.full_name}</option>
              ))}
            </select>
          </div>
          <div className="col-6 col-lg-3">
            <select className="form-select admin-input" value={action} onChange={changeFilter(setAction)} aria-label="Filter by action">
              <option value="all">All actions</option>
              {Object.entries(ACTIONS).map(([value, { label }]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <div ref={timelineRef} className="admin-card admin-timeline-card rounded-4 p-3 p-md-4">
        {loadError && (
          <p className="text-center text-white-50 py-4 mb-0">{loadError}</p>
        )}
        {!loadError && !lines && (
          <p className="text-center text-white-50 py-4 mb-0">Loading the activity log...</p>
        )}
        {!loadError && lines?.length === 0 && (
          <p className="text-center text-white-50 py-4 mb-0">
            {isFiltered ? "No lines match." : "Nothing has been logged yet. What admins do will appear here."}
          </p>
        )}

        {!loadError && lines?.length > 0 && (
          <>
            <p className="text-white-50 fs-8 mb-3" aria-live="polite">
              Showing {firstShown}-{firstShown + lines.length - 1} of {total} {total === 1 ? "line" : "lines"}
            </p>

            <div className={`admin-timeline ${loading ? "is-loading" : ""}`} aria-busy={loading}>
              {groupByDay(lines).map((day) => (
                <div key={day.key} className="admin-timeline-day">
                  <h2 className="admin-timeline-heading">{day.heading}</h2>
                  <ol className="admin-timeline-list">
                    {day.lines.map((line) => {
                      const kind = ACTIONS[line.action] || { label: line.action, icon: "bi-dot", tone: "muted" };
                      // Every sentence starts with the admin's name, which is shown in bold.
                      const startsWithName = line.message.startsWith(line.admin_name);
                      return (
                        <li key={line.id} className={`admin-timeline-item tone-${kind.tone}`}>
                          <span className="admin-timeline-dot" aria-hidden="true">
                            <i className={`bi ${kind.icon}`}></i>
                          </span>
                          <div className="admin-timeline-body text-break">
                            <p className="mb-1">
                              {startsWithName ? (
                                <>
                                  <strong>{line.admin_name}</strong>
                                  {line.message.slice(line.admin_name.length)}
                                </>
                              ) : line.message}
                            </p>
                            <p className="text-white-50 fs-7 mb-0">
                              <time dateTime={line.created_at} title={formatWhen(line.created_at)}>{formatTime(line.created_at)}</time>
                              <span className="badge bg-secondary fw-normal ms-2">{kind.label}</span>
                            </p>
                          </div>
                        </li>
                      );
                    })}
                  </ol>
                </div>
              ))}
            </div>

            <AdminPagination page={page} totalPages={totalPages} onChange={goToPage} label="Activity log pages" />
          </>
        )}
      </div>
    </section>
  );
}
