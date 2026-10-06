import { useState } from "react";
import { Link, useOutletContext } from "react-router-dom";
import { supabase } from "../../../lib/supabaseClient";
import { matchMoodboard } from "../../../lib/aiService";
import { shrinkImage } from "../../../lib/shrinkImage";
import { slideUrl } from "../../../lib/slides";
import { useVerifiedIds } from "../../../lib/useVerifiedIds";
import VerifiedBadge from "../../../components/VerifiedBadge";
import Avatar from "../../../components/Avatar";
import MediaDropzone from "../components/MediaDropzone";
import BookDialog from "../components/BookDialog";

const PICTURE_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_BYTES = 10 * 1024 * 1024; // shrunk before sending

// AI Moodboard Matching (feature 2 in PhilFreela-System-Functions.md, clients
// only): upload a reference image and find the freelancers whose portfolio
// work looks visually closest to it. CLIP turns pictures into numbers that
// describe their style (color, composition, mood); the AI service returns
// freelancer ids and scores, and this page loads their profile and matching
// picture itself, under the normal database rules.
export default function MoodboardMatchView() {
  const { currentUserId, openChat, showToast } = useOutletContext();
  // The freelancer being booked (null = Book popup closed). The match is a
  // freelancer, not one service, so the popup lists their services to pick from.
  const [bookTarget, setBookTarget] = useState(null);
  const [file, setFile] = useState(null);
  const [fileError, setFileError] = useState("");
  const [matching, setMatching] = useState(false);
  const [error, setError] = useState("");
  // null = no search yet; [] = searched, nothing close enough.
  const [matches, setMatches] = useState(null);

  const handleSelect = (picked) => {
    setMatches(null);
    setError("");
    if (!picked) {
      setFile(null);
      setFileError("");
      return;
    }
    if (!PICTURE_TYPES.includes(picked.type)) {
      setFileError("Please choose a JPG, PNG, or WebP picture.");
      return;
    }
    if (picked.size > MAX_BYTES) {
      setFileError("Pictures must be 10 MB or smaller.");
      return;
    }
    setFileError("");
    setFile(picked);
  };

  const handleMatch = async () => {
    setMatching(true);
    setError("");
    setMatches(null);
    try {
      const results = await matchMoodboard(await shrinkImage(file, 800));
      if (results.length === 0) {
        setMatches([]);
        return;
      }

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
      setMatches(
        results
          .filter((r) => freelancerById[r.freelancer_id] && slideById[r.slide_id])
          .map((r) => ({ ...r, freelancer: freelancerById[r.freelancer_id], slide: slideById[r.slide_id] }))
      );
    } catch (err) {
      setError(err.message);
    }
    setMatching(false);
  };

  const verifiedIds = useVerifiedIds((matches || []).map((m) => m.freelancer.id));

  return (
    <section className="dashboard-view active-view">
      <div className="glass-card rounded-4 p-4 p-md-5 border border-secondary border-opacity-25">
        <h3 className="text-white fw-bold mb-2"><i className="bi bi-palette2 text-role me-2"></i> Moodboard Match</h3>
        <p className="text-secondary fs-7 mb-4" style={{ maxWidth: 640 }}>
          Upload a moodboard, a picture you like, or a screenshot of a style you want. PhilFreela's AI compares its visual
          style — color, composition, mood — with every verified freelancer's portfolio, and ranks who's closest.
        </p>

        <div className="d-flex flex-column gap-3" style={{ maxWidth: 640 }}>
          <MediaDropzone
            file={file}
            onSelect={handleSelect}
            accept={PICTURE_TYPES.join(",")}
            prompt="Click to choose a reference image"
            hint="JPG, PNG, or WebP, up to 10 MB."
            error={fileError}
          />
          <div>
            <button type="button" className="btn btn-gradient-role rounded-pill px-5 py-2 fw-bold text-white" onClick={handleMatch} disabled={!file || matching}>
              {matching ? <><span className="spinner-border spinner-border-sm me-2" aria-hidden="true"></span>Comparing styles...</> : "Find Matches"}
            </button>
            {matching && <p className="text-secondary fs-8 mb-0 mt-2">This can take a few seconds, longer the first time.</p>}
          </div>
          {error && <p className="text-danger fs-7 mb-0">{error}</p>}
        </div>

        {matches?.length === 0 && (
          <p className="text-secondary fs-7 text-center py-4 mb-0 mt-4">
            No close matches yet. Try a different reference image, or check back once more freelancers post their portfolios.
          </p>
        )}

        {matches?.length > 0 && (
          <div className="row g-4 mt-1">
            {matches.map((match) => (
              <div className="col-sm-6 col-lg-4" key={match.slide_id}>
                <MatchCard
                  match={match}
                  verified={verifiedIds.has(match.freelancer.id)}
                  isMine={match.freelancer.id === currentUserId}
                  onMessage={openChat}
                  onBook={setBookTarget}
                />
              </div>
            ))}
          </div>
        )}
      </div>

      <BookDialog
        key={bookTarget?.freelancerId}
        target={bookTarget}
        onClose={() => setBookTarget(null)}
        onBooked={() => {
          showToast(`Booking sent to ${bookTarget.freelancerName}. You can follow it in Bookings.`);
          setBookTarget(null);
        }}
      />
    </section>
  );
}

// One matching freelancer: their closest-styled portfolio picture, name, and
// Book and Message buttons (this page is for clients).
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

        <div className="mt-auto d-flex gap-2">
          <Link to={`/dashboard/freelancers/${freelancer.id}`} className="btn btn-sm btn-outline-role rounded-pill px-3 fw-bold flex-grow-1 text-center">
            View portfolio
          </Link>
          {!isMine && (
            <>
              <button
                type="button"
                className="btn btn-sm btn-outline-role rounded-pill px-3 fw-bold"
                onClick={() => onBook({ freelancerId: freelancer.id, freelancerName: name, service: null })}
              >
                <i className="bi bi-calendar-check me-1"></i> Book
              </button>
              <button type="button" className="btn btn-sm btn-gradient-role rounded-pill px-3 fw-bold text-white" aria-label={`Message ${name}`} onClick={() => onMessage(freelancer.id)}>
                <i className="bi bi-chat-dots"></i>
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
