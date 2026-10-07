import { useEffect, useState } from "react";
import { useOutletContext } from "react-router-dom";
import { supabase } from "../../../lib/supabaseClient";
import { fetchSlideText, slidePagePaths, slideUrl } from "../../../lib/slides";
import { withoutHiddenCharacters } from "../../../lib/portfolio";

// A slide (photo, video or document), its uploader, and the service or
// portfolio project it's in. page_count: a PDF's page pictures (step 11).
const SLIDE_COLUMNS = `id, media_type, file_path, page_count, created_at, freelancer_id,
  owner:profiles!media_slides_freelancer_id_fkey(full_name, username),
  service:services(title), project:portfolio_items(title)`;

// Flagged slides, with the id of what each one matched: another slide
// (matched_slide_id) or a portfolio document (matched_item_id, step 8).
// The matched items themselves are loaded by id afterwards (see load below).
// They can't be asked for in the same request: for a table linked to itself,
// "media_slides!matched_slide_id(...)" gives the LIST of slides that matched
// this one, not the one slide this one matched.
const FLAGGED_SLIDES_SELECT = `${SLIDE_COLUMNS}, match_score, promo, matched_slide_id, matched_item_id`;

// A document and its writer.
const DOCUMENT_COLUMNS = `id, title, body, created_at, freelancer_id,
  owner:profiles!portfolio_items_freelancer_id_fkey(full_name, username)`;

// Flagged documents, with the id of what each one matched: another document
// (matched_item_id) or a document slide in a service (matched_slide_id, step 8).
const FLAGGED_DOCUMENTS_SELECT = `${DOCUMENT_COLUMNS}, match_score, matched_item_id, matched_slide_id`;

// The database table behind each kind of flagged item.
const TABLES = { slide: "media_slides", document: "portfolio_items" };
// What to call a flagged item in messages.
const itemName = (item) => (item.type === "document" ? "document" : { image: "photo", video: "video", document: "document" }[item.media_type]);

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

// The start of a text, in the same box for both kinds of documents.
function TextBox({ text }) {
  return (
    <div className="rounded-3 bg-black p-3 fs-8 text-light overflow-auto" style={{ height: 260, whiteSpace: "pre-wrap" }}>
      {withoutHiddenCharacters(text).slice(0, 1500)}
    </div>
  );
}

// A document slide's text, loaded from its .txt file.
function SlideText({ filePath }) {
  const [text, setText] = useState("Loading document...");
  useEffect(() => {
    let active = true;
    fetchSlideText(slideUrl(filePath))
      .then((loaded) => active && setText(loaded))
      .catch((err) => active && setText(err.message));
    return () => {
      active = false;
    };
  }, [filePath]);
  return <TextBox text={text} />;
}

// One side of a comparison: a slide (the photo, the video, or a document's
// text) and whose it is. showPages: show a PDF's page pictures instead of its
// text, for when the other side is a picture (a screenshot of one of its
// pages, or a photo saved into the PDF). Several pages scroll sideways.
function SlideCard({ label, slide, showPages = false }) {
  const where = slide?.service ? `Service "${slide.service.title}"` : slide?.project ? `Portfolio project "${slide.project.title}"` : "";
  const mediaStyle = { height: 260, objectFit: "contain" };
  const pages = showPages && slide?.media_type === "document" ? slidePagePaths(slide) : [];
  return (
    <div className="col-md-6">
      <p className="text-white-50 fs-8 mb-1">{label}</p>
      {slide ? (
        <>
          {pages.length > 1 ? (
            <div className="d-flex gap-2 overflow-auto rounded-3 bg-black" style={{ height: 260 }}>
              {pages.map((path, index) => <img key={path} src={slideUrl(path)} alt={`${label}, page ${index + 1}`} className="h-100" />)}
            </div>
          ) : pages.length === 1 ? <img src={slideUrl(pages[0])} alt={label} className="w-100 rounded-3 bg-black" style={mediaStyle} />
            : slide.media_type === "document" ? <SlideText filePath={slide.file_path} />
            : slide.media_type === "video" ? <video src={slideUrl(slide.file_path)} controls preload="metadata" className="w-100 rounded-3 bg-black" style={mediaStyle} />
              : <img src={slideUrl(slide.file_path)} alt={label} className="w-100 rounded-3 bg-black" style={mediaStyle} />}
          <Owner item={slide} where={where} />
        </>
      ) : <Deleted />}
    </div>
  );
}

// One side of a comparison: a portfolio document's text and whose it is.
function DocumentCard({ label, doc }) {
  return (
    <div className="col-md-6">
      <p className="text-white-50 fs-8 mb-1">{label}</p>
      {doc ? (
        <>
          <TextBox text={doc.body} />
          <Owner item={doc} where={`Document "${doc.title}"`} />
        </>
      ) : <Deleted />}
    </div>
  );
}

// The rows with these ids (none if there are no ids).
async function rowsById(table, columns, ids) {
  if (!ids.length) return [];
  const { data, error } = await supabase.from(table).select(columns).in("id", ids);
  if (error) throw error;
  return data;
}

// Flagged Content (watermarking steps 5-8): photos, videos and documents the
// copy check held back because they're nearly the same as another
// freelancer's (a Vision Transformer compares photos and video frames, a text
// model compares writing). Until an admin decides, only the uploader and
// admins can see them.
export default function AdminFlaggedView() {
  const { refreshPendingFlagged } = useOutletContext();
  // [{ ...item, type: "slide" | "document" }], newest first.
  const [flagged, setFlagged] = useState(null);
  const [loadError, setLoadError] = useState("");
  const [message, setMessage] = useState({ text: "", type: "" });
  // The id of the item being approved/removed, so its buttons wait.
  const [busyId, setBusyId] = useState(null);

  useEffect(() => {
    let active = true;
    const load = async () => {
      const [slides, documents] = await Promise.all([
        supabase.from("media_slides").select(FLAGGED_SLIDES_SELECT).eq("status", "flagged"),
        supabase.from("portfolio_items").select(FLAGGED_DOCUMENTS_SELECT).eq("kind", "document").eq("status", "flagged")
      ]);
      if (slides.error || documents.error) throw new Error();
      // What they matched, loaded by id: a slide or a document can each
      // match a slide or a portfolio document (see
      // supabase_service_documents_schema.sql). null = deleted since.
      const everything = [...slides.data, ...documents.data];
      const [matchedSlides, matchedDocuments] = await Promise.all([
        rowsById("media_slides", SLIDE_COLUMNS, everything.map((item) => item.matched_slide_id).filter(Boolean)),
        rowsById("portfolio_items", DOCUMENT_COLUMNS, everything.map((item) => item.matched_item_id).filter(Boolean))
      ]);
      const find = (rows, id) => rows.find((row) => row.id === id) || null;
      return [
        ...slides.data.map((item) => ({
          ...item, type: "slide",
          matched: find(matchedSlides, item.matched_slide_id), matchedDocument: find(matchedDocuments, item.matched_item_id)
        })),
        ...documents.data.map((item) => ({
          ...item, type: "document",
          matched: find(matchedDocuments, item.matched_item_id), matchedSlide: find(matchedSlides, item.matched_slide_id)
        }))
      ].sort((a, b) => b.created_at.localeCompare(a.created_at));
    };
    load()
      .then((items) => active && setFlagged(items))
      .catch(() => active && setLoadError("Failed to load flagged content."));
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
      setMessage({ text: `Couldn't approve that ${itemName(item)}. Please try again.`, type: "error" });
      return;
    }
    done(item, `Approved: the ${itemName(item)} is visible again.`);
  };

  // "Remove the copy": delete it (and a slide's file).
  const remove = async (item) => {
    if (!window.confirm(`Remove this ${itemName(item)}? This cannot be undone.`)) return;
    setBusyId(item.id);
    const { data, error } = await supabase.from(TABLES[item.type]).delete().eq("id", item.id).select("id");
    if (error || !data?.length) {
      setBusyId(null);
      setMessage({ text: `Couldn't remove that ${itemName(item)}. Please try again.`, type: "error" });
      return;
    }
    // The row is gone; if deleting the files (a PDF also has page pictures)
    // fails it only leaves unused files.
    if (item.type === "slide") await supabase.storage.from("slide-media").remove([item.file_path, ...slidePagePaths(item)]);
    setBusyId(null);
    done(item, "Removed: the copy was deleted.");
  };

  // A PDF held because one of its pages carries a photo's (or video's) hidden
  // code: someone saved that picture into a PDF (step 12). Its page pictures
  // are shown, not its text, so the admin can see the picture.
  const isPictureInPdf = (item) => item.type === "slide" && item.media_type === "document"
    && Boolean(item.matched) && item.matched.media_type !== "document";

  // The item it was matched with: a slide or a portfolio document.
  const matchedCard = (item) => {
    if (item.type === "slide" && item.matched_item_id) return <DocumentCard label="Looks like this document" doc={item.matchedDocument} />;
    if (item.type === "document" && item.matched_slide_id) return <SlideCard label="Looks like this document" slide={item.matchedSlide} />;
    if (item.type === "document") return <DocumentCard label="Looks like this document" doc={item.matched} />;
    // A photo can carry a document's hidden code: a screenshot of one of a
    // PDF's pages (step 11). Then the PDF's pages are shown next to it.
    if (item.media_type !== "document" && item.matched?.media_type === "document") {
      return <SlideCard label="Carries this document's hidden code" slide={item.matched} showPages />;
    }
    if (isPictureInPdf(item)) return <SlideCard label={`A page carries this ${itemName(item.matched)}'s hidden code`} slide={item.matched} />;
    return <SlideCard label={`Looks like this ${itemName(item)}`} slide={item.matched} />;
  };

  return (
    <section>
      <h1 className="h4 fw-bold mb-1">Flagged Content</h1>
      <p className="text-white-50 fs-7 mb-3" style={{ maxWidth: 760 }}>
        Photos, videos and documents the copy check held back because they're nearly the same as another freelancer's work
        (a Vision Transformer compares photos and video frames, a text model compares writing). Only the uploader and admins
        can see them until you decide. The earlier upload is usually the original, and Check Ownership shows whose hidden
        watermark something carries.
      </p>

      {message.text && (
        <p className={`admin-message ${message.type} fs-7 fw-semibold`} aria-live="polite">{message.text}</p>
      )}
      {loadError && <p className="text-danger fs-7">{loadError}</p>}
      {!loadError && flagged === null && <p className="text-white-50 fs-7">Loading...</p>}
      {flagged?.length === 0 && (
        <div className="admin-card rounded-4 p-4 text-center text-white-50 fs-7">
          <i className="bi bi-check2-circle fs-3 d-block mb-2"></i>
          Nothing to review. Photos, videos and documents that look nearly the same as another freelancer's show up here.
        </div>
      )}

      <div className="d-flex flex-column gap-3">
        {flagged?.map((item) => (
          <div key={item.id} className="admin-card rounded-4 p-3 p-md-4">
            <div className="d-flex flex-wrap align-items-center gap-2 mb-3">
              <span className="badge bg-info text-dark text-capitalize">{itemName(item)}</span>
              <span className="badge bg-warning text-dark">
                {item.match_score >= 1 ? "Carries the other freelancer's hidden code" : `${Math.round((item.match_score || 0) * 100)}% similar`}
              </span>
              {item.promo && <span className="badge bg-secondary">Marked as Promo</span>}
            </div>
            <div className="row g-3 mb-3">
              {item.type === "slide"
                ? <SlideCard label={`Flagged ${itemName(item)}`} slide={item} showPages={isPictureInPdf(item)} />
                : <DocumentCard label="Flagged document" doc={item} />}
              {matchedCard(item)}
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
