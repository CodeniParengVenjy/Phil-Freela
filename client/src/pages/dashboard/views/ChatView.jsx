import { Fragment, useEffect, useRef, useState } from "react";
import { Link, useNavigate, useOutletContext, useParams } from "react-router-dom";
import { supabase } from "../../../lib/supabaseClient";
import { useVerifiedIds } from "../../../lib/useVerifiedIds";
import VerifiedBadge from "../../../components/VerifiedBadge";
import Avatar from "../../../components/Avatar";
import DeleteConfirmDialog from "../components/DeleteConfirmDialog";
import ReportDialog from "../components/ReportDialog";
import BlockedNotice from "../components/BlockedNotice";
import { isMessagingBlocked } from "../../../lib/suspensions";
import { startCall, useCall } from "../../../lib/calls";
import { presenceStatus, usePresence } from "../../../lib/presence";
import { profilePath } from "../../../lib/profileStats";
import { needsTimeDivider, timeDividerLabel } from "../../../lib/chatTime";
import { pickReportMessages } from "../../../lib/reportMessages";
import { FILE_ACCEPT, checkChatFile, deleteChatFile, deleteChatMedia, fileIcon, formatSize, sendChatFile, sendVoiceMessage } from "../../../lib/chatFiles";
import ChatAttachment from "../components/ChatAttachment";
import ChatMedia from "../components/ChatMedia";
import CensoredText from "../../../components/CensoredText";
import VoiceRecorder from "../components/VoiceRecorder";
import PaymentCard from "../components/PaymentCard";
import RequestPaymentDialog from "../components/RequestPaymentDialog";
import { listConversationPayments, watchConversationPayments } from "../../../lib/payments";

// Same upload rules as the Post a Service media dropzone.
const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];
const VIDEO_TYPES = ["video/mp4", "video/webm"];
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const MAX_VIDEO_BYTES = 50 * 1024 * 1024;

// "just now" / "5m ago" / "3h ago" -- used for the Sent/Delivered/Seen label.
function formatRelativeTime(dateString) {
  if (!dateString) return "";
  const diffSec = Math.max(0, Math.floor((Date.now() - new Date(dateString).getTime()) / 1000));
  if (diffSec < 30) return "just now";
  if (diffSec < 60) return `${diffSec}s ago`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  return `${Math.floor(diffHr / 24)}d ago`;
}

export default function ChatView() {
  const { conversationId } = useParams();
  const { currentUserId, showToast, refreshUnreadCount, openPreview, suspension, accountType, isPro } = useOutletContext();
  // Suspended for a messaging violation (e.g. harassment): they can read this
  // chat, but can't send, forward, or edit messages.
  const messagingBlocked = isMessagingBlocked(suspension);
  const navigate = useNavigate();
  const [otherProfile, setOtherProfile] = useState(null);
  // The person being reported (null = Report popup closed).
  const [reportTarget, setReportTarget] = useState(null);
  // The payment cards of this chat by payment id, and the "Request payment"
  // window (PLAN-gcash-payments.md). paymentsKey goes up when a card changed.
  const [payments, setPayments] = useState({});
  const [paymentsKey, setPaymentsKey] = useState(0);
  const [requestOpen, setRequestOpen] = useState(false);
  const [otherLastReadAt, setOtherLastReadAt] = useState(null);
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
  const [forwardQuery, setForwardQuery] = useState("");
  const [forwarding, setForwarding] = useState(false);

  const [uploadingMedia, setUploadingMedia] = useState(false);
  const [pendingMedia, setPendingMedia] = useState(null); // { file, mediaType, previewUrl }
  const fileInputRef = useRef(null);
  // The paperclip's own picker (documents), and the mic's recording popup.
  const docInputRef = useRef(null);
  const [showRecorder, setShowRecorder] = useState(false);

  // The voice/video call going on (if any), so the call buttons can't start a second one.
  const activeCall = useCall();
  const inCall = Boolean(activeCall && activeCall.stage !== "ended");

  // The Verified check for the person in this chat and the forward list.
  const verifiedIds = useVerifiedIds([currentUserId, otherProfile?.id, ...(forwardConversations || []).map((c) => c.otherId)]);
  // "Online" / "Offline 5m ago" under the other person's name.
  const otherStatus = presenceStatus(usePresence([otherProfile?.id]).get(otherProfile?.id));

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

  // The payment cards in this chat: read when the chat opens, when a new card
  // arrives, when one was changed here, and when the other person pays or answers.
  const paymentCardCount = messages?.filter((m) => m.attachment_type === "payment").length ?? 0;
  useEffect(() => {
    if (!conversationId) return undefined;
    let active = true;
    const load = async () => {
      const { data } = await listConversationPayments(conversationId);
      if (active && data) setPayments(Object.fromEntries(data.map((payment) => [payment.id, payment])));
    };
    load();
    const stop = watchConversationPayments(conversationId, load);
    return () => {
      active = false;
      stop();
    };
  }, [conversationId, paymentCardCount, paymentsKey]);

  useEffect(() => {
    if (!conversationId || !currentUserId) return;
    let active = true;

    (async () => {
      const { data: conversation, error: conversationError } = await supabase
        .from("conversations")
        .select(`
          id, user_a, user_b, user_a_last_read_at, user_b_last_read_at,
          a:profiles!conversations_user_a_fkey(id, full_name, username, avatar_path, account_type),
          b:profiles!conversations_user_b_fkey(id, full_name, username, avatar_path, account_type)
        `)
        .eq("id", conversationId)
        .maybeSingle();

      if (!active) return;
      if (conversationError || !conversation) {
        setNotFound(true);
        return;
      }
      const isUserA = conversation.user_a === currentUserId;
      setOtherProfile(isUserA ? conversation.b : conversation.a);
      setOtherLastReadAt(isUserA ? conversation.user_b_last_read_at : conversation.user_a_last_read_at);

      const { data: messageRows, error: messagesError } = await supabase
        .from("messages")
        .select("id, sender_id, body, created_at, edited_at, delivered_at, unsent_at, attachment_url, attachment_type, attachment_name, attachment_size, call_id, payment_id")
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
      .on(
        // Keeps "Seen" live: fires when the other person opens this chat
        // (mark_conversation_read) or a new message updates last_message_at.
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "conversations", filter: `id=eq.${conversationId}` },
        (payload) => {
          const isUserA = payload.new.user_a === currentUserId;
          setOtherLastReadAt(isUserA ? payload.new.user_b_last_read_at : payload.new.user_a_last_read_at);
        }
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

  // Unsend keeps the message as a line ("Maria unsent a message"): the database
  // empties its text and file link and sets unsent_at (unsend_message(), see
  // database/supabase_chat_unsent_schema.sql).
  const confirmUnsend = async () => {
    setDeleting(true);
    const { error } = await supabase.rpc("unsend_message", { target_message_id: deleteTarget.id });
    if (!error) {
      // Shown at once; the live update from the database says the same.
      setMessages((prev) => prev?.map((m) => (m.id === deleteTarget.id
        ? { ...m, unsent_at: new Date().toISOString(), body: null, edited_at: null, attachment_url: null, attachment_type: null, attachment_name: null, attachment_size: null }
        : m)) ?? prev);
    }
    // An unsent file, voice message, photo or video is deleted from storage too.
    if (!error && (deleteTarget.attachment_type === "file" || deleteTarget.attachment_type === "audio")) {
      await deleteChatFile(deleteTarget.attachment_url);
    } else if (!error && (deleteTarget.attachment_type === "image" || deleteTarget.attachment_type === "video")) {
      await deleteChatMedia(deleteTarget.attachment_url);
    }
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
    setForwardQuery("");

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
        return { id: c.id, otherId: other?.id, name: other?.full_name || other?.username || "Unknown user" };
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

  const filteredForwardConversations = forwardConversations?.filter((c) =>
    c.name.toLowerCase().includes(forwardQuery.trim().toLowerCase())
  );

  const handleMediaButtonClick = () => fileInputRef.current?.click();

  // The phone / camera buttons: calls the other person (see lib/calls.js;
  // problems like a blocked microphone show in the call window).
  const handleCall = (kind) => {
    if (!otherProfile || inCall) return;
    startCall({
      conversationId,
      kind,
      other: {
        id: otherProfile.id,
        name: otherProfile.full_name || otherProfile.username || "User",
        avatarPath: otherProfile.avatar_path || ""
      }
    });
  };

  // Picking a file only stages it for review -- confirmSendMedia (triggered
  // by the preview's Send button) is what actually uploads and sends it.
  const handleFileChange = (event) => {
    const file = event.target.files?.[0];
    event.target.value = ""; // lets the same file be picked again later
    if (!file) return;

    let mediaType;
    if (IMAGE_TYPES.includes(file.type)) {
      if (file.size > MAX_IMAGE_BYTES) {
        showToast?.("Photos must be 5 MB or smaller.");
        return;
      }
      mediaType = "image";
    } else if (VIDEO_TYPES.includes(file.type)) {
      if (file.size > MAX_VIDEO_BYTES) {
        showToast?.("Videos must be 50 MB or smaller.");
        return;
      }
      mediaType = "video";
    } else {
      showToast?.("Only JPG, PNG, WebP photos or MP4, WebM videos are allowed.");
      return;
    }

    setPendingMedia({ file, mediaType, previewUrl: URL.createObjectURL(file) });
  };

  // The paperclip: a document (PDF, Word, Excel, PowerPoint, TXT). Like a
  // photo, it's shown in the "Send?" popup first (lib/chatFiles.js checks it).
  const handleDocChange = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = ""; // lets the same file be picked again later
    if (!file) return;
    // Premium sends documents up to 50 MB instead of 10 MB.
    const problem = await checkChatFile(file, Boolean(isPro));
    if (problem) {
      showToast?.(problem);
      return;
    }
    setPendingMedia({ file, mediaType: "file", previewUrl: null });
  };

  // The mic popup's Send: returns true when sent, so the popup can close.
  const handleSendVoice = async (recording) => {
    const problem = await sendVoiceMessage(conversationId, currentUserId, recording);
    if (problem) showToast?.(problem);
    return !problem;
  };

  const cancelSendMedia = () => {
    if (pendingMedia?.previewUrl) URL.revokeObjectURL(pendingMedia.previewUrl);
    setPendingMedia(null);
  };

  const confirmSendMedia = async () => {
    const { file, mediaType, previewUrl } = pendingMedia;
    setUploadingMedia(true);

    // Documents go to the private chat-files storage (lib/chatFiles.js).
    if (mediaType === "file") {
      const problem = await sendChatFile(conversationId, currentUserId, file);
      setUploadingMedia(false);
      setPendingMedia(null);
      if (problem) showToast?.(problem);
      return;
    }

    const extension = file.type.split("/")[1];
    const path = `${conversationId}/${currentUserId}-${Date.now()}.${extension}`;
    const { error: uploadError } = await supabase.storage.from("chat-attachments").upload(path, file);
    if (uploadError) {
      setUploadingMedia(false);
      showToast?.(`Couldn't upload that ${mediaType}. Please try again.`);
      return;
    }

    // The message keeps only the file's path; the chat opens it through a link
    // that expires (the bucket is private, see lib/chatFiles.js).
    const { error: insertError } = await supabase.from("messages").insert({
      conversation_id: conversationId,
      sender_id: currentUserId,
      attachment_url: path,
      attachment_type: mediaType
    });
    if (insertError) await deleteChatMedia(path); // don't leave an unused file behind
    setUploadingMedia(false);
    URL.revokeObjectURL(previewUrl);
    setPendingMedia(null);
    if (insertError) showToast?.(`Couldn't send that ${mediaType}. Please try again.`);
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
  // The other person's public page (their picture and name link to it).
  const otherPath = otherProfile ? profilePath(otherProfile.account_type, otherProfile.id) : null;
  // Call lines and unsent messages don't get the Sent / Delivered / Seen label.
  const lastMineId = [...(messages || [])].reverse().find((m) => m.sender_id === currentUserId && !m.call_id && !m.unsent_at && m.attachment_type !== "payment")?.id;

  // The "Request payment" button: only a verified freelancer who can send
  // messages. (The database checks the rest and says why in plain words.)
  const canRequestPayment = accountType === "freelancer" && Boolean(otherProfile) && verifiedIds.has(currentUserId) && !messagingBlocked;

  // Opens the Report popup with this chat's messages to tick, so admins (who
  // can't read chats) see what happened. From the header flag: the last 10 are
  // ticked. From one message (aroundId): that one and 2 either side, and the
  // report remembers which one it was (focusId) so the admin sees it marked.
  const openReport = (aroundId = null) => {
    setReportTarget({
      type: "user",
      id: otherProfile.id,
      name: recipientName,
      chat: { ...pickReportMessages(messages || [], aroundId), meId: currentUserId, focusId: aroundId }
    });
  };

  // The Report button on a payment card answered "Not received": the same popup,
  // with the payment ready to be sent along with the report (and the last messages
  // of the chat ticked, like from the header flag).
  const openPaymentReport = (payment) => {
    setReportTarget({
      type: "user",
      id: otherProfile.id,
      name: recipientName,
      payment,
      chat: { ...pickReportMessages(messages || []), meId: currentUserId, focusId: null }
    });
  };

  return (
    <section className="dashboard-view active-view">
      <div className="chat-card glass-card rounded-4 border border-secondary border-opacity-25 overflow-hidden d-flex flex-column">
        {/* One line on a phone too: a long name ends in "..." so the call
            buttons stay beside it (min-w-0 lets the name shrink). */}
        <div className="chat-header p-2 p-sm-3 bg-dark border-bottom border-secondary border-opacity-25 d-flex align-items-center justify-content-between gap-2">
          <div className="d-flex align-items-center gap-2 gap-sm-3 min-w-0">
            <button className="btn btn-sm btn-dark text-secondary flex-shrink-0" onClick={() => navigate("/dashboard/inbox")} aria-label="Back to Inbox">
              <i className="bi bi-arrow-left fs-5"></i>
            </button>
            <Avatar path={otherProfile?.avatar_path} name={otherProfile ? recipientName : ""} size={40} to={otherPath} />
            <div className="min-w-0">
              <h6 className="text-white fw-bold mb-0 text-truncate">
                {otherPath
                  ? <Link to={otherPath} className="text-white text-decoration-none hover-role">{recipientName}</Link>
                  : recipientName}
                <VerifiedBadge verified={verifiedIds.has(otherProfile?.id)} />
              </h6>
              {otherStatus && (
                <small className={`fs-8 d-flex align-items-center gap-1 ${otherStatus.online ? "text-success" : "text-secondary"}`}>
                  {otherStatus.online && <span className="presence-dot"></span>}
                  {otherStatus.label}
                </small>
              )}
            </div>
          </div>
          <div className="d-flex flex-shrink-0">
            {/* Suspended from messaging: no calls either (the database checks too). */}
            {!messagingBlocked && (
              <>
                {canRequestPayment && (
                  <button
                    type="button"
                    className="btn btn-sm btn-outline-role rounded-pill px-2 px-sm-3 me-1 fw-bold"
                    title="Request payment"
                    aria-label="Request payment"
                    onClick={() => setRequestOpen(true)}
                  >
                    <i className="bi bi-cash-coin"></i><span className="d-none d-sm-inline ms-1">Request payment</span>
                  </button>
                )}
                <button
                  className="btn btn-sm btn-outline-secondary text-white border-0"
                  title="Voice call"
                  aria-label="Voice call"
                  disabled={!otherProfile || inCall}
                  onClick={() => handleCall("voice")}
                >
                  <i className="bi bi-telephone-fill fs-5"></i>
                </button>
                <button
                  className="btn btn-sm btn-outline-secondary text-white border-0"
                  title="Video call"
                  aria-label="Video call"
                  disabled={!otherProfile || inCall}
                  onClick={() => handleCall("video")}
                >
                  <i className="bi bi-camera-video-fill fs-5"></i>
                </button>
              </>
            )}
            {otherProfile && (
              <button
                className="btn btn-sm btn-outline-secondary text-white border-0"
                title="Report this user"
                aria-label="Report this user"
                onClick={() => openReport()}
              >
                <i className="bi bi-flag-fill fs-5"></i>
              </button>
            )}
          </div>
        </div>

        <div ref={streamRef} className="chat-body flex-grow-1 p-3 p-md-4 overflow-y-auto d-flex flex-column gap-3 bg-black bg-opacity-40">
          {messages === null && <p className="text-secondary fs-7 text-center mb-0">Loading messages...</p>}
          {messages !== null && messages.length === 0 && (
            <p className="text-secondary fs-7 text-center mb-0">No messages yet. Say hello!</p>
          )}
          {messages?.map((m, index) => {
            // Messenger-style "—— Tuesday 4:12 AM ——" line above the first
            // message and after an hour or more of silence (lib/chatTime.js).
            const divider = needsTimeDivider(messages[index - 1], m) && (
              <div className="chat-time-divider fs-8 text-white-50">
                <span>{timeDividerLabel(m.created_at)}</span>
              </div>
            );

            // A finished call, written by the database: a small line in the
            // middle ("Video call, 3:12", "Missed voice call"), with no
            // right-click menu.
            if (m.call_id) {
              const isVideo = /video/i.test(m.body);
              const notAnswered = m.body.startsWith("Missed") || m.body.startsWith("Declined");
              return (
                <Fragment key={m.id}>
                  {divider}
                  <div className="align-self-center d-flex align-items-center gap-2 px-3 py-2 rounded-pill bg-dark bg-opacity-75 border border-secondary border-opacity-25 fs-8 text-white-50">
                    <i className={`bi ${isVideo ? "bi-camera-video-fill" : "bi-telephone-fill"} ${notAnswered ? "text-danger" : "text-role"}`}></i>
                    <span className="text-white">{m.body}</span>
                    <span>{new Date(m.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                  </div>
                </Fragment>
              );
            }

            // A payment request card (made by the database, see request_payment()):
            // it changes as the payment moves, and has no right-click menu.
            if (m.attachment_type === "payment") {
              const payment = payments[m.payment_id];
              return (
                <Fragment key={m.id}>
                  {divider}
                  {payment ? (
                    <PaymentCard
                      payment={payment}
                      currentUserId={currentUserId}
                      otherName={recipientName}
                      showToast={showToast}
                      onChanged={() => setPaymentsKey((n) => n + 1)}
                      onReport={openPaymentReport}
                    />
                  ) : (
                    <p className="align-self-center text-secondary fs-8 mb-0">{m.body || "Payment request"}</p>
                  )}
                </Fragment>
              );
            }

            const isMe = m.sender_id === currentUserId;

            // An unsent message: an empty outlined bubble on its sender's side,
            // like the message it was, with no right-click menu (its text and
            // file are gone).
            if (m.unsent_at) {
              return (
                <Fragment key={m.id}>
                  {divider}
                  <div
                    data-unsent
                    className={`chat-bubble ${isMe ? "outgoing align-self-end" : "incoming align-self-start"} px-3 py-2 rounded-4 border border-secondary border-opacity-50 text-white-50`}
                  >
                    <div className={`d-flex ${isMe ? "justify-content-end" : ""}`}>
                      <small className="fs-8">{new Date(m.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</small>
                    </div>
                    <p className="mb-0 fs-7 fst-italic">
                      <i className="bi bi-slash-circle me-2"></i>
                      {isMe ? "You unsent a message" : `${recipientName} unsent a message`}
                    </p>
                  </div>
                </Fragment>
              );
            }

            const isEditingThis = editingMessage?.id === m.id;
            return (
              <Fragment key={m.id}>
                {divider}
                <div
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
                      {m.attachment_url && (m.attachment_type === "image" || m.attachment_type === "video") && (
                        <ChatMedia message={m} openPreview={openPreview} />
                      )}
                      {m.attachment_url && (m.attachment_type === "file" || m.attachment_type === "audio") && (
                        <ChatAttachment message={m} showToast={showToast} />
                      )}
                      {m.body && <p className="mb-0 fs-7"><CensoredText text={m.body} /></p>}
                      {m.edited_at && <small className="fs-9 text-white-50 fst-italic">(edited)</small>}
                      {isMe && m.id === lastMineId && (
                        <small className="fs-9 text-white-50 d-block text-end mt-1">
                          {otherLastReadAt && new Date(otherLastReadAt) >= new Date(m.created_at)
                            ? `Seen ${formatRelativeTime(otherLastReadAt)}`
                            : m.delivered_at
                            ? `Delivered ${formatRelativeTime(m.delivered_at)}`
                            : `Sent ${formatRelativeTime(m.created_at)}`}
                        </small>
                      )}
                    </>
                  )}
                </div>
              </Fragment>
            );
          })}
        </div>

        <div className="chat-footer p-2 p-sm-3 bg-dark border-top border-secondary border-opacity-25">
          {messagingBlocked && <BlockedNotice suspension={suspension} what="send messages" compact />}
          {!messagingBlocked && (
            <form className="d-flex align-items-center gap-1 gap-sm-2" onSubmit={handleSubmit}>
              <input
                type="file"
                ref={fileInputRef}
                accept="image/jpeg,image/png,image/webp,video/mp4,video/webm"
                style={{ display: "none" }}
                onChange={handleFileChange}
              />
              <input
                type="file"
                ref={docInputRef}
                accept={FILE_ACCEPT}
                style={{ display: "none" }}
                onChange={handleDocChange}
              />
              {/* Paperclip = documents, picture = photo/video, mic = voice
                  message. Tighter padding on phones leaves room for typing. */}
              <button type="button" className="btn btn-dark text-secondary px-1 px-sm-2 py-2 flex-shrink-0" onClick={() => docInputRef.current?.click()} disabled={uploadingMedia} title="Send a file" aria-label="Send a file">
                <i className="bi bi-paperclip fs-5"></i>
              </button>
              <button type="button" className="btn btn-dark text-secondary px-1 px-sm-2 py-2 flex-shrink-0" onClick={handleMediaButtonClick} disabled={uploadingMedia} title="Send a photo or video" aria-label="Send a photo or video">
                <i className="bi bi-image fs-5"></i>
              </button>
              <button type="button" className="btn btn-dark text-secondary px-1 px-sm-2 py-2 flex-shrink-0" onClick={() => setShowRecorder(true)} disabled={uploadingMedia} title="Record a voice message" aria-label="Record a voice message">
                <i className="bi bi-mic fs-5"></i>
              </button>

              <input
                type="text"
                className="form-control bg-secondary bg-opacity-25 border-0 text-white rounded-pill px-3 px-sm-4 py-2 min-w-0"
                placeholder="Type a message..."
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                required
              />

              <button type="submit" className="btn btn-gradient-role rounded-circle p-2 text-white d-flex align-items-center justify-content-center flex-shrink-0" style={{ width: 42, height: 42 }}>
                <i className="bi bi-send-fill fs-5"></i>
              </button>
            </form>
          )}
        </div>
      </div>

      {contextMenu && (
        <div
          className="dropdown-menu dropdown-menu-dark show border border-secondary border-opacity-25 shadow-lg p-2"
          style={{ position: "fixed", top: contextMenu.y, left: contextMenu.x, zIndex: 1200, minWidth: 180 }}
          onClick={(event) => event.stopPropagation()}
        >
          {/* Copy / Forward / Edit only make sense for a message with text
              (not a photo, video, file or voice message on its own). */}
          {contextMenu.message.body && (
            <button type="button" className="dropdown-item rounded-2 text-white d-flex align-items-center" onClick={() => handleCopy(contextMenu.message)}>
              <i className="bi bi-clipboard me-2 text-info"></i> Copy Text
            </button>
          )}
          {!messagingBlocked && contextMenu.message.body && (
            <button type="button" className="dropdown-item rounded-2 text-white d-flex align-items-center" onClick={() => openForwardPicker(contextMenu.message)}>
              <i className="bi bi-arrow-90deg-right me-2 text-warning"></i> Forward Text
            </button>
          )}
          {contextMenu.message.sender_id === currentUserId && (
            <>
              {!messagingBlocked && contextMenu.message.body && (
                <button type="button" className="dropdown-item rounded-2 text-white d-flex align-items-center" onClick={() => startEdit(contextMenu.message)}>
                  <i className="bi bi-pencil me-2 text-orange"></i> Edit Text
                </button>
              )}
              <button type="button" className="dropdown-item rounded-2 text-danger d-flex align-items-center" onClick={() => requestUnsend(contextMenu.message)}>
                <i className="bi bi-trash3 me-2"></i> Unsend
              </button>
            </>
          )}
          {/* A message from the other person can be reported: the popup opens
              with it and the messages around it ticked. */}
          {contextMenu.message.sender_id !== currentUserId && (
            <button
              type="button"
              className="dropdown-item rounded-2 text-danger d-flex align-items-center"
              onClick={() => { setContextMenu(null); openReport(contextMenu.message.id); }}
            >
              <i className="bi bi-flag me-2"></i> Report Message
            </button>
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

            {forwardConversations !== null && forwardConversations.length === 0 && (
              <p className="text-secondary fs-7 mb-0">No other conversations to forward to.</p>
            )}

            {forwardConversations !== null && forwardConversations.length > 0 && (
              <div className="position-relative mb-3">
                <i className="bi bi-search search-icon text-secondary"></i>
                <input
                  type="search"
                  className="form-control nav-search-input"
                  placeholder="Search contacts..."
                  value={forwardQuery}
                  onChange={(event) => setForwardQuery(event.target.value)}
                  autoFocus
                />
              </div>
            )}

            {forwardConversations?.length > 0 && filteredForwardConversations.length === 0 && (
              <p className="text-secondary fs-7 mb-0">No contacts match "{forwardQuery}".</p>
            )}

            <div className="d-flex flex-column gap-2" style={{ maxHeight: 260, overflowY: "auto" }}>
              {filteredForwardConversations?.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  className="btn btn-outline-secondary text-white text-start rounded-3"
                  disabled={forwarding}
                  onClick={() => handleForward(c.id)}
                >
                  {c.name}
                  <VerifiedBadge verified={verifiedIds.has(c.otherId)} />
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

      {pendingMedia && (
        <div
          className="position-fixed top-0 start-0 w-100 h-100 d-flex align-items-center justify-content-center"
          style={{ background: "rgba(0,0,0,0.65)", zIndex: 1300 }}
          onClick={uploadingMedia ? undefined : cancelSendMedia}
        >
          <div
            className="bg-dark text-white border border-secondary border-opacity-25 rounded-4 p-4"
            style={{ maxWidth: 420, width: "100%" }}
            onClick={(event) => event.stopPropagation()}
          >
            <h6 className="fw-bold mb-3">Send {pendingMedia.mediaType === "video" ? "video" : pendingMedia.mediaType === "file" ? "this file" : "photo"}?</h6>
            <div className="text-center mb-3">
              {pendingMedia.mediaType === "image" && (
                <img src={pendingMedia.previewUrl} alt="Preview" className="img-fluid rounded-3" style={{ maxHeight: 320 }} />
              )}
              {pendingMedia.mediaType === "video" && (
                <video src={pendingMedia.previewUrl} controls className="rounded-3" style={{ maxHeight: 320, maxWidth: "100%" }} />
              )}
              {pendingMedia.mediaType === "file" && (
                <div className="d-flex align-items-center gap-3 text-start p-3 rounded-3 bg-secondary bg-opacity-25">
                  <i className={`bi ${fileIcon(pendingMedia.file.name)} fs-1 text-role flex-shrink-0`}></i>
                  <div className="overflow-hidden">
                    <div className="fw-semibold fs-7 text-truncate">{pendingMedia.file.name}</div>
                    <small className="text-white-50 fs-8">{formatSize(pendingMedia.file.size)}</small>
                  </div>
                </div>
              )}
            </div>
            <div className="d-flex gap-2 justify-content-end">
              <button type="button" className="btn btn-outline-secondary text-white-50 rounded-pill px-4 py-2 fw-bold" onClick={cancelSendMedia} disabled={uploadingMedia}>
                Cancel
              </button>
              <button type="button" className="btn btn-gradient-role rounded-pill px-4 py-2 fw-bold text-white" onClick={confirmSendMedia} disabled={uploadingMedia}>
                {uploadingMedia ? "Sending..." : "Send"}
              </button>
            </div>
          </div>
        </div>
      )}

      {showRecorder && <VoiceRecorder onSend={handleSendVoice} onClose={() => setShowRecorder(false)} />}

      <DeleteConfirmDialog
        open={!!deleteTarget}
        title="Unsend this message?"
        message="Its text or file is removed for everyone in this conversation, and they will see that you unsent a message. This can't be undone."
        confirmLabel="Unsend"
        busyLabel="Unsending..."
        busy={deleting}
        onConfirm={confirmUnsend}
        onCancel={() => setDeleteTarget(null)}
      />

      <ReportDialog target={reportTarget} onClose={() => setReportTarget(null)} onDone={showToast} />

      {requestOpen && (
        <RequestPaymentDialog
          userId={currentUserId}
          conversationId={conversationId}
          otherName={recipientName}
          onClose={() => setRequestOpen(false)}
          onSent={() => {
            setRequestOpen(false);
            setPaymentsKey((n) => n + 1);
            showToast?.(`Payment request sent to ${recipientName}.`);
          }}
        />
      )}
    </section>
  );
}
