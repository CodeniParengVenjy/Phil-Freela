import { useEffect, useRef, useState } from "react";
import {
  COLORS, MAX_CUSTOM_TEXT, POSITIONS, SIZES,
  loadWatermarkSettings, saveWatermarkSettings, watermarkText
} from "../../../lib/watermarkSettings";
import { drawWatermark, loadWatermarkFont } from "../../../lib/watermarkPreview";

const SAMPLE_PHOTO = "/images/Freelancers.png";
const LOGO = "/email/logo.png";

// Loads a picture for drawing on the preview canvas.
function loadPicture(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

// Settings > Watermark Settings: how the visible watermark on the freelancer's
// photos looks, with a live preview on a sample photo. The invisible HiDDeN
// code is always added and has no settings.
export default function WatermarkSettingsForm({ userId, username, fullName, showToast }) {
  const [settings, setSettings] = useState(null);
  const [loadError, setLoadError] = useState("");
  const [saving, setSaving] = useState(false);
  // The sample photo and logo, once loaded: { photo, logo }.
  const [pictures, setPictures] = useState(null);
  const canvasRef = useRef(null);

  useEffect(() => {
    let active = true;
    loadWatermarkSettings(userId)
      .then((saved) => {
        if (active) setSettings(saved);
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
    drawWatermark(canvas, settings, { username, fullName }, logo);
  }, [settings, pictures, username, fullName]);

  const change = (field, value) => setSettings((prev) => ({ ...prev, [field]: value }));

  const customMissing = settings?.text_mode === "custom" && !settings.custom_text.trim();

  const handleSave = async (event) => {
    event.preventDefault();
    if (customMissing) return;
    setSaving(true);
    try {
      await saveWatermarkSettings(userId, settings);
      showToast("Watermark settings saved. They apply to photos you upload from now on.");
    } catch (err) {
      showToast(err.message);
    }
    setSaving(false);
  };

  if (loadError) return <p className="text-danger fs-7">{loadError}</p>;
  if (!settings) return <p className="text-secondary fs-7">Loading...</p>;

  const pill = (active) => `btn btn-sm rounded-pill px-3 fw-semibold ${active ? "btn-gradient-role text-white" : "btn-outline-secondary text-white-50"}`;

  return (
    <form className="d-flex flex-column gap-4" onSubmit={handleSave}>
      <p className="text-secondary fs-7 mb-0">
        Every photo you upload gets an <strong className="text-white">invisible code</strong> that proves it's yours.
        Here you choose the <strong className="text-white">visible watermark</strong> drawn on top. Changes apply to photos
        you upload from now on. Files you mark as <em>Promo</em> never get a visible watermark.
      </p>

      <div className="form-check form-switch">
        <input
          id="wmEnabled"
          className="form-check-input"
          type="checkbox"
          role="switch"
          checked={settings.visible_enabled}
          onChange={(e) => change("visible_enabled", e.target.checked)}
        />
        <label htmlFor="wmEnabled" className="form-check-label text-white fw-semibold fs-7">Show a visible watermark on my photos</label>
      </div>

      <fieldset disabled={!settings.visible_enabled} className="d-flex flex-column gap-4" style={{ opacity: settings.visible_enabled ? 1 : 0.45 }}>
        <div>
          <label className="form-label text-white fw-semibold fs-7">Text:</label>
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
                <button key={s.value} type="button" className={pill(settings.size === s.value)} onClick={() => change("size", s.value)}>{s.label}</button>
              ))}
            </div>
          </div>
        </div>

        <div className="d-flex flex-wrap align-items-center gap-4">
          <div>
            <label className="form-label text-white fw-semibold fs-7 d-block">Color:</label>
            <div className="d-flex gap-2">
              {COLORS.map((c) => (
                <button
                  key={c.value}
                  type="button"
                  className="rounded-circle border"
                  style={{
                    width: 32, height: 32, background: c.hex,
                    borderColor: settings.color === c.value ? "var(--accent-role)" : "rgba(148,163,184,0.5)",
                    boxShadow: settings.color === c.value ? "0 0 0 3px var(--accent-role-glow)" : "none"
                  }}
                  aria-label={c.label}
                  aria-pressed={settings.color === c.value}
                  onClick={() => change("color", c.value)}
                ></button>
              ))}
            </div>
          </div>
          <div className="form-check mt-3">
            <input id="wmBadge" className="form-check-input" type="checkbox" checked={settings.show_badge} onChange={(e) => change("show_badge", e.target.checked)} />
            <label htmlFor="wmBadge" className="form-check-label text-white fs-7">Show the PhilFreela logo</label>
          </div>
        </div>
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
          Turning the visible watermark off also removes it from PDF pages.
        </p>
      </div>

      <div>
        <label className="form-label text-white fw-semibold fs-7">Preview:</label>
        <div className="rounded-3 overflow-hidden border border-secondary border-opacity-25 bg-black">
          <canvas ref={canvasRef} className="d-block w-100 h-auto" aria-label="Watermark preview on a sample photo"></canvas>
        </div>
        {!pictures && <p className="text-secondary fs-8 mb-0 mt-1">Loading preview...</p>}
      </div>

      <div>
        <button type="submit" className="btn btn-gradient-role rounded-pill px-5 py-2 fw-bold text-white shadow-glow-role" disabled={saving || customMissing}>
          {saving ? "Saving..." : "Save Watermark Settings"}
        </button>
      </div>
    </form>
  );
}
