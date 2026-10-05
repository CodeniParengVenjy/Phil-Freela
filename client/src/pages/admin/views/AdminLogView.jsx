import { useEffect, useState } from "react";
import { supabase } from "../../../lib/supabaseClient";

// How many lines one request loads; "Load more" fetches the next batch.
const PAGE_SIZE = 50;

// The kinds of action the database logs (the "action" column of admin_log),
// with the words and icon shown for each.
const ACTIONS = {
  suspend: { label: "Suspension", icon: "bi-pause-circle" },
  ban: { label: "Ban", icon: "bi-slash-circle" },
  lift: { label: "Penalty lifted", icon: "bi-unlock" },
  report: { label: "Report", icon: "bi-flag" },
  verification: { label: "ID verification", icon: "bi-person-vcard" },
  appeal: { label: "Appeal", icon: "bi-envelope-paper" },
  announcement: { label: "Announcement", icon: "bi-megaphone" },
  flagged: { label: "Flagged content", icon: "bi-images" },
  listing: { label: "Listing", icon: "bi-grid" },
  admin: { label: "Admin", icon: "bi-shield-lock" },
  user_delete: { label: "Account deleted", icon: "bi-person-x" }
};

// e.g. "Oct 5, 2026, 3:42 PM"
const formatWhen = (value) =>
  new Date(value).toLocaleString(undefined, { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });

// One batch of log lines, newest first. The database applies the filters, so
// "Load more" keeps to the same ones.
function fetchLog({ search, action, adminId }, from) {
  let query = supabase
    .from("admin_log")
    .select("id, admin_name, action, message, created_at")
    .order("created_at", { ascending: false })
    .range(from, from + PAGE_SIZE - 1);
  if (action !== "all") query = query.eq("action", action);
  if (adminId !== "all") query = query.eq("admin_id", adminId);
  if (search) query = query.ilike("message", `%${search}%`);
  return query;
}

// The Activity Log: what every admin did and when. The lines are written by
// database triggers (database/supabase_admin_log_schema.sql), not by the admin
// pages, so nothing can be skipped, and nobody can edit or delete a line.
export default function AdminLogView() {
  // The lines on screen, together with the filters they were loaded for.
  const [loaded, setLoaded] = useState(null);
  const [loadError, setLoadError] = useState("");
  const [loadingMore, setLoadingMore] = useState(false);
  const [admins, setAdmins] = useState([]);
  const [search, setSearch] = useState("");
  const [action, setAction] = useState("all");
  const [adminId, setAdminId] = useState("all");

  // The names for the "by admin" filter.
  useEffect(() => {
    let active = true;

    (async () => {
      const { data } = await supabase.from("admins").select("id, full_name").order("full_name", { ascending: true });
      if (active) setAdmins(data || []);
    })();

    return () => { active = false; };
  }, []);

  // Load from the top again whenever a filter changes. The short wait means
  // typing in the search box doesn't send a request for every letter.
  useEffect(() => {
    let active = true;
    const filters = { search: search.trim(), action, adminId };

    const timer = setTimeout(async () => {
      const { data, error } = await fetchLog(filters, 0);
      if (!active) return;

      if (error) {
        setLoadError("Failed to load the activity log.");
        return;
      }
      setLoadError("");
      setLoaded({ filters, lines: data, hasMore: data.length === PAGE_SIZE });
    }, 300);

    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [search, action, adminId]);

  const loadMore = async () => {
    const { filters, lines } = loaded;

    setLoadingMore(true);
    const { data, error } = await fetchLog(filters, lines.length);
    setLoadingMore(false);

    if (error) {
      setLoadError("Failed to load more of the activity log.");
      return;
    }
    setLoaded((prev) => {
      // The filters changed while this was loading: these lines are not wanted.
      if (prev.filters !== filters) return prev;
      // A line logged since the first batch shifts the rest down by one, so the
      // next batch can repeat a line already on screen.
      const shown = new Set(prev.lines.map((line) => line.id));
      return {
        filters,
        lines: [...prev.lines, ...data.filter((line) => !shown.has(line.id))],
        hasMore: data.length === PAGE_SIZE
      };
    });
  };

  const lines = loaded?.lines;
  const isFiltered = search.trim() !== "" || action !== "all" || adminId !== "all";

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
            <select className="form-select admin-input" value={adminId} onChange={(e) => setAdminId(e.target.value)} aria-label="Filter by admin">
              <option value="all">All admins</option>
              {admins.map((admin) => (
                <option key={admin.id} value={admin.id}>{admin.full_name}</option>
              ))}
            </select>
          </div>
          <div className="col-6 col-lg-3">
            <select className="form-select admin-input" value={action} onChange={(e) => setAction(e.target.value)} aria-label="Filter by action">
              <option value="all">All actions</option>
              {Object.entries(ACTIONS).map(([value, { label }]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <div className="admin-card rounded-4 p-3 p-md-4">
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
        {!loadError && lines?.map((line) => {
          const kind = ACTIONS[line.action] || { label: line.action, icon: "bi-dot" };
          // Every sentence starts with the admin's name, which is shown in bold.
          const startsWithName = line.message.startsWith(line.admin_name);
          return (
            <div key={line.id} className="admin-log-line d-flex align-items-start gap-3 py-2 border-bottom border-secondary border-opacity-25">
              <i className={`bi ${kind.icon} text-warning fs-5`} aria-hidden="true"></i>
              <div className="flex-grow-1 text-break">
                <p className="mb-1">
                  {startsWithName ? (
                    <>
                      <strong>{line.admin_name}</strong>
                      {line.message.slice(line.admin_name.length)}
                    </>
                  ) : line.message}
                </p>
                <p className="text-white-50 fs-7 mb-0">
                  <time dateTime={line.created_at}>{formatWhen(line.created_at)}</time>
                  <span className="badge bg-secondary fw-normal ms-2">{kind.label}</span>
                </p>
              </div>
            </div>
          );
        })}
        {!loadError && loaded?.hasMore && (
          <div className="text-center pt-3">
            <button className="btn btn-outline-light btn-sm rounded-pill px-3" onClick={loadMore} disabled={loadingMore}>
              {loadingMore ? "Loading..." : "Load more"}
            </button>
          </div>
        )}
      </div>
    </section>
  );
}
