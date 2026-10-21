import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

// The popup that lets someone crop and zoom a picked photo before it is
// uploaded (profile picture and cover photo, in Settings).
//   file: the picked image. Mount this only while cropping; a new file = a new mount.
//   aspect: width / height of the cut (1 = square, 4 = a wide banner)
//   outputWidth: the width the cut is saved at (the height follows from aspect)
//   round: draws a circle guide, for profile pictures (the saved image stays square)
//   onConfirm(file): the cropped JPEG, ready to upload
//   onCancel(): closed without saving. onError(message): the photo couldn't be opened.
//
// How it works: the photo is drawn inside a fixed "frame". "zoom" 1 is the
// smallest size that still covers the whole frame; the "centre" is the point
// of the photo (in the photo's own pixels) that sits in the middle of the
// frame. Dragging moves the centre, zooming changes the zoom, and what is
// inside the frame when you press the button is what gets saved.
const MAX_ZOOM = 4;

// Screen pixels per photo pixel at zoom 1.
const baseScale = (image, frame) => Math.max(frame.w / image.width, frame.h / image.height);

// Keeps the photo covering the frame: zoom stays between 1 and MAX_ZOOM and
// the centre can't move so far that an edge of the photo shows.
function clampView(view, image, frame) {
  const zoom = Math.min(MAX_ZOOM, Math.max(1, view.zoom));
  const scale = baseScale(image, frame) * zoom;
  const halfW = frame.w / scale / 2;
  const halfH = frame.h / scale / 2;
  return {
    zoom,
    cx: Math.min(image.width - halfW, Math.max(halfW, view.cx)),
    cy: Math.min(image.height - halfH, Math.max(halfH, view.cy))
  };
}

// Cuts out what is inside the frame and saves it as a JPEG file.
function cropToFile(image, view, frame, aspect, outputWidth, fileName) {
  const scale = baseScale(image, frame) * view.zoom;
  const width = frame.w / scale; // the part of the photo inside the frame, in photo pixels
  const height = frame.h / scale;
  // A small photo isn't stretched past its real size, so it doesn't go blurry.
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.min(outputWidth, Math.round(width)));
  canvas.height = Math.max(1, Math.round(canvas.width / aspect));
  const context = canvas.getContext("2d");
  // JPEGs can't be see-through, so transparent parts (a PNG logo) become white.
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(image.element, view.cx - width / 2, view.cy - height / 2, width, height, 0, 0, canvas.width, canvas.height);

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) reject(new Error("This photo couldn't be processed. Please try another one."));
      else resolve(new File([blob], `${fileName.replace(/\.[^.]+$/, "") || "photo"}.jpg`, { type: "image/jpeg" }));
    }, "image/jpeg", 0.9);
  });
}

export default function ImageCropDialog({ file, title, aspect, outputWidth, round = false, onConfirm, onCancel, onError }) {
  // The opened photo: { element, url, width, height }, or null while loading.
  const [image, setImage] = useState(null);
  const [view, setView] = useState(null); // { zoom, cx, cy }; null = centred and not zoomed
  const [frame, setFrame] = useState({ w: 0, h: 0 }); // the frame's size on screen
  const [working, setWorking] = useState(false);
  const stageRef = useRef(null);
  const pointers = useRef(new Map()); // fingers / mouse currently on the frame
  const pinchDistance = useRef(0);

  // The callbacks are kept in a ref so a new function from the page doesn't reopen the photo.
  const callbacks = useRef({ onCancel, onError });
  useEffect(() => {
    callbacks.current = { onCancel, onError };
  });

  // Opens the picked file as a photo.
  useEffect(() => {
    const url = URL.createObjectURL(file);
    const element = new Image();
    let active = true;
    element.onload = () => {
      if (active) setImage({ element, url, width: element.naturalWidth, height: element.naturalHeight });
    };
    element.onerror = () => {
      if (active) callbacks.current.onError("This file couldn't be opened as a photo. Please use a JPG or PNG photo.");
    };
    element.src = url;
    return () => {
      active = false;
      URL.revokeObjectURL(url);
    };
  }, [file]);

  // Keeps track of how big the frame is on screen (it follows the screen width).
  useEffect(() => {
    const stage = stageRef.current;
    const measure = () => setFrame((old) => (old.w === stage.clientWidth && old.h === stage.clientHeight ? old : { w: stage.clientWidth, h: stage.clientHeight }));
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(stage);
    return () => observer.disconnect();
  }, []);

  // Escape closes the popup, unless the photo is being cut.
  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === "Escape" && !working) callbacks.current.onCancel();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [working]);

  const ready = Boolean(image) && frame.w > 0;
  // What is drawn: the saved view, or the middle of the photo before anything moved.
  const shown = ready ? clampView(view ?? { zoom: 1, cx: image.width / 2, cy: image.height / 2 }, image, frame) : null;

  // Every change goes through here so the photo always covers the frame.
  const change = (makeNext) => {
    if (!ready) return;
    setView((old) => clampView(makeNext(clampView(old ?? { zoom: 1, cx: image.width / 2, cy: image.height / 2 }, image, frame)), image, frame));
  };
  const zoomBy = (factor) => change((v) => ({ ...v, zoom: v.zoom * factor }));

  // The mouse wheel zooms. It is attached by hand because React's own wheel
  // listener can't stop the page behind the popup from scrolling.
  useEffect(() => {
    const stage = stageRef.current;
    const handleWheel = (event) => {
      event.preventDefault();
      zoomBy(event.deltaY < 0 ? 1.1 : 1 / 1.1);
    };
    stage.addEventListener("wheel", handleWheel, { passive: false });
    return () => stage.removeEventListener("wheel", handleWheel);
  });

  // One finger (or the mouse) drags the photo; two fingers pinch to zoom.
  const handlePointerDown = (event) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      pinchDistance.current = Math.hypot(a.x - b.x, a.y - b.y);
    }
  };
  const handlePointerMove = (event) => {
    const before = pointers.current.get(event.pointerId);
    if (!before) return;
    const now = { x: event.clientX, y: event.clientY };
    pointers.current.set(event.pointerId, now);

    if (pointers.current.size === 1) {
      // Moving the photo 10 screen pixels right moves the centre 10 / scale photo pixels left.
      change((v) => {
        const scale = baseScale(image, frame) * v.zoom;
        return { ...v, cx: v.cx - (now.x - before.x) / scale, cy: v.cy - (now.y - before.y) / scale };
      });
    } else if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      const distance = Math.hypot(a.x - b.x, a.y - b.y);
      if (pinchDistance.current > 0) zoomBy(distance / pinchDistance.current);
      pinchDistance.current = distance;
    }
  };
  const handlePointerEnd = (event) => {
    pointers.current.delete(event.pointerId);
    pinchDistance.current = 0;
  };

  const handleConfirm = async () => {
    if (!shown || working) return;
    setWorking(true);
    try {
      onConfirm(await cropToFile(image, shown, frame, aspect, outputWidth, file.name));
    } catch (error) {
      setWorking(false);
      onError(error.message);
    }
  };

  const scale = shown ? baseScale(image, frame) * shown.zoom : 1;

  return createPortal(
    <div
      className="role-confirm-backdrop"
      style={{
        position: "fixed", inset: 0, zIndex: 1300,
        background: "rgba(0,0,0,0.65)",
        display: "flex", alignItems: "center", justifyContent: "center", padding: "1rem"
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="crop-dialog-title"
        className="role-confirm-card bg-dark text-white border border-secondary border-opacity-25 rounded-4 p-3 p-sm-4"
        style={{ width: `min(100%, ${round ? 420 : 640}px)`, maxHeight: "100%", overflowY: "auto" }}
      >
        <div className="d-flex align-items-center justify-content-between gap-2 mb-3">
          <h5 id="crop-dialog-title" className="fw-bold mb-0">{title}</h5>
          <button type="button" className="btn btn-sm btn-outline-secondary text-white-50 rounded-circle p-0 d-flex align-items-center justify-content-center flex-shrink-0" style={{ width: 30, height: 30 }} aria-label="Cancel" onClick={onCancel} disabled={working}>
            <i className="bi bi-x-lg"></i>
          </button>
        </div>

        {/* The frame. Everything outside it is cut off. */}
        <div
          ref={stageRef}
          className="position-relative overflow-hidden rounded-3 mx-auto"
          style={{ width: "100%", maxWidth: round ? 340 : "none", aspectRatio: String(aspect), background: "#0b0f17", touchAction: "none", cursor: "grab", userSelect: "none" }}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerEnd}
          onPointerCancel={handlePointerEnd}
        >
          {shown ? (
            <img
              src={image.url}
              alt=""
              draggable={false}
              style={{
                position: "absolute", maxWidth: "none", pointerEvents: "none",
                left: frame.w / 2 - shown.cx * scale,
                top: frame.h / 2 - shown.cy * scale,
                width: image.width * scale,
                height: image.height * scale
              }}
            />
          ) : (
            <div className="position-absolute top-50 start-50 translate-middle text-secondary fs-7">Loading...</div>
          )}
          {/* The circle guide: the corners outside it are dimmed (the saved picture is still square). */}
          {round && (
            <div
              className="position-absolute top-0 start-0 w-100 h-100 rounded-circle"
              style={{ pointerEvents: "none", boxShadow: "0 0 0 9999px rgba(0,0,0,0.55)", border: "2px solid rgba(255,255,255,0.85)" }}
            ></div>
          )}
        </div>

        <p className="text-secondary fs-8 text-center mt-2 mb-3">Drag the photo to move it. Use the slider, the mouse wheel or two fingers to zoom.</p>

        <div className="d-flex align-items-center gap-2 mb-4">
          <button type="button" className="btn btn-sm btn-outline-secondary text-white-50 rounded-circle p-0 d-flex align-items-center justify-content-center flex-shrink-0" style={{ width: 32, height: 32 }} aria-label="Zoom out" onClick={() => zoomBy(1 / 1.2)} disabled={!ready || working}>
            <i className="bi bi-dash-lg"></i>
          </button>
          <input
            type="range"
            className="flex-grow-1"
            style={{ accentColor: "var(--accent-role)" }}
            min="1"
            max={MAX_ZOOM}
            step="0.01"
            value={shown ? shown.zoom : 1}
            aria-label="Zoom"
            onChange={(event) => change((v) => ({ ...v, zoom: Number(event.target.value) }))}
            disabled={!ready || working}
          />
          <button type="button" className="btn btn-sm btn-outline-secondary text-white-50 rounded-circle p-0 d-flex align-items-center justify-content-center flex-shrink-0" style={{ width: 32, height: 32 }} aria-label="Zoom in" onClick={() => zoomBy(1.2)} disabled={!ready || working}>
            <i className="bi bi-plus-lg"></i>
          </button>
        </div>

        <div className="d-flex gap-2 justify-content-end">
          <button type="button" className="btn btn-outline-secondary text-white-50 rounded-pill px-4 py-2 fw-bold" onClick={onCancel} disabled={working}>
            Cancel
          </button>
          <button type="button" className="btn btn-gradient-role rounded-pill px-4 py-2 fw-bold text-white shadow-glow-role" onClick={handleConfirm} disabled={!ready || working}>
            {working ? "Cropping..." : "Use this photo"}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
