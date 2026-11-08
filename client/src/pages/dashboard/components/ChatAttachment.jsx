import { useEffect, useState } from "react";
import { downloadChatFile, fileIcon, formatSize, openChatFile, showVoiceLength } from "../../../lib/chatFiles";
import { Busy } from "../../../components/Loaders";

// A file or voice message inside a chat bubble (lib/chatFiles.js). Both are
// private: a document opens through its own short-lived link, and a voice
// message is downloaded by the signed-in person (never a public link).
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
        <small className="text-white-50 fs-8">{opening ? <Busy>Opening</Busy> : formatSize(message.attachment_size)}</small>
      </span>
    </button>
  );
}

// A voice message: the audio player, once the whole recording is downloaded.
// Playing it from the browser's memory means it never stops halfway to load
// more on a slow connection (it used to stream, and cut in and out).
function VoicePlayer({ path }) {
  // null while it downloads, "" if it failed, otherwise a local blob: link.
  const [link, setLink] = useState(null);

  useEffect(() => {
    let active = true;
    let url = "";
    downloadChatFile(path).then((blob) => {
      if (!active) return;
      url = blob ? URL.createObjectURL(blob) : "";
      setLink(url);
    });
    return () => {
      active = false;
      if (url) URL.revokeObjectURL(url); // frees the memory when the message leaves the screen
    };
  }, [path]);

  if (link === null) return <small className="text-white-50 fs-8 d-block mb-1"><Busy>Loading voice message</Busy></small>;
  if (!link) return <small className="text-white-50 fs-8 d-block mb-1"><i className="bi bi-mic-mute-fill me-1"></i>Couldn't load this voice message.</small>;
  return (
    <audio
      src={link}
      controls
      className="d-block mb-1"
      style={{ maxWidth: 260, width: "100%" }}
      onLoadedMetadata={(event) => showVoiceLength(event.currentTarget)}
    ></audio>
  );
}
