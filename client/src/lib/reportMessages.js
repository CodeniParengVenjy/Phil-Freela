// Chat messages sent with a report (database/supabase_report_messages_schema.sql).
// Admins can't read anyone's chat, so the person reporting ticks the messages
// that show the problem and the database copies them next to the report.

// How many messages the popup lists, and how many are ticked to start with.
const LISTED = 30;
const TICKED_LAST = 10; // from the flag in the chat's header: the last 10
const TICKED_AROUND = 2; // from one message: that one, plus 2 before and 2 after

// What the popup shows for a chat. chat = all the messages (oldest first).
//   aroundId empty: the last 30 messages, the last 10 ticked.
//   aroundId = one message's id: 30 messages with that one in the middle (moved
//   when it is near either end of the chat), it and 2 each side ticked.
// Returns { messages, ticked: [ids] }.
export function pickReportMessages(chat, aroundId = null) {
  const index = aroundId ? chat.findIndex((m) => m.id === aroundId) : -1;
  if (index === -1) {
    const messages = chat.slice(-LISTED);
    return { messages, ticked: messages.slice(-TICKED_LAST).map((m) => m.id) };
  }
  const start = Math.max(0, Math.min(index - LISTED / 2, chat.length - LISTED));
  return {
    messages: chat.slice(start, start + LISTED),
    ticked: chat.slice(Math.max(0, index - TICKED_AROUND), index + TICKED_AROUND + 1).map((m) => m.id)
  };
}

// A message in words, for the popup and the admin's transcript. It works on a
// message of the chat (call_id) and on its copy in a report (is_call). A photo,
// video, voice message or file is only named, never shown: the file isn't
// copied. Returns { icon, label, text }; label is "" for plain text.
export function messageSummary(message) {
  const type = message.attachment_type;
  const text = message.body || "";
  if (message.call_id || message.is_call) {
    return { icon: /video/i.test(text) ? "bi-camera-video-fill" : "bi-telephone-fill", label: "", text };
  }
  if (type === "image") return { icon: "bi-image", label: "Photo", text };
  if (type === "video") return { icon: "bi-camera-video", label: "Video", text };
  if (type === "audio") return { icon: "bi-mic", label: "Voice message", text };
  if (type === "file") return { icon: "bi-paperclip", label: `File: ${message.attachment_name || "document"}`, text };
  return { icon: "", label: "", text };
}
