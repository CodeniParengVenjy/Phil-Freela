import { useEffect, useState } from "react";
import { chatFileLink, fileIcon, formatSize, openChatFile } from "../../../lib/chatFiles";

// Voice message links last an hour, plenty for listening while the chat is open.
const VOICE_LINK_SECONDS = 60 * 60;

// A file or voice message inside a chat bubble (lib/chatFiles.js). Both are
// private, so each one gets its own short-lived link instead of a public one.
export default function ChatAttachment({ message, showToast }) {
  if (message.attachment_type === "audio") return <VoicePlayer path={message.attachment_url} />;
  return <FileCard message={message} showToast={showToast} />;
}

// A document: icon, name and size. Clicking it opens or downloads it.
function FileCard({ message, showToast }) {
  const [opening, setOpening] = useState(false);

  const handleOpen = async () => {
    setOpening(true);
    const problem = await openChatFile(message.attachment_url);
    setOpening(false);
    if (problem) showToast?.(problem);
  };

  return (
    <button
      type="button"
      className="btn btn-dark bg-opacity-50 border border-secondary border-opacity-25 rounded-3 d-flex align-items-center gap-3 text-start text-white mb-1 w-100"
      style={{ maxWidth: 280 }}
      onClick={handleOpen}
      disabled={opening}
      title="Open file"
    >
      <i className={`bi ${fileIcon(message.attachment_name)} fs-2 text-role flex-shrink-0`}></i>
      <span className="overflow-hidden">
        <span className="d-block fw-semibold fs-7 text-truncate">{message.attachment_name || "File"}</span>
        <small className="text-white-50 fs-8">{opening ? "Opening..." : formatSize(message.attachment_size)}</small>
      </span>
    </button>
  );
}

// A voice message: the audio player, once its private link is ready.
function VoicePlayer({ path }) {
  // null while the link loads, "" if it failed.
  const [link, setLink] = useState(null);

  useEffect(() => {
    let active = true;
    chatFileLink(path, VOICE_LINK_SECONDS).then((url) => {
      if (active) setLink(url || "");
    });
    return () => {
      active = false;
    };
  }, [path]);

  if (link === null) return <small className="text-white-50 fs-8 d-block mb-1"><i className="bi bi-mic-fill me-1"></i>Loading voice message...</small>;
  if (!link) return <small className="text-white-50 fs-8 d-block mb-1"><i className="bi bi-mic-mute-fill me-1"></i>Couldn't load this voice message.</small>;
  return <audio src={link} controls className="d-block mb-1" style={{ maxWidth: 260, width: "100%" }}></audio>;
}
