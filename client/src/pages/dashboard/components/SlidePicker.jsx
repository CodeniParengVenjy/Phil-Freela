import { useEffect, useRef, useState } from "react";
import { MAX_SLIDES, SLIDE_ACCEPT, isDocumentFile, isVideoFile } from "../../../lib/slides";
import "./slides.css";

// A picked document's tile: an icon and its type (it has no picture).
function DocumentThumb({ file }) {
  const extension = file.name.split(".").pop().toUpperCase();
  return (
    <div className="slide-picker-preview slide-picker-document">
      <i className="bi bi-file-earmark-text"></i>
      <span>{extension}</span>
    </div>
  );
}

// A picked file's small preview, through a temporary browser link that is
// freed again when the file is removed.
function SlideThumb({ file }) {
  const previewRef = useRef(null);
  const isVideo = isVideoFile(file);

  useEffect(() => {
    const url = URL.createObjectURL(file);
    previewRef.current.src = isVideo ? `${url}#t=0.1` : url;
    return () => URL.revokeObjectURL(url);
  }, [file, isVideo]);

  return isVideo
    ? <video ref={previewRef} muted preload="metadata" className="slide-picker-preview" />
    : <img ref={previewRef} alt="" className="slide-picker-preview" />;
}

// Picks up to 10 photos and videos for a slideshow: click the "+" tile, or
// drag files onto the box. The parent owns the list ([{ key, file, promo }])
// and checks each file; this only reports new picks through onAdd (an array
// of Files) and removals through onRemove (a key). Slides keep the order they
// were picked in. With onTogglePromo, each file also gets a Protected / Promo
// switch: a promo (an ad, like "Are you looking for a video editor?") gets no
// visible watermark (documents have no switch: their watermark is the footer
// and the invisible code). accept / addLabel: which files it offers (default:
// photos and videos).
export default function SlidePicker({ items, onAdd, onRemove, onTogglePromo, hint, error, disabled, accept = SLIDE_ACCEPT, addLabel = "Add photos or videos" }) {
  const inputRef = useRef(null);
  const [dragging, setDragging] = useState(false);
  const canAdd = !disabled && items.length < MAX_SLIDES;

  const handleInputChange = (event) => {
    const picked = [...(event.target.files || [])];
    event.target.value = ""; // so picking the same file again still counts
    if (picked.length) onAdd(picked);
  };

  const dragProps = canAdd
    ? {
      onDragOver: (event) => {
        event.preventDefault();
        setDragging(true);
      },
      onDragLeave: () => setDragging(false),
      onDrop: (event) => {
        event.preventDefault();
        setDragging(false);
        const dropped = [...(event.dataTransfer.files || [])];
        if (dropped.length) onAdd(dropped);
      }
    }
    : {};

  return (
    <div>
      <input ref={inputRef} type="file" multiple className="d-none" accept={accept} onChange={handleInputChange} />

      <div className={`slide-picker${dragging ? " is-dragging" : ""}`} {...dragProps}>
        {items.map(({ key, file, promo }, index) => (
          <div key={key} className="slide-picker-tile" title={file.name}>
            {isDocumentFile(file) ? <DocumentThumb file={file} /> : <SlideThumb file={file} />}
            <span className="slide-picker-number">{index + 1}</span>
            {isVideoFile(file) && <i className="bi bi-play-circle-fill slide-picker-video-icon"></i>}
            {!disabled && (
              <button type="button" className="slide-picker-remove" aria-label={`Remove ${file.name}`} onClick={() => onRemove(key)}>
                <i className="bi bi-x-lg"></i>
              </button>
            )}
            {onTogglePromo && !isDocumentFile(file) && (
              <button
                type="button"
                className={`slide-picker-promo${promo ? " is-promo" : ""}`}
                aria-pressed={promo}
                title={promo ? "Promo: no visible watermark. Tap to protect it." : "Protected: gets your watermark. Tap if it's a promo/ad."}
                onClick={() => onTogglePromo(key)}
                disabled={disabled}
              >
                <i className={`bi ${promo ? "bi-megaphone-fill" : "bi-shield-check"} me-1`}></i>
                {promo ? "Promo" : "Protected"}
              </button>
            )}
          </div>
        ))}

        {canAdd && (
          <button type="button" className={`slide-picker-add${error ? " has-error" : ""}`} onClick={() => inputRef.current?.click()}>
            <i className="bi bi-plus-lg"></i>
            <span>{dragging ? "Drop them here" : items.length ? "Add more" : addLabel}</span>
          </button>
        )}
      </div>

      <p className="text-secondary fs-9 mb-0 mt-2">{items.length} of {MAX_SLIDES} added. {hint}</p>
      {error && <p className="text-warning fs-8 mb-0 mt-1">{error}</p>}
    </div>
  );
}
