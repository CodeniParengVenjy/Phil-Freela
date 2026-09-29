import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { fetchSlideText } from "../../../lib/slides";
import "./slides.css";

// Stops the browser's "Save image/video as..." menu.
const blockSaveMenu = (event) => event.preventDefault();

// A document opened from its slide: the whole text, over the whole screen.
// The text can be selected and copied on purpose, like portfolio writing:
// the invisible code in every sentence goes along with any copy.
function DocumentReader({ text, onClose }) {
  // Escape closes it.
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
        position: "fixed", inset: 0, zIndex: 1300,
        background: "rgba(0,0,0,0.75)",
        display: "flex", alignItems: "center", justifyContent: "center", padding: "1rem"
      }}
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Document"
        className="role-confirm-card bg-dark text-white border border-secondary border-opacity-25 rounded-4 p-4"
        style={{ maxWidth: 760, width: "100%" }}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="d-flex justify-content-between align-items-center mb-3">
          <h5 className="fw-bold mb-0"><i className="bi bi-file-earmark-text me-2"></i>Document</h5>
          <button type="button" className="btn btn-sm btn-outline-light rounded-circle" aria-label="Close" onClick={onClose}>
            <i className="bi bi-x-lg"></i>
          </button>
        </div>
        <div className="document-reader-text">{text}</div>
      </div>
    </div>,
    document.body
  );
}

// A document slide (step 8): the start of its text and a Read button. The
// text is a small .txt file, loaded when the slide is shown.
function DocumentSlide({ url }) {
  // null = loading; otherwise the text, or an error message.
  const [loaded, setLoaded] = useState(null);
  const [reading, setReading] = useState(false);

  useEffect(() => {
    let active = true;
    fetchSlideText(url)
      .then((text) => active && setLoaded({ text }))
      .catch((err) => active && setLoaded({ error: err.message }));
    return () => {
      active = false;
    };
  }, [url]);

  return (
    <div className="media-carousel-document">
      {loaded === null ? "Loading document..." : loaded.error || loaded.text.slice(0, 1200)}
      {loaded?.text && (
        <button type="button" className="btn btn-sm btn-light rounded-pill px-3 fw-semibold media-carousel-read" onClick={() => setReading(true)}>
          <i className="bi bi-book me-1"></i> Read document
        </button>
      )}
      {reading && <DocumentReader text={loaded.text} onClose={() => setReading(false)} />}
    </div>
  );
}

// A service's or portfolio project's photos, videos and documents as a
// slideshow (slides come from itemSlides in lib/slides.js). Arrows, a "2 / 5" counter, and
// swiping on phones. fit is "cover" (fill the box, trimming the edges) or
// "contain" (show the whole photo). To make copying others' work harder there
// is no Download button, right-click menu, dragging, or picture-in-picture,
// and ownerName (the uploader's @username) is shown faintly across the slide,
// so a screenshot still shows whose work it is. Only the current slide is on
// the page, so a playing video stops when you move on.
export default function MediaCarousel({ slides, height = 140, fit = "cover", alt = "", ownerName }) {
  const [index, setIndex] = useState(0);
  const swipeStartX = useRef(null);

  const count = slides.length;
  if (count === 0) return null;
  const shown = Math.min(index, count - 1);
  const current = slides[shown];
  // step is 1 (next) or -1 (previous); it wraps around at both ends.
  const go = (step) => setIndex((shown + step + count) % count);

  const handleTouchStart = (event) => {
    swipeStartX.current = event.touches[0].clientX;
  };
  const handleTouchEnd = (event) => {
    if (swipeStartX.current === null) return;
    const moved = event.changedTouches[0].clientX - swipeStartX.current;
    swipeStartX.current = null;
    // A swipe of more than 40 px left or right changes the slide.
    if (Math.abs(moved) > 40) go(moved < 0 ? 1 : -1);
  };

  return (
    <div
      className="media-carousel"
      style={{ height }}
      onTouchStart={count > 1 ? handleTouchStart : undefined}
      onTouchEnd={count > 1 ? handleTouchEnd : undefined}
    >
      {current.mediaType === "document" ? (
        <DocumentSlide key={current.id} url={current.url} />
      ) : current.mediaType === "video" ? (
        <video
          key={current.id}
          src={current.url}
          controls
          controlsList="nodownload"
          disablePictureInPicture
          preload="metadata"
          onContextMenu={blockSaveMenu}
          className="media-carousel-item"
          style={{ objectFit: fit }}
        />
      ) : (
        <img key={current.id} src={current.url} alt={alt} draggable={false} onContextMenu={blockSaveMenu} className="media-carousel-item" style={{ objectFit: fit }} />
      )}

      {/* Drawn on top of the page, not saved into the file, and clicks go
          through it, so the video controls still work. */}
      {/* Held back by the copy check: only its uploader and the admins see it. */}
      {current.underReview && (
        <span className="media-carousel-review" title="Waiting for an admin: it looks very similar to another freelancer's work">
          <i className="bi bi-hourglass-split me-1"></i>Under review
        </span>
      )}

      {/* Only over slides whose file has no watermark of its own (older
          photos, videos for now) and that aren't promos. */}
      {ownerName && current.showOwnerName !== false && (
        <div className="media-carousel-owner" aria-hidden="true">
          {Array.from({ length: 60 }, (_, i) => <span key={i}>@{ownerName}</span>)}
        </div>
      )}

      {count > 1 && (
        <>
          <button type="button" className="media-carousel-arrow is-prev" aria-label="Previous slide" onClick={() => go(-1)}>
            <i className="bi bi-chevron-left"></i>
          </button>
          <button type="button" className="media-carousel-arrow is-next" aria-label="Next slide" onClick={() => go(1)}>
            <i className="bi bi-chevron-right"></i>
          </button>
          <span className="media-carousel-counter">{shown + 1} / {count}</span>
        </>
      )}
    </div>
  );
}
