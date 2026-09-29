import { supabase } from "./supabaseClient";

// Files (paperclip) and voice messages (mic) sent in a chat. They're stored in
// the PRIVATE "chat-files" bucket (database/supabase_chat_files_schema.sql),
// one folder per conversation, and only the two people in that conversation
// can open them, through links that expire (Data Privacy Act, RA 10173).
const BUCKET = "chat-files";
const MAX_FILE_BYTES = 10 * 1024 * 1024;
export const MAX_VOICE_SECONDS = 120;

// DOCX, XLSX and PPTX files are ZIP packages inside, so they start with "PK".
const ZIP_START = "PK\u0003\u0004";

// The documents that can be sent. `start` is how a real file of that type
// begins ("magic bytes"), so a renamed file, like a program named report.pdf,
// is refused.
const FILE_TYPES = {
  pdf: { mime: "application/pdf", icon: "bi-file-earmark-pdf-fill", start: "%PDF-" },
  docx: { mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", icon: "bi-file-earmark-word-fill", start: ZIP_START },
  xlsx: { mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", icon: "bi-file-earmark-excel-fill", start: ZIP_START },
  pptx: { mime: "application/vnd.openxmlformats-officedocument.presentationml.presentation", icon: "bi-file-earmark-ppt-fill", start: ZIP_START },
  txt: { mime: "text/plain", icon: "bi-file-earmark-text-fill", start: null }
};

// For the file picker: only these can be chosen.
export const FILE_ACCEPT = Object.keys(FILE_TYPES).map((extension) => `.${extension}`).join(",");

function extensionOf(name) {
  const match = /\.([a-z0-9]+)$/i.exec(name || "");
  return match ? match[1].toLowerCase() : "";
}

// The Bootstrap icon for a file name (a PDF icon for .pdf, and so on).
export function fileIcon(name) {
  return FILE_TYPES[extensionOf(name)]?.icon || "bi-file-earmark-fill";
}

// 1536 -> "1.5 KB", 2400000 -> "2.3 MB".
export function formatSize(bytes) {
  if (!bytes && bytes !== 0) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// Checks a picked document. Returns "" when it can be sent, or a message.
export async function checkChatFile(file) {
  const type = FILE_TYPES[extensionOf(file.name)];
  if (!type) return "Only PDF, Word (DOCX), Excel (XLSX), PowerPoint (PPTX) or TXT files can be sent.";
  if (file.size === 0) return "That file is empty.";
  if (file.size > MAX_FILE_BYTES) return "Files must be 10 MB or smaller.";
  if (type.start && (await file.slice(0, type.start.length).text()) !== type.start) {
    return "That file isn't what its name says. Please send the original file.";
  }
  // A text file has no "start" to check, but a real one never contains a zero byte.
  if (!type.start && (await file.slice(0, 4096).text()).includes("\u0000")) {
    return "That file isn't a plain text file.";
  }
  return "";
}

// Uploads the file, then sends the chat message that points to it.
// Returns "" when sent, or a message to show.
async function sendAttachment(conversationId, senderId, blob, { type, name, mime, extension }) {
  // The sender's id starts the file name: only they can delete it (unsend).
  const path = `${conversationId}/${senderId}-${Date.now()}.${extension}`;
  const { error: uploadError } = await supabase.storage.from(BUCKET).upload(path, blob, { contentType: mime });
  if (uploadError) {
    console.error("Chat file upload failed:", uploadError);
    return "Couldn't upload that. Please try again.";
  }

  const { error } = await supabase.from("messages").insert({
    conversation_id: conversationId,
    sender_id: senderId,
    attachment_url: path,
    attachment_type: type,
    attachment_name: name,
    attachment_size: blob.size
  });
  if (error) {
    await supabase.storage.from(BUCKET).remove([path]); // don't leave an unused file behind
    console.error("Sending the chat file failed:", error);
    return "Couldn't send that. Please try again.";
  }
  return "";
}

// Sends a document picked with the paperclip (check it with checkChatFile first).
export function sendChatFile(conversationId, senderId, file) {
  const extension = extensionOf(file.name);
  return sendAttachment(conversationId, senderId, file, {
    type: "file",
    name: file.name.slice(-200),
    mime: FILE_TYPES[extension].mime,
    extension
  });
}

// Sends a voice message ({ blob, mime, extension } from VoiceRecorder).
export function sendVoiceMessage(conversationId, senderId, recording) {
  return sendAttachment(conversationId, senderId, recording.blob, {
    type: "audio",
    name: null,
    mime: recording.mime,
    extension: recording.extension
  });
}

// A link to a chat file that stops working after `seconds`.
export async function chatFileLink(path, seconds) {
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, seconds);
  return error ? null : data.signedUrl;
}

// Opens a document in a new tab (PDF and TXT show in the browser; the others
// download). The link only works for 60 seconds. Returns "" or a message.
export async function openChatFile(path) {
  // Open the tab right away (browsers block tabs opened after a wait), then
  // point it at the file once the link is ready.
  const tab = window.open("", "_blank");
  const link = await chatFileLink(path, 60);
  if (!link) {
    tab?.close();
    return "Couldn't open that file. Please try again.";
  }
  if (tab) tab.location.href = link;
  else window.location.href = link;
  return "";
}

// Deletes the stored file after its message is unsent. If this fails it only
// leaves an unused file behind, so it isn't treated as an error.
export async function deleteChatFile(path) {
  await supabase.storage.from(BUCKET).remove([path]);
}
