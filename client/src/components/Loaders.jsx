// Every loading animation on the site comes from this file (the looks are in
// styles/loaders.css), so every page waits the same way:
//
//   <Loader label="Loading services" />       a part of a page: two rings turning
//                                             around a beating dot, with its words
//   <Loader label="Loading" size="sm" />      a small spinning ring and the words on one line
//   <Loader label="Loading job" size="lg" />  a whole page (a job, an offer, a project)
//   <Busy kind="send">Posting</Busy>          inside a button while it works (or as a
//                                             status line under something)
//   <PageLoader />                            the splash while the dashboard or the
//                                             admin panel opens
//   <SkeletonServiceCards /> and the others   shimmering shapes the size of a list's
//                                             items, until the items arrive
//
// The words can be written with or without "..." at the end: the dots are
// taken off and three hopping dots are drawn instead.
import AccentLogo from "../pages/dashboard/components/AccentLogo";

// "Saving..." becomes "Saving".
function withoutDots(text) {
  return typeof text === "string" ? text.replace(/\s*(\.\.\.|…)\s*$/, "") : text;
}

// The three hopping dots after the words.
function Dots() {
  return <span className="pf-dots" aria-hidden="true"><i></i><i></i><i></i></span>;
}

// Only the hopping dots, in place of a number that is still loading (the
// admin Overview numbers, the counts on the admin tabs).
export function LoadingDots() {
  return (
    <span className="pf-dots-only" role="status">
      <span className="visually-hidden">Loading</span>
      <Dots />
    </span>
  );
}

// Two accent rings turning against each other around a beating dot.
function Orbit({ large = false }) {
  return (
    <span className={`pf-orbit${large ? " pf-orbit-lg" : ""}`} aria-hidden="true">
      <span className="pf-ring"></span>
      <span className="pf-ring pf-ring-rev"></span>
    </span>
  );
}

// A part of a page that is loading. size: "sm" (one line, for small boxes),
// "md" (centered, the usual) or "lg" (a whole page).
export function Loader({ label = "Loading", size = "md", className = "" }) {
  return (
    <div className={`pf-loader pf-loader-${size} ${className}`.trim()} role="status">
      {size === "sm" ? <span className="pf-ring" aria-hidden="true"></span> : <Orbit large={size === "lg"} />}
      <span className="pf-text">
        <span className="pf-label">{withoutDots(label)}</span>
        <Dots />
      </span>
    </div>
  );
}

// The small moving picture for each kind of work. Anything else gets the
// spinning ring ("ring", the default).
const PICTURES = {
  send: <i className="bi bi-send-fill"></i>, // sending or posting: a paper plane flies off
  upload: <i className="bi bi-arrow-up"></i>, // uploading: an arrow rises
  ai: <i className="bi bi-stars"></i>, // the AI is checking: sparkles twinkle
  go: <i className="bi bi-arrow-right"></i>, // taking you to another page: an arrow slides on
  ping: <b></b> // waiting on something else (a phone, a call, a payment): a radar ping
};

// What a button shows while it works: the moving picture, the words and the
// hopping dots, while a light sweeps across the button (loaders.css).
// progress (0 to 1) also fills the button from the left, for uploads of
// several files.
export function Busy({ kind = "ring", progress, className = "", children }) {
  const filled = progress == null ? null : `${Math.round(Math.min(Math.max(progress, 0), 1) * 100)}%`;
  return (
    <span className={`pf-busy pf-kind-${kind} ${className}`.trim()}>
      {filled && <span className="pf-fill" style={{ "--pf-progress": filled }} aria-hidden="true"></span>}
      {PICTURES[kind]
        ? <span className="pf-icon" aria-hidden="true">{PICTURES[kind]}</span>
        : <span className="pf-ring" aria-hidden="true"></span>}
      <span className="pf-busy-text">{withoutDots(children)}</span>
      <Dots />
    </span>
  );
}

// The splash that covers the screen while the dashboard or the admin panel
// checks who is signed in: the logo with a light gliding over it, two rings
// around it and a bar. Only its background shows for the first quarter of a
// second, so a fast load looks the same as before (loaders.css).
export function PageLoader({ label = "Getting your dashboard ready" }) {
  return (
    <div className="pf-splash" role="status">
      <span className="pf-splash-blob pf-splash-blob-a" aria-hidden="true"></span>
      <span className="pf-splash-blob pf-splash-blob-b" aria-hidden="true"></span>
      <div className="pf-splash-inner">
        <div className="pf-splash-mark" aria-hidden="true">
          <span className="pf-splash-halo"></span>
          <span className="pf-splash-glow"><span className="pf-ring"></span></span>
          <span className="pf-splash-dash"></span>
          <AccentLogo className="pf-splash-logo" shine viewBox="-56 0 640 470" />
        </div>
        <div className="pf-splash-bar" aria-hidden="true"><span></span></div>
        <p className="pf-text">
          <span className="pf-label">{withoutDots(label)}</span>
          <Dots />
        </p>
      </div>
    </div>
  );
}

/* ---- Shimmering shapes for lists ---------------------------------------- */

// One shimmering shape. Its size comes from the classes and style passed in.
export function Skel({ className = "", style }) {
  return <span className={`pf-skel ${className}`.trim()} style={style} aria-hidden="true"></span>;
}

// Widths that change from row to row, so the shapes look like real text.
const WIDTHS = ["72%", "58%", "84%", "64%", "78%", "52%"];
const width = (index, shift = 0) => WIDTHS[(index + shift) % WIDTHS.length];
const range = (count) => Array.from({ length: count }, (_, index) => index);

// The box around a set of shapes: screen readers hear the words instead.
function SkeletonBox({ label, className, children }) {
  return (
    <div className={className} role="status">
      <span className="visually-hidden">{withoutDots(label)}</span>
      {children}
    </div>
  );
}

// Browse Services: cards with a picture, badges, a title, a name and a button.
export function SkeletonServiceCards({ count = 6, label = "Loading services" }) {
  return (
    <SkeletonBox label={label} className="row g-4">
      {range(count).map((index) => (
        <div className="col-sm-6 col-lg-4" key={index}>
          <div className="glass-card rounded-4 h-100 border border-secondary border-opacity-25 overflow-hidden">
            <Skel className="pf-skel-media" />
            <div className="p-3 d-flex flex-column gap-2">
              <div className="d-flex gap-1">
                <Skel className="pf-skel-pill" style={{ width: 74 }} />
                <Skel className="pf-skel-pill" style={{ width: 56 }} />
              </div>
              <Skel className="pf-skel-line pf-skel-line-lg" style={{ width: width(index) }} />
              <Skel className="pf-skel-line pf-skel-line-sm" style={{ width: "42%" }} />
              <div className="d-flex justify-content-between align-items-center mt-2">
                <Skel className="pf-skel-line" style={{ width: "34%" }} />
                <Skel className="pf-skel-pill pf-skel-btn" style={{ width: 104 }} />
              </div>
            </div>
          </div>
        </div>
      ))}
    </SkeletonBox>
  );
}

// Find Jobs: rows with the client's picture, a title, a name and badges.
export function SkeletonJobRows({ count = 4, label = "Loading listings" }) {
  return (
    <SkeletonBox label={label} className="d-flex flex-column gap-3">
      {range(count).map((index) => (
        <div key={index} className="p-3 p-md-4 rounded-3 bg-dark bg-opacity-50 border border-secondary border-opacity-25 d-flex align-items-center gap-3">
          <Skel className="pf-skel-circle" style={{ width: 64, height: 64 }} />
          <div className="flex-grow-1 d-flex flex-column gap-2 min-w-0">
            <Skel className="pf-skel-line pf-skel-line-lg" style={{ width: width(index) }} />
            <Skel className="pf-skel-line pf-skel-line-sm" style={{ width: "30%" }} />
            <div className="d-flex gap-2">
              <Skel className="pf-skel-pill" style={{ width: 96 }} />
              <Skel className="pf-skel-pill" style={{ width: 70 }} />
            </div>
          </div>
        </div>
      ))}
    </SkeletonBox>
  );
}

// A list of rows with a round picture and two lines of text: the inbox,
// notifications, and the bell and chat menus in the top bar. "boxed" draws
// each row in its own box like the inbox; without it the rows are plain, like
// the menus. picture={0} leaves the picture out.
export function SkeletonRows({ count = 4, picture = 48, boxed = true, label = "Loading", className = "d-flex flex-column gap-2" }) {
  return (
    <SkeletonBox label={label} className={className}>
      {range(count).map((index) => (
        <div
          key={index}
          className={boxed
            ? "p-3 rounded-3 bg-dark bg-opacity-50 border border-secondary border-opacity-25 d-flex align-items-center gap-3"
            : "px-3 py-2 d-flex align-items-center gap-2"}
        >
          {picture > 0 && <Skel className="pf-skel-circle" style={{ width: picture, height: picture }} />}
          <div className="flex-grow-1 d-flex flex-column gap-2 min-w-0">
            <Skel className="pf-skel-line" style={{ width: width(index, 1) }} />
            <Skel className="pf-skel-line pf-skel-line-sm" style={{ width: width(index, 3) }} />
          </div>
        </div>
      ))}
    </SkeletonBox>
  );
}

// Chat: message bubbles, some from the other person (left), some mine (right).
const BUBBLES = [
  { mine: false, width: "46%", height: 38 },
  { mine: false, width: "30%", height: 38 },
  { mine: true, width: "52%", height: 56 },
  { mine: false, width: "38%", height: 38 },
  { mine: true, width: "28%", height: 38 }
];
export function SkeletonChat({ label = "Loading messages" }) {
  return (
    <SkeletonBox label={label} className="d-flex flex-column gap-3">
      {BUBBLES.map((bubble, index) => (
        <Skel
          key={index}
          className={`pf-skel-bubble ${bubble.mine ? "pf-skel-bubble-mine align-self-end" : "align-self-start"}`}
          style={{ width: bubble.width, height: bubble.height }}
        />
      ))}
    </SkeletonBox>
  );
}

// Admin tables: rows of shapes inside the table's own body. "columns" is the
// table's number of columns.
export function SkeletonTableRows({ rows = 5, columns, label = "Loading" }) {
  return range(rows).map((row) => (
    <tr key={row} aria-hidden={row > 0 ? "true" : undefined}>
      {range(columns).map((column) => (
        <td key={column} className="py-3">
          {row === 0 && column === 0 && <span className="visually-hidden" role="status">{withoutDots(label)}</span>}
          <Skel className="pf-skel-line" style={{ width: width(row, column), maxWidth: 140 }} />
        </td>
      ))}
    </tr>
  ));
}
