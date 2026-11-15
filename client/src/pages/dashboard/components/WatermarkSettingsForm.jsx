import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { isHexColor } from "../../../lib/appearance";
import {
  COLORS, FONTS, MARK_KINDS, MAX_CUSTOM_TEXT, POSITIONS, SIZES,
  loadWatermarkSettings, saveWatermarkSettings, watermarkText
} from "../../../lib/watermarkSettings";
import {
  MAX_PICTURE_MB, PICTURE_ACCEPT,
  loadWatermarkPicture, makeMark, readPictureFile, removeWatermarkPicture, uploadWatermarkPicture
} from "../../../lib/watermarkPicture";
import { drawWatermark, loadWatermarkFont } from "../../../lib/watermarkPreview";
import { Loader, Busy } from "../../../components/Loaders";

const SAMPLE_PHOTO = "/images/Freelancers.png";
const LOGO = "/email/logo.png";
// What the "any color" box shows before a color of their own was picked.
const FIRST_OWN_COLOR = "#8b5cf6";
// A gray checkerboard behind the picture, so a see-through background shows.
const CHECKERBOARD = {
  backgroundColor: "#f1f5f9",
  backgroundImage: "conic-gradient(#cbd5e1 25%, transparent 0 50%, #cbd5e1 0 75%, transparent 0)",
  backgroundSize: "16px 16px"
};

// Loads a picture for drawing on the preview canvas.
function loadPicture(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

// Settings > Watermark Settings: the On/Off switch, what the visible watermark
// shows (text, the freelancer's own picture, or both: PLAN-own-watermark.md)
// and how it looks, with a live preview on a sample photo. The invisible
// HiDDeN code is always added and has no settings. Any color, the extra sizes
// and 3 more fonts are Premium's (PLAN-premium.md): shown locked without it.
// The own picture is free for everyone.
export default function WatermarkSettingsForm({ userId, username, fullName, showToast }) {
  const [settings, setSettings] = useState(null);
  const [loadError, setLoadError] = useState("");
  const [saving, setSaving] = useState(false);
  // The sample photo and logo, once loaded: { photo, logo }.
  const [pictures, setPictures] = useState(null);
  // Their own picture while editing: { original, mark, url } (canvases + a
  // link for the small view), or null.
  const [ownPicture, setOwnPicture] = useState(null);
  const [pictureBusy, setPictureBusy] = useState(false);
  const [pictureNote, setPictureNote] = useState("");
  // True when the picture changed since the last save (it gets uploaded on Save).
  const [pictureChanged, setPictureChanged] = useState(false);
  // The picture saved in the database, removed from storage once replaced.
  const savedPath = useRef(null);
  const canvasRef = useRef(null);

  useEffect(() => {
    let active = true;
    loadWatermarkSettings(userId)
      .then(async (saved) => {
        if (!active) return;
        setSettings(saved);
        savedPath.current = saved.picture_path;
        if (!saved.picture_path) return;
        setPictureBusy(true);
        try {
          const { original, mark } = await loadWatermarkPicture(saved.picture_path);
          if (active) setOwnPicture({ original, mark, url: mark.toDataURL("image/png") });
        } catch (err) {
          if (active) setPictureNote(err.message);
        }
        if (active) setPictureBusy(false);
      })
      .catch((err) => {
        if (active) setLoadError(err.message);
      });
    Promise.all([loadPicture(SAMPLE_PHOTO), loadPicture(LOGO), loadWatermarkFont()])
      .then(([photo, logo]) => {
        if (active) setPictures({ photo, logo });
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [userId]);

  // Redraws the preview whenever a setting changes.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !settings || !pictures) return;
    const { photo, logo } = pictures;
    canvas.width = photo.naturalWidth;
    canvas.height = photo.naturalHeight;
    canvas.getContext("2d").drawImage(photo, 0, 0);
    drawWatermark(canvas, settings, { username, fullName }, logo, ownPicture?.mark || null);
  }, [settings, pictures, username, fullName, ownPicture]);

  const change = (field, value) => setSettings((prev) => ({ ...prev, [field]: value }));

  // Makes the finished picture from the original and the switch.
  const applyPicture = (original, removeBg) => {
    const { mark, removed, note } = makeMark(original, removeBg);
    setOwnPicture({ original, mark, url: mark.toDataURL("image/png") });
    change("picture_bg_removed", removed);
    setPictureNote(note);
    setPictureChanged(true);
  };

  // A new picture was picked: Remove background starts on.
  const handlePickPicture = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setPictureBusy(true);
    try {
      applyPicture(await readPictureFile(file), true);
    } catch (err) {
      setPictureNote(err.message);
    }
    setPictureBusy(false);
  };

  const handleRemovePicture = () => {
    setOwnPicture(null);
    setPictureNote("");
    setPictureChanged(true);
    setSettings((prev) => ({ ...prev, mark_kind: "text", picture_bg_removed: false }));
  };

  const usesPicture = settings && settings.mark_kind !== "text";
  const customMissing = settings?.text_mode === "custom" && !settings.custom_text.trim();
  const pictureMissing = usesPicture && !ownPicture && (pictureChanged || !settings.picture_path);

  const handleSave = async (event) => {
    event.preventDefault();
    if (customMissing || pictureMissing) return;
    setSaving(true);
    let uploaded = null;
    try {
      let next = settings;
      if (pictureChanged) {
        if (ownPicture) uploaded = await uploadWatermarkPicture(userId, ownPicture.original, ownPicture.mark);
        next = { ...next, picture_path: uploaded };
      }
      await saveWatermarkSettings(userId, next);
      // The old picture's files are no longer used.
      if (pictureChanged && savedPath.current && savedPath.current !== next.picture_path) removeWatermarkPicture(savedPath.current);
      savedPath.current = next.picture_path;
      setSettings(next);
      setPictureChanged(false);
      showToast("Watermark settings saved. They apply to files you upload from now on.");
    } catch (err) {
      // A picture uploaded for a save that failed is not used.
      if (uploaded) removeWatermarkPicture(uploaded);
      showToast(err.message);
    }
    setSaving(false);
  };

  if (loadError) return <p className="text-danger fs-7">{loadError}</p>;
  if (!settings) return <Loader size="sm" />;

  const pill = (active) => `btn btn-sm rounded-pill px-3 fw-semibold ${active ? "btn-gradient-role text-white" : "btn-outline-secondary text-white-50"}`;
  const { premium } = settings;
  const on = settings.visible_enabled;
  // A Premium choice: locked (with a gem) without Premium.
  const gem = (item) => item.premium && <i className={`bi ${premium ? "bi-gem" : "bi-lock-fill"} text-warning ms-1`} title="Premium"></i>;
  const ownColor = isHexColor(settings.color);
  const ring = (picked) => ({
    borderColor: picked ? "var(--accent-role)" : "rgba(148,163,184,0.5)",
    boxShadow: picked ? "0 0 0 3px var(--accent-role-glow)" : "none"
  });
  const pictureOnly = settings.mark_kind === "picture";

  return (
    <form className="d-flex flex-column gap-4" onSubmit={handleSave}>
      {/* The main switch. Changes reach files uploaded from now on: the
          watermark is drawn into each saved file (PLAN-own-watermark.md, A1). */}
      <div
        className={`p-3 p-md-4 rounded-4 border d-flex align-items-start gap-3 ${on ? "bg-role-subtle" : "border-secondary border-opacity-25"}`}
        style={on ? { borderColor: "var(--accent-role)" } : undefined}
      >
        <span
          className={`d-inline-flex align-items-center justify-content-center rounded-circle flex-shrink-0 fs-5 ${on ? "bg-role text-white" : "bg-secondary bg-opacity-25 text-secondary"}`}
          style={{ width: 44, height: 44 }}
          aria-hidden="true"
        >
          <i className={`bi ${on ? "bi-shield-check" : "bi-shield-slash"}`}></i>
        </span>
        <div className="flex-grow-1 min-w-0">
          <div className="d-flex flex-wrap align-items-center gap-2">
            <label htmlFor="wmEnabled" className="text-white fw-bold mb-0">Watermark</label>
            <span className={`badge rounded-pill ${on ? "bg-success" : "bg-secondary"}`}>{on ? "On" : "Off"}</span>
          </div>
          <p className="text-secondary fs-8 mb-0 mt-1">
            {on
              ? "Your watermark is drawn on the photos, videos and PDF pages you upload from now on."
              : "Photos, videos and PDF pages you upload from now on get no visible watermark."}{" "}
            Files you already uploaded keep the one they got. The <strong className="text-white">invisible code</strong> that
            proves your work is yours is always added, and files you mark as <em>Promo</em> never get a visible watermark.
          </p>
        </div>
        <div className="form-check form-switch fs-4 mb-0 ms-auto flex-shrink-0">
          <input
            id="wmEnabled"
            className="form-check-input"
            type="checkbox"
            role="switch"
            checked={on}
            onChange={(e) => change("visible_enabled", e.target.checked)}
          />
        </div>
      </div>

      <fieldset disabled={!on} className="d-flex flex-column gap-4" style={{ opacity: on ? 1 : 0.45 }}>
        <div>
          <label className="form-label text-white fw-semibold fs-7">What it shows:</label>
          <div className="d-flex flex-wrap gap-2">
            {MARK_KINDS.map((kind) => (
              <button key={kind.value} type="button" className={pill(settings.mark_kind === kind.value)} onClick={() => change("mark_kind", kind.value)}>
                <i className={`bi ${kind.icon} me-1`}></i>{kind.label}
              </button>
            ))}
          </div>
        </div>

        {usesPicture && (
          <div className="p-3 rounded-3 border border-secondary border-opacity-25">
            {ownPicture ? (
              <div className="d-flex flex-wrap align-items-start gap-3">
                <div
                  className="rounded-3 border border-secondary border-opacity-25 d-flex align-items-center justify-content-center p-2 flex-shrink-0"
                  style={{ ...CHECKERBOARD, width: 140, height: 100 }}
                >
                  <img src={ownPicture.url} alt="Your watermark picture" className="mw-100 mh-100" style={{ objectFit: "contain" }} />
                </div>
                <div className="d-flex flex-column gap-2 flex-grow-1 min-w-0" style={{ flexBasis: 220 }}>
                  <div className="form-check form-switch mb-0">
                    <input
                      id="wmRemoveBg"
                      className="form-check-input"
                      type="checkbox"
                      role="switch"
                      checked={settings.picture_bg_removed}
                      onChange={(e) => applyPicture(ownPicture.original, e.target.checked)}
                    />
                    <label htmlFor="wmRemoveBg" className="form-check-label text-white fw-semibold fs-7">Remove background</label>
                  </div>
                  <p className="text-secondary fs-8 mb-0">
                    Makes a plain background, like white paper, see-through. Best for a logo or a signature.
                  </p>
                  {pictureNote && <p className="text-warning fs-8 mb-0" role="status">{pictureNote}</p>}
                  <div className="d-flex flex-wrap gap-2">
                    <label className={`btn btn-sm btn-outline-secondary text-white-50 rounded-pill px-3 mb-0${pictureBusy ? " disabled" : ""}`}>
                      <i className="bi bi-arrow-repeat me-1"></i>Change picture
                      <input type="file" accept={PICTURE_ACCEPT} className="d-none" onChange={handlePickPicture} disabled={pictureBusy} />
                    </label>
                    <button type="button" className="btn btn-sm btn-outline-danger rounded-pill px-3" onClick={handleRemovePicture}>
                      <i className="bi bi-trash me-1"></i>Remove picture
                    </button>
                  </div>
                </div>
              </div>
            ) : pictureBusy ? (
              <Loader size="sm" label="Loading your picture" />
            ) : (
              <>
                <label
                  htmlFor="wmPictureFile"
                  className="d-flex flex-column align-items-center justify-content-center gap-1 text-center rounded-3 border border-2 border-secondary border-opacity-50 p-4 mb-0"
                  style={{ borderStyle: "dashed", cursor: "pointer" }}
                >
                  <i className="bi bi-upload fs-4 text-role"></i>
                  <span className="text-white fw-semibold fs-7">Add your logo or signature</span>
                  <span className="text-secondary fs-8">PNG, JPG or WebP, up to {MAX_PICTURE_MB} MB</span>
                </label>
                <input id="wmPictureFile" type="file" accept={PICTURE_ACCEPT} className="d-none" onChange={handlePickPicture} />
                {pictureNote && <p className="text-warning fs-8 mb-0 mt-2" role="status">{pictureNote}</p>}
                {pictureMissing && !pictureNote && <p className="text-warning fs-8 mb-0 mt-2">Add your picture, or pick Text.</p>}
              </>
            )}
            <p className="text-secondary fs-9 mb-0 mt-2">Use only your own logo or signature.</p>
          </div>
        )}

        <div>
          <label className="form-label text-white fw-semibold fs-7">
            {pictureOnly ? "Text (used on PDF pages and in the document footer):" : "Text:"}
          </label>
          <div className="d-flex flex-wrap gap-2 mb-2">
            <button type="button" className={pill(settings.text_mode === "username")} onClick={() => change("text_mode", "username")}>@{username || "username"}</button>
            <button type="button" className={pill(settings.text_mode === "full_name")} onClick={() => change("text_mode", "full_name")}>Full name</button>
            <button type="button" className={pill(settings.text_mode === "custom")} onClick={() => change("text_mode", "custom")}>Custom text</button>
          </div>
          {settings.text_mode === "custom" && (
            <input
              type="text"
              className="form-control bg-secondary bg-opacity-25 border-secondary text-white py-2"
              placeholder="e.g. Elena Designs"
              maxLength={MAX_CUSTOM_TEXT}
              value={settings.custom_text}
              onChange={(e) => change("custom_text", e.target.value)}
            />
          )}
          {customMissing && <p className="text-warning fs-8 mb-0 mt-1">Type your custom text, or pick another option.</p>}
        </div>

        <div>
          <label className="form-label text-white fw-semibold fs-7">Position:</label>
          <div className="d-flex flex-wrap gap-2">
            {POSITIONS.map((p) => (
              <button key={p.value} type="button" className={pill(settings.position === p.value)} onClick={() => change("position", p.value)}>
                <i className={`bi ${p.icon} me-1`}></i>{p.label}
              </button>
            ))}
          </div>
        </div>

        <div className="row g-3">
          <div className="col-sm-6">
            <label htmlFor="wmOpacity" className="form-label text-white fw-semibold fs-7">Opacity: {settings.opacity}%</label>
            <input
              id="wmOpacity"
              type="range"
              className="form-range"
              min="10"
              max="80"
              step="5"
              value={settings.opacity}
              onChange={(e) => change("opacity", Number(e.target.value))}
            />
            <div className="d-flex justify-content-between text-secondary fs-9"><span>Faint</span><span>Strong</span></div>
          </div>
          <div className="col-sm-6">
            <label className="form-label text-white fw-semibold fs-7">Size:</label>
            <div className="d-flex flex-wrap gap-2">
              {SIZES.map((s) => (
                <button
                  key={s.value}
                  type="button"
                  className={pill(settings.size === s.value)}
                  onClick={() => change("size", s.value)}
                  disabled={s.premium && !premium}
                >
                  {s.label}{gem(s)}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Font and color change the text only, so a picture alone has neither. */}
        {!pictureOnly && (
          <div>
            <label className="form-label text-white fw-semibold fs-7">Font:</label>
            <div className="d-flex flex-wrap gap-2">
              {FONTS.map((f) => (
                <button
                  key={f.value}
                  type="button"
                  className={pill(settings.font === f.value)}
                  style={{ fontFamily: `"${f.family}", sans-serif`, fontWeight: f.weight || 400 }}
                  onClick={() => change("font", f.value)}
                  disabled={f.premium && !premium}
                >
                  {f.label}{gem(f)}
                </button>
              ))}
            </div>
          </div>
        )}

        {!pictureOnly && (
          <div className="d-flex flex-wrap align-items-center gap-4">
            <div>
              <label className="form-label text-white fw-semibold fs-7 d-block">
                {usesPicture ? "Text color:" : "Color:"}
              </label>
              <div className="d-flex flex-wrap align-items-center gap-2">
                {COLORS.map((c) => (
                  <button
                    key={c.value}
                    type="button"
                    className="rounded-circle border"
                    style={{ width: 32, height: 32, background: c.hex, ...ring(settings.color === c.value) }}
                    aria-label={c.label}
                    aria-pressed={settings.color === c.value}
                    onClick={() => change("color", c.value)}
                  ></button>
                ))}
                {/* Premium: any color of their own. */}
                <span className="d-inline-flex align-items-center">
                  <input
                    type="color"
                    className="form-control form-control-color bg-secondary bg-opacity-25 border p-1"
                    style={{ width: 44, height: 32, ...ring(ownColor) }}
                    value={ownColor ? settings.color : FIRST_OWN_COLOR}
                    onChange={(e) => change("color", e.target.value.toLowerCase())}
                    disabled={!premium}
                    aria-label="Any color (Premium)"
                    title={premium ? "Any color" : "Any color comes with Premium"}
                  />
                  {gem({ premium: true })}
                </span>
              </div>
            </div>
            {/* Their own picture takes the PhilFreela logo's place. */}
            {!usesPicture && (
              <div className="form-check mt-3">
                <input id="wmBadge" className="form-check-input" type="checkbox" checked={settings.show_badge} onChange={(e) => change("show_badge", e.target.checked)} />
                <label htmlFor="wmBadge" className="form-check-label text-white fs-7">Show the PhilFreela logo</label>
              </div>
            )}
          </div>
        )}

        {!premium && (
          <div className="p-3 rounded-3 border border-warning border-opacity-50 bg-warning bg-opacity-10 d-flex flex-wrap align-items-center justify-content-between gap-2">
            <span className="text-white fs-7"><i className="bi bi-lock-fill text-warning me-2"></i>Any color, 3 more fonts and the extra sizes come with Premium.</span>
            <Link to="/dashboard/pro" className="btn btn-sm btn-outline-warning rounded-pill px-3 fs-8 fw-bold">
              <i className="bi bi-gem me-1"></i>See Premium
            </Link>
          </div>
        )}
      </fieldset>

      <div className="form-check form-switch">
        <input
          id="wmFooter"
          className="form-check-input"
          type="checkbox"
          role="switch"
          checked={settings.document_footer}
          onChange={(e) => change("document_footer", e.target.checked)}
        />
        <label htmlFor="wmFooter" className="form-check-label text-white fw-semibold fs-7">
          Add a footer to my documents: <span className="text-secondary fw-normal">"© {watermarkText(settings, { username, fullName })} · PhilFreela"</span>
        </label>
        {/* Step 11: a PDF's pages are shown as pictures with the same words. */}
        <p className="text-secondary fs-8 mb-0 mt-1">
          PDF pages show your watermark text too, always small, faint and repeated across the whole page, so the text under it stays readable.
          {usesPicture && " They show your text, not your picture."} Turning the watermark off also removes it from PDF pages.
        </p>
      </div>

      <div>
        <label className="form-label text-white fw-semibold fs-7">Preview:</label>
        <div className="rounded-3 overflow-hidden border border-secondary border-opacity-25 bg-black">
          <canvas ref={canvasRef} className="d-block w-100 h-auto" aria-label="Watermark preview on a sample photo"></canvas>
        </div>
        {!pictures && <Loader size="sm" label="Loading preview" className="mt-1" />}
      </div>

      <div>
        <button
          type="submit"
          className="btn btn-gradient-role rounded-pill px-5 py-2 fw-bold text-white shadow-glow-role"
          disabled={saving || customMissing || pictureMissing || pictureBusy}
        >
          {saving ? <Busy>Saving</Busy> : "Save Watermark Settings"}
        </button>
      </div>
    </form>
  );
}
