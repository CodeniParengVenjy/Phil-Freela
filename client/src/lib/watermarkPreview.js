import { isHexColor } from "./appearance";
import { FONTS, watermarkText } from "./watermarkSettings";

// Draws the visible watermark on a <canvas> for the live preview in
// Settings > Watermark Settings. It follows the same layout rules as the AI
// service, which draws the real one into uploaded photos
// (ai-service/visible_watermark.py): if you change one, change the other.

// Text height as a share of the photo's shorter side (same numbers as
// ai-service/visible_watermark.py). xsmall and xlarge are Premium's.
const SIZE_RATIOS = { xsmall: 0.035, small: 0.05, medium: 0.08, large: 0.11, xlarge: 0.15 };
const COLORS = { white: "#ffffff", black: "#111111", orange: "#ff6b00" };
const TILE_ANGLE = 30; // degrees, for the tiled pattern

// The canvas font for one of FONTS (lib/watermarkSettings.js) at this size.
export function fontCss(font, px) {
  const { family, weight = 400 } = FONTS.find((item) => item.value === font) || FONTS[0];
  return `${weight} ${px}px "${family}", sans-serif`;
}

// A color name or "#rrggbb" as "#rrggbb" (white if it is neither).
const colorHex = (color) => COLORS[color] || (isHexColor(color) ? color : COLORS.white);

// A dark color gets a light outline, and the other way round (the same rule
// as the AI service: black is dark, white and orange are not).
function isDark(hex) {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  return 0.299 * r + 0.587 * g + 0.114 * b < 128;
}

// Waits until the fonts are ready, so the preview isn't drawn in a fallback
// font. The site's own font comes with the page; Premium's 3 are loaded from
// public/watermark-fonts the first time.
let fontsReady = null;
export function loadWatermarkFont() {
  if (!document.fonts) return Promise.resolve();
  fontsReady ??= Promise.all(
    FONTS.map((font) => {
      if (font.file && typeof FontFace !== "undefined") {
        const face = new FontFace(font.family, `url(/watermark-fonts/${font.file})`);
        document.fonts.add(face);
        return face.load().catch(() => {});
      }
      return document.fonts.load(fontCss(font.value, 32)).catch(() => {});
    })
  );
  return fontsReady;
}

// The watermark itself (logo + text) on its own small canvas, at full strength.
function drawMark(text, fontPx, color, logo, font) {
  const measure = document.createElement("canvas").getContext("2d");
  measure.font = fontCss(font, fontPx);
  const stroke = Math.max(1, Math.round(fontPx / 18));
  const textWidth = Math.ceil(measure.measureText(text).width) + 2 * stroke;

  let height = Math.round(fontPx * 1.3);
  let logoWidth = 0;
  let logoHeight = 0;
  if (logo) {
    logoHeight = Math.round(fontPx * 1.25);
    logoWidth = Math.round((logo.naturalWidth * logoHeight) / logo.naturalHeight);
    height = Math.max(height, logoHeight);
  }
  const gap = logo ? Math.round(fontPx * 0.35) : 0;

  const mark = document.createElement("canvas");
  mark.width = logoWidth + gap + textWidth;
  mark.height = height;
  const ctx = mark.getContext("2d");
  if (logo) ctx.drawImage(logo, 0, Math.round((height - logoHeight) / 2), logoWidth, logoHeight);

  // A thin outline in the opposite shade keeps it readable on any background.
  const hex = colorHex(color);
  ctx.font = fontCss(font, fontPx);
  ctx.textBaseline = "middle";
  ctx.lineJoin = "round";
  ctx.lineWidth = stroke * 2;
  ctx.strokeStyle = isDark(hex) ? "rgba(255,255,255,0.43)" : "rgba(0,0,0,0.43)";
  const x = logoWidth + gap + stroke;
  ctx.strokeText(text, x, height / 2);
  ctx.fillStyle = hex;
  ctx.fillText(text, x, height / 2);
  return mark;
}

// Draws the watermark for these settings over whatever is already on the canvas.
// owner: { username, fullName }; logo: a loaded <img> of the PhilFreela logo.
export function drawWatermark(canvas, settings, owner, logo) {
  if (!settings.visible_enabled) return;
  const ctx = canvas.getContext("2d");
  const { width, height } = canvas;
  const text = watermarkText(settings, owner);
  const badge = settings.show_badge ? logo : null;

  let fontPx = Math.max(12, Math.round(Math.min(width, height) * (SIZE_RATIOS[settings.size] || SIZE_RATIOS.medium)));
  let mark = drawMark(text, fontPx, settings.color, badge, settings.font);
  // Long text on a small photo: shrink it so it fits.
  const room = width - 2 * Math.round(fontPx * 0.8);
  if (settings.position !== "tiled" && mark.width > room) {
    fontPx = Math.max(10, Math.floor((fontPx * room) / mark.width));
    mark = drawMark(text, fontPx, settings.color, badge, settings.font);
  }
  const margin = Math.round(fontPx * 0.8);

  ctx.save();
  ctx.globalAlpha = settings.opacity / 100;
  if (settings.position === "tiled") {
    // Rows of marks, every other row shifted, turned 30 degrees and covering the photo.
    const side = Math.ceil(Math.hypot(width, height));
    const stepX = mark.width + fontPx * 3;
    const stepY = mark.height + fontPx * 3;
    ctx.translate(width / 2, height / 2);
    ctx.rotate((-TILE_ANGLE * Math.PI) / 180);
    for (let row = 0, y = -side / 2 - stepX; y < side / 2 + stepY; row += 1, y += stepY) {
      const shift = row % 2 ? stepX / 2 : 0;
      for (let x = -side / 2 - stepX + shift; x < side / 2 + stepX; x += stepX) {
        ctx.drawImage(mark, Math.round(x), Math.round(y));
      }
    }
  } else {
    const spots = {
      top_left: [margin, margin],
      top_right: [width - margin - mark.width, margin],
      bottom_left: [margin, height - margin - mark.height],
      bottom_right: [width - margin - mark.width, height - margin - mark.height],
      center: [(width - mark.width) / 2, (height - mark.height) / 2]
    };
    const [x, y] = spots[settings.position];
    ctx.drawImage(mark, Math.max(0, Math.round(x)), Math.max(0, Math.round(y)));
  }
  ctx.restore();
}
