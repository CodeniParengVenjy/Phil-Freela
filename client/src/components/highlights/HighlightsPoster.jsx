import { useEffect, useState } from "react";
import { itemSlides } from "../../lib/slides";
import { coverUrl } from "../../lib/avatar";
import { HighlightsOverlay } from "./HighlightsButton";
import "./highlights-poster.css";

// Stops the browser's "Save image as..." menu on the pictures.
const blockSaveMenu = (event) => event.preventDefault();
const reduceMotion = () => window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

// The Portfolio box of a freelancer's profile is their highlight (PLAN-highlights.md): instead of a grid of
// cards, one big poster with their project pictures slowly changing behind a play button. The play button
// opens the highlight, and inside it the visitor opens each project from the project wall.
//   userId, username, displayName, coverPath  whose highlight (the cover photo shows when there are no pictures)
//   items      their portfolio projects (null while loading), for the pictures and the counts
//   isOwn      your own profile: "Preview my highlights" (your highlight style and the level preview are in
//              Settings > Highlights: pages/dashboard/components/HighlightSettingsForm.jsx)
//   onMessage, onReport(item), reportOpen: chat, Report on a project, and whether that form is open
export default function HighlightsPoster({ userId, username, displayName, coverPath, items, isOwn = false, onMessage, onReport, reportOpen = false }) {
  const [open, setOpen] = useState(false);
  // Which picture shows now.
  const [shown, setShown] = useState(0);

  // Up to 6 pictures: each project's first file (a photo, a PDF's first page, or a video's frame at 2 seconds,
  // after the usual fade-in from black). Photos and pages come first, since a video's frame can still be dark.
  // Projects under review are left out, as they are in the highlight.
  const firstFiles = (items || [])
    .filter((item) => item.status !== "flagged")
    .map((item) => itemSlides(item).find((slide) => !slide.underReview))
    .filter((slide) => slide && (slide.mediaType !== "document" || slide.pages?.length));
  const pictures = [...firstFiles.filter((slide) => slide.mediaType !== "video"), ...firstFiles.filter((slide) => slide.mediaType === "video")]
    .slice(0, 6)
    .map((slide) => (slide.mediaType === "video" ? { video: slide.url } : { src: slide.mediaType === "document" ? slide.pages[0] : slide.url }));
  const count = (items || []).filter((item) => item.status !== "flagged").length;
  const videos = (items || []).reduce((sum, item) => sum + (item.slides || []).filter((slide) => slide.media_type === "video" && slide.status !== "flagged").length, 0);
  const first = (displayName || username || "").trim().split(/\s+/)[0];

  // A new picture every few seconds (not for people who asked for less motion).
  useEffect(() => {
    if (pictures.length < 2 || reduceMotion()) return undefined;
    const timer = setInterval(() => setShown((value) => (value + 1) % pictures.length), 3500);
    return () => clearInterval(timer);
  }, [pictures.length]);

  const title = isOwn ? "Preview my highlights" : `Watch ${first ? `${first}'s` : "the"} highlights`;
  // (nothing while the projects are still loading)
  const sub = items === null ? "" : count
    ? `${count} ${count === 1 ? "project" : "projects"}${videos ? ` · ${videos} ${videos === 1 ? "video" : "videos"}` : ""} · open any project inside`
    : isOwn ? "Add projects and they show up in your highlights" : "Their profile and services, as a short film";
  // No pictures: their cover photo, or a dark poster with a glow in the user's color.
  const coverBg = coverPath
    ? `url("${coverUrl(coverPath)}")`
    : "radial-gradient(circle at 78% 30%, color-mix(in srgb, var(--accent-role, #f97316) 32%, transparent), transparent 58%), linear-gradient(135deg, #1e293b, #0b0d14 70%)";

  return (
    <div>
      <button type="button" className="hl-poster" onClick={() => setOpen(true)} aria-label={title}>
        {pictures.length === 0 && <span className="hl-poster-pic bg on" style={{ backgroundImage: coverBg }} />}
        {pictures.map((picture, index) => (picture.video ? (
          <video key={index} className={`hl-poster-pic${index === shown % pictures.length ? " on" : ""}`} src={`${picture.video}#t=2`} muted playsInline preload="metadata" onContextMenu={blockSaveMenu} />
        ) : (
          <img key={index} className={`hl-poster-pic${index === shown % pictures.length ? " on" : ""}`} src={picture.src} alt="" draggable={false} onContextMenu={blockSaveMenu} />
        )))}
        <span className="hl-poster-shade" />
        <span className="hl-poster-body">
          <span className="hl-poster-kicker"><i className="bi bi-stars me-1"></i>Highlights</span>
          <span className="hl-poster-title">{title}</span>
          {sub && <span className="hl-poster-sub">{sub}</span>}
        </span>
        <span className="hl-poster-play" aria-hidden="true"><i className="bi bi-play-fill"></i></span>
      </button>
      {open && (
        <HighlightsOverlay
          userId={userId}
          username={username}
          isOwn={isOwn}
          onMessage={onMessage}
          onReport={onReport}
          reportOpen={reportOpen}
          onClose={() => setOpen(false)}
        />
      )}
    </div>
  );
}
