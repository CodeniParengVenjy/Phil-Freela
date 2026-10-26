import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  PART_NAMES, TOUR, VERIFY_PAGE, canKeepTour, fetchAccountCreatedAt, fetchTourStatus, fitsPerson,
  isNewAccount, loadTour, nextPart, onOpenWelcomeGuide, pagePath, saveTour
} from "../../../lib/welcomeGuide";

// How the note and the outline are laid out (in pixels).
const NOTE_WIDTH = 340;   // the note's width on a laptop
const NOTE_HEIGHT = 240;  // about how tall it is, until it is drawn and measured
const OUTLINE_PAD = 8;    // space between a button and its outline
const NOTE_GAP = 14;      // space between the outline and the note
const PHONE_WIDTH = 576;  // narrower than this, the note is a strip at the top or bottom
const LOADING_WAIT = 2500; // how long a part that isn't there yet may take to show up (ms)

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
// tall menu, otherwise below, above, to the right or to the left), clamped to
// the screen. noteHeight is the note's real height once it is drawn. On a
// phone it is a strip across the bottom, or across the top when the outlined
// part is in the lower half (a tall part, like the menu, keeps the bottom so
// its top stays in view).
function notePosition(hole, vw, vh, noteHeight) {
  if (vw < PHONE_WIDTH) {
    const lowerHalf = hole.top + hole.height / 2 > vh / 2 && hole.height < vh * 0.6;
    return lowerHalf ? { left: 12, right: 12, top: 80 } : { left: 12, right: 12, bottom: 12 };
  }
  const clamp = (value, low, high) => Math.max(low, Math.min(value, high));
  const left = clamp(hole.left, 12, vw - NOTE_WIDTH - 12);
  const right = hole.left + hole.width;
  const bottom = hole.top + hole.height;
  const sideTop = clamp(hole.top + 16, 80, vh - noteHeight - 12);
  const roomRight = vw - right >= NOTE_WIDTH + NOTE_GAP + 12;
  const roomLeft = hole.left >= NOTE_WIDTH + NOTE_GAP + 12;
  if (hole.height > vh * 0.5 && roomRight) return { left: right + NOTE_GAP, top: sideTop };
  if (vh - bottom >= noteHeight + NOTE_GAP + 12) return { left, top: bottom + NOTE_GAP };
  if (hole.top >= noteHeight + NOTE_GAP + 80) return { left, bottom: vh - hole.top + NOTE_GAP };
  if (roomRight) return { left: right + NOTE_GAP, top: sideTop };
  if (roomLeft) return { left: hole.left - NOTE_WIDTH - NOTE_GAP, top: sideTop };
  return { left: clamp((vw - NOTE_WIDTH) / 2, 12, vw), bottom: 16 };
}

const sameView = (a, b) => a.key === b.key && a.vw === b.vw && a.vh === b.vh && a.loading === b.loading && a.noteHeight === b.noteHeight
  && (a.rect === b.rect || (a.rect && b.rect && a.rect.left === b.rect.left && a.rect.top === b.rect.top && a.rect.width === b.rect.width && a.rect.height === b.rect.height));

// Kept outside the component, because moving between some pages draws the
// whole dashboard again, and the tour with it:
//   menuBefore: whether the side menu was open before the tour opened it
//               (null = the tour isn't showing)
//   lastDrawn:  the note last on screen ("part:index"). If the person leaves its
//               page by themselves (the browser's Back button), the tour pauses
//               instead of pulling them back.
let menuBefore = null;
let lastDrawn = null;

// The opening tour: a guided tour in three parts (the notes and their words are
// in lib/welcomeGuide.js). The page goes dim, one real button or box is
// outlined, and a note next to it says what it is for. It moves from page to
// page by itself, and remembers where it is, so it goes on after a page change
// or a reload.
//   accountType: null until the dashboard has finished loading the profile (it
//                also checks for a ban or an archive then), so the tour waits
//                for it: otherwise it could flash up first, with the wrong
//                role's words.
//   blocked: true while the "add your name" pop-up is open, so the two never
//            sit on top of each other: the tour waits until the name is saved.
export default function WelcomeGuide({ userId, accountType, blocked }) {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  // Where the person is in the tour, as saved (lib/welcomeGuide.js).
  const [tour, setTourState] = useState(() => (userId ? loadTour(userId) : null));
  const tourRef = useRef(tour);
  // The person's ID status: undefined = not read yet, null = it couldn't be read.
  const [status, setStatus] = useState(undefined);
  // What the screen looks like now: which note is drawn, where its part is
  // (null for a card in the middle), whether its part is still loading, and
  // the window's size.
  const [view, setView] = useState({ key: "", rect: null, loading: false, vw: window.innerWidth, vh: window.innerHeight, noteHeight: NOTE_HEIGHT });
  const scrolledFor = useRef("");

  // Every change is saved at once, so a page change can't lose it.
  const setTour = useCallback((next) => {
    tourRef.current = next;
    saveTour(userId, next);
    setTourState(next);
  }, [userId]);

  // The notes of the part the person is in, and the note shown now.
  const part = tour?.part;
  const index = tour?.index ?? 0;
  const notes = useMemo(() => (accountType && part && TOUR[accountType]?.[part]) || [], [accountType, part]);
  const note = tour ? notes[index] : null;
  const verified = Boolean(status?.verified);
  const running = tour?.mode === "on" && Boolean(accountType) && !blocked && status !== undefined;
  const key = tour ? `${part}:${index}` : "";

  // Opens by itself once, for a NEW account (made after this tour was added).
  useEffect(() => {
    if (!userId || !accountType || tour || !canKeepTour()) return undefined;
    let active = true;
    fetchAccountCreatedAt().then((createdAt) => {
      if (active && !tourRef.current && isNewAccount(createdAt)) setTour({ mode: "on", part: "welcome", index: 0, shown: [] });
    }).catch(() => {});
    return () => { active = false; };
  }, [userId, accountType, tour, setTour]);

  // The ID status decides which part comes next. It is read once each time
  // the dashboard is drawn, and it is also how the tour finds out that an
  // admin has answered: approved = the full tour, not approved = try again.
  const needsStatus = ["on", "waiting", "review"].includes(tour?.mode);
  useEffect(() => {
    if (!userId || !accountType || !needsStatus || status !== undefined) return undefined;
    let active = true;
    fetchTourStatus(userId).then((result) => {
      if (!active) return;
      setStatus(result);
      const now = tourRef.current;
      if (now?.mode !== "review" && now?.mode !== "waiting") return;
      if (result?.verified) {
        setTour({ mode: "on", part: "full", index: 0, shown: [] });
      } else if (now.mode === "review" && result?.status === "rejected") {
        setTour({ mode: "on", part: "retry", index: 0, shown: [] });
      } else if (now.mode === "waiting" && result?.status === "pending" && window.location.pathname !== VERIFY_PAGE) {
        // Sent from a phone while this page waited: now it waits for the admin.
        setTour({ ...now, mode: "review" });
      }
    }).catch(() => {
      if (active) setStatus(null);
    });
    return () => { active = false; };
  }, [userId, accountType, needsStatus, status, setTour]);

  // "Take the tour" in the account menu: go on where it was paused, otherwise
  // start again from the welcome.
  useEffect(() => onOpenWelcomeGuide(() => {
    const now = tourRef.current;
    lastDrawn = null;
    if (now?.mode === "paused") setTour({ ...now, mode: "on" });
    else setTour({ mode: "on", part: "welcome", index: 0, shown: [] });
  }), [setTour]);

  // Skip (or Escape): pause here; the account menu goes on from this note.
  const pause = useCallback(() => setTour({ ...tourRef.current, mode: "paused" }), [setTour]);

  // The end of a part: the next part, or wait for the admin (after the ID was
  // sent), or done.
  const finishPart = useCallback(() => {
    const part = tourRef.current.part;
    const after = nextPart(part, verified);
    if (after) setTour({ mode: "on", part: after, index: 0, shown: [] });
    else setTour({ mode: part === "verify" ? "review" : "done", part, index: 0, shown: [] });
  }, [verified, setTour]);

  // Shows note i of this part, or the first one after it that is for this person.
  const goTo = useCallback((i) => {
    let next = i;
    while (next < notes.length && !fitsPerson(notes[next], verified)) next += 1;
    if (next >= notes.length) finishPart();
    else setTour({ ...tourRef.current, mode: "on", index: next });
  }, [notes, verified, finishPart, setTour]);

  useEffect(() => {
    if (!running) return undefined;
    const handleKeyDown = (event) => {
      if (event.key === "Escape") pause();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [running, pause]);

  // The side menu: remember whether it was open, open it for a note that
  // points into it, and put it back the way it was afterwards.
  const wantMenu = Boolean(running && note?.menu);
  useEffect(() => {
    if (!running) return undefined;
    if (menuBefore === null) menuBefore = isMenuOpen();
    return () => {
      setMenuOpen(menuBefore);
      menuBefore = null;
    };
  }, [running]);
  useEffect(() => {
    if (running && !wantMenu && menuBefore !== null) setMenuOpen(menuBefore);
  }, [running, wantMenu, key]);

  // While the person fills in the ID form, the tour is hidden; it comes back
  // as soon as the part it waits for (the "Waiting for review" box) shows up.
  const waitFor = tour?.mode === "waiting" ? note?.waitFor : null;
  useEffect(() => {
    if (!waitFor) return undefined;
    const timer = setInterval(() => {
      if (findTarget(waitFor)) setTour({ ...tourRef.current, mode: "on", index: tourRef.current.index + 1 });
    }, 400);
    return () => clearInterval(timer);
  }, [waitFor, setTour]);

  // Follows the outlined part on every screen frame, so the outline stays on it
  // while the menu slides open, the page scrolls or the window changes size.
  // It also opens the note's page, and skips a part that isn't on the page.
  useEffect(() => {
    if (!running) return undefined;
    if (!note) {
      // Past the last note (the steps changed since it was saved).
      const frame = requestAnimationFrame(() => finishPart());
      return () => cancelAnimationFrame(frame);
    }
    const want = note.page ? pagePath(note.page, accountType) : null;
    const onThisPage = (n) => n.page && pagePath(n.page, accountType) === pathname;
    let frame;
    let missingSince = null;
    let navigated = false;

    const tick = (now) => {
      if (!fitsPerson(note, verified)) return goTo(index + 1);

      // Another page: open the note's page, unless the person just left it.
      if (want && pathname !== want) {
        if (lastDrawn === key) return pause();
        if (!navigated) {
          navigated = true;
          navigate(want);
        }
        frame = requestAnimationFrame(tick);
        return undefined;
      }

      if (note.menu && !isMenuOpen()) setMenuOpen(true);
      const el = note.target ? findTarget(note.target) : null;
      if (note.target && !el) {
        // The page has loaded, and this part isn't on it, when a later note on
        // the same page is already there: go to that one. (Not for the menu,
        // which takes a moment to slide open.)
        if (!note.menu) {
          for (let i = index + 1; i < notes.length && onThisPage(notes[i]); i += 1) {
            if (fitsPerson(notes[i], verified) && (!notes[i].target || findTarget(notes[i].target))) return goTo(i);
          }
        }
        if (missingSince === null) missingSince = now;
        // Still loading? Give it a moment, then go on with the next page's notes.
        if (now - missingSince > LOADING_WAIT) {
          let i = index + 1;
          while (i < notes.length && onThisPage(notes[i])) i += 1;
          return goTo(i);
        }
        setView((prev) => (prev.key === key && prev.loading ? prev : { key, rect: null, loading: true, vw: window.innerWidth, vh: window.innerHeight, noteHeight: NOTE_HEIGHT }));
        frame = requestAnimationFrame(tick);
        return undefined;
      }
      missingSince = null;

      // A note the person answers by pressing the outlined part: once the
      // next note's part shows up, go on.
      const after = notes[index + 1];
      if (note.click && after?.target && onThisPage(after) && findTarget(after.target)) return goTo(index + 1);

      // Bring a part that is further down the page into view (once), near the top so the note fits below it.
      if (el && note.scroll && scrolledFor.current !== key) {
        scrolledFor.current = key;
        scrollToTop(el);
      }

      // On screen: remember it for the Back button.
      lastDrawn = key;
      const shown = tourRef.current.shown || [];
      if (shown[shown.length - 1] !== index) setTour({ ...tourRef.current, shown: [...shown, index] });

      const box = el?.getBoundingClientRect();
      // The note's real height (offsetHeight leaves out its pop-in animation).
      const drawnNote = document.getElementById("tourNote");
      const next = {
        key,
        rect: box ? { left: Math.round(box.left), top: Math.round(box.top), width: Math.round(box.width), height: Math.round(box.height) } : null,
        loading: false,
        vw: window.innerWidth,
        vh: window.innerHeight,
        noteHeight: drawnNote?.offsetHeight || NOTE_HEIGHT
      };
      setView((prev) => (sameView(prev, next) ? prev : next));
      frame = requestAnimationFrame(tick);
      return undefined;
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
    // Starts again for each note (key), page and ID status; the rest stays the same meanwhile.
  }, [running, key, pathname, accountType, verified, note, notes, index, goTo, pause, finishPart, navigate, setTour]);

  if (!running || !note || view.key !== key) return null;

  // "Welcome · 2 of 6": counts only the notes for this person, without the
  // optional ones (an optional note shows the number of the one before it).
  const counted = notes.filter((n) => fitsPerson(n, verified) && !n.optional);
  const position = Math.max(1, notes.slice(0, tour.index + 1).filter((n) => fitsPerson(n, verified) && !n.optional).length);
  const hasLater = notes.some((n, i) => i > tour.index && fitsPerson(n, verified));
  const last = !hasLater && !nextPart(tour.part, verified);
  const shown = tour.shown || [];
  const back = shown.length >= 2 ? shown[shown.length - 2] : null;
  const goBack = () => setTour({ ...tour, mode: "on", index: back, shown: shown.slice(0, -2) });
  const goNext = () => {
    if (note.waitFor) setTour({ ...tour, mode: "waiting" });
    else goTo(tour.index + 1);
  };

  // The outline around the part (null for a card in the middle, or while the part is still loading).
  const rect = note.target ? view.rect : null;
  const hole = rect && { left: rect.left - OUTLINE_PAD, top: rect.top - OUTLINE_PAD, width: rect.width + OUTLINE_PAD * 2, height: rect.height + OUTLINE_PAD * 2 };
  const phone = view.vw < PHONE_WIDTH;
  const middle = !note.target;
  const text = typeof note.text === "function" ? note.text({ adminNote: status?.adminNote || "" }) : note.text;
  const nextLabel = note.next || (last ? "Done" : "Next");

  const buttons = last ? (
    <button type="button" className="btn btn-gradient-role rounded-pill w-100 py-2 fw-bold text-white" autoFocus onClick={goNext}>{nextLabel}</button>
  ) : (
    <div className="d-flex align-items-center justify-content-between gap-2">
      <button type="button" className="btn btn-link text-white-50 text-decoration-none fw-semibold px-0" onClick={pause}>{note.skip || "Skip"}</button>
      <div className="d-flex align-items-center gap-2">
        {back !== null && (
          <button type="button" className="btn btn-outline-secondary text-white-50 rounded-pill px-3 py-2 fw-semibold" onClick={goBack}>Back</button>
        )}
        {!note.click && (
          <button type="button" className="btn btn-gradient-role rounded-pill px-4 py-2 fw-bold text-white" autoFocus onClick={goNext}>{nextLabel}</button>
        )}
      </div>
    </div>
  );

  const noteBody = (
    <>
      <p className="text-role fw-bold fs-8 text-uppercase mb-2" style={{ letterSpacing: "0.06em" }}>
        {PART_NAMES[tour.part]} · {position} of {counted.length}
      </p>
      {middle && (
        <div className="role-confirm-icon bg-role-subtle text-role rounded-circle d-flex align-items-center justify-content-center mx-auto mb-3" style={{ width: 64, height: 64 }}>
          <i className={`bi ${tour.part === "full" ? "bi-patch-check-fill" : tour.part === "retry" ? "bi-arrow-repeat" : "bi-stars"} fs-3`}></i>
        </div>
      )}
      <h5 id="tourTitle" className="fw-bold mb-2">{note.title}</h5>
      <p className="text-secondary fs-7 mb-3">{text}</p>
      {note.click && <p className="text-role fw-semibold fs-8 mb-3"><i className="bi bi-hand-index-thumb me-1"></i>Press the outlined button to go on.</p>}
      {buttons}
    </>
  );

  // What stops the page behind from being pressed during the tour: the whole
  // screen, or, for a note the person answers by pressing the outlined part,
  // everything around that part.
  const cover = { position: "fixed", zIndex: 1350, background: "transparent" };
  const blockers = note.click && hole ? (
    <>
      <div aria-hidden="true" style={{ ...cover, left: 0, top: 0, right: 0, height: Math.max(0, hole.top) }}></div>
      <div aria-hidden="true" style={{ ...cover, left: 0, top: hole.top + hole.height, right: 0, bottom: 0 }}></div>
      <div aria-hidden="true" style={{ ...cover, left: 0, top: hole.top, width: Math.max(0, hole.left), height: hole.height }}></div>
      <div aria-hidden="true" style={{ ...cover, left: hole.left + hole.width, top: hole.top, right: 0, height: hole.height }}></div>
    </>
  ) : (
    <div aria-hidden="true" style={{ ...cover, inset: 0, background: hole ? "transparent" : "rgba(0,0,0,0.72)" }}></div>
  );

  return (
    <>
      {blockers}

      {/* The outline: a box over the part, with a huge shadow that dims everything
          else. No slide animation: it is moved on every screen frame, so it stays
          exactly on a part that moves (the menu sliding open). */}
      {hole && (
        <div
          aria-hidden="true"
          style={{
            position: "fixed", zIndex: 1351, pointerEvents: "none",
            left: hole.left, top: hole.top, width: hole.width, height: hole.height,
            borderRadius: 14, border: "2px solid var(--accent-role)",
            boxShadow: "0 0 0 9999px rgba(0,0,0,0.72)"
          }}
        ></div>
      )}

      {/* The note: in the middle for a card, next to the outlined part for the other notes (none while the part is still loading). */}
      {middle ? (
        <div style={{ position: "fixed", inset: 0, zIndex: 1352, display: "flex", alignItems: "center", justifyContent: "center", padding: "1rem" }}>
          <div key={key} role="dialog" aria-modal="true" aria-labelledby="tourTitle" className="role-confirm-card bg-dark text-white border border-secondary border-opacity-25 rounded-4 p-4 text-center" style={{ maxWidth: 420, width: "100%" }}>
            {noteBody}
          </div>
        </div>
      ) : hole && (
        <div
          key={key}
          id="tourNote"
          role="dialog"
          aria-modal="true"
          aria-labelledby="tourTitle"
          className="role-confirm-card bg-dark text-white border border-secondary border-opacity-25 rounded-4 p-3 p-sm-4 text-start"
          style={{ position: "fixed", zIndex: 1352, ...(phone ? {} : { width: NOTE_WIDTH }), ...notePosition(hole, view.vw, view.vh, view.noteHeight) }}
        >
          {noteBody}
        </div>
      )}
    </>
  );
}
