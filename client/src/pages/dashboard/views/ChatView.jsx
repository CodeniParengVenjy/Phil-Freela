import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useOutletContext, useParams } from "react-router-dom";
import { supabase } from "../../../lib/supabaseClient";
import DeleteConfirmDialog from "../components/DeleteConfirmDialog";

export default function ChatView() {
  const { conversationId } = useParams();
  const { currentUserId, showToast, refreshUnreadCount } = useOutletContext();
  const navigate = useNavigate();
  const [otherProfile, setOtherProfile] = useState(null);
  const [messages, setMessages] = useState(null);
  const [notFound, setNotFound] = useState(false);
  const [draft, setDraft] = useState("");
  const streamRef = useRef(null);

  const [contextMenu, setContextMenu] = useState(null); // { x, y, message }
  const [editingMessage, setEditingMessage] = useState(null); // { id, body }
  const [deleteTarget, setDeleteTarget] = useState(null); // message pending unsend confirm
  const [deleting, setDeleting] = useState(false);
  const [forwardMessage, setForwardMessage] = useState(null); // message being forwarded
  const [forwardConversations, setForwardConversations] = useState(null);
  const [forwarding, setForwarding] = useState(false);

  useEffect(() => {
    if (streamRef.current) streamRef.current.scrollTop = streamRef.current.scrollHeight;
  }, [messages]);

  // Closes the right-click menu on any click elsewhere, or Esc for that and
  // the forward picker (matches DeleteConfirmDialog's own Esc handling).
  useEffect(() => {
    if (!contextMenu) return undefined;
    const closeMenu = () => setContextMenu(null);
    window.addEventListener("click", closeMenu);
    return () => window.removeEventListener("click", closeMenu);
  }, [contextMenu]);

  useEffect(() => {
    if (!contextMenu && !forwardMessage) return undefined;
    const handleKeyDown = (event) => {
      if (event.key !== "Escape") return;
      setContextMenu(null);
      setForwardMessage(null);
      setForwardConversations(null);
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [contextMenu, forwardMessage]);

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
        .select("id, sender_id, body, created_at, edited_at")
        .eq("conversation_id", conversationId)
        .order("created_at", { ascending: true });

      if (!active) return;
      if (messagesError) {
        setNotFound(true);
        return;
      }
      setMessages(messageRows);

      // Opening the conversation counts as reading whatever's already here.
      await supabase.rpc("mark_conversation_read", { target_conversation_id: conversationId });
      refreshUnreadCount?.();
    })();

    const channel = supabase
      .channel(`messages:${conversationId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages", filter: `conversation_id=eq.${conversationId}` },
        async (payload) => {
          setMessages((prev) => (prev ? [...prev, payload.new] : [payload.new]));
          // Still on this screen when it arrives, so it's read immediately too.
          await supabase.rpc("mark_conversation_read", { target_conversation_id: conversationId });
          refreshUnreadCount?.();
        }
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "messages", filter: `conversation_id=eq.${conversationId}` },
        (payload) => setMessages((prev) => prev?.map((m) => (m.id === payload.new.id ? payload.new : m)) ?? prev)
      )
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "messages", filter: `conversation_id=eq.${conversationId}` },
        (payload) => setMessages((prev) => prev?.filter((m) => m.id !== payload.old.id) ?? prev)
      )
      .subscribe();

    return () => {
      active = false;
      supabase.removeChannel(channel);
    };
  }, [conversationId, currentUserId, refreshUnreadCount]);

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

  const openContextMenu = (event, message) => {
    event.preventDefault();
    event.stopPropagation();
    setContextMenu({ x: event.clientX, y: event.clientY, message });
  };

  const handleCopy = async (message) => {
    setContextMenu(null);
    try {
      await navigator.clipboard.writeText(message.body);
      showToast?.("Copied to clipboard.");
    } catch {
      showToast?.("Couldn't copy that message.");
    }
  };

  const startEdit = (message) => {
    setContextMenu(null);
    setEditingMessage({ id: message.id, body: message.body });
  };

  const saveEdit = async (event) => {
    event.preventDefault();
    const text = editingMessage.body.trim();
    if (!text) return;

    const { error } = await supabase
      .from("messages")
      .update({ body: text, edited_at: new Date().toISOString() })
      .eq("id", editingMessage.id);

    if (error) {
      showToast?.("Couldn't save that edit. Please try again.");
      return;
    }
    setEditingMessage(null);
  };

  const requestUnsend = (message) => {
    setContextMenu(null);
    setDeleteTarget(message);
  };

  const confirmUnsend = async () => {
    setDeleting(true);
    const { error } = await supabase.from("messages").delete().eq("id", deleteTarget.id);
    setDeleting(false);
    setDeleteTarget(null);
    if (error) {
      showToast?.("Couldn't unsend that message.");
    } else {
      showToast?.("Message unsent.");
    }
  };

  const openForwardPicker = async (message) => {
    setContextMenu(null);
    setForwardMessage(message);
    setForwardConversations(null);

    const { data } = await supabase
      .from("conversations")
      .select(`
        id, user_a, user_b,
        a:profiles!conversations_user_a_fkey(id, full_name, username),
        b:profiles!conversations_user_b_fkey(id, full_name, username)
      `)
      .or(`user_a.eq.${currentUserId},user_b.eq.${currentUserId}`)
      .neq("id", conversationId);

    setForwardConversations(
      (data || []).map((c) => {
        const other = c.user_a === currentUserId ? c.b : c.a;
        return { id: c.id, name: other?.full_name || other?.username || "Unknown user" };
      })
    );
  };

  const handleForward = async (targetConversationId) => {
    setForwarding(true);
    const { error } = await supabase.from("messages").insert({
      conversation_id: targetConversationId,
      sender_id: currentUserId,
      body: forwardMessage.body
    });
    setForwarding(false);
    setForwardMessage(null);
    setForwardConversations(null);
    showToast?.(error ? "Couldn't forward that message." : "Message forwarded.");
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
            const isEditingThis = editingMessage?.id === m.id;
            return (
              <div
                key={m.id}
                className={`chat-bubble ${isMe ? "outgoing align-self-end bg-role" : "incoming align-self-start bg-secondary bg-opacity-25"} p-3 rounded-4 max-w-500 text-white`}
                onContextMenu={(event) => openContextMenu(event, m)}
              >
                <div className={`d-flex align-items-center gap-2 mb-1 ${isMe ? "justify-content-end" : ""}`}>
                  {!isMe && <strong className="fs-8 text-role">{recipientName}</strong>}
                  <small className="fs-8 text-white-50">{new Date(m.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</small>
                </div>

                {isEditingThis ? (
                  <form className="d-flex flex-column gap-2" onSubmit={saveEdit}>
                    <textarea
                      className="form-control bg-dark bg-opacity-50 border-secondary text-white fs-7"
                      rows={2}
                      value={editingMessage.body}
                      onChange={(event) => setEditingMessage((prev) => ({ ...prev, body: event.target.value }))}
                      autoFocus
                    />
                    <div className="d-flex gap-2 justify-content-end">
                      <button type="button" className="btn btn-sm btn-outline-secondary text-white-50" onClick={() => setEditingMessage(null)}>Cancel</button>
                      <button type="submit" className="btn btn-sm btn-gradient-role text-white">Save</button>
                    </div>
                  </form>
                ) : (
                  <>
                    <p className="mb-0 fs-7">{m.body}</p>
                    {m.edited_at && <small className="fs-9 text-white-50 fst-italic">(edited)</small>}
                  </>
                )}
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

      {contextMenu && (
        <div
          className="dropdown-menu dropdown-menu-dark show border border-secondary border-opacity-25 shadow-lg p-2"
          style={{ position: "fixed", top: contextMenu.y, left: contextMenu.x, zIndex: 1200, minWidth: 180 }}
          onClick={(event) => event.stopPropagation()}
        >
          <button type="button" className="dropdown-item rounded-2 text-white d-flex align-items-center" onClick={() => handleCopy(contextMenu.message)}>
            <i className="bi bi-clipboard me-2 text-info"></i> Copy Text
          </button>
          <button type="button" className="dropdown-item rounded-2 text-white d-flex align-items-center" onClick={() => openForwardPicker(contextMenu.message)}>
            <i className="bi bi-arrow-90deg-right me-2 text-warning"></i> Forward Text
          </button>
          {contextMenu.message.sender_id === currentUserId && (
            <>
              <button type="button" className="dropdown-item rounded-2 text-white d-flex align-items-center" onClick={() => startEdit(contextMenu.message)}>
                <i className="bi bi-pencil me-2 text-orange"></i> Edit Text
              </button>
              <button type="button" className="dropdown-item rounded-2 text-danger d-flex align-items-center" onClick={() => requestUnsend(contextMenu.message)}>
                <i className="bi bi-trash3 me-2"></i> Unsend
              </button>
            </>
          )}
        </div>
      )}

      {forwardMessage && (
        <div
          className="position-fixed top-0 start-0 w-100 h-100 d-flex align-items-center justify-content-center"
          style={{ background: "rgba(0,0,0,0.65)", zIndex: 1300 }}
          onClick={() => { setForwardMessage(null); setForwardConversations(null); }}
        >
          <div
            className="bg-dark text-white border border-secondary border-opacity-25 rounded-4 p-4"
            style={{ maxWidth: 420, width: "100%" }}
            onClick={(event) => event.stopPropagation()}
          >
            <h6 className="fw-bold mb-3">Forward to...</h6>
            {forwardConversations === null && <p className="text-secondary fs-7">Loading conversations...</p>}
            {forwardConversations?.length === 0 && <p className="text-secondary fs-7 mb-0">No other conversations to forward to.</p>}
            <div className="d-flex flex-column gap-2" style={{ maxHeight: 260, overflowY: "auto" }}>
              {forwardConversations?.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  className="btn btn-outline-secondary text-white text-start rounded-3"
                  disabled={forwarding}
                  onClick={() => handleForward(c.id)}
                >
                  {c.name}
                </button>
              ))}
            </div>
            <div className="text-end mt-3">
              <button type="button" className="btn btn-sm btn-outline-secondary text-white-50" onClick={() => { setForwardMessage(null); setForwardConversations(null); }}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      <DeleteConfirmDialog
        open={!!deleteTarget}
        title="Unsend this message?"
        message="This deletes it permanently for everyone in this conversation. This can't be undone."
        busy={deleting}
        onConfirm={confirmUnsend}
        onCancel={() => setDeleteTarget(null)}
      />
    </section>
  );
}
