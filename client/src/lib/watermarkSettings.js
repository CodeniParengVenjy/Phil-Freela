import { supabase } from "./supabaseClient";

// A freelancer's visible watermark style (Settings > Watermark Settings,
// watermarking system step 3). The AI service reads the same row when a photo
// is uploaded and draws the watermark into the photo; the settings page draws
// a preview the same way (lib/watermarkPreview.js). Changes only apply to
// photos uploaded afterwards.

// Used when a freelancer never saved their own style (same as the database defaults).
export const DEFAULT_WATERMARK = {
  visible_enabled: true,
  text_mode: "username",
  custom_text: "",
  position: "bottom_right",
  opacity: 40,
  size: "medium",
  color: "white",
  show_badge: true
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

export const SIZES = [
  { value: "small", label: "Small" },
  { value: "medium", label: "Medium" },
  { value: "large", label: "Large" }
];

export const COLORS = [
  { value: "white", label: "White", hex: "#ffffff" },
  { value: "black", label: "Black", hex: "#111111" },
  { value: "orange", label: "Orange", hex: "#ff6b00" }
];

// The freelancer's saved style, or the defaults if they never saved one.
export async function loadWatermarkSettings(freelancerId) {
  const { data, error } = await supabase
    .from("watermark_settings")
    .select("visible_enabled, text_mode, custom_text, position, opacity, size, color, show_badge")
    .eq("freelancer_id", freelancerId)
    .maybeSingle();
  if (error) throw new Error("Couldn't load your watermark settings right now.");
  return { ...DEFAULT_WATERMARK, ...(data || {}), custom_text: data?.custom_text || "" };
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
    show_badge: settings.show_badge,
    updated_at: new Date().toISOString()
  });
  if (error) throw new Error("Couldn't save your watermark settings. Please try again.");
}

// The words the watermark shows for these settings.
export function watermarkText(settings, { username, fullName }) {
  if (settings.text_mode === "custom" && settings.custom_text.trim()) return settings.custom_text.trim();
  if (settings.text_mode === "full_name" && fullName) return fullName;
  return `@${username || "username"}`;
}
