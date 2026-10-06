import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { fetchSlideText } from "../../../lib/slides";
import "./slides.css";

// Stops the browser's "Save image/video as..." menu.
const blockSaveMenu = (event) => event.preventDefault();

// Touches inside the reader stay there: without this they'd reach the
// slideshow behind it (React passes events up to the parent), and a sideways
// swipe while reading would change the slide and close the reader.
const stopTouch = { onTouchStart: (event) => event.stopPropagation(), onTouchEnd: (event) => event.stopPropagation() };

// A document opened from its slide, over the whole screen. A PDF (step 11)
// opens on its pages: pictures with the freelancer's name across them and
// the hidden code inside, so the PDF file itself is never handed out. The
// Text view is the whole text. It can be selected and copied on purpose,
// like portfolio writing: the invisible code in every sentence goes along
// with any copy.
function DocumentReader({ text, pages = [], onClose }) {
  // "pages" or "text" (a DOCX or TXT has only its text).
  const [view, setView] = useState(pages.length ? "pages" : "text");

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
      {...stopTouch}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Document"
        className="role-confirm-card bg-dark text-white border border-secondary border-opacity-25 rounded-4 p-4"
        style={{ maxWidth: 760, width: "100%" }}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="d-flex justify-content-between align-items-center gap-2 mb-3">
          <h5 className="fw-bold mb-0"><i className="bi bi-file-earmark-text me-2"></i>Document</h5>
          {pages.length > 0 && (
            <div className="btn-group btn-group-sm ms-auto" role="group" aria-label="How to show the document">
              <button type="button" className={`btn ${view === "pages" ? "btn-light" : "btn-outline-light"}`} aria-pressed={view === "pages"} onClick={() => setView("pages")}>
                <i className="bi bi-file-earmark-richtext me-1"></i>Pages
              </button>
              <button type="button" className={`btn ${view === "text" ? "btn-light" : "btn-outline-light"}`} aria-pressed={view === "text"} onClick={() => setView("text")}>
                <i className="bi bi-text-paragraph me-1"></i>Text
              </button>
            </div>
          )}
          <button type="button" className="btn btn-sm btn-outline-light rounded-circle flex-shrink-0" aria-label="Close" onClick={onClose}>
            <i className="bi bi-x-lg"></i>
          </button>
        </div>
        {view === "pages" ? (
          <div className="document-reader-pages" onContextMenu={blockSaveMenu}>
            {pages.map((page, i) => (
              <img key={page} src={page} alt={`Page ${i + 1}`} draggable={false} loading={i ? "lazy" : undefined} />
            ))}
            <p className="document-reader-note">
              The first {pages.length === 1 ? "page is" : `${pages.length} pages are`} shown as {pages.length === 1 ? "a picture" : "pictures"}. Switch to Text for the whole document.
            </p>
          </div>
        ) : (
          <div className="document-reader-text">{text}</div>
        )}
      </div>
    </div>,
    document.body
  );
}

// A document slide (step 8): the start of its text and a Read button. The
// text is a small .txt file, loaded when the slide is shown. A PDF (step 11)
// shows its first page instead (pages: the links of its page pictures); a
// click on the page opens the reader too.
function DocumentSlide({ url, pages = [], fit }) {
  // null = loading; otherwise the text, or an error message.
  const [loaded, setLoaded] = useState(null);
  const [reading, setReading] = useState(false);
  const hasPages = pages.length > 0;

  useEffect(() => {
    let active = true;
    fetchSlideText(url)
      .then((text) => active && setLoaded({ text }))
      .catch((err) => active && setLoaded({ error: err.message }));
    return () => {
      active = false;
    };
  }, [url]);

  // What the slide and the reader's Text view say while the text loads.
  const shownText = loaded === null ? "Loading document..." : loaded.error || loaded.text;

  return (
    <div className={`media-carousel-document${hasPages ? " has-pages" : ""}`}>
      {hasPages ? (
        <img
          src={pages[0]}
          alt="First page of the document"
          draggable={false}
          onContextMenu={blockSaveMenu}
          onClick={() => setReading(true)}
          className="media-carousel-page"
          style={{ objectFit: fit }}
        />
      ) : shownText.slice(0, 1200)}
      {(hasPages || loaded?.text) && (
        <button type="button" className="btn btn-sm btn-light rounded-pill px-3 fw-semibold media-carousel-read" onClick={() => setReading(true)}>
          <i className="bi bi-book me-1"></i> Read document
        </button>
      )}
      {reading && <DocumentReader text={shownText} pages={pages} onClose={() => setReading(false)} />}
    </div>
  );
}

// True when the user asked their device for less motion (no auto-play then).
const prefersReducedMotion = () => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

// The same slideshow, big, over the whole screen (opened from a card, see
// `expandable`). Escape, the X or a click beside it closes it.
function FullScreenSlides({ slides, startIndex, alt, ownerName, onClose }) {
  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return createPortal(
    <div className="media-fullscreen role-confirm-backdrop" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label={alt || "Photos"} className="media-fullscreen-box" onClick={(event) => event.stopPropagation()}>
        <MediaCarousel slides={slides} startIndex={startIndex} height="min(85vh, 900px)" fit="contain" alt={alt} ownerName={ownerName} />
        <button type="button" className="media-fullscreen-close btn btn-light rounded-circle" aria-label="Close" onClick={onClose}>
          <i className="bi bi-x-lg"></i>
        </button>
      </div>
    </div>,
    document.body
  );
}

// A service's or portfolio project's photos, videos and documents as a
// slideshow (slides come from itemSlides in lib/slides.js). Arrows, a "2 / 5" counter, and
// swiping on phones. fit is "cover" (fill the box, trimming the edges) or
// "contain" (show the whole photo). The box is `height` tall, or, with
// aspectRatio (e.g. "16 / 10"), grows with its width. autoPlayMs: move to the
// next slide by itself every that many milliseconds (0 = only by hand).
// expandable: a tap on a photo (or the expand button) shows the slides big,
// over the whole screen. startIndex: the slide to show first.
// To make copying others' work harder there
// is no Download button, right-click menu, dragging, or picture-in-picture,
// and ownerName (the uploader's @username) is shown faintly across the slide,
// so a screenshot still shows whose work it is. Only the current slide is on
// the page, so a playing video stops when you move on.
export default function MediaCarousel({ slides, height = 140, aspectRatio, fit = "cover", alt = "", ownerName, autoPlayMs = 0, expandable = false, startIndex = 0 }) {
  const [index, setIndex] = useState(startIndex);
  const [fullScreen, setFullScreen] = useState(false);
  // "next" or "prev": the side the new slide slides in from (null before the
  // first move, so the first slide doesn't slide in).
  const [direction, setDirection] = useState(null);
  // Auto-play waits while the mouse is over the slideshow or a video plays.
  const [hovered, setHovered] = useState(false);
  const [videoPlaying, setVideoPlaying] = useState(false);
  const swipeStartX = useRef(null);

  const count = slides.length;
  const shown = Math.min(index, Math.max(count - 1, 0));

  // Auto-play: a new timer starts on every slide change, so tapping an arrow
  // also restarts the wait.
  useEffect(() => {
    if (!autoPlayMs || count < 2 || hovered || videoPlaying || fullScreen || prefersReducedMotion()) return undefined;
    const timer = setTimeout(() => {
      setDirection("next");
      setIndex((shown + 1) % count);
    }, autoPlayMs);
    return () => clearTimeout(timer);
  }, [autoPlayMs, count, hovered, videoPlaying, fullScreen, shown]);

  if (count === 0) return null;
  const current = slides[shown];
  // step is 1 (next) or -1 (previous); it wraps around at both ends.
  const go = (step) => {
    setDirection(step > 0 ? "next" : "prev");
    setVideoPlaying(false);
    setIndex((shown + step + count) % count);
  };

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
    <>
      <div
        className="media-carousel"
        style={aspectRatio ? { aspectRatio } : { height }}
        onTouchStart={count > 1 ? handleTouchStart : undefined}
        onTouchEnd={count > 1 ? handleTouchEnd : undefined}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      >
        {/* key: a new slide is a new element, so its slide-in animation
            (slides.css) plays every time the slide changes. */}
        <div key={current.id} className={`media-carousel-slide${direction ? ` is-from-${direction}` : ""}`}>
          {current.mediaType === "document" ? (
            <DocumentSlide url={current.url} pages={current.pages} fit={fit} />
          ) : current.mediaType === "video" ? (
            <video
              src={current.url}
              controls
              controlsList="nodownload"
              disablePictureInPicture
              preload="metadata"
              onContextMenu={blockSaveMenu}
              onPlay={() => setVideoPlaying(true)}
              onPause={() => setVideoPlaying(false)}
              className="media-carousel-item"
              style={{ objectFit: fit }}
            />
          ) : (
            <img
              src={current.url}
              alt={alt}
              draggable={false}
              onContextMenu={blockSaveMenu}
              onClick={expandable ? () => setFullScreen(true) : undefined}
              className={`media-carousel-item${expandable ? " is-expandable" : ""}`}
              style={{ objectFit: fit }}
            />
          )}
        </div>

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

        {expandable && (
          <button type="button" className="media-carousel-expand" aria-label="View full screen" title="View full screen" onClick={() => setFullScreen(true)}>
            <i className="bi bi-arrows-fullscreen"></i>
          </button>
        )}
      </div>
      {/* Outside the box above, so swipes in the big view don't also move
          this small slideshow (React passes events up to the parent). */}
      {fullScreen && (
        <FullScreenSlides slides={slides} startIndex={shown} alt={alt} ownerName={ownerName} onClose={() => setFullScreen(false)} />
      )}
    </>
  );
}
