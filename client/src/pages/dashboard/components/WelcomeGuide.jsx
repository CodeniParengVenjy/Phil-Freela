import { useEffect, useRef, useState } from "react";
import { TOUR_STEPS, hasSeenGuide, markGuideSeen, onOpenWelcomeGuide } from "../../../lib/welcomeGuide";

// How the note and the outline are laid out (in pixels).
const NOTE_WIDTH = 340;   // the note's width on a laptop
const NOTE_HEIGHT = 210;  // about how tall it is: used to choose where it fits
const OUTLINE_PAD = 8;    // space between a button and its outline
const NOTE_GAP = 14;      // space between the outline and the note
const PHONE_WIDTH = 576;  // narrower than this, the note is a strip at the top or bottom

// The first part of the page with this data-tour name that is on screen. One name
// can be on two parts (the search box on a laptop, the search icon on a phone).
function findTarget(name) {
  return [...document.querySelectorAll(`[data-tour="${name}"]`)].find((el) => {
    const box = el.getBoundingClientRect();
    return box.width > 0 && box.height > 0;
  }) || null;
}

// Scrolls the dashboard's content area so this part is near its top. Only that
// area is scrolled: scrollIntoView() would also slide the whole page (it is
// overflow: hidden, but still scrollable by code) up under the top bar.
function scrollToTop(el) {
  const area = el.closest(".content-wrapper");
  if (!area) return;
  const offset = el.getBoundingClientRect().top - area.getBoundingClientRect().top;
  area.scrollTo({ top: area.scrollTop + offset - 24 });
}

// The side menu starts closed. Below 992px it slides over the page ("sidebar-open"),
// above it, it is pushed in and out of view ("sidebar-collapsed"), the same two
// classes the menu button uses (useDashboardShell.js).
const onPhoneLayout = () => window.innerWidth < 992;
const isMenuOpen = () => (onPhoneLayout()
  ? document.body.classList.contains("sidebar-open")
  : !document.body.classList.contains("sidebar-collapsed"));
const setMenuOpen = (open) => {
  if (onPhoneLayout()) document.body.classList.toggle("sidebar-open", open);
  else document.body.classList.toggle("sidebar-collapsed", !open);
};

// Where the note goes: next to the outlined part where there is room (beside a
// tall menu, otherwise below, otherwise above), clamped to the screen. On a
// phone it is a strip across the bottom, or across the top when the outlined
// part is in the lower half (a tall part, like the menu, keeps the bottom so
// its top stays in view).
function notePosition(hole, vw, vh) {
  if (vw < PHONE_WIDTH) {
    const lowerHalf = hole.top + hole.height / 2 > vh / 2 && hole.height < vh * 0.6;
    return lowerHalf ? { left: 12, right: 12, top: 80 } : { left: 12, right: 12, bottom: 12 };
  }
  const clamp = (value, low, high) => Math.max(low, Math.min(value, high));
  const left = clamp(hole.left, 12, vw - NOTE_WIDTH - 12);
  const right = hole.left + hole.width;
  const bottom = hole.top + hole.height;
  if (hole.height > vh * 0.5 && vw - right >= NOTE_WIDTH + NOTE_GAP + 12) return { left: right + NOTE_GAP, top: clamp(hole.top + 16, 80, vh - NOTE_HEIGHT - 12) };
  if (vh - bottom >= NOTE_HEIGHT + NOTE_GAP + 12) return { left, top: bottom + NOTE_GAP };
  if (hole.top >= NOTE_HEIGHT + NOTE_GAP + 80) return { left, bottom: vh - hole.top + NOTE_GAP };
  return { left: clamp((vw - NOTE_WIDTH) / 2, 12, vw), bottom: 16 };
}

const sameView = (a, b) => a.vw === b.vw && a.vh === b.vh && a.position === b.position && a.total === b.total
  && (a.rect === b.rect || (a.rect && b.rect && a.rect.left === b.rect.left && a.rect.top === b.rect.top && a.rect.width === b.rect.width && a.rect.height === b.rect.height));

// The opening guide: a short guided tour for beginners. The page goes dim, one
// real button or box is outlined, and a small note next to it says what it is
// for (the steps and their words are in lib/welcomeGuide.js). It opens by itself
// once, for someone who hasn't seen it in this browser, and the account menu's
// "Take the tour" opens it again. Buttons: Skip and Next (Start tour on the
// welcome, Done on the last step). Escape also closes it.
//   accountType: null until the dashboard has finished loading the profile (it
//                also checks for a ban or an archive then), so the tour waits
//                for it: otherwise it could flash up first, with the wrong
//                role's words, and count as seen.
//   blocked: true while the "add your name" pop-up is open, so the two never
//            sit on top of each other: the tour waits until the name is saved.
export default function WelcomeGuide({ userId, accountType, blocked }) {
  // Starts open for someone who hasn't seen it. (DashboardOverlays only draws
  // this once the signed-in person's id is known.)
  const [open, setOpen] = useState(() => Boolean(userId) && !hasSeenGuide(userId));
  const [index, setIndex] = useState(0);
  // What the page looks like right now: where the outlined part is, which step
  // this is among the steps that are on the page, and the window's size.
  // total 0 = not looked at the page yet (nothing is drawn until the first look).
  const [view, setView] = useState({ rect: null, position: 0, total: 0, vw: window.innerWidth, vh: window.innerHeight });
  const visible = open && Boolean(accountType) && !blocked;
  const steps = accountType ? TOUR_STEPS[accountType] : null;
  const step = steps?.[index];
  const wantMenu = Boolean(step?.menu);

  // Counts as seen from the moment it is on screen, so a reload doesn't show it again.
  useEffect(() => {
    if (visible && userId) markGuideSeen(userId);
  }, [visible, userId]);

  // "Take the tour" in the account menu: start again from the welcome.
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

  // The side menu: the tour remembers whether it was open, opens it for the
  // menu step, and puts it back the way it was when the tour closes.
  const menuWasOpen = useRef(false);
  useEffect(() => {
    if (!visible) return undefined;
    const wasOpen = isMenuOpen();
    menuWasOpen.current = wasOpen;
    return () => setMenuOpen(wasOpen);
  }, [visible]);
  useEffect(() => {
    if (visible) setMenuOpen(wantMenu || menuWasOpen.current);
  }, [visible, wantMenu]);

  // Follows the outlined part on every frame, so the outline stays on it while
  // the menu slides open, the page scrolls or the window changes size. If the
  // part never shows up (it is not on this page) the step is skipped.
  useEffect(() => {
    if (!visible || !steps) return undefined;
    const isThere = (s) => !s.target || Boolean(findTarget(s.target));
    let frame;
    let missingSince = null;
    let scrolled = false;

    const tick = (now) => {
      const el = step.target ? findTarget(step.target) : null;
      if (step.target && !el) {
        if (missingSince === null) missingSince = now;
        // Still loading? Give it a moment, then move on to the next step that is there.
        if (now - missingSince > 2500) {
          const next = steps.findIndex((s, i) => i > index && isThere(s));
          if (next === -1) setOpen(false);
          else setIndex(next);
          return;
        }
      } else {
        missingSince = null;
      }
      // Bring a part that is further down the page into view (once), near the top so the note fits below it.
      if (el && step.scroll && !scrolled) {
        scrolled = true;
        scrollToTop(el);
      }
      const box = el?.getBoundingClientRect();
      const present = steps.map((s, i) => (i === index || isThere(s) ? i : -1)).filter((i) => i !== -1);
      const next = {
        rect: box ? { left: Math.round(box.left), top: Math.round(box.top), width: Math.round(box.width), height: Math.round(box.height) } : null,
        position: present.indexOf(index) + 1,
        total: present.length,
        vw: window.innerWidth,
        vh: window.innerHeight
      };
      setView((prev) => (sameView(prev, next) ? prev : next));
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [visible, steps, step, index]);

  if (!visible || !step || view.total === 0) return null;

  const close = () => setOpen(false);
  // The next step that is on the page, or close the tour when there is none.
  const goNext = () => {
    const next = steps.findIndex((s, i) => i > index && (!s.target || findTarget(s.target)));
    if (next === -1) close();
    else setIndex(next);
  };
  const hasLater = view.position < view.total;
  const nextLabel = step.next || (hasLater ? "Next" : "Done");

  // The outline around the part (null on the welcome, or while the part is still loading).
  const rect = step.target ? view.rect : null;
  const hole = rect && { left: rect.left - OUTLINE_PAD, top: rect.top - OUTLINE_PAD, width: rect.width + OUTLINE_PAD * 2, height: rect.height + OUTLINE_PAD * 2 };
  const waiting = Boolean(step.target) && !rect;
  const phone = view.vw < PHONE_WIDTH;
  const welcome = !step.target;

  const buttons = hasLater || step.next ? (
    <div className="d-flex align-items-center justify-content-between gap-2">
      <button type="button" className="btn btn-link text-white-50 text-decoration-none fw-semibold" onClick={close}>Skip</button>
      <button type="button" className="btn btn-gradient-role rounded-pill px-4 py-2 fw-bold text-white" autoFocus onClick={goNext}>{nextLabel}</button>
    </div>
  ) : (
    <button type="button" className="btn btn-gradient-role rounded-pill w-100 py-2 fw-bold text-white" autoFocus onClick={goNext}>{nextLabel}</button>
  );

  const noteBody = (
    <>
      <p className="text-role fw-bold fs-8 text-uppercase mb-2" style={{ letterSpacing: "0.06em" }}>
        How PhilFreela works · {view.position} of {view.total}
      </p>
      {welcome && (
        <div className="role-confirm-icon bg-role-subtle text-role rounded-circle d-flex align-items-center justify-content-center mx-auto mb-3" style={{ width: 64, height: 64 }}>
          <i className="bi bi-stars fs-3"></i>
        </div>
      )}
      <h5 id="tourTitle" className="fw-bold mb-2">{step.title}</h5>
      <p className="text-secondary fs-7 mb-3">{step.text}</p>
      {buttons}
    </>
  );

  return (
    <>
      {/* Covers the page: nothing behind can be pressed during the tour. It is
          what makes the page dim, except around the outlined part (below). */}
      <div style={{ position: "fixed", inset: 0, zIndex: 1350, background: hole ? "transparent" : "rgba(0,0,0,0.72)" }} aria-hidden="true"></div>

      {/* The outline: a box over the part, with a huge shadow that dims everything else. */}
      {hole && (
        <div
          aria-hidden="true"
          style={{
            position: "fixed", zIndex: 1351, pointerEvents: "none",
            left: hole.left, top: hole.top, width: hole.width, height: hole.height,
            borderRadius: 14, border: "2px solid var(--accent-role)",
            boxShadow: "0 0 0 9999px rgba(0,0,0,0.72)",
            transition: "left 0.18s, top 0.18s, width 0.18s, height 0.18s"
          }}
        ></div>
      )}

      {/* The note: in the middle for the welcome, next to the outlined part for the other steps. */}
      {welcome ? (
        <div style={{ position: "fixed", inset: 0, zIndex: 1352, display: "flex", alignItems: "center", justifyContent: "center", padding: "1rem" }}>
          <div key={index} role="dialog" aria-modal="true" aria-labelledby="tourTitle" className="role-confirm-card bg-dark text-white border border-secondary border-opacity-25 rounded-4 p-4 text-center" style={{ maxWidth: 420, width: "100%" }}>
            {noteBody}
          </div>
        </div>
      ) : !waiting && (
        <div
          key={index}
          role="dialog"
          aria-modal="true"
          aria-labelledby="tourTitle"
          className="role-confirm-card bg-dark text-white border border-secondary border-opacity-25 rounded-4 p-3 p-sm-4 text-start"
          style={{ position: "fixed", zIndex: 1352, ...(phone ? {} : { width: NOTE_WIDTH }), ...notePosition(hole, view.vw, view.vh) }}
        >
          {noteBody}
        </div>
      )}
    </>
  );
}
