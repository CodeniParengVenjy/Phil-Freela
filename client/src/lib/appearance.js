import { supabase } from "./supabaseClient";

// Appearance (Settings > Appearance): each user's dark or light mode and their
// own accent color. It is saved on their profile
// (database/supabase_appearance_schema.sql), so it follows them to any device,
// and remembered in this browser, so the dashboard opens in the right colors
// straight away instead of showing the usual look for a moment first.
//
// mode: "dark" or "light". accent: a color like "#3b82f6", or null for the
// usual one (orange for freelancers, cyan for clients).
export const DEFAULT_APPEARANCE = { mode: "dark", accent: null };

// The ready-made colors in Settings. Any other color can be picked too.
export const ACCENT_PRESETS = [
  { name: "Orange", value: "#ff6b00" },
  { name: "Red", value: "#ef4444" },
  { name: "Pink", value: "#ec4899" },
  { name: "Purple", value: "#8b5cf6" },
  { name: "Blue", value: "#3b82f6" },
  { name: "Cyan", value: "#06b6d4" },
  { name: "Teal", value: "#14b8a6" },
  { name: "Green", value: "#22c55e" },
  { name: "Yellow", value: "#eab308" }
];

// A "#" and six letters or numbers (0-9, a-f): the same rule as the database.
const HEX_COLOR = /^#[0-9a-f]{6}$/;
export const isHexColor = (value) => typeof value === "string" && HEX_COLOR.test(value);

// Keeps only values the database accepts; anything else becomes the usual look.
function clean(appearance) {
  return {
    mode: appearance?.mode === "light" ? "light" : "dark",
    accent: isHexColor(appearance?.accent) ? appearance.accent : null
  };
}

// ---- Color math -----------------------------------------------------------

// "#ff6b00" -> [255, 107, 0] (red, green, blue), and back.
const hexToRgb = (hex) => [1, 3, 5].map((start) => parseInt(hex.slice(start, start + 2), 16));
const rgbToHex = (rgb) => `#${rgb.map((n) => Math.round(n).toString(16).padStart(2, "0")).join("")}`;

// Mixes one color into another: amount 0 = all "from", 1 = all "to".
const mix = (from, to, amount) => from.map((n, i) => n + (to[i] - n) * amount);

// How bright a color looks to the eye, from 0 (black) to 1 (white). This is
// the standard formula from the web accessibility guidelines (WCAG).
function brightness(rgb) {
  const [r, g, b] = rgb.map((n) => {
    const part = n / 255;
    return part <= 0.03928 ? part / 12.92 : ((part + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

// How easy two colors are to tell apart, from 1 (the same) to 21 (black on white).
function contrast(a, b) {
  const lighter = Math.max(brightness(a), brightness(b));
  const darker = Math.min(brightness(a), brightness(b));
  return (lighter + 0.05) / (darker + 0.05);
}

// The color of a card in each mode, which is what the accent is seen on.
const CARD_COLOR = { dark: [20, 24, 36], light: [255, 255, 255] };
// The guidelines ask for at least 3 for buttons, icons and large text.
const MIN_CONTRAST = 3;

// "Any color" includes ones that can't be seen (black on the dark theme, pale
// yellow on the light one). So the picked color is moved toward white (dark
// mode) or black (light mode) a little at a time until it stands out enough.
// Colors that are already easy to see are not changed.
export function readableAccent(hex, mode) {
  const card = CARD_COLOR[mode];
  const toward = mode === "light" ? [0, 0, 0] : [255, 255, 255];
  let rgb = hexToRgb(hex);
  for (let step = 0; step < 20 && contrast(rgb, card) < MIN_CONTRAST; step++) {
    rgb = mix(rgb, toward, 0.1);
  }
  return rgb;
}

// ---- Showing it on the page -----------------------------------------------

// The color settings dashboard.css reads (see the top of that file).
const ACCENT_NAMES = ["--accent-orange", "--accent-role"];
const ACCENT_PARTS = ["", "-2", "-glow", "-subtle"];

// Puts the look on the page: the "theme-light" class on <body> (see
// pages/dashboard/theme.css) and the accent colors. With no accent picked the
// colors are taken off again, so the usual orange or cyan comes back.
export function applyAppearance(appearance) {
  const { mode, accent } = clean(appearance);
  const { classList, style } = document.body;
  classList.toggle("theme-light", mode === "light");

  if (!accent) {
    for (const name of ACCENT_NAMES) {
      for (const part of ACCENT_PARTS) style.removeProperty(name + part);
    }
    style.removeProperty("--accent-on");
    style.removeProperty("--accent-on-rgb");
    return;
  }

  const rgb = readableAccent(accent, mode);
  const [r, g, b] = rgb.map(Math.round);
  for (const name of ACCENT_NAMES) {
    style.setProperty(name, rgbToHex(rgb));
    // The second color of the gradient buttons: a little lighter.
    style.setProperty(`${name}-2`, rgbToHex(mix(rgb, [255, 255, 255], 0.2)));
    style.setProperty(`${name}-glow`, `rgba(${r}, ${g}, ${b}, 0.4)`);
    style.setProperty(`${name}-subtle`, `rgba(${r}, ${g}, ${b}, 0.15)`);
  }
  // Text on top of the accent (button labels): white, or dark on a light
  // color. 0.45 keeps white on the site's own orange and cyan, and gives
  // yellow and lighter colors dark labels.
  const darkLabels = brightness(rgb) > 0.45;
  style.setProperty("--accent-on", darkLabels ? "#0f172a" : "#ffffff");
  // The same color as three numbers, for the text inside accent-colored boxes.
  style.setProperty("--accent-on-rgb", darkLabels ? "15, 23, 42" : "255, 255, 255");
}

// Back to the usual look, for the pages outside the dashboard (login, homepage).
export function clearAppearance() {
  applyAppearance(DEFAULT_APPEARANCE);
}

// ---- Remembering it in this browser ---------------------------------------

const STORAGE_KEY = "philfreela-appearance";

export function readSavedAppearance() {
  try {
    return clean(JSON.parse(localStorage.getItem(STORAGE_KEY)));
  } catch {
    // Storage is off (private browsing) or holds something else: the usual look.
    return DEFAULT_APPEARANCE;
  }
}

export function rememberAppearance(appearance) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(clean(appearance)));
  } catch {
    // Storage is off: the look is still loaded from the profile each time.
  }
}

// On sign-out, so the next person on this browser doesn't start with it.
export function forgetAppearance() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Storage is off: there is nothing to remove.
  }
}

// ---- Saving it on the profile ---------------------------------------------

// The look saved on the user's profile, or null when it couldn't be loaded.
export async function fetchAppearance(userId) {
  const { data, error } = await supabase.from("profiles").select("theme_mode, accent_color").eq("id", userId).maybeSingle();
  if (error || !data) return null;
  return clean({ mode: data.theme_mode, accent: data.accent_color });
}

// Returns "" when saved, or a message to show the user.
export async function saveAppearance(userId, appearance) {
  const { mode, accent } = clean(appearance);
  // .select("id") returns the updated row, so an empty result means nothing was saved.
  const { data, error } = await supabase.from("profiles").update({ theme_mode: mode, accent_color: accent }).eq("id", userId).select("id");
  if (error || !data?.length) return "Couldn't save your appearance. Please try again.";
  return "";
}
