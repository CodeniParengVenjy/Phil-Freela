import { useEffect, useState } from "react";
import { useOutletContext } from "react-router-dom";
import { supabase } from "../../../lib/supabaseClient";
import { slideUrl } from "../../../lib/slides";

// A photo, its uploader, and the service or portfolio project it's in.
const SLIDE_COLUMNS = `id, file_path, created_at, freelancer_id,
  owner:profiles!media_slides_freelancer_id_fkey(full_name, username),
  service:services(title), project:portfolio_items(title)`;

// Flagged photos, each with the photo it matched.
const FLAGGED_SELECT = `${SLIDE_COLUMNS}, match_score, promo,
  matched:media_slides!matched_slide_id(${SLIDE_COLUMNS})`;

// One side of the comparison: the picture and whose it is.
function SlideCard({ label, slide }) {
  if (!slide) {
    return (
      <div className="col-md-6">
        <p className="text-white-50 fs-8 mb-1">{label}</p>
        <div className="rounded-3 bg-black d-flex align-items-center justify-content-center text-white-50 fs-7 p-4" style={{ height: 260 }}>
          That photo has been deleted since.
        </div>
      </div>
    );
  }
  const where = slide.service ? `Service "${slide.service.title}"` : slide.project ? `Portfolio project "${slide.project.title}"` : "";
  return (
    <div className="col-md-6">
      <p className="text-white-50 fs-8 mb-1">{label}</p>
      <img src={slideUrl(slide.file_path)} alt={label} className="w-100 rounded-3 bg-black" style={{ height: 260, objectFit: "contain" }} />
      <p className="fs-7 fw-bold mb-0 mt-2">
        {slide.owner?.full_name || "Unknown"} <span className="text-white-50 fw-normal">@{slide.owner?.username || "?"}</span>
      </p>
      <p className="fs-8 text-white-50 mb-0">{where}{where && " • "}uploaded {new Date(slide.created_at).toLocaleString()}</p>
    </div>
  );
}

// Flagged Content (watermarking step 5): photos the copy check held back
// because a Vision Transformer found them nearly the same as another
// freelancer's photo. Until an admin decides, only the uploader and admins
// can see them.
export default function AdminFlaggedView() {
  const { refreshPendingFlagged } = useOutletContext();
  const [flagged, setFlagged] = useState(null);
  const [loadError, setLoadError] = useState("");
  const [message, setMessage] = useState({ text: "", type: "" });
  // The id of the photo being approved/removed, so its buttons wait.
  const [busyId, setBusyId] = useState(null);

  useEffect(() => {
    let active = true;
    supabase
      .from("media_slides")
      .select(FLAGGED_SELECT)
      .eq("status", "flagged")
      .order("created_at", { ascending: false })
      .then(({ data, error }) => {
        if (!active) return;
        if (error) setLoadError("Failed to load flagged content.");
        else setFlagged(data);
      });
    return () => {
      active = false;
    };
  }, []);

  const done = (slide, text) => {
    setFlagged((prev) => prev.filter((s) => s.id !== slide.id));
    setMessage({ text, type: "success" });
    refreshPendingFlagged();
  };

  // "Looks fine": show it to everyone again.
  const approve = async (slide) => {
    setBusyId(slide.id);
    const { data, error } = await supabase.from("media_slides").update({ status: "active" }).eq("id", slide.id).select("id");
    setBusyId(null);
    if (error || !data?.length) {
      setMessage({ text: "Couldn't approve that photo. Please try again.", type: "error" });
      return;
    }
    done(slide, "Approved: the photo is visible again.");
  };

  // "Remove the copy": delete the photo and its file.
  const remove = async (slide) => {
    if (!window.confirm("Remove this photo? This cannot be undone.")) return;
    setBusyId(slide.id);
    const { data, error } = await supabase.from("media_slides").delete().eq("id", slide.id).select("id");
    if (error || !data?.length) {
      setBusyId(null);
      setMessage({ text: "Couldn't remove that photo. Please try again.", type: "error" });
      return;
    }
    // The row is gone; if deleting the file fails it only leaves an unused file.
    await supabase.storage.from("slide-media").remove([slide.file_path]);
    setBusyId(null);
    done(slide, "Removed: the copy was deleted.");
  };

  return (
    <section>
      <h1 className="h4 fw-bold mb-1">Flagged Content</h1>
      <p className="text-white-50 fs-7 mb-3" style={{ maxWidth: 760 }}>
        Photos the copy check held back: a Vision Transformer found each one nearly the same as another freelancer's photo.
        Only the uploader and admins can see them until you decide. The earlier upload is usually the original, and
        Check Ownership shows whose hidden watermark a picture carries.
      </p>

      {message.text && (
        <p className={`admin-message ${message.type} fs-7 fw-semibold`} aria-live="polite">{message.text}</p>
      )}
      {loadError && <p className="text-danger fs-7">{loadError}</p>}
      {!loadError && flagged === null && <p className="text-white-50 fs-7">Loading...</p>}
      {flagged?.length === 0 && (
        <div className="admin-card rounded-4 p-4 text-center text-white-50 fs-7">
          <i className="bi bi-check2-circle fs-3 d-block mb-2"></i>
          Nothing to review. Photos that look nearly the same as another freelancer's show up here.
        </div>
      )}

      <div className="d-flex flex-column gap-3">
        {flagged?.map((slide) => (
          <div key={slide.id} className="admin-card rounded-4 p-3 p-md-4">
            <div className="d-flex flex-wrap align-items-center gap-2 mb-3">
              <span className="badge bg-warning text-dark">{Math.round((slide.match_score || 0) * 100)}% similar</span>
              {slide.promo && <span className="badge bg-secondary">Marked as Promo</span>}
            </div>
            <div className="row g-3 mb-3">
              <SlideCard label="Flagged upload" slide={slide} />
              <SlideCard label="Looks like this photo" slide={slide.matched} />
            </div>
            <div className="d-flex flex-wrap justify-content-end gap-2">
              <button className="btn btn-outline-success btn-sm rounded-pill px-3" disabled={busyId === slide.id} onClick={() => approve(slide)}>
                <i className="bi bi-check-lg me-1"></i> Looks fine, show it
              </button>
              <button className="btn btn-outline-danger btn-sm rounded-pill px-3" disabled={busyId === slide.id} onClick={() => remove(slide)}>
                <i className="bi bi-trash me-1"></i> Remove the copy
              </button>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
