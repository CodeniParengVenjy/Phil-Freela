import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router-dom";

// The popup that shows a profile picture or a cover photo bigger, opened by
// clicking it on a profile page. Not full screen: the picture is shown at a
// comfortable size (a cover is wider than a profile picture) and Escape, the
// X, or a click outside closes it.
//   picture: { src, alt, kind: "picture" | "cover" } or null (closed)
//   onReport: when given, a Report button shows (someone else's picture)
//   changeTo: when given, a "Change" link to that page shows (your own picture)
export default function PictureViewer({ picture, onClose, onReport, changeTo }) {
  const closeButton = useRef(null);
  const open = Boolean(picture);

  // The close button gets focus when it opens, so the keyboard works right away.
  useEffect(() => {
    if (open) closeButton.current?.focus();
  }, [open]);

  // Escape closes it.
  useEffect(() => {
    if (!open) return undefined;
    const handleKeyDown = (event) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose]);

  if (!picture) return null;
  const isCover = picture.kind === "cover";

  return createPortal(
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 1400,
        background: "rgba(0,0,0,0.75)",
        display: "flex", alignItems: "center", justifyContent: "center", padding: "1rem"
      }}
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={picture.alt}
        className="bg-dark text-white border border-secondary border-opacity-25 rounded-4 p-3"
        // A cover is wide, a profile picture is square.
        style={{ width: `min(100%, ${isCover ? 880 : 460}px)`, maxHeight: "100%", overflowY: "auto" }}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="d-flex align-items-center justify-content-between gap-2 mb-2">
          <span className="fw-semibold fs-7 text-truncate">{isCover ? "Cover photo" : "Profile picture"}</span>
          <button ref={closeButton} type="button" className="btn btn-sm btn-outline-secondary text-white-50 rounded-circle p-0 d-flex align-items-center justify-content-center flex-shrink-0" style={{ width: 30, height: 30 }} aria-label="Close" onClick={onClose}>
            <i className="bi bi-x-lg"></i>
          </button>
        </div>

        <img
          src={picture.src}
          alt={picture.alt}
          className="d-block w-100 rounded-3 bg-black"
          style={{ maxHeight: "65vh", objectFit: "contain" }}
        />

        {(onReport || changeTo) && (
          <div className="d-flex justify-content-end gap-2 mt-3">
            {changeTo && (
              <Link to={changeTo} className="btn btn-sm btn-outline-role rounded-pill px-3 fw-bold" onClick={onClose}>
                <i className="bi bi-pencil me-1"></i> Change in Settings
              </Link>
            )}
            {onReport && (
              <button type="button" className="btn btn-sm btn-outline-danger rounded-pill px-3 fw-bold" onClick={onReport}>
                <i className="bi bi-flag-fill me-1"></i> Report this {isCover ? "cover photo" : "picture"}
              </button>
            )}
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}
