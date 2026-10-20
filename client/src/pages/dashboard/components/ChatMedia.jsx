import { useEffect, useState } from "react";
import { chatMediaLink } from "../../../lib/chatFiles";

// A photo or video inside a chat bubble (lib/chatFiles.js). The file is
// private, so it is shown through a short-lived link instead of a public one.
export default function ChatMedia({ message, openPreview }) {
  // null while the link loads, "" if it failed.
  const [link, setLink] = useState(null);
  const isVideo = message.attachment_type === "video";

  useEffect(() => {
    let active = true;
    chatMediaLink(message.attachment_url).then((url) => {
      if (active) setLink(url || "");
    });
    return () => {
      active = false;
    };
  }, [message.attachment_url]);

  if (link === null) {
    return (
      <small className="text-white-50 fs-8 d-block mb-1">
        <i className={`bi ${isVideo ? "bi-camera-video-fill" : "bi-image-fill"} me-1`}></i>Loading {isVideo ? "video" : "photo"}...
      </small>
    );
  }
  if (!link) {
    return (
      <small className="text-white-50 fs-8 d-block mb-1">
        <i className="bi bi-exclamation-circle me-1"></i>Couldn't load this {isVideo ? "video" : "photo"}.
      </small>
    );
  }
  if (isVideo) return <video src={link} controls className="rounded-3 mb-1 d-block" style={{ maxWidth: 240 }} />;
  return (
    <img
      src={link}
      alt="Sent"
      className="rounded-3 mb-1 d-block"
      style={{ maxWidth: 240, maxHeight: 240, objectFit: "cover", cursor: "pointer" }}
      onClick={() => openPreview?.(link, "Photo")}
    />
  );
}
