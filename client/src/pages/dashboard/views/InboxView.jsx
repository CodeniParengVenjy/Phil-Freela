import { useEffect, useMemo, useState } from "react";
import { useNavigate, useOutletContext } from "react-router-dom";
import { supabase } from "../../../lib/supabaseClient";

export default function InboxView() {
  const { currentUserId } = useOutletContext();
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [conversations, setConversations] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!currentUserId) return;
    let active = true;

    const fetchConversations = async () => {
      const { data, error: fetchError } = await supabase
        .from("conversations")
        .select(`
          id, last_message_at, last_message_preview, user_a, user_b,
          a:profiles!conversations_user_a_fkey(id, full_name, username, account_type),
          b:profiles!conversations_user_b_fkey(id, full_name, username, account_type)
        `)
        .or(`user_a.eq.${currentUserId},user_b.eq.${currentUserId}`)
        .order("last_message_at", { ascending: false });

      if (!active) return;
      if (fetchError) {
        setError("Failed to load conversations.");
      } else {
        setConversations(data);
      }
    };

    fetchConversations();

    const channel = supabase
      .channel(`inbox:${currentUserId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "conversations", filter: `user_a=eq.${currentUserId}` }, fetchConversations)
      .on("postgres_changes", { event: "*", schema: "public", table: "conversations", filter: `user_b=eq.${currentUserId}` }, fetchConversations)
      .subscribe();

    return () => {
      active = false;
      supabase.removeChannel(channel);
    };
  }, [currentUserId]);

  const rows = useMemo(() => {
    if (!conversations) return [];
    return conversations.map((c) => {
      const other = c.user_a === currentUserId ? c.b : c.a;
      return {
        id: c.id,
        name: other?.full_name || other?.username || "Unknown user",
        preview: c.last_message_preview || "No messages yet",
        lastMessageAt: c.last_message_at
      };
    });
  }, [conversations, currentUserId]);

  const filtered = useMemo(() => {
    const q = query.toLowerCase();
    return rows.filter((c) => `${c.name} ${c.preview}`.toLowerCase().includes(q));
  }, [rows, query]);

  return (
    <section className="dashboard-view active-view">
      <div className="glass-card rounded-4 p-4 border border-secondary border-opacity-25">
        <div className="d-flex flex-column flex-md-row justify-content-between align-items-md-center gap-3 mb-4">
          <div>
            <h3 className="text-white fw-bold mb-1"><i className="bi bi-inbox-fill text-role me-2"></i> Inbox</h3>
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

        {error && <p className="text-danger fs-7 text-center py-4 mb-0">{error}</p>}

        {!error && conversations === null && (
          <p className="text-secondary fs-7 text-center py-4 mb-0">Loading conversations...</p>
        )}

        {!error && conversations !== null && filtered.length === 0 && (
          <p className="text-secondary fs-7 text-center py-4 mb-0">No conversations yet.</p>
        )}

        <div className="d-flex flex-column gap-2">
          {filtered.map((c) => (
            <div
              key={c.id}
              className="inbox-item-row p-3 rounded-3 bg-dark bg-opacity-50 border border-secondary border-opacity-25 d-flex align-items-center justify-content-between cursor-pointer hover-lift"
              onClick={() => navigate(`/dashboard/chat/${c.id}`)}
            >
              <div className="d-flex align-items-center gap-3">
                <div className="avatar-circle bg-secondary text-white fw-bold flex-shrink-0 d-flex align-items-center justify-content-center" style={{ width: 48, height: 48 }}>
                  <i className="bi bi-person-fill fs-4"></i>
                </div>
                <div>
                  <h6 className="text-white fw-bold mb-1">{c.name}</h6>
                  <p className="fs-7 mb-0 text-light-50">{c.preview}</p>
                </div>
              </div>
              <small className="text-secondary fs-8">{new Date(c.lastMessageAt).toLocaleDateString()}</small>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
