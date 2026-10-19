import { useCallback, useEffect, useState } from "react";
import { useOutletContext } from "react-router-dom";
import { supabase } from "../../../lib/supabaseClient";
import { resendConfirmation, useResendWait } from "../../../lib/resendConfirmation";

// "just now", "12 minutes ago", "3 days ago": how long ago something happened.
function timeAgo(value) {
  const seconds = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 1000));
  const units = [["day", 86400], ["hour", 3600], ["minute", 60]];
  for (const [name, size] of units) {
    const count = Math.floor(seconds / size);
    if (count >= 1) return `${count} ${name}${count === 1 ? "" : "s"} ago`;
  }
  return "just now";
}

// People who signed up with an email but never opened the confirmation link, so
// they have no profile and can't sign in. admin_pending_users() is a database
// function that adds their email and sign-up details (only admins can call it).
// "Resend email" sends them a new confirmation email, as many times as needed,
// with a short wait between sends (Supabase's rule: one email per address per
// minute; see lib/resendConfirmation.js).
export default function AdminPendingView() {
  const { refreshPendingUsers } = useOutletContext();
  // null while loading.
  const [people, setPeople] = useState(null);
  const [loadError, setLoadError] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState("");
  const [message, setMessage] = useState({ text: "", type: "" });
  // The person whose email is being sent right now.
  const [sendingId, setSendingId] = useState(null);
  // person id -> a short line under their button (a problem, or why to wait).
  const [notes, setNotes] = useState({});
  const { secondsLeft, startWait, startWaitsFrom } = useResendWait();

  // Shows the list the database sent (or says it couldn't).
  const showList = useCallback((data, error) => {
    if (error) {
      setLoadError("Failed to load pending users.");
      return;
    }
    setLoadError("");
    setPeople(data);
    // A wait that is still on (the last email went out under a minute ago)
    // carries on after a refresh.
    startWaitsFrom(data.map((person) => ({ id: person.id, sentAt: person.confirmation_sent_at })));
    // The number on the sidebar link.
    refreshPendingUsers();
  }, [refreshPendingUsers, startWaitsFrom]);

  useEffect(() => {
    let active = true;

    (async () => {
      const { data, error } = await supabase.rpc("admin_pending_users");
      if (active) showList(data, error);
    })();

    return () => { active = false; };
  }, [showList]);

  const handleRefresh = async () => {
    setRefreshing(true);
    const { data, error } = await supabase.rpc("admin_pending_users");
    showList(data, error);
    setRefreshing(false);
  };

  const handleResend = async (person) => {
    setSendingId(person.id);
    setMessage({ text: "", type: "" });
    setNotes((prev) => ({ ...prev, [person.id]: "" }));
    const result = await resendConfirmation(person.email);
    setSendingId(null);

    if (result.sent) {
      startWait(person.id);
      // Supabase has just changed "last email sent", so show the same here.
      setPeople((prev) => prev.map((p) => (p.id === person.id ? { ...p, confirmation_sent_at: new Date().toISOString() } : p)));
      setMessage({ text: `Confirmation email sent to ${person.email}.`, type: "success" });
    } else if (result.waitSeconds) {
      // Someone else (or an earlier press) sent one under a minute ago.
      startWait(person.id, result.waitSeconds);
      setNotes((prev) => ({ ...prev, [person.id]: "An email went out less than a minute ago." }));
    } else {
      setNotes((prev) => ({ ...prev, [person.id]: result.error }));
    }
  };

  const searchText = search.trim().toLowerCase();
  const visiblePeople = (people || []).filter((person) => !searchText
    || (person.full_name || "").toLowerCase().includes(searchText)
    || (person.username || "").toLowerCase().includes(searchText)
    || (person.email || "").toLowerCase().includes(searchText));

  return (
    <section>
      <h1 className="h4 fw-bold mb-1">Pending Users</h1>
      <p className="text-secondary fs-7 mb-3">
        People who signed up with an email but haven't opened the confirmation link yet, so they can't sign in.
        Each new email cancels the older ones: tell them to use the newest email and to check their Spam folder.
      </p>

      <div className="admin-card rounded-4 p-3 mb-3">
        <div className="row g-2">
          <div className="col-12 col-lg-6">
            <input
              type="search"
              className="form-control admin-input"
              placeholder="Search by name, username or email..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="col-6 col-lg-3 d-flex align-items-center text-white-50 fs-7">
            {people !== null && `${visiblePeople.length} of ${people.length} waiting`}
          </div>
          <div className="col-6 col-lg-3">
            <button type="button" className="btn btn-outline-light w-100" onClick={handleRefresh} disabled={refreshing}>
              <i className="bi bi-arrow-clockwise me-1"></i> Refresh
            </button>
          </div>
        </div>
      </div>

      {message.text && (
        <p className={`admin-message ${message.type} fs-7 fw-semibold`} aria-live="polite">{message.text}</p>
      )}

      <div className="admin-card rounded-4 p-3 p-md-4">
        {loadError && <p className="text-center text-white-50 py-3 mb-0">{loadError}</p>}
        {!loadError && people === null && <p className="text-center text-white-50 py-3 mb-0">Loading pending users...</p>}
        {!loadError && people !== null && visiblePeople.length === 0 && (
          <p className="text-center text-white-50 py-3 mb-0">
            {people.length === 0 ? "Nobody is waiting on an email." : "No one matches that search."}
          </p>
        )}

        <ul className="admin-pending-list">
          {visiblePeople.map((person) => {
            const wait = secondsLeft(person.id);
            const sending = sendingId === person.id;
            return (
              <li key={person.id} className="admin-pending-row">
                <div className="admin-pending-who">
                  <div className="fw-semibold text-white">
                    {person.full_name || "No name given"}
                    <span className={`badge ${person.account_type === "client" ? "bg-info" : "admin-badge-orange"} text-white fw-normal ms-2`}>
                      {person.account_type === "client" ? "Client" : "Freelancer"}
                    </span>
                  </div>
                  <div className="text-white-50 fs-7">{person.username ? `@${person.username}` : "No username"}</div>
                  <div className="fs-7">{person.email}</div>
                </div>

                <div className="admin-pending-times text-white-50 fs-8">
                  <div>Signed up {timeAgo(person.created_at)}</div>
                  <div>{person.confirmation_sent_at ? `Last email sent ${timeAgo(person.confirmation_sent_at)}` : "No email sent yet"}</div>
                </div>

                <div className="admin-pending-action">
                  <button
                    type="button"
                    className="btn btn-outline-info btn-sm"
                    onClick={() => handleResend(person)}
                    disabled={sending || wait > 0}
                    aria-label={`Resend the confirmation email to ${person.email}`}
                  >
                    <i className="bi bi-envelope-arrow-up me-1"></i>
                    {sending ? "Sending..." : wait > 0 ? `Resend in ${wait}s` : "Resend email"}
                  </button>
                  {notes[person.id] && <div className="text-danger fs-8 mt-1">{notes[person.id]}</div>}
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
