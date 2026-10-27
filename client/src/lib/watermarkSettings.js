import { isHexColor } from "./appearance";
import { supabase } from "./supabaseClient";

// A freelancer's visible watermark style (Settings > Watermark Settings,
// watermarking system step 3). The AI service reads the same row when a photo
// is uploaded and draws the watermark into the photo; the settings page draws
// a preview the same way (lib/watermarkPreview.js). Changes only apply to
// photos uploaded afterwards.
//
// Premium (PLAN-premium.md) adds any color (#rrggbb), extra small and extra
// large, and 3 more fonts; the database only lets Premium members pick them.
// Without Premium the AI service draws the nearest free look (free_style in
// ai-service/visible_watermark.py), and so does the page (freeWatermark).

// Used when a freelancer never saved their own style (same as the database defaults).
export const DEFAULT_WATERMARK = {
  visible_enabled: true,
  text_mode: "username",
  custom_text: "",
  position: "bottom_right",
  opacity: 60,
  size: "medium",
  color: "white",
  font: "jakarta",
  show_badge: true,
  // Documents (step 6): the "© @username · PhilFreela" line at the end.
  document_footer: true
};

export const MAX_CUSTOM_TEXT = 40;

export const POSITIONS = [
  { value: "top_left", label: "Top left", icon: "bi-arrow-up-left" },
  { value: "top_right", label: "Top right", icon: "bi-arrow-up-right" },
  { value: "center", label: "Center", icon: "bi-bullseye" },
  { value: "bottom_left", label: "Bottom left", icon: "bi-arrow-down-left" },
  { value: "bottom_right", label: "Bottom right", icon: "bi-arrow-down-right" },
  { value: "tiled", label: "Tiled", icon: "bi-grid-3x3" }
];

// premium: only with Premium.
export const SIZES = [
  { value: "xsmall", label: "Extra small", premium: true },
  { value: "small", label: "Small" },
  { value: "medium", label: "Medium" },
  { value: "large", label: "Large" },
  { value: "xlarge", label: "Extra large", premium: true }
];

// The site's own font, and Premium's 3 more. family is the name the preview
// draws with (lib/watermarkPreview.js); the files are in public/watermark-fonts,
// the same ones the AI service draws with (ai-service/assets).
export const FONTS = [
  { value: "jakarta", label: "PhilFreela", family: "Plus Jakarta Sans", weight: 700 },
  { value: "serif", label: "Serif", family: "Watermark Serif", file: "DMSerifDisplay-Regular.ttf", premium: true },
  { value: "mono", label: "Typewriter", family: "Watermark Mono", file: "SpaceMono-Bold.ttf", premium: true },
  { value: "script", label: "Handwriting", family: "Watermark Script", file: "Pacifico-Regular.ttf", premium: true }
];

export const COLORS = [
  { value: "white", label: "White", hex: "#ffffff" },
  { value: "black", label: "Black", hex: "#111111" },
  { value: "orange", label: "Orange", hex: "#ff6b00" }
];

// The freelancer's saved style, or the defaults if they never saved one.
// premium: whether they have Premium now. Without it, Premium's choices saved
// earlier are shown as the free look their photos get (see the top).
export async function loadWatermarkSettings(freelancerId) {
  const [{ data, error }, pro] = await Promise.all([
    supabase
      .from("watermark_settings")
      .select("visible_enabled, text_mode, custom_text, position, opacity, size, color, font, show_badge, document_footer")
      .eq("freelancer_id", freelancerId)
      .maybeSingle(),
    supabase.rpc("is_pro", { target: freelancerId })
  ]);
  if (error) throw new Error("Couldn't load your watermark settings right now.");
  const premium = pro.data === true;
  const saved = { ...DEFAULT_WATERMARK, ...(data || {}), font: data?.font || "jakarta", custom_text: data?.custom_text || "" };
  return { ...(premium ? saved : freeWatermark(saved)), premium };
}

// The nearest free look: the site's font, one of the 3 colors (white instead
// of a color of their own), and small to large.
export function freeWatermark(settings) {
  const free = (list, value, fallback) => (list.some((item) => item.value === value && !item.premium) ? value : fallback);
  return {
    ...settings,
    font: "jakarta",
    color: free(COLORS, settings.color, "white"),
    size: free(SIZES, settings.size, settings.size === "xsmall" ? "small" : "large")
  };
}

// True when this style uses one of Premium's choices.
export function usesPremium(settings) {
  return (
    settings.font !== "jakarta" ||
    isHexColor(settings.color) ||
    SIZES.some((size) => size.premium && size.value === settings.size)
  );
}

// Saves the style (creates the row the first time).
export async function saveWatermarkSettings(freelancerId, settings) {
  const customText = settings.custom_text.trim();
  const { error } = await supabase.from("watermark_settings").upsert({
    freelancer_id: freelancerId,
    visible_enabled: settings.visible_enabled,
    text_mode: settings.text_mode,
    custom_text: customText || null,
    position: settings.position,
    opacity: settings.opacity,
    size: settings.size,
    color: settings.color,
    font: settings.font,
    show_badge: settings.show_badge,
    document_footer: settings.document_footer,
    updated_at: new Date().toISOString()
  });
  if (error) {
    // The database's own sentence when a Premium choice is sent without Premium.
    if (error.message?.includes("Premium perks")) throw new Error("Other colors, fonts and the extra sizes come with Premium.");
    throw new Error("Couldn't save your watermark settings. Please try again.");
  }
}

// The words the watermark shows for these settings.
export function watermarkText(settings, { username, fullName }) {
  if (settings.text_mode === "custom" && settings.custom_text.trim()) return settings.custom_text.trim();
  if (settings.text_mode === "full_name" && fullName) return fullName;
  return `@${username || "username"}`;
}
