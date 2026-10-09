import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import PictureOwnershipCheck from "./PictureOwnershipCheck";
import TextOwnershipCheck from "./TextOwnershipCheck";
import VideoOwnershipCheck from "./VideoOwnershipCheck";

const TABS = [["picture", "bi-image", "Picture"], ["video", "bi-camera-video", "Video"], ["text", "bi-file-earmark-text", "Text"]];

// Check Ownership (watermarking system, steps 4, 6 and 7), as a popup opened
// from the "Check a file I found" button on Services and on the Portfolio:
// upload a picture or video you found somewhere (a screenshot, a download, a
// repost), or paste text, and the AI service reads the invisible code
// PhilFreela hides in every photo, video and document, to show whose work it
// is. (Files being posted are checked automatically as they are uploaded; this
// is for files found outside PhilFreela.) Escape, the X or a click beside it
// closes it.
export default function OwnershipCheckDialog({ onClose }) {
  // "picture", "video" or "text".
  const [mode, setMode] = useState("picture");

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return createPortal(
    <div
      className="role-confirm-backdrop"
      style={{
        position: "fixed", inset: 0, zIndex: 1250,
        background: "rgba(0,0,0,0.75)",
        display: "flex", alignItems: "center", justifyContent: "center", padding: "1rem"
      }}
      // Pressed down on the backdrop itself, so selecting pasted text and
      // letting go outside the box doesn't close it.
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="ownership-check-title"
        className="role-confirm-card bg-dark text-white border border-secondary border-opacity-25 rounded-4 p-4"
        style={{ maxWidth: 760, width: "100%", maxHeight: "92vh", overflowY: "auto" }}
      >
        <div className="d-flex justify-content-between align-items-start gap-3 mb-2">
          <h5 id="ownership-check-title" className="fw-bold mb-0"><i className="bi bi-shield-check text-role me-2"></i>Check Ownership</h5>
          <button type="button" className="btn btn-sm btn-outline-light rounded-circle flex-shrink-0" aria-label="Close" onClick={onClose}>
            <i className="bi bi-x-lg"></i>
          </button>
        </div>
        <p className="text-secondary fs-7 mb-3">
          Found someone's work somewhere else, like a screenshot, a download, a repost, or copied text? Check it here. Every
          photo and document posted on PhilFreela carries an <strong className="text-white">invisible code</strong>, and
          we'll tell you who it belongs to.
        </p>

        <div className="d-flex gap-2 mb-4">
          {TABS.map(([value, icon, label]) => (
            <button
              key={value}
              type="button"
              className={`btn btn-sm rounded-pill px-4 fw-bold ${mode === value ? "btn-gradient-role text-white" : "btn-outline-secondary text-white-50"}`}
              aria-pressed={mode === value}
              onClick={() => setMode(value)}
            >
              <i className={`bi ${icon} me-1`}></i>{label}
            </button>
          ))}
        </div>

        {mode === "text" ? <TextOwnershipCheck /> : mode === "video" ? <VideoOwnershipCheck /> : <PictureOwnershipCheck />}
      </div>
    </div>,
    document.body
  );
}
