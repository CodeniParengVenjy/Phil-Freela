import { supabase } from "./supabaseClient";

// The freelancer's own watermark picture (PLAN-own-watermark.md): a logo or a
// signature they add in Settings > Watermark Settings. All the work happens
// here in the browser: the picture is shrunk, its plain background is made
// see-through if they ask, and two PNG files go to the private
// watermark-pictures bucket (database/supabase_own_watermark_schema.sql):
//   <their id>/<number>/original.png  as picked (shrunk), so "Remove
//                                     background" can be flipped later
//   <their id>/<number>/mark.png      the finished picture the AI service
//                                     draws into their uploads
// Each save uses a new <number>, so the AI service never gets an old copy.

export const PICTURE_BUCKET = "watermark-pictures";
export const PICTURE_ACCEPT = "image/png,image/jpeg,image/webp";
export const MAX_PICTURE_MB = 10;
// Longest side after shrinking. A watermark is never drawn bigger than this,
// and the AI service ignores pictures over 1200 x 1200.
const MAX_SIDE = 600;
// The bucket's own limit for one file.
const MAX_SAVED_BYTES = 2 * 1024 * 1024;

// Remove background: a pixel this close to the background color becomes fully
// see-through, one this far stays as it is, and those in between become
// partly see-through (soft edges). Distance = how far apart two colors are,
// 0 (same) to 441 (black vs white).
const NEAR = 40;
const FAR = 90;

// Loads a picture from a link.
function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

// A new canvas with this picture drawn at width x height.
function toCanvas(picture, width = picture.naturalWidth || picture.width, height = picture.naturalHeight || picture.height) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  canvas.getContext("2d").drawImage(picture, 0, 0, width, height);
  return canvas;
}

// Opens a picked file as a canvas, shrunk to at most 600 px on its longer side.
export async function readPictureFile(file) {
  if (!PICTURE_ACCEPT.split(",").includes(file.type)) throw new Error("Pick a PNG, JPG or WebP picture.");
  if (file.size > MAX_PICTURE_MB * 1024 * 1024) throw new Error(`That picture is bigger than ${MAX_PICTURE_MB} MB.`);
  const url = URL.createObjectURL(file);
  try {
    const img = await loadImage(url);
    const scale = Math.min(1, MAX_SIDE / Math.max(img.naturalWidth, img.naturalHeight));
    return toCanvas(img, Math.max(1, Math.round(img.naturalWidth * scale)), Math.max(1, Math.round(img.naturalHeight * scale)));
  } catch {
    throw new Error("That file couldn't be opened as a picture.");
  } finally {
    URL.revokeObjectURL(url);
  }
}

// How far apart the pixel at i and the color [r, g, b] are.
function distance(px, i, color) {
  return Math.hypot(px[i] - color[0], px[i + 1] - color[1], px[i + 2] - color[2]);
}

// The picture without its see-through margins (null if nothing is left).
function trimClear(canvas) {
  const { width, height } = canvas;
  const px = canvas.getContext("2d").getImageData(0, 0, width, height).data;
  let [left, top, right, bottom] = [width, height, -1, -1];
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (px[(y * width + x) * 4 + 3] > 8) {
        left = Math.min(left, x);
        right = Math.max(right, x);
        top = Math.min(top, y);
        bottom = Math.max(bottom, y);
      }
    }
  }
  if (right < 0) return null;
  const out = document.createElement("canvas");
  out.width = right - left + 1;
  out.height = bottom - top + 1;
  out.getContext("2d").drawImage(canvas, left, top, out.width, out.height, 0, 0, out.width, out.height);
  return out;
}

// "Remove background", for a logo or signature on a plain background (like
// white paper). No AI model: it looks at the pixels along the picture's 4
// edges, takes their most common color as the background, and makes every
// pixel close to that color see-through.
// Returns { canvas, status }: "done"; "already" (the edges were already
// see-through); "not_plain" (the edges have no one main color, e.g. a photo,
// so nothing was changed); "empty" (nothing would be left).
export function removeBackground(source) {
  const { width, height } = source;
  const canvas = toCanvas(source);
  const ctx = canvas.getContext("2d");
  const image = ctx.getImageData(0, 0, width, height);
  const px = image.data;

  // 1. The pixels along the 4 edges, grouped by rough color (16 shades per channel).
  const edge = [];
  for (let x = 0; x < width; x += 1) edge.push(x, (height - 1) * width + x);
  for (let y = 1; y < height - 1; y += 1) edge.push(y * width, y * width + width - 1);
  let clear = 0;
  const groups = new Map(); // rough color -> [count, sum of red, green, blue]
  for (const p of edge) {
    const i = p * 4;
    if (px[i + 3] < 32) {
      clear += 1;
      continue;
    }
    const key = ((px[i] >> 4) << 8) | ((px[i + 1] >> 4) << 4) | (px[i + 2] >> 4);
    const group = groups.get(key) || [0, 0, 0, 0];
    group[0] += 1;
    group[1] += px[i];
    group[2] += px[i + 1];
    group[3] += px[i + 2];
    groups.set(key, group);
  }
  if (clear > edge.length / 2) return { canvas: trimClear(canvas) || canvas, status: "already" };

  // 2. The most common group is the background; its average is the exact color.
  let top = null;
  for (const group of groups.values()) if (!top || group[0] > top[0]) top = group;
  const background = [top[1] / top[0], top[2] / top[0], top[3] / top[0]];

  // 3. A plain background: at least 60% of the edge is close to that color.
  let near = 0;
  for (const p of edge) if (px[p * 4 + 3] >= 32 && distance(px, p * 4, background) < FAR) near += 1;
  if (near < (edge.length - clear) * 0.6) return { canvas: source, status: "not_plain" };

  // 4. Every pixel close to the background color becomes (partly) see-through.
  for (let i = 0; i < px.length; i += 4) {
    const d = distance(px, i, background);
    if (d >= FAR) continue;
    const alpha = d <= NEAR ? 0 : (d - NEAR) / (FAR - NEAR);
    if (alpha > 0) {
      // A partly see-through edge pixel loses the background's tint, so no
      // white rim is left around the logo.
      for (let c = 0; c < 3; c += 1) {
        px[i + c] = Math.max(0, Math.min(255, Math.round((px[i + c] - background[c] * (1 - alpha)) / alpha)));
      }
    }
    px[i + 3] = Math.round(px[i + 3] * alpha);
  }
  ctx.putImageData(image, 0, 0);
  const trimmed = trimClear(canvas);
  return trimmed ? { canvas: trimmed, status: "done" } : { canvas: source, status: "empty" };
}

// The finished watermark picture for this original and switch.
// Returns { mark, removed, note }: removed = the background really was taken
// out; note = what to tell the freelancer when it couldn't be.
export function makeMark(original, removeBg) {
  if (!removeBg) return { mark: original, removed: false, note: "" };
  const { canvas, status } = removeBackground(original);
  if (status === "done") return { mark: canvas, removed: true, note: "" };
  if (status === "already") return { mark: canvas, removed: true, note: "This picture already has a see-through background." };
  if (status === "empty") return { mark: original, removed: false, note: "Removing the background would leave nothing, so the picture was kept as it is." };
  return {
    mark: original,
    removed: false,
    note: "This picture's background isn't one plain color, so it was kept as it is. Use a PNG with a see-through background instead."
  };
}

function toPng(canvas) {
  return new Promise((resolve, reject) => canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("png"))), "image/png"));
}

// Where the original sits next to a mark.png.
const originalPath = (markPath) => `${markPath.slice(0, -"mark.png".length)}original.png`;

// Saves both files in a new folder and returns the mark.png path for
// watermark_settings.picture_path.
export async function uploadWatermarkPicture(userId, original, mark) {
  const folder = `${userId}/${Date.now()}`;
  const [originalBlob, markBlob] = await Promise.all([toPng(original), toPng(mark)]);
  if (originalBlob.size > MAX_SAVED_BYTES || markBlob.size > MAX_SAVED_BYTES) {
    throw new Error("That picture is too detailed to save. Try a simpler logo or a smaller picture.");
  }
  const storage = supabase.storage.from(PICTURE_BUCKET);
  for (const [name, blob] of [["original.png", originalBlob], ["mark.png", markBlob]]) {
    const { error } = await storage.upload(`${folder}/${name}`, blob, { contentType: "image/png", upsert: false });
    if (error) throw new Error("Couldn't upload your watermark picture. Please try again.");
  }
  return `${folder}/mark.png`;
}

// Removes an older picture's two files (quietly: a leftover file harms nothing).
export async function removeWatermarkPicture(markPath) {
  if (!markPath) return;
  try {
    await supabase.storage.from(PICTURE_BUCKET).remove([markPath, originalPath(markPath)]);
  } catch {
    // ignore
  }
}

// The saved picture as { original, mark } canvases, for the settings page.
export async function loadWatermarkPicture(markPath) {
  const storage = supabase.storage.from(PICTURE_BUCKET);
  const [original, mark] = await Promise.all(
    [originalPath(markPath), markPath].map(async (path) => {
      const { data, error } = await storage.download(path);
      if (error || !data) throw new Error("Couldn't load your watermark picture.");
      const url = URL.createObjectURL(data);
      try {
        return toCanvas(await loadImage(url));
      } finally {
        URL.revokeObjectURL(url);
      }
    })
  );
  return { original, mark };
}
