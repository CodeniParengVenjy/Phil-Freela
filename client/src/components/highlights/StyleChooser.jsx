import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router-dom";
import { closeOnBackdrop } from "../../lib/backdrop";
import { fetchHighlightStyle, saveHighlightStyle } from "../../lib/highlights";
import { STYLES } from "./styles/index.js";

// A small picture of each style for its card (drawn with CSS in highlights-poster.css, like the approved preview).
function StyleArt({ id, first }) {
  return (
    <span className={`hl-style-art sx-${id}`} aria-hidden="true">
      <i className="a1"></i><i className="a2"></i><i className="a3"></i><i className="a4"></i>
      {id === "kinetic" && <span className="sx-words">MEET<br />{(first || "YOU").toUpperCase()}</span>}
    </span>
  );
}

// The owner's highlight style (PLAN-highlight-styles.md, Step 3): a button under the Portfolio poster that opens
// the six styles. Visitors see the highlight in the style you use. The Director's Cut is for everyone; the five
// other styles come with Premium (the page checks it, and so does the database). Without Premium you can still
// preview them on your own highlight.
//   userId, first      whose highlight (first: their first name, for the Kinetic type picture)
//   isPro              they have Premium now
//   onPreview(id)      plays their highlight in that style (only they see it)
//   showToast          the dashboard's message line
export default function StyleChooser({ userId, first, isPro, onPreview, showToast }) {
  const [open, setOpen] = useState(false);
  // The saved style (null while it loads).
  const [saved, setSaved] = useState(null);
  const [saving, setSaving] = useState("");

  useEffect(() => {
    let active = true;
    fetchHighlightStyle(userId).then((id) => active && setSaved(id)).catch(() => active && setSaved("cinema"));
    return () => {
      active = false;
    };
  }, [userId]);

  // Escape closes the list.
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (event) => { if (event.key === "Escape") setOpen(false); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  const current = STYLES.find((style) => style.id === saved) || STYLES[0];
  // A Premium style is kept when Premium ends, but visitors see the Director's Cut until Premium is back.
  const waiting = current.premium && !isPro;

  const use = async (style) => {
    setSaving(style.id);
    try {
      await saveHighlightStyle(userId, style.id);
      setSaved(style.id);
      showToast?.(style.id === "cinema" ? "Your highlight plays in the Director's Cut." : `Your highlight now plays in ${style.name}.`);
    } catch (error) {
      showToast?.(error.message || "Couldn't save your style. Please try again.");
    } finally {
      setSaving("");
    }
  };

  return (
    <>
      <button type="button" className="btn btn-sm btn-outline-role rounded-pill fw-bold" onClick={() => setOpen(true)} disabled={saved === null} aria-haspopup="dialog">
        <i className="bi bi-palette-fill me-1"></i> Style: {saved === null ? "…" : current.name}
        {waiting && <i className="bi bi-lock-fill ms-1" title="Needs Premium"></i>}
      </button>

      {open && createPortal(
        <div
          className="role-confirm-backdrop"
          style={{ position: "fixed", inset: 0, zIndex: 1200, background: "rgba(0,0,0,0.75)", display: "flex", alignItems: "center", justifyContent: "center", padding: "1rem" }}
          {...closeOnBackdrop(() => setOpen(false))}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="hl-style-title"
            className="role-confirm-card bg-dark text-white border border-secondary border-opacity-25 rounded-4"
            style={{ maxWidth: 940, width: "100%", maxHeight: "90vh", overflowY: "auto" }}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="p-4">
              <div className="d-flex justify-content-between align-items-start gap-3 mb-2">
                <h5 id="hl-style-title" className="fw-bold mb-0"><i className="bi bi-palette-fill me-2"></i>Highlight style</h5>
                <button type="button" className="btn btn-sm btn-outline-light rounded-circle flex-shrink-0" aria-label="Close" onClick={() => setOpen(false)}>
                  <i className="bi bi-x-lg"></i>
                </button>
              </div>
              <p className="text-secondary fs-8 mb-3">
                Visitors watch your highlight in the style you use, and your level still decides how big it goes. The
                Director&apos;s Cut is for everyone; the other five come with Premium. Preview plays your highlight in
                that style, and only you see it.
              </p>
              {!isPro && (
                <div className="hl-style-note d-flex flex-wrap align-items-center gap-2 mb-3">
                  <i className="bi bi-lock-fill"></i>
                  <span className="flex-grow-1">
                    {waiting
                      ? `${current.name} stays saved, but visitors see the Director's Cut until you have Premium again.`
                      : "The Premium styles are locked. You can still preview them."}
                  </span>
                  <Link to="/dashboard/pro" className="btn btn-sm btn-warning rounded-pill fw-bold" onClick={() => setOpen(false)}>
                    <i className="bi bi-gem me-1"></i>Get Premium
                  </Link>
                </div>
              )}
              <div className="hl-style-grid">
                {STYLES.map((style) => {
                  const locked = style.premium && !isPro;
                  const inUse = style.id === saved;
                  return (
                    <div key={style.id} className={`hl-style-card${inUse ? " on" : ""}${locked ? " locked" : ""}`}>
                      <StyleArt id={style.id} first={first} />
                      <div className="d-flex flex-wrap align-items-center gap-2">
                        <strong>{style.name}</strong>
                        {style.premium && (
                          <span className="hl-style-prem"><i className={`bi ${locked ? "bi-lock-fill" : "bi-gem"}`}></i>Premium</span>
                        )}
                        {inUse && <span className="badge rounded-pill text-bg-success">In use</span>}
                      </div>
                      <small className="text-secondary">{style.look}</small>
                      <small className="text-secondary"><i className="bi bi-music-note-beamed me-1"></i>{style.music}</small>
                      <div className="d-flex flex-wrap gap-2 mt-auto pt-1">
                        <button type="button" className="btn btn-sm btn-outline-secondary rounded-pill fw-bold" onClick={() => { setOpen(false); onPreview(style.id); }}>
                          <i className="bi bi-play-fill"></i> Preview
                        </button>
                        {!inUse && (locked ? (
                          <Link to="/dashboard/pro" className="btn btn-sm btn-warning rounded-pill fw-bold" onClick={() => setOpen(false)}>
                            <i className="bi bi-lock-fill me-1"></i>Get Premium
                          </Link>
                        ) : (
                          <button type="button" className="btn btn-sm btn-outline-role rounded-pill fw-bold" disabled={Boolean(saving)} onClick={() => use(style)}>
                            {saving === style.id ? "Saving…" : "Use this style"}
                          </button>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}
