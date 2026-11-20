import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { fetchHighlightStyle, saveHighlightStyle } from "../../../lib/highlights";
import { STYLES } from "../../../components/highlights/styles/index.js";
import { HighlightsOverlay, LevelSwitch } from "../../../components/highlights/HighlightsButton";
import { Busy } from "../../../components/Loaders";
import "../../../components/highlights/highlights-poster.css";

// A small picture of each style for its card (drawn with CSS in highlights-poster.css, like the approved preview).
function StyleArt({ id, first }) {
  return (
    <span className={`hl-style-art sx-${id}`} aria-hidden="true">
      <i className="a1"></i><i className="a2"></i><i className="a3"></i><i className="a4"></i>
      {id === "kinetic" && <span className="sx-words">MEET<br />{(first || "YOU").toUpperCase()}</span>}
    </span>
  );
}

// Settings > Highlights (PLAN-highlight-styles.md; it used to be a "Style:" button and a "Preview as" box under the
// Portfolio poster, moved here at the user's ask, 2026-11-20). Freelancers only: how the highlight looks.
// Visitors watch your highlight in the style you use, and your level still decides how big it goes. The Director's Cut
// is for everyone; the five other styles come with Premium (this page checks it, and so does the database). Without
// Premium you can still preview them on your own highlight.
//   userId, username   whose highlight (username: drawn over project files in the film's project viewer)
//   first              their first name, for the Kinetic type picture
//   isPro              they have Premium now
//   showToast          the dashboard's message line
export default function HighlightSettingsForm({ userId, username, first, isPro, showToast }) {
  // The saved style (null while it loads).
  const [saved, setSaved] = useState(null);
  const [saving, setSaving] = useState("");
  // "" = your real level, else the level whose size to preview (only you see a preview).
  const [levelPick, setLevelPick] = useState("");
  // The style being previewed now (null = no preview open).
  const [previewing, setPreviewing] = useState(null);

  useEffect(() => {
    let active = true;
    fetchHighlightStyle(userId).then((id) => active && setSaved(id)).catch(() => active && setSaved("cinema"));
    return () => {
      active = false;
    };
  }, [userId]);

  const current = STYLES.find((style) => style.id === saved) || STYLES[0];
  // A Premium style is kept when Premium ends, but visitors see the Director's Cut until Premium is back.
  const waiting = saved !== null && current.premium && !isPro;

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
      <p className="text-secondary fs-8 mb-3">
        Your highlight is the film that plays from the Portfolio box on your profile. Visitors watch it in the style you
        use, and your level still decides how big it goes. The Director&apos;s Cut is for everyone; the other five come
        with Premium. Preview plays your highlight in that style, and only you see it.
      </p>

      {saved === null && <p className="text-secondary fs-8 mb-3"><Busy>Loading your style</Busy></p>}

      {!isPro && (
        <div className="hl-style-note d-flex flex-wrap align-items-center gap-2 mb-3">
          <i className="bi bi-lock-fill"></i>
          <span className="flex-grow-1">
            {waiting
              ? `${current.name} stays saved, but visitors see the Director's Cut until you have Premium again.`
              : "The Premium styles are locked. You can still preview them."}
          </span>
          <Link to="/dashboard/pro" className="btn btn-sm btn-warning rounded-pill fw-bold">
            <i className="bi bi-gem me-1"></i>Get Premium
          </Link>
        </div>
      )}

      <div className="d-flex flex-wrap align-items-center gap-2 mb-3">
        <span className="text-white-50 fw-semibold fs-7">Preview as</span>
        <LevelSwitch value={levelPick} onChange={setLevelPick} className="bg-secondary bg-opacity-25 border-secondary text-white" />
        <span className="text-secondary fs-8">Visitors always see your real level.</span>
      </div>

      <div className="hl-style-grid">
        {STYLES.map((style) => {
          const locked = style.premium && !isPro;
          const inUse = style.id === saved;
          return (
            <div key={style.id} className={`hl-style-card${inUse ? " on" : ""}${locked ? " locked" : ""}`}>
              <StyleArt id={style.id} first={first} />
              <div className="d-flex flex-wrap align-items-center gap-2">
                <strong className="text-white">{style.name}</strong>
                {style.premium && (
                  <span className="hl-style-prem"><i className={`bi ${locked ? "bi-lock-fill" : "bi-gem"}`}></i>Premium</span>
                )}
                {inUse && <span className="badge rounded-pill text-bg-success">In use</span>}
              </div>
              <small className="text-secondary">{style.look}</small>
              <small className="text-secondary"><i className="bi bi-music-note-beamed me-1"></i>{style.music}</small>
              <div className="d-flex flex-wrap gap-2 mt-auto pt-1">
                <button type="button" className="btn btn-sm btn-outline-secondary rounded-pill fw-bold" onClick={() => setPreviewing(style.id)}>
                  <i className="bi bi-play-fill"></i> Preview
                </button>
                {!inUse && (locked ? (
                  <Link to="/dashboard/pro" className="btn btn-sm btn-warning rounded-pill fw-bold">
                    <i className="bi bi-lock-fill me-1"></i>Get Premium
                  </Link>
                ) : (
                  <button type="button" className="btn btn-sm btn-outline-role rounded-pill fw-bold" disabled={Boolean(saving) || saved === null} onClick={() => use(style)}>
                    {saving === style.id ? "Saving…" : "Use this style"}
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {previewing && (
        <HighlightsOverlay
          userId={userId}
          username={username}
          isOwn
          levelPick={levelPick || null}
          stylePick={previewing}
          onClose={() => setPreviewing(null)}
        />
      )}
    </>
  );
}
