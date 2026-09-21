import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useOutletContext, useParams } from "react-router-dom";
import { supabase } from "../../../lib/supabaseClient";

export default function ChatView() {
  const { conversationId } = useParams();
  const { currentUserId } = useOutletContext();
  const navigate = useNavigate();
  const [otherProfile, setOtherProfile] = useState(null);
  const [messages, setMessages] = useState(null);
  const [notFound, setNotFound] = useState(false);
  const [draft, setDraft] = useState("");
  const streamRef = useRef(null);

  useEffect(() => {
    if (streamRef.current) streamRef.current.scrollTop = streamRef.current.scrollHeight;
  }, [messages]);

  useEffect(() => {
    if (!conversationId || !currentUserId) return;
    let active = true;

    (async () => {
      const { data: conversation, error: conversationError } = await supabase
        .from("conversations")
        .select(`
          id, user_a, user_b,
          a:profiles!conversations_user_a_fkey(id, full_name, username),
          b:profiles!conversations_user_b_fkey(id, full_name, username)
        `)
        .eq("id", conversationId)
        .maybeSingle();

      if (!active) return;
      if (conversationError || !conversation) {
        setNotFound(true);
        return;
      }
      setOtherProfile(conversation.user_a === currentUserId ? conversation.b : conversation.a);

      const { data: messageRows, error: messagesError } = await supabase
        .from("messages")
        .select("id, sender_id, body, created_at")
        .eq("conversation_id", conversationId)
        .order("created_at", { ascending: true });

      if (!active) return;
      if (messagesError) {
        setNotFound(true);
        return;
      }
      setMessages(messageRows);
    })();

    const channel = supabase
      .channel(`messages:${conversationId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages", filter: `conversation_id=eq.${conversationId}` },
        (payload) => setMessages((prev) => (prev ? [...prev, payload.new] : [payload.new]))
      )
      .subscribe();

    return () => {
      active = false;
      supabase.removeChannel(channel);
    };
  }, [conversationId, currentUserId]);

  const handleSubmit = async (event) => {
    event.preventDefault();
    const text = draft.trim();
    if (!text) return;

    setDraft("");
    const { error } = await supabase.from("messages").insert({
      conversation_id: conversationId,
      sender_id: currentUserId,
      body: text
    });
    if (error) setDraft(text);
  };

  if (!conversationId) {
    return (
      <section className="dashboard-view active-view">
        <div className="glass-card rounded-4 p-5 border border-secondary border-opacity-25 text-center">
          <i className="bi bi-chat-square-text fs-1 text-secondary d-block mb-3"></i>
          <p className="text-secondary mb-0">Select a conversation from your Inbox.</p>
        </div>
      </section>
    );
  }

  if (notFound) {
    return (
      <section className="dashboard-view active-view">
        <div className="glass-card rounded-4 p-5 border border-secondary border-opacity-25 text-center">
          <i className="bi bi-exclamation-circle fs-1 text-secondary d-block mb-3"></i>
          <p className="text-secondary mb-3">Conversation not found.</p>
          <Link to="/dashboard/inbox" className="btn btn-gradient-role rounded-pill px-4 py-2 fw-bold text-white">Back to Inbox</Link>
        </div>
      </section>
    );
  }

  const recipientName = otherProfile?.full_name || otherProfile?.username || "...";

  return (
    <section className="dashboard-view active-view">
      <div className="glass-card rounded-4 border border-secondary border-opacity-25 overflow-hidden d-flex flex-column" style={{ height: 680 }}>
        <div className="chat-header p-3 bg-dark border-bottom border-secondary border-opacity-25 d-flex align-items-center justify-content-between">
          <div className="d-flex align-items-center gap-3">
            <button className="btn btn-sm btn-dark text-secondary" onClick={() => navigate("/dashboard/inbox")}>
              <i className="bi bi-arrow-left fs-5"></i>
            </button>
            <div className="avatar-circle bg-success text-white fw-bold d-flex align-items-center justify-content-center" style={{ width: 40, height: 40 }}>
              <i className="bi bi-person-fill fs-5"></i>
            </div>
            <div>
              <h6 className="text-white fw-bold mb-0">{recipientName}</h6>
            </div>
          </div>
          <div>
            <button className="btn btn-sm btn-outline-secondary text-white border-0"><i className="bi bi-telephone-fill fs-5"></i></button>
            <button className="btn btn-sm btn-outline-secondary text-white border-0"><i className="bi bi-camera-video-fill fs-5"></i></button>
          </div>
        </div>

        <div ref={streamRef} className="chat-body flex-grow-1 p-4 overflow-y-auto d-flex flex-column gap-3 bg-black bg-opacity-40">
          {messages === null && <p className="text-secondary fs-7 text-center mb-0">Loading messages...</p>}
          {messages !== null && messages.length === 0 && (
            <p className="text-secondary fs-7 text-center mb-0">No messages yet. Say hello!</p>
          )}
          {messages?.map((m) => {
            const isMe = m.sender_id === currentUserId;
            return (
              <div
                key={m.id}
                className={`chat-bubble ${isMe ? "outgoing align-self-end bg-role" : "incoming align-self-start bg-secondary bg-opacity-25"} p-3 rounded-4 max-w-500 text-white`}
              >
                <div className={`d-flex align-items-center gap-2 mb-1 ${isMe ? "justify-content-end" : ""}`}>
                  {!isMe && <strong className="fs-8 text-role">{recipientName}</strong>}
                  <small className="fs-8 text-white-50">{new Date(m.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</small>
                </div>
                <p className="mb-0 fs-7">{m.body}</p>
              </div>
            );
          })}
        </div>

        <div className="chat-footer p-3 bg-dark border-top border-secondary border-opacity-25">
          <form className="d-flex align-items-center gap-2" onSubmit={handleSubmit}>
            <button type="button" className="btn btn-dark text-secondary p-2"><i className="bi bi-paperclip fs-5"></i></button>
            <button type="button" className="btn btn-dark text-secondary p-2"><i className="bi bi-image fs-5"></i></button>
            <button type="button" className="btn btn-dark text-secondary p-2"><i className="bi bi-mic fs-5"></i></button>

            <input
              type="text"
              className="form-control bg-secondary bg-opacity-25 border-0 text-white rounded-pill px-4 py-2"
              placeholder="Type a message..."
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              required
            />

            <button type="submit" className="btn btn-gradient-role rounded-circle p-2 text-white d-flex align-items-center justify-content-center" style={{ width: 42, height: 42 }}>
              <i className="bi bi-send-fill fs-5"></i>
            </button>
          </form>
        </div>
      </div>
    </section>
  );
}
