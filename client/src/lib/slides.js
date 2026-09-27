import { supabase } from "./supabaseClient";
import { addSlide } from "./aiService";
import { shrinkImage } from "./shrinkImage";
import { storagePathFromUrl } from "./storage";

// Slideshows for services and portfolio projects (watermarking system, steps
// 1-2). Every photo and video goes through the AI service, which checks it
// (and, from step 3, watermarks it) before saving it in the "slide-media"
// bucket. The AI service checks all of these rules again; the browser checks
// first only to answer faster.
//
// "target" says what the slides are for: { serviceId } or { portfolioItemId }.

export const MAX_SLIDES = 10;
const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];
const VIDEO_TYPES = ["video/mp4", "video/webm"];
const MAX_IMAGE_BYTES = 10 * 1024 * 1024; // shrunk to about 0.5 MB before sending
const MAX_VIDEO_BYTES = 50 * 1024 * 1024;
const MAX_VIDEO_SECONDS = 30;

export const SLIDE_ACCEPT = [...IMAGE_TYPES, ...VIDEO_TYPES].join(",");
export const SLIDE_HINT = "Photos (JPG, PNG, WebP) up to 10 MB. Videos (MP4, WebM) up to 50 MB and 30 seconds.";

// Add this to a services select to get each service's slides with it.
// watermarked: the file carries the watermark itself (photos from step 3 on).
// promo: the freelancer marked it as a promo/ad, so it has no visible watermark.
export const SLIDES_SELECT = "slides:media_slides(id, position, media_type, file_path, watermarked, promo)";

export const isVideoFile = (file) => VIDEO_TYPES.includes(file.type);

// How many seconds a video file lasts, read by the browser (null if it can't play it).
function videoSeconds(file) {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement("video");
    video.preload = "metadata";
    video.onloadedmetadata = () => {
      URL.revokeObjectURL(url);
      resolve(video.duration);
    };
    video.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(null);
    };
    video.src = url;
  });
}

// Returns a message when the file can't be a slide, or "" when it's fine.
export async function checkSlideFile(file) {
  if (IMAGE_TYPES.includes(file.type)) {
    return file.size > MAX_IMAGE_BYTES ? "Photos must be 10 MB or smaller." : "";
  }
  if (isVideoFile(file)) {
    if (file.size > MAX_VIDEO_BYTES) return "Videos must be 50 MB or smaller.";
    const seconds = await videoSeconds(file);
    if (seconds === null) return "This video can't be played. Please use an MP4 or WebM video.";
    // Some recorded videos don't store their length (Infinity); the AI service measures those.
    if (Number.isFinite(seconds) && seconds > MAX_VIDEO_SECONDS + 0.5) return `Videos can be at most ${MAX_VIDEO_SECONDS} seconds long.`;
    return "";
  }
  return "Only JPG, PNG or WebP photos, or MP4 or WebM videos, are allowed.";
}

// Gives each picked file its own key, so the picker can tell them apart.
let nextSlideKey = 0;

// Checks newly picked files and adds the good ones after the files already
// picked ([{ key, file }], at most 10). Returns { items, error }: the new
// list, and a message about any file that was left out ("" if none were).
export async function addPickedFiles(items, files) {
  const problems = [];
  const accepted = [];
  for (const file of files) {
    const problem = await checkSlideFile(file);
    if (problem) problems.push(`${file.name}: ${problem}`);
    else accepted.push({ key: nextSlideKey++, file, promo: false });
  }

  const room = MAX_SLIDES - items.length;
  if (accepted.length > room) {
    problems.push(`Only ${MAX_SLIDES} photos and videos fit, so ${accepted.length - room} were left out.`);
  }
  return { items: [...items, ...accepted].slice(0, MAX_SLIDES), error: problems.join(" ") };
}

// Adds one file to the end of a service's or project's slideshow and returns
// the saved slide. promo: it's an ad, so no visible watermark. Photos are
// shrunk first. Videos are too big to send to the AI service directly, so
// they go to the private "slide-uploads" bucket first and the AI service
// takes them from there.
export async function uploadSlide(target, file, userId, promo = false) {
  if (!isVideoFile(file)) {
    return addSlide({ ...target, image: await shrinkImage(file), promo });
  }

  // Named by time + a random part only, so odd characters in the file name can't break it.
  const extension = file.type === "video/webm" ? "webm" : "mp4";
  const videoPath = `${userId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${extension}`;
  const { error } = await supabase.storage.from("slide-uploads").upload(videoPath, file);
  if (error) throw new Error("Couldn't upload that video. Please try again.");

  try {
    return await addSlide({ ...target, videoPath, promo });
  } catch (err) {
    // The AI service deletes the temporary copy itself; this covers the case
    // where it couldn't be reached at all.
    await supabase.storage.from("slide-uploads").remove([videoPath]);
    throw err;
  }
}

// Uploads the picked files ([{ key, file, promo }]) one at a time: each
// request to the AI service must stay small, and it lets the page show
// progress through onProgress("Uploading 2 of 5..."). If one fails the rest
// still go. Returns { slides, failed }: the saved slides, and a message per
// failed file.
export async function uploadSlides(target, items, userId, onProgress) {
  const slides = [];
  const failed = [];
  for (const [index, { file, promo }] of items.entries()) {
    onProgress(`Uploading ${index + 1} of ${items.length}...`);
    try {
      slides.push(await uploadSlide(target, file, userId, promo));
    } catch (err) {
      failed.push(`${file.name}: ${err.message}`);
    }
  }
  return { slides, failed };
}

// The public link of a saved slide.
export function slideUrl(filePath) {
  return supabase.storage.from("slide-media").getPublicUrl(filePath).data.publicUrl;
}

// A service's or project's slides in slideshow order, as
// [{ id, mediaType, url, showOwnerName }]. showOwnerName: the page draws the
// uploader's name faintly over it, because the file itself has no watermark
// (older photos, videos until step 7) and it isn't a promo.
// Services posted before slideshows existed have one photo or video
// (image_url), shown as a one-slide slideshow.
export function itemSlides(item) {
  if (item.slides?.length) {
    return [...item.slides]
      .sort((a, b) => a.position - b.position)
      .map((slide) => ({
        id: slide.id,
        mediaType: slide.media_type,
        url: slideUrl(slide.file_path),
        showOwnerName: !slide.watermarked && !slide.promo
      }));
  }
  if (item.image_url) return [{ id: "original", mediaType: item.media_type, url: item.image_url, showOwnerName: true }];
  return [];
}

// After a service or project is deleted, deletes its files too: its slides,
// or the one photo/video of an older service. A failure only leaves unused
// files behind.
export async function removeItemFiles(item) {
  const slidePaths = (item.slides || []).map((slide) => slide.file_path);
  if (slidePaths.length) await supabase.storage.from("slide-media").remove(slidePaths);

  const oldPath = storagePathFromUrl(item.image_url);
  if (oldPath) await supabase.storage.from("marketplace-images").remove([oldPath]);
}
