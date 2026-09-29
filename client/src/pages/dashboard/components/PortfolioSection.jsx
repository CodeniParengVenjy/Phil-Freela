import { useEffect, useState } from "react";
import { useOutletContext } from "react-router-dom";
import { getCategory } from "../../../lib/categories";
import { deletePortfolioItem, fetchPortfolio, withoutHiddenCharacters } from "../../../lib/portfolio";
import { fetchSlideText, isOriginalWork, itemSlides, underReviewMessage } from "../../../lib/slides";
import OriginalBadge from "../../../components/OriginalBadge";
import DeleteConfirmDialog from "./DeleteConfirmDialog";
import PortfolioUploadDialog from "./PortfolioUploadDialog";
import PortfolioViewer from "./PortfolioViewer";
import "./portfolio.css";

// Stops the browser's "Save image as..." menu on the cover pictures.
const blockSaveMenu = (event) => event.preventDefault();

// The cover of a project whose first file is a document (step 10): its first
// lines, loaded from the .txt file.
function DocumentCover({ url }) {
  const [text, setText] = useState("");
  useEffect(() => {
    let active = true;
    fetchSlideText(url).then((loaded) => active && setText(loaded)).catch(() => {});
    return () => {
      active = false;
    };
  }, [url]);
  return (
    <div className="portfolio-card-text">
      <i className="bi bi-file-earmark-text-fill me-1"></i>
      {withoutHiddenCharacters(text).slice(0, 180)}
    </div>
  );
}

// A freelancer's portfolio as a grid of cards: projects (the first file is
// the cover: a photo, a video, or a document's first lines) and older
// writing items; clicking one opens it big. Each card shows its category and,
// if it earned it, the "Original" badge (step 10); chips on top filter by
// category. Used on the owner's own Profile page (isOwner: can add and
// delete) and on the public portfolio page.
// ownerName: the freelancer's @username, shown over the slides (see MediaCarousel).
export default function PortfolioSection({ freelancerId, ownerName, isOwner = false }) {
  const { showToast } = useOutletContext();
  const [items, setItems] = useState(null);
  const [loadError, setLoadError] = useState("");
  // The project opened big, the "+ Add" popup, and the project being deleted.
  const [viewing, setViewing] = useState(null);
  const [adding, setAdding] = useState(false);
  const [toDelete, setToDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);
  // The category chip picked ("" = all).
  const [shownCategory, setShownCategory] = useState("");

  useEffect(() => {
    if (!freelancerId) return undefined;
    let active = true;
    fetchPortfolio(freelancerId)
      .then((data) => {
        if (active) setItems(data);
      })
      .catch((err) => {
        if (active) setLoadError(err.message);
      });
    return () => {
      active = false;
    };
  }, [freelancerId]);

  const handleSaved = (project, failed) => {
    setItems((prev) => [project, ...(prev || [])]);
    setAdding(false);
    // Anything held back for an admin (steps 5-9) is mentioned too.
    const heldBack = underReviewMessage(project.slides);
    showToast(`${failed.length
      ? `"${project.title}" was added, but ${failed.length === 1 ? "1 file" : `${failed.length} files`} couldn't be. ${failed.join(" ")}`
      : `"${project.title}" was added to your portfolio!`} ${heldBack}`.trim());
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await deletePortfolioItem(toDelete);
      setItems((prev) => prev.filter((item) => item.id !== toDelete.id));
      setViewing(null);
      showToast(`"${toDelete.title}" was deleted.`);
      setToDelete(null);
    } catch (err) {
      showToast(err.message);
    }
    setDeleting(false);
  };

  // The categories used in this portfolio, and the items the picked chip shows.
  const usedCategories = [...new Set((items || []).map((item) => item.category).filter(Boolean))];
  const shownItems = items?.filter((item) => !shownCategory || item.category === shownCategory);

  return (
    <div>
      <div className="d-flex justify-content-between align-items-center gap-2 mb-3">
        <h5 className="text-white fw-bold mb-0"><i className="bi bi-grid-3x3-gap-fill text-orange me-2"></i> Portfolio</h5>
        {isOwner && (
          <button type="button" className="btn btn-sm btn-outline-warning rounded-pill fs-8 fw-bold" onClick={() => setAdding(true)}>
            + Add to Portfolio
          </button>
        )}
      </div>

      {loadError && <p className="text-danger fs-7 mb-0">{loadError}</p>}
      {!loadError && items === null && <p className="text-secondary fs-7 mb-0">Loading...</p>}
      {items?.length === 0 && (
        <p className="text-secondary fs-7 mb-0">
          {isOwner ? "You haven't added anything yet. Show clients your best work!" : "No portfolio projects yet."}
        </p>
      )}

      {/* Category chips, once the projects have more than one category. */}
      {usedCategories.length > 1 && (
        <div className="d-flex flex-wrap gap-2 mb-3">
          {["", ...usedCategories].map((value) => (
            <button
              key={value || "all"}
              type="button"
              className={`btn btn-sm rounded-pill px-3 fs-8 fw-semibold ${shownCategory === value ? "btn-gradient-orange text-white" : "btn-outline-secondary text-white-50"}`}
              onClick={() => setShownCategory(value)}
            >
              {value ? getCategory(value).label : "All"}
            </button>
          ))}
        </div>
      )}

      <div className="row g-3">
        {shownItems?.map((item) => {
          const slides = itemSlides(item);
          const cover = slides[0];
          return (
            <div className="col-6 col-md-4" key={item.id}>
              <button type="button" className="portfolio-card" onClick={() => setViewing(item)} aria-label={`Open ${item.title}`}>
                <div className="portfolio-card-cover">
                  {item.kind === "document" && (
                    <div className="portfolio-card-text">
                      <i className="bi bi-file-earmark-text-fill me-1"></i>
                      {withoutHiddenCharacters(item.body).slice(0, 180)}
                    </div>
                  )}
                  {item.status === "flagged" && <span className="portfolio-card-review"><i className="bi bi-hourglass-split me-1"></i>Under review</span>}
                  {cover?.mediaType === "video" && (
                    <video src={`${cover.url}#t=0.1`} muted preload="metadata" onContextMenu={blockSaveMenu} />
                  )}
                  {cover?.mediaType === "image" && <img src={cover.url} alt="" draggable={false} onContextMenu={blockSaveMenu} />}
                  {cover?.mediaType === "document" && <DocumentCover url={cover.url} />}
                  {isOriginalWork(item) && <OriginalBadge className="portfolio-card-original" />}
                  {!cover && item.kind !== "document" && <i className="bi bi-images portfolio-card-empty"></i>}
                  {cover?.mediaType === "video" && <i className="bi bi-play-circle-fill portfolio-card-play"></i>}
                  {slides.length > 1 && (
                    <span className="portfolio-card-count"><i className="bi bi-collection me-1"></i>{slides.length}</span>
                  )}
                </div>
                <span className="portfolio-card-title">
                  {item.title}
                  {item.category && <span className="portfolio-card-category">{getCategory(item.category).label}</span>}
                </span>
              </button>
            </div>
          );
        })}
      </div>

      <PortfolioViewer
        item={viewing}
        ownerName={ownerName}
        onDelete={isOwner ? setToDelete : undefined}
        onClose={() => setViewing(null)}
      />

      {adding && <PortfolioUploadDialog userId={freelancerId} onSaved={handleSaved} onClose={() => setAdding(false)} />}

      <DeleteConfirmDialog
        open={Boolean(toDelete)}
        title="Delete this project?"
        message={toDelete ? `"${toDelete.title}" and its files will be deleted. This can't be undone.` : ""}
        busy={deleting}
        onConfirm={handleDelete}
        onCancel={() => setToDelete(null)}
      />
    </div>
  );
}
