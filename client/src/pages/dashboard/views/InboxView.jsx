import { useMemo, useState } from "react";
import { useOutletContext } from "react-router-dom";

const conversations = [
  { name: "Juan Cruz", preview: "Do we have a deal?", right: "New", isNew: true, icon: "bi-person-fill", avatar: "bg-success" },
  { name: "Steven Rhodes", preview: "Typing...", right: "10:42 AM", typing: true, icon: "bi-person", avatar: "bg-secondary" },
  { name: "John Doe", preview: "Nice meeting you sir", right: "Yesterday", icon: "bi-person", avatar: "bg-secondary" },
  { name: "Melanie Shelleys", preview: "Seen yesterday", right: "Aug 28", icon: "bi-person", avatar: "bg-secondary" },
  { name: "Pedro Mabini", preview: "Good evening sir", right: "Aug 25", icon: "bi-person", avatar: "bg-secondary" }
];

export default function InboxView() {
  const { openChat } = useOutletContext();
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.toLowerCase();
    return conversations.filter((c) => `${c.name} ${c.preview}`.toLowerCase().includes(q));
  }, [query]);

  return (
    <section className="dashboard-view active-view">
      <div className="glass-card rounded-4 p-4 border border-secondary border-opacity-25">
        <div className="d-flex flex-column flex-md-row justify-content-between align-items-md-center gap-3 mb-4">
          <div>
            <h3 className="text-white fw-bold mb-1"><i className="bi bi-inbox-fill text-orange me-2"></i> Inbox</h3>
            <p className="text-secondary fs-7 mb-0">Your direct conversations with clients and freelancers.</p>
          </div>

          <div className="position-relative search-nav-box" style={{ minWidth: 280 }}>
            <i className="bi bi-search search-icon text-secondary"></i>
            <input
              type="search"
              className="form-control nav-search-input"
              placeholder="Search messages..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
        </div>

        <div className="d-flex flex-column gap-2">
          {filtered.map((c) => (
            <div
              key={c.name}
              className="inbox-item-row p-3 rounded-3 bg-dark bg-opacity-50 border border-secondary border-opacity-25 d-flex align-items-center justify-content-between cursor-pointer hover-lift"
              onClick={() => openChat(c.name)}
            >
              <div className="d-flex align-items-center gap-3">
                <div className={`avatar-circle ${c.avatar} text-white fw-bold flex-shrink-0 d-flex align-items-center justify-content-center`} style={{ width: 48, height: 48 }}>
                  <i className={`bi ${c.icon} fs-4`}></i>
                </div>
                <div>
                  <h6 className="text-white fw-bold mb-1">{c.name}</h6>
                  <p className={`fs-7 mb-0 ${c.typing ? "text-info" : "text-light-50"}`}>
                    {c.typing && <i className="bi bi-chat-dots-fill me-1"></i>}
                    {c.preview}
                  </p>
                </div>
              </div>
              {c.isNew ? (
                <span className="badge bg-orange text-white rounded-pill">New</span>
              ) : (
                <small className="text-secondary fs-8">{c.right}</small>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
