import { useEffect, useState } from "react";
import { ACCENT_PRESETS, applyAppearance, fetchAppearance, isHexColor, readSavedAppearance, rememberAppearance, saveAppearance } from "../../../lib/appearance";

// The usual accent of each role, shown on the "Default" choice.
const ROLE_COLOR = { freelancer: "#ff6b00", client: "#06b6d4" };

// The two modes. Light re-colors the dashboard through pages/dashboard/theme.css.
const MODES = [
  { value: "dark", label: "Dark", icon: "bi-moon-stars-fill", hint: "Easy on the eyes at night" },
  { value: "light", label: "Light", icon: "bi-sun-fill", hint: "Bright, like paper" }
];

// Settings > Appearance: dark or light mode, and the user's own accent color.
// A change shows on the page at once and is saved on their profile, so it
// follows them to any device (see lib/appearance.js).
export default function AppearanceForm({ userId, accountType, showToast }) {
  // Starts from what this browser remembers; the saved profile replaces it
  // once it has loaded.
  const [appearance, setAppearance] = useState(readSavedAppearance);
  // Nothing can be changed until the saved look has loaded, so a half-loaded
  // one can't be saved over the real one.
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  // The color in the "any color" box (null = not touched yet).
  const [pickedColor, setPickedColor] = useState(null);

  useEffect(() => {
    let active = true;
    fetchAppearance(userId).then((saved) => {
      if (!active) return;
      if (saved) setAppearance(saved);
      setLoaded(true);
    });
    return () => { active = false; };
  }, [userId]);

  const roleColor = ROLE_COLOR[accountType] || ROLE_COLOR.freelancer;
  const boxColor = pickedColor ?? appearance.accent ?? roleColor;
  const busy = !loaded || saving;

  // Shows the change right away, then saves it. If it can't be saved, the
  // look from before comes back.
  const change = async (next) => {
    const before = appearance;
    setAppearance(next);
    applyAppearance(next);
    setSaving(true);
    const problem = await saveAppearance(userId, next);
    setSaving(false);
    if (problem) {
      setAppearance(before);
      applyAppearance(before);
      showToast(problem);
      return;
    }
    rememberAppearance(next);
    showToast("Appearance saved.");
  };

  const chooseAccent = (accent) => {
    setPickedColor(null);
    change({ ...appearance, accent });
  };

  const applyPickedColor = () => {
    // The color box always gives "#" and six letters or numbers; checked
    // anyway, since the database refuses anything else.
    if (!isHexColor(boxColor)) {
      showToast("Please pick a color.");
      return;
    }
    chooseAccent(boxColor);
  };

  return (
    <div className="d-flex flex-column gap-4">
      <div>
        <h6 className="text-white fw-bold mb-1">Mode</h6>
        <p className="text-secondary fs-8 mb-3">How your dashboard looks. The top bar stays dark in both.</p>
        <div className="row g-3" role="radiogroup" aria-label="Mode">
          {MODES.map((mode) => {
            const picked = appearance.mode === mode.value;
            return (
              <div className="col-sm-6" key={mode.value}>
                <button
                  type="button"
                  role="radio"
                  aria-checked={picked}
                  className={`mode-choice w-100 text-start rounded-3 p-3 d-flex align-items-center gap-3${picked ? " is-selected" : ""}`}
                  onClick={() => !picked && change({ ...appearance, mode: mode.value })}
                  disabled={busy}
                >
                  <i className={`bi ${mode.icon} fs-4 text-role`}></i>
                  <span>
                    <span className="d-block text-white fw-bold fs-7">{mode.label}</span>
                    <span className="d-block text-secondary fs-8">{mode.hint}</span>
                  </span>
                  {picked && <i className="bi bi-check-circle-fill text-role ms-auto"></i>}
                </button>
              </div>
            );
          })}
        </div>
      </div>

      <div>
        <h6 className="text-white fw-bold mb-1">Accent color</h6>
        <p className="text-secondary fs-8 mb-3">
          The color of the buttons, icons and highlights on your dashboard. Only you see it.
        </p>

        <div className="d-flex flex-wrap align-items-center gap-3" role="radiogroup" aria-label="Accent color">
          <button
            type="button"
            role="radio"
            aria-checked={appearance.accent === null}
            className={`btn btn-sm rounded-pill px-3 fw-bold d-inline-flex align-items-center gap-2 ${appearance.accent === null ? "btn-gradient-role text-white" : "btn-outline-secondary text-white"}`}
            onClick={() => chooseAccent(null)}
            disabled={busy}
          >
            <span className="rounded-circle border border-light border-opacity-50" style={{ width: 14, height: 14, background: roleColor }}></span>
            Default
          </button>
          {ACCENT_PRESETS.map((preset) => (
            <button
              key={preset.value}
              type="button"
              role="radio"
              aria-checked={appearance.accent === preset.value}
              aria-label={preset.name}
              title={preset.name}
              className={`accent-swatch${appearance.accent === preset.value ? " is-selected" : ""}`}
              style={{ background: preset.value }}
              onClick={() => chooseAccent(preset.value)}
              disabled={busy}
            ></button>
          ))}
        </div>
      </div>

      <div>
        <label htmlFor="anyAccentColor" className="form-label text-white-50 fw-semibold fs-7">Or pick any color:</label>
        <div className="d-flex flex-wrap align-items-center gap-3">
          <input
            id="anyAccentColor"
            type="color"
            className="form-control form-control-color bg-secondary bg-opacity-25 border-secondary"
            value={boxColor}
            onChange={(event) => setPickedColor(event.target.value.toLowerCase())}
            disabled={busy}
          />
          <button
            type="button"
            className="btn btn-outline-role rounded-pill px-4 py-2 fw-bold fs-7"
            onClick={applyPickedColor}
            disabled={busy || boxColor === appearance.accent}
          >
            {saving ? "Saving..." : "Use this color"}
          </button>
        </div>
        <small className="text-secondary fs-8 d-block mt-2">
          {loaded
            ? "A color that is too close to the background is adjusted a little, so buttons and icons can still be seen."
            : "Loading your appearance..."}
        </small>
      </div>
    </div>
  );
}
