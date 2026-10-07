import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router-dom";
import { supabase } from "../../../lib/supabaseClient";
import { matchMoodboard } from "../../../lib/aiService";
import { shrinkImage } from "../../../lib/shrinkImage";
import { slideUrl } from "../../../lib/slides";
import { useVerifiedIds } from "../../../lib/useVerifiedIds";
import VerifiedBadge from "../../../components/VerifiedBadge";
import Avatar from "../../../components/Avatar";
import BookDialog from "./BookDialog";
import PhotoPreview from "./PhotoPreview";

// Scans one picture: asks the AI service who matches, then loads each
// freelancer and their matching picture under the normal database rules.
// Returns the matches, best first ([] = nothing close enough).
async function findMatches(picture) {
  const results = await matchMoodboard(await shrinkImage(picture, 800));
  if (results.length === 0) return [];

  const freelancerIds = results.map((r) => r.freelancer_id);
  const slideIds = results.map((r) => r.slide_id);
  const [{ data: freelancers, error: fErr }, { data: slides, error: sErr }] = await Promise.all([
    supabase.from("profiles").select("id, full_name, username, avatar_path").in("id", freelancerIds),
    supabase.from("media_slides").select("id, file_path").in("id", slideIds)
  ]);
  if (fErr || sErr) throw new Error("Couldn't load the matching freelancers. Please try again.");

  const freelancerById = Object.fromEntries((freelancers || []).map((f) => [f.id, f]));
  const slideById = Object.fromEntries((slides || []).map((s) => [s.id, s]));
  // Anything that failed to load (e.g. a freelancer who stopped being
  // verified between the search and now) simply drops out here.
  return results
    .filter((r) => freelancerById[r.freelancer_id] && slideById[r.slide_id])
    .map((r) => ({ ...r, freelancer: freelancerById[r.freelancer_id], slide: slideById[r.slide_id] }));
}

// The Search by picture popup: AI Moodboard Matching (feature 2 in
// PhilFreela-System-Functions.md, clients only). A client picks a picture with
// the camera button of a search box, or drops one on the top bar, and this
// popup opens over the page they are on. It finds the freelancers whose
// portfolio work looks closest to the picture: CLIP turns pictures into
// numbers that describe their style (color, composition, mood), the AI
// service returns freelancer ids and scores, and this popup loads their
// profile and matching picture itself, under the normal database rules.
//
// picture: the File to scan, or null when closed. The parent gives the popup
// a new key for each picture, so it starts fresh every time.
export default function PictureSearchDialog({ picture, onClose, currentUserId, openChat, showToast }) {
  // null = still scanning; [] = scanned, nothing close enough.
  const [matches, setMatches] = useState(null);
  const [error, setError] = useState("");
  // The freelancer being booked (null = Book popup closed). The match is a
  // freelancer, not one service, so the Book popup lists their services.
  const [bookTarget, setBookTarget] = useState(null);

  // Scans the picture as soon as the popup opens.
  useEffect(() => {
    if (!picture) return undefined;
    let active = true;
    findMatches(picture)
      .then((found) => {
        if (active) setMatches(found);
      })
      .catch((err) => {
        if (active) setError(err.message);
      });
    return () => { active = false; };
  }, [picture]);

  // Escape closes the popup (the Book popup on top of it closes first).
  useEffect(() => {
    if (!picture) return undefined;
    const handleKeyDown = (event) => {
      if (event.key === "Escape" && !bookTarget) onClose();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [picture, bookTarget, onClose]);

  const verifiedIds = useVerifiedIds((matches || []).map((m) => m.freelancer.id));

  if (!picture) return null;

  const scanning = matches === null && !error;

  const handleMessage = (freelancerId) => {
    onClose();
    openChat(freelancerId);
  };

  // A click in the card doesn't close the popup, unless it is on a link (a
  // freelancer's name, picture or "View portfolio"): that opens another
  // page, so the popup closes with it.
  const handleCardClick = (event) => {
    event.stopPropagation();
    if (event.target.closest("a")) onClose();
  };

  // The Book popup is kept outside the backdrop, so a click in it doesn't
  // count as a click on this popup's backdrop.
  return (
    <>
      {createPortal(
        <div
          className="role-confirm-backdrop"
          style={{
            position: "fixed", inset: 0, zIndex: 1300,
            background: "rgba(0,0,0,0.65)",
            display: "flex", alignItems: "center", justifyContent: "center", padding: "1rem"
          }}
          onClick={onClose}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="picture-search-title"
            className="role-confirm-card bg-dark text-white border border-secondary border-opacity-25 rounded-4 p-4"
            style={{ maxWidth: 920, width: "100%", maxHeight: "92vh", overflowY: "auto" }}
            onClick={handleCardClick}
          >
            <div className="d-flex align-items-start gap-3 mb-3">
              <PhotoPreview photo={picture} alt="The picture you chose" />
              <div className="flex-grow-1" style={{ minWidth: 0 }}>
                <h5 id="picture-search-title" className="fw-bold mb-1"><i className="bi bi-camera text-role me-2"></i>Search by picture</h5>
                <p className="text-secondary fs-7 mb-0">
                  Freelancers whose portfolio looks closest to your picture in color, composition and mood.
                </p>
              </div>
              <button type="button" className="btn-close btn-close-white flex-shrink-0" aria-label="Close" onClick={onClose}></button>
            </div>

            {scanning && (
              <p className="text-secondary fs-7 text-center py-4 mb-0" role="status">
                <span className="spinner-border spinner-border-sm me-2" aria-hidden="true"></span>
                Scanning the picture and comparing it with every verified freelancer's portfolio. This can take a few seconds, longer the first time.
              </p>
            )}
            {error && <p className="text-danger fs-7 text-center py-4 mb-0">{error}</p>}
            {matches?.length === 0 && (
              <p className="text-secondary fs-7 text-center py-4 mb-0">
                No close matches yet. Try a different picture, or check back once more freelancers post their portfolios.
              </p>
            )}

            {matches?.length > 0 && (
              <div className="row g-3">
                {matches.map((match) => (
                  <div className="col-sm-6 col-lg-4" key={match.slide_id}>
                    <MatchCard
                      match={match}
                      verified={verifiedIds.has(match.freelancer.id)}
                      isMine={match.freelancer.id === currentUserId}
                      onMessage={handleMessage}
                      onBook={setBookTarget}
                    />
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>,
        document.body
      )}

      <BookDialog
        key={bookTarget?.freelancerId}
        target={bookTarget}
        onClose={() => setBookTarget(null)}
        onBooked={() => {
          showToast(`Booking sent to ${bookTarget.freelancerName}. You can follow it in Bookings.`);
          setBookTarget(null);
        }}
      />
    </>
  );
}

// One matching freelancer: their closest-styled portfolio picture, name, and
// Book and Message buttons (searching by picture is for clients).
function MatchCard({ match, verified, isMine, onMessage, onBook }) {
  const { freelancer, slide, strong } = match;
  const name = freelancer.full_name || freelancer.username || "Freelancer";

  return (
    <div className="glass-card rounded-4 h-100 border border-secondary border-opacity-25 overflow-hidden hover-lift d-flex flex-column">
      <div className="position-relative">
        <img src={slideUrl(slide.file_path)} alt={`${name}'s portfolio`} className="w-100" style={{ height: 180, objectFit: "cover" }} />
        <span className={`badge rounded-pill fw-semibold position-absolute top-0 end-0 m-2 ${strong ? "bg-success" : "bg-dark bg-opacity-75"}`}>
          {strong ? "Strong match" : "Related style"}
        </span>
      </div>

      <div className="p-3 d-flex flex-column flex-grow-1">
        <div className="d-flex align-items-center gap-2 mb-3">
          <Avatar path={freelancer.avatar_path} name={name} size={36} to={`/dashboard/freelancers/${freelancer.id}`} />
          <div className="overflow-hidden">
            <Link to={`/dashboard/freelancers/${freelancer.id}`} className="text-white fw-bold text-truncate d-block">
              {name}
              <VerifiedBadge verified={verified} />
            </Link>
          </div>
        </div>

        {/* "View portfolio" takes the first line; Book and Message share the second. */}
        <div className="mt-auto d-flex flex-wrap gap-2">
          <Link to={`/dashboard/freelancers/${freelancer.id}`} className="btn btn-sm btn-outline-role rounded-pill px-3 fw-bold w-100 text-center">
            View portfolio
          </Link>
          {!isMine && (
            <>
              <button
                type="button"
                className="btn btn-sm btn-outline-role rounded-pill px-3 fw-bold flex-grow-1"
                onClick={() => onBook({ freelancerId: freelancer.id, freelancerName: name, service: null })}
              >
                <i className="bi bi-calendar-check me-1"></i> Book
              </button>
              <button type="button" className="btn btn-sm btn-gradient-role rounded-pill px-3 fw-bold text-white flex-grow-1" aria-label={`Message ${name}`} onClick={() => onMessage(freelancer.id)}>
                <i className="bi bi-chat-dots me-1"></i> Message
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
