import { supabase } from "./supabaseClient";

// Appearance (Settings > Appearance): each user's dark or light mode and their
// own accent color. It is saved on their profile
// (database/supabase_appearance_schema.sql), so it follows them to any device,
// and remembered in this browser, so the dashboard opens in the right colors
// straight away instead of showing the usual look for a moment first.
//
// mode: "dark" or "light". accent: a color like "#3b82f6", or null for the
// usual one (orange for freelancers, cyan for clients). accent2: a second
// color the accent blends into (a gradient theme), or null for one color.
export const DEFAULT_APPEARANCE = { mode: "dark", accent: null, accent2: null };

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

// The ready-made gradients in Settings: the accent color ("from") blending
// into a second color ("to"). Any other pair can be picked too.
export const GRADIENT_PRESETS = [
  { name: "Sunset", from: "#ff6b00", to: "#ec4899" },
  { name: "Ocean", from: "#06b6d4", to: "#3b82f6" },
  { name: "Grape", from: "#8b5cf6", to: "#ec4899" },
  { name: "Forest", from: "#22c55e", to: "#14b8a6" },
  { name: "Fire", from: "#ef4444", to: "#eab308" }
];

// A "#" and six letters or numbers (0-9, a-f): the same rule as the database.
const HEX_COLOR = /^#[0-9a-f]{6}$/;
export const isHexColor = (value) => typeof value === "string" && HEX_COLOR.test(value);

// Keeps only values the database accepts; anything else becomes the usual look.
function clean(appearance) {
  const accent = isHexColor(appearance?.accent) ? appearance.accent : null;
  // A second color needs a first one, and has to be a different color.
  const accent2 = accent && isHexColor(appearance?.accent2) && appearance.accent2 !== accent ? appearance.accent2 : null;
  return { mode: appearance?.mode === "light" ? "light" : "dark", accent, accent2 };
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
// The top bar's own colors: the menu (burger) icon and the logo's "Phil".
const TOP_BAR_NAMES = ["--topbar-icon", "--logo-light", "--logo-mid", "--logo-dark"];
// Only set for a gradient theme: the blend itself, and the label color on it.
const GRADIENT_NAMES = ["--accent-gradient", "--accent-gradient-on"];

// Puts the look on the page: the "theme-light" class on <body> (see
// pages/dashboard/theme.css) and the accent colors. With no accent picked the
// colors are taken off again, so the usual orange or cyan comes back.
export function applyAppearance(appearance) {
  const { mode, accent, accent2 } = clean(appearance);
  const { classList, style } = document.body;
  classList.toggle("theme-light", mode === "light");

  if (!accent) {
    for (const name of ACCENT_NAMES) {
      for (const part of ACCENT_PARTS) style.removeProperty(name + part);
    }
    style.removeProperty("--accent-on");
    style.removeProperty("--accent-on-rgb");
    for (const name of [...TOP_BAR_NAMES, ...GRADIENT_NAMES]) style.removeProperty(name);
    showTabIcon(null);
    return;
  }

  // With a gradient theme there are two colors: the accent blends into the
  // second one. Both get the same "can it be seen" adjustment.
  const rgb = readableAccent(accent, mode);
  const rgb2 = accent2 ? readableAccent(accent2, mode) : null;
  const [r, g, b] = rgb.map(Math.round);
  for (const name of ACCENT_NAMES) {
    style.setProperty(name, rgbToHex(rgb));
    // Where the gradient buttons end: the second color, or with one color a
    // slightly lighter shade of it.
    style.setProperty(`${name}-2`, rgbToHex(rgb2 ?? mix(rgb, [255, 255, 255], 0.2)));
    style.setProperty(`${name}-glow`, `rgba(${r}, ${g}, ${b}, 0.4)`);
    style.setProperty(`${name}-subtle`, `rgba(${r}, ${g}, ${b}, 0.15)`);
  }
  // Text on top of the accent (button labels): white, or dark on a light
  // color. 0.45 keeps white on the site's own orange and cyan, and gives
  // yellow and lighter colors dark labels. In a gradient the lighter of the
  // two colors decides, so the label can be read from one end to the other.
  const darkLabels = Math.max(brightness(rgb), rgb2 ? brightness(rgb2) : 0) > 0.45;
  const onAccent = darkLabels ? "#0f172a" : "#ffffff";
  style.setProperty("--accent-on", onAccent);
  // The same color as three numbers, for the text inside accent-colored boxes.
  style.setProperty("--accent-on-rgb", darkLabels ? "15, 23, 42" : "255, 255, 255");

  // Gradient theme: the boxes that are one flat accent color (your chat
  // bubbles, the active menu item, badges) are filled with the blend instead.
  // dashboard.css reads these two only when they are set.
  if (rgb2) {
    style.setProperty("--accent-gradient", "linear-gradient(135deg, " + rgbToHex(rgb) + " 0%, " + rgbToHex(rgb2) + " 100%)");
    style.setProperty("--accent-gradient-on", onAccent);
  } else {
    for (const name of GRADIENT_NAMES) style.removeProperty(name);
  }

  // The top bar stays dark in both modes, so its menu icon and the logo's
  // "Phil" use the colors as they read on a dark background, even in light
  // mode. The logo has three shades: with one color they are lighter, the
  // color, darker; with a gradient they run from the first color to the second.
  const onDark = readableAccent(accent, "dark");
  const onDark2 = accent2 ? readableAccent(accent2, "dark") : null;
  const shades = onDark2
    ? [rgbToHex(onDark), rgbToHex(mix(onDark, onDark2, 0.5)), rgbToHex(onDark2)]
    : [rgbToHex(mix(onDark, [255, 255, 255], 0.3)), rgbToHex(onDark), rgbToHex(mix(onDark, [0, 0, 0], 0.15))];
  style.setProperty("--topbar-icon", rgbToHex(onDark));
  style.setProperty("--logo-light", shades[0]);
  style.setProperty("--logo-mid", shades[1]);
  style.setProperty("--logo-dark", shades[2]);
  // The small logo in the browser tab gets the same shades.
  showTabIcon(shades);
}

// ---- The logo in the browser tab ------------------------------------------

// The tab's icon is the logo file. A file can't read the page's colors, so
// for a picked accent the file's text is loaded once, its three gold shades
// are swapped for the accent's, and the result is handed to the browser as
// the icon. (Only the picture can change: the words in the tab are drawn by
// the browser in its own color.)
const TAB_ICON_FILE = "/logo-philfreela.svg";
// The gold shades inside that file, lightest first (the same as --logo-light,
// --logo-mid and --logo-dark in dashboard.css).
const FILE_GOLDS = ["#ffbf45", "#ffa228", "#f58600"];
let logoFileText = null; // loaded the first time it's needed, then kept
let tabIconTurn = 0;     // so a slow load can't overwrite a newer choice

// shades: the three colors for "Phil", top-left to bottom-right, or null for
// the usual gold icon.
async function showTabIcon(shades) {
  const turn = ++tabIconTurn;
  const link = document.querySelector('link[rel="icon"]');
  if (!link) return;
  if (!shades) {
    link.href = TAB_ICON_FILE;
    return;
  }

  try {
    logoFileText ??= fetch(TAB_ICON_FILE).then((response) => {
      if (!response.ok) throw new Error("The logo file couldn't be loaded.");
      return response.text();
    });
    let drawing = await logoFileText;
    if (turn !== tabIconTurn) return; // the user has picked something else since
    FILE_GOLDS.forEach((gold, index) => {
      drawing = drawing.replace(gold, shades[index]);
    });
    link.href = `data:image/svg+xml,${encodeURIComponent(drawing)}`;
  } catch {
    // The file couldn't be loaded: the tab keeps the usual icon, and the next
    // change tries again.
    logoFileText = null;
  }
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
  const { data, error } = await supabase.from("profiles").select("theme_mode, accent_color, accent_color_2").eq("id", userId).maybeSingle();
  if (error || !data) return null;
  return clean({ mode: data.theme_mode, accent: data.accent_color, accent2: data.accent_color_2 });
}

// Returns "" when saved, or a message to show the user.
export async function saveAppearance(userId, appearance) {
  const { mode, accent, accent2 } = clean(appearance);
  // .select("id") returns the updated row, so an empty result means nothing was saved.
  const { data, error } = await supabase.from("profiles").update({ theme_mode: mode, accent_color: accent, accent_color_2: accent2 }).eq("id", userId).select("id");
  if (error || !data?.length) return "Couldn't save your appearance. Please try again.";
  return "";
}
