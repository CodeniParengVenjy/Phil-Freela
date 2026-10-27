import { useCallback, useEffect, useState } from "react";
import { NavLink } from "react-router-dom";
import { supabase } from "../../../lib/supabaseClient";
import { useVerifiedIds } from "../../../lib/useVerifiedIds";
import { shortTimeAgo } from "../../../lib/chatTime";
import VerifiedBadge from "../../../components/VerifiedBadge";
import Avatar from "../../../components/Avatar";
import CensoredText from "../../../components/CensoredText";
import TopNavIconMenu from "./TopNavIconMenu";

// How many of the latest chats the chat icon's list shows.
const LIST_SIZE = 6;

// A chat counts as unread when the other person sent something after this
// user last opened it: the same rule as the red number
// (get_unread_message_count), so unsent messages and calls that were picked up
// don't count, only missed ones. Returns the ids of the unread chats.
async function findUnreadChats(chats, userId) {
  // "-infinity" (never opened) can't be read as a date: it counts as the very start.
  const readAt = (chat) => Date.parse(chat.user_a === userId ? chat.user_a_last_read_at : chat.user_b_last_read_at) || -Infinity;
  const oldest = Math.min(...chats.map(readAt));

  const { data, error } = await supabase
    .from("messages")
    .select("conversation_id, created_at, call_id, body")
    .in("conversation_id", chats.map((chat) => chat.id))
    .neq("sender_id", userId)
    .is("unsent_at", null)
    .gt("created_at", Number.isFinite(oldest) ? new Date(oldest).toISOString() : "-infinity")
    .order("created_at", { ascending: false })
    .limit(500);
  if (error) return new Set();

  const unread = new Set();
  for (const message of data) {
    const chat = chats.find((c) => c.id === message.conversation_id);
    const counts = !message.call_id || message.body?.startsWith("Missed");
    if (counts && Date.parse(message.created_at) > readAt(chat)) unread.add(chat.id);
  }
  return unread;
}

// The chat icon in the top bar: a red number for the messages not read yet,
// and the latest chats when pressed (unread ones in bold). Pressing a chat
// opens it; "See all in Inbox" opens the Inbox page.
export default function TopNavMessages({ currentUserId, unread }) {
  const [open, setOpen] = useState(false);
  const [chats, setChats] = useState(null);
  const [loadError, setLoadError] = useState(false);
  const handleOpenChange = useCallback((isOpen) => setOpen(isOpen), []);

  // Loads the list each time it opens, and again when a message arrives while
  // it is open (the number changes).
  useEffect(() => {
    if (!open || !currentUserId) return undefined;
    let active = true;

    (async () => {
      // The same chats as the Inbox page, newest first; the database rules
      // only return this user's own.
      const { data, error } = await supabase
        .from("conversations")
        .select(`
          id, last_message_at, last_message_preview, user_a, user_b, user_a_last_read_at, user_b_last_read_at,
          a:profiles!conversations_user_a_fkey(id, full_name, username, avatar_path),
          b:profiles!conversations_user_b_fkey(id, full_name, username, avatar_path)
        `)
        .or(`user_a.eq.${currentUserId},user_b.eq.${currentUserId}`)
        .order("last_message_at", { ascending: false })
        .limit(LIST_SIZE);

      if (!active) return;
      if (error) {
        setLoadError(true);
        return;
      }

      const unreadIds = data.length ? await findUnreadChats(data, currentUserId) : new Set();
      if (!active) return;

      setLoadError(false);
      setChats(data.map((c) => {
        const other = c.user_a === currentUserId ? c.b : c.a;
        return {
          id: c.id,
          otherId: other?.id,
          name: other?.full_name || other?.username || "Unknown user",
          avatarPath: other?.avatar_path,
          preview: c.last_message_preview || "No messages yet",
          lastMessageAt: c.last_message_at,
          isUnread: unreadIds.has(c.id)
        };
      }));
    })();

    return () => { active = false; };
  }, [open, currentUserId, unread]);

  const verifiedIds = useVerifiedIds(chats ? chats.map((c) => c.otherId) : []);

  return (
    <TopNavIconMenu icon="bi-chat-dots-fill" label="Messages" count={unread} tour="topbar-messages" onOpenChange={handleOpenChange}>
      <div className="topbar-panel-head px-3 py-2 border-bottom border-secondary border-opacity-25 fw-bold text-white">Messages</div>

      <div className="topbar-panel-list">
        {loadError && <p className="text-white-50 fs-7 text-center py-4 mb-0">Failed to load your chats.</p>}
        {!loadError && chats === null && <p className="text-white-50 fs-7 text-center py-4 mb-0">Loading...</p>}
        {!loadError && chats?.length === 0 && (
          <div className="text-white-50 fs-7 text-center py-4">
            <i className="bi bi-chat-square-dots fs-3 d-block mb-1"></i>
            No conversations yet.
          </div>
        )}

        {!loadError && chats?.map((c) => (
          <NavLink key={c.id} to={`/dashboard/chat/${c.id}`} className="dropdown-item topbar-panel-item">
            <Avatar path={c.avatarPath} name={c.name} size={40} />
            <span className="flex-grow-1 min-w-0">
              <span className={`d-block text-truncate text-white ${c.isUnread ? "fw-bold" : ""}`}>
                {c.name}
                <VerifiedBadge verified={verifiedIds.has(c.otherId)} />
              </span>
              <span className={`d-block text-truncate fs-8 ${c.isUnread ? "text-white fw-semibold" : "text-white-50"}`}>
                <CensoredText text={c.preview} />
              </span>
            </span>
            <span className="topbar-panel-meta">
              <small className="text-white-50 fs-8">{shortTimeAgo(c.lastMessageAt)}</small>
              {c.isUnread && <span className="topbar-new-dot" title="Unread"></span>}
            </span>
          </NavLink>
        ))}
      </div>

      <NavLink to="/dashboard/inbox" className="dropdown-item topbar-panel-all">See all in Inbox</NavLink>
    </TopNavIconMenu>
  );
}
