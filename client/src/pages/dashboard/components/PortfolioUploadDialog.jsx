import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { categories } from "../../../lib/categories";
import {
  MAX_DESCRIPTION_LENGTH, MAX_DOCUMENT_CHARACTERS, MAX_TAG_LENGTH, MAX_TAGS, MAX_TITLE_LENGTH,
  createPortfolioItem
} from "../../../lib/portfolio";
import { MAX_SLIDES, SLIDE_ACCEPT_WITH_DOCUMENTS, SLIDE_HINT_WITH_DOCUMENTS, addPickedFiles, uploadSlides } from "../../../lib/slides";
import SlidePicker from "./SlidePicker";

// The "+ Add to Portfolio" popup (step 10: one form for everything): a title,
// a short description, a category, up to 5 tags, and up to 10 files: photos,
// videos and documents (PDF, DOCX, TXT), like Post a Service. Writing can also
// be pasted; it's added as a document at the end. The project is saved first,
// then its files are uploaded one at a time through the AI service, which
// watermarks and checks each one. Calls onSaved(item, failed), where failed
// lists files that couldn't be added. It can't be closed while saving.
export default function PortfolioUploadDialog({ userId, onSaved, onClose }) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("");
  const [tags, setTags] = useState([]);
  // What's being typed in the tags box, before it becomes a tag.
  const [tagDraft, setTagDraft] = useState("");
  // The picked files: [{ key, file, promo }].
  const [slideItems, setSlideItems] = useState([]);
  const [slidesError, setSlidesError] = useState("");
  // Pasted writing (the box opens with "Paste writing").
  const [pasting, setPasting] = useState(false);
  const [text, setText] = useState("");
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
    const result = await addPickedFiles(slideItems, files, true);
    setSlideItems(result.items);
    setSlidesError(result.error);
  };

  const handleRemoveSlide = (key) => {
    setSlideItems((prev) => prev.filter((item) => item.key !== key));
    setSlidesError("");
  };

  // Adds the typed or pasted words as tags (skipping empty ones, repeats, and
  // any past the 5th). Returns the new list.
  const addTags = (words) => {
    const next = [...tags];
    for (const word of words) {
      const tag = word.trim().replace(/\s+/g, " ").slice(0, MAX_TAG_LENGTH);
      if (tag && next.length < MAX_TAGS && !next.some((t) => t.toLowerCase() === tag.toLowerCase())) next.push(tag);
    }
    setTags(next);
    return next;
  };

  // A comma (typed or pasted) finishes a tag; what's after the last comma is still being typed.
  const handleTagChange = (event) => {
    const parts = event.target.value.split(",");
    if (parts.length > 1) addTags(parts.slice(0, -1));
    setTagDraft(parts[parts.length - 1]);
  };

  // Enter finishes a tag; Backspace in an empty box removes the last one.
  const handleTagKeyDown = (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      addTags([tagDraft]);
      setTagDraft("");
    } else if (event.key === "Backspace" && !tagDraft && tags.length) {
      setTags(tags.slice(0, -1));
    }
  };

  // Pasted writing takes one of the 10 places.
  const hasWriting = pasting && text.trim().length > 0;
  const fileCount = slideItems.length + (hasWriting ? 1 : 0);
  const hasContent = fileCount > 0;

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!title.trim() || !category || !hasContent) return;
    if (fileCount > MAX_SLIDES) {
      setFormError(`A project can have at most ${MAX_SLIDES} files, and the pasted writing counts as one.`);
      return;
    }
    setSaving(true);
    setFormError("");
    // A tag still being typed counts too.
    const finalTags = tagDraft.trim() ? addTags([tagDraft]) : tags;
    setTagDraft("");

    // 1. Save the project itself. Its files are added next.
    let project;
    try {
      project = await createPortfolioItem(userId, { title, description, category, tags: finalTags });
    } catch (err) {
      setSaving(false);
      setFormError(err.message);
      return;
    }

    // 2. Send the files one at a time through the AI service; pasted writing
    // goes last, as a text file.
    const items = hasWriting
      ? [...slideItems, { key: "writing", file: new File([text], "Writing.txt", { type: "text/plain" }), promo: false }]
      : slideItems;
    const { slides, failed } = await uploadSlides({ portfolioItemId: project.id }, items, userId, setProgress);
    onSaved({ ...project, slides }, failed);
  };

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

        <div>
          <label htmlFor="portfolioTitle" className="form-label text-white fw-semibold fs-7">Project title:</label>
          <input
            id="portfolioTitle"
            type="text"
            className="form-control bg-secondary bg-opacity-25 border-secondary text-white py-2"
            placeholder="e.g. Brand identity for a Cebu coffee shop"
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
            placeholder="What you made, the tools you used, and your role..."
            maxLength={MAX_DESCRIPTION_LENGTH}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            disabled={saving}
          ></textarea>
        </div>

        <div className="row g-3">
          <div className="col-sm-6">
            <label htmlFor="portfolioCategory" className="form-label text-white fw-semibold fs-7">Category:</label>
            <select
              id="portfolioCategory"
              className="form-select bg-secondary bg-opacity-25 border-secondary text-white py-2"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              disabled={saving}
              required
            >
              <option value="" disabled>Select a category...</option>
              {categories.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
            </select>
          </div>
          <div className="col-sm-6">
            <label htmlFor="portfolioTags" className="form-label text-white fw-semibold fs-7">Tags (up to {MAX_TAGS}, optional):</label>
            <div className="portfolio-tag-box form-control bg-secondary bg-opacity-25 border-secondary d-flex flex-wrap align-items-center gap-1 py-1">
              {tags.map((tag) => (
                <span key={tag} className="portfolio-tag">
                  {tag}
                  {!saving && (
                    <button type="button" aria-label={`Remove the tag ${tag}`} onClick={() => setTags(tags.filter((t) => t !== tag))}>
                      <i className="bi bi-x"></i>
                    </button>
                  )}
                </span>
              ))}
              {tags.length < MAX_TAGS && (
                <input
                  id="portfolioTags"
                  type="text"
                  className="flex-grow-1 bg-transparent border-0 text-white py-1"
                  placeholder={tags.length ? "" : "e.g. Photoshop, Logo"}
                  maxLength={MAX_TAG_LENGTH}
                  value={tagDraft}
                  onChange={handleTagChange}
                  onKeyDown={handleTagKeyDown}
                  onBlur={() => {
                    if (tagDraft.trim()) addTags([tagDraft]);
                    setTagDraft("");
                  }}
                  disabled={saving}
                />
              )}
            </div>
            <p className="text-secondary fs-9 mb-0 mt-1">Press Enter or a comma after each one. They help clients find your work.</p>
          </div>
        </div>

        <div>
          <label className="form-label text-white fw-semibold fs-7">Files (at least one, or pasted writing):</label>
          <SlidePicker
            items={slideItems}
            onAdd={handleAddSlides}
            onRemove={handleRemoveSlide}
            hint={SLIDE_HINT_WITH_DOCUMENTS}
            error={slidesError}
            disabled={saving}
            accept={SLIDE_ACCEPT_WITH_DOCUMENTS}
            addLabel="Add photos, videos or documents"
          />

          {pasting ? (
            <div className="mt-3">
              <div className="d-flex justify-content-between align-items-center mb-1">
                <label htmlFor="portfolioText" className="form-label text-white fw-semibold fs-7 mb-0">Pasted writing:</label>
                <button type="button" className="btn btn-link btn-sm text-white-50 p-0" onClick={() => { setPasting(false); setText(""); }} disabled={saving}>
                  Remove
                </button>
              </div>
              <textarea
                id="portfolioText"
                className="form-control bg-secondary bg-opacity-25 border-secondary text-white p-3"
                rows="6"
                placeholder="Paste your article, blog post, copy or story here..."
                maxLength={MAX_DOCUMENT_CHARACTERS}
                value={text}
                onChange={(e) => setText(e.target.value)}
                disabled={saving}
              ></textarea>
              <p className="text-secondary fs-9 mb-0 mt-1">
                Added as a document, with an invisible code in every sentence, so any copy can be traced back to you.
              </p>
            </div>
          ) : (
            <button
              type="button"
              className="btn btn-sm btn-outline-info rounded-pill px-3 mt-2"
              onClick={() => setPasting(true)}
              disabled={saving || slideItems.length >= MAX_SLIDES}
            >
              <i className="bi bi-clipboard me-1"></i> Paste writing
            </button>
          )}
        </div>

        {formError && <p className="text-warning fs-8 mb-0">{formError}</p>}

        <div className="d-flex justify-content-end gap-2 pt-1">
          <button type="button" className="btn btn-outline-secondary text-white-50 rounded-pill px-4 fw-bold" onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button type="submit" className="btn btn-gradient-orange rounded-pill px-4 fw-bold text-white" disabled={saving || !title.trim() || !category || !hasContent}>
            {saving ? progress || "Saving..." : "Add to Portfolio"}
          </button>
        </div>
      </form>
    </div>,
    document.body
  );
}
