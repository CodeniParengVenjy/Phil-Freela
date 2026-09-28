import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { addDocument } from "../../../lib/aiService";
import {
  DOCUMENT_ACCEPT, MAX_DESCRIPTION_LENGTH, MAX_DOCUMENT_BYTES, MAX_DOCUMENT_CHARACTERS, MAX_TITLE_LENGTH,
  createPortfolioItem
} from "../../../lib/portfolio";
import { SLIDE_HINT, addPickedFiles, uploadSlides } from "../../../lib/slides";
import SlidePicker from "./SlidePicker";

// The "+ Add to Portfolio" popup: a title, a short description, and either
// up to 10 photos and videos (a project) or writing (a document: pasted text,
// or a TXT, DOCX or PDF file). Projects are saved first, then their files are
// uploaded one at a time (like Post a Service); documents go to the AI service
// in one step, which watermarks them. Calls onSaved(item, failed), where failed
// lists files that couldn't be added. It can't be closed while saving.
export default function PortfolioUploadDialog({ userId, onSaved, onClose }) {
  // "project" (photos and videos) or "document" (writing).
  const [kind, setKind] = useState("project");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  // Project: the picked photos and videos: [{ key, file, promo }].
  const [slideItems, setSlideItems] = useState([]);
  const [slidesError, setSlidesError] = useState("");
  // Document: pasted text, or a file (a file wins if both are given).
  const [text, setText] = useState("");
  const [documentFile, setDocumentFile] = useState(null);
  const fileInputRef = useRef(null);
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);
  // "Uploading 2 of 5..." while the files are being sent.
  const [progress, setProgress] = useState("");

  // Escape closes it, unless it's saving.
  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === "Escape" && !saving) onClose();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [saving, onClose]);

  const handleAddSlides = async (files) => {
    const result = await addPickedFiles(slideItems, files);
    setSlideItems(result.items);
    setSlidesError(result.error);
  };

  const handleRemoveSlide = (key) => {
    setSlideItems((prev) => prev.filter((item) => item.key !== key));
    setSlidesError("");
  };

  const handlePickDocument = (event) => {
    const picked = event.target.files?.[0];
    event.target.value = ""; // so picking the same file again still counts
    if (!picked) return;
    if (picked.size > MAX_DOCUMENT_BYTES) {
      setFormError("That file is too big (max 4 MB).");
      return;
    }
    setFormError("");
    setDocumentFile(picked);
  };

  const hasContent = kind === "project" ? slideItems.length > 0 : Boolean(documentFile || text.trim());

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!title.trim() || !hasContent) return;
    setSaving(true);
    setFormError("");

    if (kind === "document") {
      try {
        const saved = await addDocument({ title: title.trim(), description: description.trim(), text: documentFile ? "" : text, file: documentFile });
        onSaved({ ...saved, slides: [] }, []);
      } catch (err) {
        setSaving(false);
        setFormError(err.message);
      }
      return;
    }

    // 1. Save the project itself. Its photos and videos are added next.
    let project;
    try {
      project = await createPortfolioItem(userId, { title, description });
    } catch (err) {
      setSaving(false);
      setFormError(err.message);
      return;
    }

    // 2. Send the files one at a time through the AI service.
    const { slides, failed } = await uploadSlides({ portfolioItemId: project.id }, slideItems, userId, setProgress);
    onSaved({ ...project, slides }, failed);
  };

  const tab = (value, icon, label) => (
    <button
      type="button"
      className={`btn btn-sm rounded-pill px-3 fw-semibold ${kind === value ? "btn-gradient-orange text-white" : "btn-outline-secondary text-white-50"}`}
      onClick={() => {
        setKind(value);
        setFormError("");
      }}
      disabled={saving}
    >
      <i className={`bi ${icon} me-1`}></i>{label}
    </button>
  );

  return createPortal(
    <div
      className="role-confirm-backdrop"
      style={{
        position: "fixed", inset: 0, zIndex: 1250,
        background: "rgba(0,0,0,0.75)",
        display: "flex", alignItems: "center", justifyContent: "center", padding: "1rem"
      }}
      onClick={saving ? undefined : onClose}
    >
      <form
        role="dialog"
        aria-modal="true"
        aria-labelledby="portfolio-upload-title"
        className="role-confirm-card bg-dark text-white border border-secondary border-opacity-25 rounded-4 p-4 d-flex flex-column gap-3"
        style={{ maxWidth: 620, width: "100%", maxHeight: "92vh", overflowY: "auto" }}
        onClick={(event) => event.stopPropagation()}
        onSubmit={handleSubmit}
      >
        <div className="d-flex justify-content-between align-items-start gap-3">
          <h5 id="portfolio-upload-title" className="fw-bold mb-0">
            <i className="bi bi-plus-circle text-orange me-2"></i>Add to Portfolio
          </h5>
          <button type="button" className="btn btn-sm btn-outline-light rounded-circle flex-shrink-0" aria-label="Close" onClick={onClose} disabled={saving}>
            <i className="bi bi-x-lg"></i>
          </button>
        </div>

        <div className="d-flex flex-wrap gap-2">
          {tab("project", "bi-images", "Photos & videos")}
          {tab("document", "bi-file-earmark-text", "Writing")}
        </div>

        <div>
          <label htmlFor="portfolioTitle" className="form-label text-white fw-semibold fs-7">{kind === "project" ? "Project title:" : "Document title:"}</label>
          <input
            id="portfolioTitle"
            type="text"
            className="form-control bg-secondary bg-opacity-25 border-secondary text-white py-2"
            placeholder={kind === "project" ? "e.g. Brand identity for a Cebu coffee shop" : "e.g. Blog post: 5 ways to grow a small online shop"}
            maxLength={MAX_TITLE_LENGTH}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            disabled={saving}
            required
          />
        </div>

        <div>
          <label htmlFor="portfolioDescription" className="form-label text-white fw-semibold fs-7">Short description (optional):</label>
          <textarea
            id="portfolioDescription"
            className="form-control bg-secondary bg-opacity-25 border-secondary text-white p-3"
            rows="2"
            placeholder={kind === "project" ? "What you made, the tools you used, and your role..." : "Who it was for, and what kind of writing it is..."}
            maxLength={MAX_DESCRIPTION_LENGTH}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            disabled={saving}
          ></textarea>
        </div>

        {kind === "project" ? (
          <div>
            <label className="form-label text-white fw-semibold fs-7">Photos and videos (at least one):</label>
            <SlidePicker
              items={slideItems}
              onAdd={handleAddSlides}
              onRemove={handleRemoveSlide}
              hint={SLIDE_HINT}
              error={slidesError}
              disabled={saving}
            />
          </div>
        ) : (
          <div>
            <label htmlFor="portfolioText" className="form-label text-white fw-semibold fs-7">Your writing:</label>
            {documentFile ? (
              <div className="d-flex align-items-center gap-2 p-3 rounded-3 border border-secondary border-opacity-25 bg-secondary bg-opacity-10">
                <i className="bi bi-file-earmark-text fs-4 text-info"></i>
                <span className="flex-grow-1 text-truncate fs-7">{documentFile.name}</span>
                <button type="button" className="btn btn-sm btn-outline-secondary text-white-50 rounded-pill px-3" onClick={() => setDocumentFile(null)} disabled={saving}>Remove</button>
              </div>
            ) : (
              <>
                <textarea
                  id="portfolioText"
                  className="form-control bg-secondary bg-opacity-25 border-secondary text-white p-3"
                  rows="8"
                  placeholder="Paste your article, blog post, copy or story here..."
                  maxLength={MAX_DOCUMENT_CHARACTERS}
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  disabled={saving}
                ></textarea>
                <div className="d-flex flex-wrap align-items-center gap-2 mt-2">
                  <span className="text-secondary fs-8">or</span>
                  <input ref={fileInputRef} type="file" className="d-none" accept={DOCUMENT_ACCEPT} onChange={handlePickDocument} />
                  <button type="button" className="btn btn-sm btn-outline-info rounded-pill px-3" onClick={() => fileInputRef.current?.click()} disabled={saving}>
                    <i className="bi bi-upload me-1"></i> Upload a TXT, DOCX or PDF
                  </button>
                </div>
              </>
            )}
            <p className="text-secondary fs-9 mb-0 mt-2">
              Only the text is kept (not the layout or pictures in a file), up to {MAX_DOCUMENT_CHARACTERS.toLocaleString()} characters.
              It gets an invisible code in every sentence, so any copy can be traced back to you.
            </p>
          </div>
        )}

        {formError && <p className="text-warning fs-8 mb-0">{formError}</p>}

        <div className="d-flex justify-content-end gap-2 pt-1">
          <button type="button" className="btn btn-outline-secondary text-white-50 rounded-pill px-4 fw-bold" onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button type="submit" className="btn btn-gradient-orange rounded-pill px-4 fw-bold text-white" disabled={saving || !title.trim() || !hasContent}>
            {saving ? progress || "Saving..." : "Add to Portfolio"}
          </button>
        </div>
      </form>
    </div>,
    document.body
  );
}
