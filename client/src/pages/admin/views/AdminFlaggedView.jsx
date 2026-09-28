import { useEffect, useState } from "react";
import { useOutletContext } from "react-router-dom";
import { supabase } from "../../../lib/supabaseClient";
import { slideUrl } from "../../../lib/slides";
import { withoutHiddenCharacters } from "../../../lib/portfolio";

// A photo, its uploader, and the service or portfolio project it's in.
const SLIDE_COLUMNS = `id, file_path, created_at, freelancer_id,
  owner:profiles!media_slides_freelancer_id_fkey(full_name, username),
  service:services(title), project:portfolio_items(title)`;

// Flagged photos, each with the photo it matched. (A table linked to itself is
// written with the column name, media_slides!matched_slide_id.)
const FLAGGED_PHOTOS_SELECT = `${SLIDE_COLUMNS}, match_score, promo,
  matched:media_slides!matched_slide_id(${SLIDE_COLUMNS})`;

// A document and its writer.
const DOCUMENT_COLUMNS = `id, title, body, created_at, freelancer_id,
  owner:profiles!portfolio_items_freelancer_id_fkey(full_name, username)`;

// Flagged documents, each with the document it matched.
const FLAGGED_DOCUMENTS_SELECT = `${DOCUMENT_COLUMNS}, match_score,
  matched:portfolio_items!matched_item_id(${DOCUMENT_COLUMNS})`;

// The database table behind each kind of flagged item.
const TABLES = { photo: "media_slides", document: "portfolio_items" };

function Owner({ item, where }) {
  return (
    <>
      <p className="fs-7 fw-bold mb-0 mt-2">
        {item.owner?.full_name || "Unknown"} <span className="text-white-50 fw-normal">@{item.owner?.username || "?"}</span>
      </p>
      <p className="fs-8 text-white-50 mb-0">{where}{where && " • "}uploaded {new Date(item.created_at).toLocaleString()}</p>
    </>
  );
}

function Deleted() {
  return (
    <div className="rounded-3 bg-black d-flex align-items-center justify-content-center text-white-50 fs-7 p-4" style={{ height: 260 }}>
      That item has been deleted since.
    </div>
  );
}

// One side of a photo comparison: the picture and whose it is.
function SlideCard({ label, slide }) {
  const where = slide?.service ? `Service "${slide.service.title}"` : slide?.project ? `Portfolio project "${slide.project.title}"` : "";
  return (
    <div className="col-md-6">
      <p className="text-white-50 fs-8 mb-1">{label}</p>
      {slide ? (
        <>
          <img src={slideUrl(slide.file_path)} alt={label} className="w-100 rounded-3 bg-black" style={{ height: 260, objectFit: "contain" }} />
          <Owner item={slide} where={where} />
        </>
      ) : <Deleted />}
    </div>
  );
}

// One side of a document comparison: the start of the text and whose it is.
function DocumentCard({ label, doc }) {
  return (
    <div className="col-md-6">
      <p className="text-white-50 fs-8 mb-1">{label}</p>
      {doc ? (
        <>
          <div className="rounded-3 bg-black p-3 fs-8 text-light overflow-auto" style={{ height: 260, whiteSpace: "pre-wrap" }}>
            {withoutHiddenCharacters(doc.body).slice(0, 1500)}
          </div>
          <Owner item={doc} where={`Document "${doc.title}"`} />
        </>
      ) : <Deleted />}
    </div>
  );
}

// Flagged Content (watermarking steps 5-6): photos and documents the copy
// check held back because they're nearly the same as another freelancer's
// (a Vision Transformer compares photos, a text model compares writing).
// Until an admin decides, only the uploader and admins can see them.
export default function AdminFlaggedView() {
  const { refreshPendingFlagged } = useOutletContext();
  // [{ ...item, type: "photo" | "document" }], newest first.
  const [flagged, setFlagged] = useState(null);
  const [loadError, setLoadError] = useState("");
  const [message, setMessage] = useState({ text: "", type: "" });
  // The id of the item being approved/removed, so its buttons wait.
  const [busyId, setBusyId] = useState(null);

  useEffect(() => {
    let active = true;
    Promise.all([
      supabase.from("media_slides").select(FLAGGED_PHOTOS_SELECT).eq("status", "flagged"),
      supabase.from("portfolio_items").select(FLAGGED_DOCUMENTS_SELECT).eq("kind", "document").eq("status", "flagged")
    ]).then(([photos, documents]) => {
      if (!active) return;
      if (photos.error || documents.error) {
        setLoadError("Failed to load flagged content.");
        return;
      }
      setFlagged([
        ...photos.data.map((item) => ({ ...item, type: "photo" })),
        ...documents.data.map((item) => ({ ...item, type: "document" }))
      ].sort((a, b) => b.created_at.localeCompare(a.created_at)));
    });
    return () => {
      active = false;
    };
  }, []);

  const done = (item, text) => {
    setFlagged((prev) => prev.filter((other) => other.id !== item.id));
    setMessage({ text, type: "success" });
    refreshPendingFlagged();
  };

  // "Looks fine": show it to everyone again.
  const approve = async (item) => {
    setBusyId(item.id);
    const { data, error } = await supabase.from(TABLES[item.type]).update({ status: "active" }).eq("id", item.id).select("id");
    setBusyId(null);
    if (error || !data?.length) {
      setMessage({ text: `Couldn't approve that ${item.type}. Please try again.`, type: "error" });
      return;
    }
    done(item, `Approved: the ${item.type} is visible again.`);
  };

  // "Remove the copy": delete it (and a photo's file).
  const remove = async (item) => {
    if (!window.confirm(`Remove this ${item.type}? This cannot be undone.`)) return;
    setBusyId(item.id);
    const { data, error } = await supabase.from(TABLES[item.type]).delete().eq("id", item.id).select("id");
    if (error || !data?.length) {
      setBusyId(null);
      setMessage({ text: `Couldn't remove that ${item.type}. Please try again.`, type: "error" });
      return;
    }
    // The row is gone; if deleting the file fails it only leaves an unused file.
    if (item.type === "photo") await supabase.storage.from("slide-media").remove([item.file_path]);
    setBusyId(null);
    done(item, "Removed: the copy was deleted.");
  };

  return (
    <section>
      <h1 className="h4 fw-bold mb-1">Flagged Content</h1>
      <p className="text-white-50 fs-7 mb-3" style={{ maxWidth: 760 }}>
        Photos and documents the copy check held back because they're nearly the same as another freelancer's work
        (a Vision Transformer compares photos, a text model compares writing). Only the uploader and admins can see them
        until you decide. The earlier upload is usually the original, and Check Ownership shows whose hidden watermark
        something carries.
      </p>

      {message.text && (
        <p className={`admin-message ${message.type} fs-7 fw-semibold`} aria-live="polite">{message.text}</p>
      )}
      {loadError && <p className="text-danger fs-7">{loadError}</p>}
      {!loadError && flagged === null && <p className="text-white-50 fs-7">Loading...</p>}
      {flagged?.length === 0 && (
        <div className="admin-card rounded-4 p-4 text-center text-white-50 fs-7">
          <i className="bi bi-check2-circle fs-3 d-block mb-2"></i>
          Nothing to review. Photos and documents that look nearly the same as another freelancer's show up here.
        </div>
      )}

      <div className="d-flex flex-column gap-3">
        {flagged?.map((item) => (
          <div key={item.id} className="admin-card rounded-4 p-3 p-md-4">
            <div className="d-flex flex-wrap align-items-center gap-2 mb-3">
              <span className="badge bg-info text-dark">{item.type === "photo" ? "Photo" : "Document"}</span>
              <span className="badge bg-warning text-dark">
                {item.match_score >= 1 ? "Carries the other freelancer's hidden code" : `${Math.round((item.match_score || 0) * 100)}% similar`}
              </span>
              {item.promo && <span className="badge bg-secondary">Marked as Promo</span>}
            </div>
            <div className="row g-3 mb-3">
              {item.type === "photo" ? (
                <>
                  <SlideCard label="Flagged upload" slide={item} />
                  <SlideCard label="Looks like this photo" slide={item.matched} />
                </>
              ) : (
                <>
                  <DocumentCard label="Flagged document" doc={item} />
                  <DocumentCard label="Looks like this document" doc={item.matched} />
                </>
              )}
            </div>
            <div className="d-flex flex-wrap justify-content-end gap-2">
              <button className="btn btn-outline-success btn-sm rounded-pill px-3" disabled={busyId === item.id} onClick={() => approve(item)}>
                <i className="bi bi-check-lg me-1"></i> Looks fine, show it
              </button>
              <button className="btn btn-outline-danger btn-sm rounded-pill px-3" disabled={busyId === item.id} onClick={() => remove(item)}>
                <i className="bi bi-trash me-1"></i> Remove the copy
              </button>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
