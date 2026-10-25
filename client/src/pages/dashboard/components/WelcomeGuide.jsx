import { useEffect, useState } from "react";
import { GUIDE_SLIDES, hasSeenGuide, markGuideSeen, onOpenWelcomeGuide } from "../../../lib/welcomeGuide";

// The opening guide: a pop-up of three short slides that explains how
// PhilFreela works for this person's role (lib/welcomeGuide.js has the words).
// It opens by itself once, for someone who hasn't seen it in this browser, and
// the account menu's "How PhilFreela works" opens it again.
// Buttons: Next and Skip; the last slide has only Start. Escape also closes it.
//   accountType: null until the dashboard has finished loading the profile (it
//                also checks for a ban or an archive then), so the guide waits
//                for it: otherwise it could flash up first, with the wrong
//                role's words, and count as seen.
//   blocked: true while the "add your name" pop-up is open, so the two never
//            sit on top of each other: the guide waits until the name is saved.
export default function WelcomeGuide({ userId, accountType, blocked }) {
  // Starts open for someone who hasn't seen it. (DashboardOverlays only draws
  // this once the signed-in person's id is known.)
  const [open, setOpen] = useState(() => Boolean(userId) && !hasSeenGuide(userId));
  const [index, setIndex] = useState(0);
  const visible = open && Boolean(accountType) && !blocked;

  // Counts as seen from the moment it is on screen, so a reload doesn't show it again.
  useEffect(() => {
    if (visible && userId) markGuideSeen(userId);
  }, [visible, userId]);

  // "How PhilFreela works" in the account menu: start again from the first slide.
  useEffect(() => onOpenWelcomeGuide(() => {
    setIndex(0);
    setOpen(true);
  }), []);

  useEffect(() => {
    if (!visible) return undefined;
    const handleKeyDown = (event) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [visible]);

  if (!visible) return null;

  const slides = GUIDE_SLIDES[accountType];
  const slide = slides[index];
  const last = index === slides.length - 1;
  const close = () => setOpen(false);

  return (
    <div
      className="role-confirm-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="welcomeGuideTitle"
      style={{
        position: "fixed", inset: 0, zIndex: 1350,
        background: "rgba(0,0,0,0.7)",
        display: "flex", alignItems: "center", justifyContent: "center", padding: "1rem",
        overflowY: "auto"
      }}
    >
      <div className="role-confirm-card bg-dark text-white border border-secondary border-opacity-25 rounded-4 p-4 text-center" style={{ maxWidth: 440, width: "100%" }}>
        <p className="text-role fw-bold fs-8 text-uppercase mb-3" style={{ letterSpacing: "0.06em" }}>
          How PhilFreela works · {index + 1} of {slides.length}
        </p>
        {/* A new key per slide plays the icon's little spin again. */}
        <div key={index} className="role-confirm-icon bg-role-subtle text-role rounded-circle d-flex align-items-center justify-content-center mx-auto mb-3" style={{ width: 64, height: 64 }}>
          <i className={`bi ${slide.icon} fs-3`}></i>
        </div>
        <h5 id="welcomeGuideTitle" className="fw-bold mb-2">{slide.title}</h5>
        <p className="text-secondary fs-7 mb-4">{slide.text}</p>

        {/* One dot for each slide; the current one is coloured. */}
        <div className="d-flex justify-content-center gap-2 mb-3" aria-hidden="true">
          {slides.map((_, dot) => (
            <span key={dot} className={`rounded-circle ${dot === index ? "bg-role" : "bg-secondary bg-opacity-50"}`} style={{ width: 8, height: 8 }}></span>
          ))}
        </div>

        {last ? (
          <button type="button" className="btn btn-gradient-role rounded-pill w-100 py-2 fw-bold text-white" autoFocus onClick={close}>
            Start
          </button>
        ) : (
          <div className="d-flex align-items-center justify-content-between gap-2">
            <button type="button" className="btn btn-link text-white-50 text-decoration-none fw-semibold" onClick={close}>Skip</button>
            <button type="button" className="btn btn-gradient-role rounded-pill px-4 py-2 fw-bold text-white" autoFocus onClick={() => setIndex(index + 1)}>Next</button>
          </div>
        )}
      </div>
    </div>
  );
}
