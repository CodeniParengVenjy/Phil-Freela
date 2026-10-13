import { useMemo } from "react";
import "./slides.css";

// Stops everything that would copy or save the text: copy, cut, the right-click
// menu and dragging it out. (The text also can't be selected, see slides.css.)
const block = (event) => event.preventDefault();

const LETTERS = "abcdefghijklmnopqrstuvwxyz";
// The blurred part is never longer than this, so a long document doesn't make
// a long box of nothing.
const MAX_FILLER = 900;
const MAX_FILLER_BARE = 400;

// Words of random letters, only there to look like text under the blur. It is
// NOT the document's hidden text: the page never receives that (the AI service
// saves only the preview in the public file, and keeps the rest in slide_texts).
// The letters come from a small seeded generator, so the same document always
// shows the same filler and nothing changes when the page draws again.
function fillerFor(length, seed) {
  let state = 2166136261;
  for (const char of String(seed)) state = Math.imul(state ^ char.charCodeAt(0), 16777619) >>> 0;
  const next = () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };

  let out = "";
  while (out.length < length) {
    const size = 2 + Math.floor(next() * 8);
    let word = "";
    for (let i = 0; i < size; i += 1) word += LETTERS[Math.floor(next() * LETTERS.length)];
    out += (out ? (next() < 0.06 ? "\n\n" : " ") : "") + word;
  }
  return out.slice(0, length);
}

// A document's text as a PREVIEW (document previews): `text` is the start of
// it, clear, then blurred filler where the rest would be (hiddenChars > 0
// means some of it was left out), and a note. Nothing in it can be selected,
// copied, dragged or printed. framed: in its own dark box (the reader), with the
// writer's @name drawn faintly across it like on photos, because a screenshot
// can't be blocked; not framed: just the text, for a slide that already has
// its own background (MediaCarousel).
export default function ProtectedText({ text, hiddenChars = 0, ownerName = "", seed = "", framed = true }) {
  const filler = useMemo(
    () => (hiddenChars > 0 ? fillerFor(Math.min(hiddenChars, framed ? MAX_FILLER : MAX_FILLER_BARE), seed) : ""),
    [hiddenChars, seed, framed]
  );

  const content = (
    <div className="protected-text" onCopy={block} onCut={block} onContextMenu={block} onDragStart={block}>
      <div>{text}</div>
      {hiddenChars > 0 && <div className="protected-text-hidden" aria-hidden="true">{filler}</div>}
    </div>
  );
  if (!framed) return content;

  return (
    <>
      <div className="protected-text-frame">
        {content}
        {ownerName && (
          <div className="media-carousel-owner" aria-hidden="true">
            {Array.from({ length: 80 }, (_, i) => <span key={i}>@{ownerName}</span>)}
          </div>
        )}
      </div>
      {hiddenChars > 0 && (
        <p className="document-reader-note mt-2">
          <i className="bi bi-eye-slash me-1"></i>Preview only. The rest of this document is hidden to protect the writer's work. Message the writer to ask for the full file.
        </p>
      )}
    </>
  );
}
