import { useEffect } from "react";
import { createPortal } from "react-dom";
import { itemSlides } from "../../../lib/slides";
import MediaCarousel from "./MediaCarousel";
import "./portfolio.css";

// A portfolio project opened big: its slideshow (or, for a document, its
// text), title and description.
// Owners also get a Delete button (pass onDelete). ownerName: see
// MediaCarousel. Rendered straight into <body> so it covers the whole screen,
// in the same look and animation as the other popups (role-confirm-* classes).
export default function PortfolioViewer({ item, ownerName, onDelete, onClose }) {
  // Escape closes it.
  useEffect(() => {
    if (!item) return undefined;
    const handleKeyDown = (event) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [item, onClose]);

  if (!item) return null;
  const slides = itemSlides(item);

  return createPortal(
    <div
      className="role-confirm-backdrop"
      style={{
        position: "fixed", inset: 0, zIndex: 1250,
        background: "rgba(0,0,0,0.75)",
        display: "flex", alignItems: "center", justifyContent: "center", padding: "1rem"
      }}
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="portfolio-viewer-title"
        className="role-confirm-card bg-dark text-white border border-secondary border-opacity-25 rounded-4 overflow-hidden"
        style={{ maxWidth: 760, width: "100%", maxHeight: "92vh", overflowY: "auto" }}
        onClick={(event) => event.stopPropagation()}
      >
        {item.kind === "document" ? (
          // Writing: shown as text. It can be selected and copied on purpose,
          // because the invisible code in every sentence goes along with any copy.
          <div className="p-4 pb-0">
            {item.status === "flagged" && <span className="badge bg-warning text-dark mb-2"><i className="bi bi-hourglass-split me-1"></i>Under review</span>}
            <div className="portfolio-document-text">{item.body}</div>
          </div>
        ) : slides.length > 0 ? (
          <MediaCarousel slides={slides} height="min(60vh, 460px)" fit="contain" alt={item.title} ownerName={ownerName} />
        ) : (
          <div className="d-flex align-items-center justify-content-center bg-black text-secondary fs-7" style={{ height: 200 }}>
            This project has no photos or videos.
          </div>
        )}

        <div className="p-4">
          <div className="d-flex justify-content-between align-items-start gap-3 mb-1">
            <h5 id="portfolio-viewer-title" className="fw-bold mb-0 text-break">{item.title}</h5>
            <button type="button" className="btn btn-sm btn-outline-light rounded-circle flex-shrink-0" aria-label="Close" onClick={onClose}>
              <i className="bi bi-x-lg"></i>
            </button>
          </div>
          <p className="text-secondary fs-8 mb-3">Added {new Date(item.created_at).toLocaleDateString()}</p>
          {item.description && <p className="text-light fs-7 mb-0 text-break" style={{ whiteSpace: "pre-line" }}>{item.description}</p>}

          {onDelete && (
            <div className="d-flex justify-content-end mt-4">
              <button type="button" className="btn btn-outline-danger btn-sm rounded-pill px-3" onClick={() => onDelete(item)}>
                <i className="bi bi-trash3 me-1"></i> Delete {item.kind === "document" ? "document" : "project"}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
