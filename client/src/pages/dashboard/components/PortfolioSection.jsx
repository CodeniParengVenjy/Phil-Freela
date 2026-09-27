import { useEffect, useState } from "react";
import { useOutletContext } from "react-router-dom";
import { deletePortfolioItem, fetchPortfolio } from "../../../lib/portfolio";
import { itemSlides } from "../../../lib/slides";
import DeleteConfirmDialog from "./DeleteConfirmDialog";
import PortfolioUploadDialog from "./PortfolioUploadDialog";
import PortfolioViewer from "./PortfolioViewer";
import "./portfolio.css";

// Stops the browser's "Save image as..." menu on the cover pictures.
const blockSaveMenu = (event) => event.preventDefault();

// A freelancer's portfolio as a grid of project cards (the first photo or
// video is the cover); clicking one opens it big. Used on the owner's own
// Profile page (isOwner: can add and delete) and on the public portfolio page.
// viewerName: the visitor's @username, shown over the slides (see MediaCarousel).
export default function PortfolioSection({ freelancerId, isOwner = false, viewerName }) {
  const { showToast } = useOutletContext();
  const [items, setItems] = useState(null);
  const [loadError, setLoadError] = useState("");
  // The project opened big, the "+ Add" popup, and the project being deleted.
  const [viewing, setViewing] = useState(null);
  const [adding, setAdding] = useState(false);
  const [toDelete, setToDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);

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
    showToast(failed.length
      ? `"${project.title}" was added, but ${failed.length === 1 ? "1 file" : `${failed.length} files`} couldn't be. ${failed.join(" ")}`
      : `"${project.title}" was added to your portfolio!`);
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
          {isOwner ? "You haven't added any projects yet. Show clients your best work!" : "No portfolio projects yet."}
        </p>
      )}

      <div className="row g-3">
        {items?.map((item) => {
          const slides = itemSlides(item);
          const cover = slides[0];
          return (
            <div className="col-6 col-md-4" key={item.id}>
              <button type="button" className="portfolio-card" onClick={() => setViewing(item)} aria-label={`Open ${item.title}`}>
                <div className="portfolio-card-cover">
                  {cover?.mediaType === "video" && (
                    <video src={`${cover.url}#t=0.1`} muted preload="metadata" onContextMenu={blockSaveMenu} />
                  )}
                  {cover?.mediaType === "image" && <img src={cover.url} alt="" draggable={false} onContextMenu={blockSaveMenu} />}
                  {!cover && <i className="bi bi-images portfolio-card-empty"></i>}
                  {cover?.mediaType === "video" && <i className="bi bi-play-circle-fill portfolio-card-play"></i>}
                  {slides.length > 1 && (
                    <span className="portfolio-card-count"><i className="bi bi-collection me-1"></i>{slides.length}</span>
                  )}
                </div>
                <span className="portfolio-card-title">{item.title}</span>
              </button>
            </div>
          );
        })}
      </div>

      <PortfolioViewer
        item={viewing}
        viewerName={viewerName}
        onDelete={isOwner ? setToDelete : undefined}
        onClose={() => setViewing(null)}
      />

      {adding && <PortfolioUploadDialog userId={freelancerId} onSaved={handleSaved} onClose={() => setAdding(false)} />}

      <DeleteConfirmDialog
        open={Boolean(toDelete)}
        title="Delete this project?"
        message={toDelete ? `"${toDelete.title}" and its photos and videos will be deleted. This can't be undone.` : ""}
        busy={deleting}
        onConfirm={handleDelete}
        onCancel={() => setToDelete(null)}
      />
    </div>
  );
}
