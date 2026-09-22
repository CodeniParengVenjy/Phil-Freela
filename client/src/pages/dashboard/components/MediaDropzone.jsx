import { useEffect, useRef, useState } from "react";

// Turns a byte count into "340 KB" / "12.4 MB" for display.
function formatSize(bytes) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// A styled replacement for the browser's plain "Choose File" button. Click it or
// drag a file onto it; once a file is chosen it shows a preview, the name and size.
// The parent owns the file and validates it: this only reports picks via onSelect
// (a File, or null when the person removes it).
export default function MediaDropzone({ file, onSelect, accept, hint, error }) {
  const inputRef = useRef(null);
  const previewRef = useRef(null);
  const [dragging, setDragging] = useState(false);
  const isVideo = Boolean(file?.type.startsWith("video/"));

  // Points the thumbnail at the chosen file through a temporary browser URL,
  // and frees that URL when the file changes or is removed.
  useEffect(() => {
    const thumb = previewRef.current;
    if (!file || !thumb) return undefined;
    const url = URL.createObjectURL(file);
    thumb.src = isVideo ? `${url}#t=0.1` : url;
    return () => URL.revokeObjectURL(url);
  }, [file, isVideo]);

  const openPicker = () => inputRef.current?.click();

  const handleInputChange = (event) => {
    const picked = event.target.files?.[0];
    event.target.value = ""; // so choosing the same file again still counts as a change
    if (picked) onSelect(picked);
  };

  const dragProps = {
    onDragOver: (event) => {
      event.preventDefault();
      setDragging(true);
    },
    onDragLeave: () => setDragging(false),
    onDrop: (event) => {
      event.preventDefault();
      setDragging(false);
      const dropped = event.dataTransfer.files?.[0];
      if (dropped) onSelect(dropped);
    }
  };

  return (
    <div>
      <input ref={inputRef} type="file" className="d-none" accept={accept} onChange={handleInputChange} />

      {file ? (
        <div className={`media-dropzone is-filled${dragging ? " is-dragging" : ""}`} {...dragProps}>
          {isVideo
            ? <video ref={previewRef} muted preload="metadata" className="media-preview" />
            : <img ref={previewRef} alt="" className="media-preview" />}
          <div className="flex-grow-1 overflow-hidden">
            <p className="text-white fw-bold fs-7 mb-0 text-truncate">{file.name}</p>
            <p className="text-secondary fs-8 mb-2">{isVideo ? "Video" : "Photo"} &middot; {formatSize(file.size)}</p>
            <div className="d-flex gap-2">
              <button type="button" className="btn btn-sm btn-outline-role rounded-pill px-3 fw-bold" onClick={openPicker}>
                Change
              </button>
              <button type="button" className="btn btn-sm btn-outline-secondary text-white-50 rounded-pill px-3 fw-bold" onClick={() => onSelect(null)}>
                Remove
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div
          role="button"
          tabIndex={0}
          className={`media-dropzone${dragging ? " is-dragging" : ""}${error ? " has-error" : ""}`}
          onClick={openPicker}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              openPicker();
            }
          }}
          {...dragProps}
        >
          <div className="media-dropzone-icon">
            <i className="bi bi-cloud-arrow-up-fill"></i>
          </div>
          <div>
            <p className="text-white fw-bold fs-7 mb-0">{dragging ? "Drop it here" : "Click to choose a photo or video"}</p>
            <p className="text-secondary fs-8 mb-0">{dragging ? "Release to add this file" : "or drag and drop it here"}</p>
          </div>
        </div>
      )}

      {hint && <p className="text-secondary fs-9 mb-0 mt-2">{hint}</p>}
      {error && <p className="text-warning fs-8 mb-0 mt-1">{error}</p>}
    </div>
  );
}
