import { useRef, useState } from "react";
import "./slides.css";

// Stops the browser's "Save image/video as..." menu.
const blockSaveMenu = (event) => event.preventDefault();

// A service's or portfolio project's photos and videos as a slideshow (slides
// come from itemSlides in lib/slides.js). Arrows, a "2 / 5" counter, and
// swiping on phones. fit is "cover" (fill the box, trimming the edges) or
// "contain" (show the whole photo). To make copying others' work harder there
// is no Download button, right-click menu, dragging, or picture-in-picture,
// and viewerName (the person looking, when it isn't their own work) is shown
// faintly across the slide, so a screenshot shows who took it. Only the
// current slide is on the page, so a playing video stops when you move on.
export default function MediaCarousel({ slides, height = 140, fit = "cover", alt = "", viewerName }) {
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
      {current.mediaType === "video" ? (
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
      {viewerName && (
        <div className="media-carousel-viewer" aria-hidden="true">
          {Array.from({ length: 60 }, (_, i) => <span key={i}>@{viewerName}</span>)}
        </div>
      )}

      {count > 1 && (
        <>
          <button type="button" className="media-carousel-arrow is-prev" aria-label="Previous photo or video" onClick={() => go(-1)}>
            <i className="bi bi-chevron-left"></i>
          </button>
          <button type="button" className="media-carousel-arrow is-next" aria-label="Next photo or video" onClick={() => go(1)}>
            <i className="bi bi-chevron-right"></i>
          </button>
          <span className="media-carousel-counter">{shown + 1} / {count}</span>
        </>
      )}
    </div>
  );
}
