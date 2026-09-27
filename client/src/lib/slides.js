import { supabase } from "./supabaseClient";
import { addSlide } from "./aiService";
import { shrinkImage } from "./shrinkImage";
import { storagePathFromUrl } from "./storage";

// Service slideshows (watermarking system, step 1). Every photo and video goes
// through the AI service, which checks it (and, from step 3, watermarks it)
// before saving it in the "slide-media" bucket. The AI service checks all of
// these rules again; the browser checks first only to answer faster.

export const MAX_SLIDES = 10;
const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];
const VIDEO_TYPES = ["video/mp4", "video/webm"];
const MAX_IMAGE_BYTES = 10 * 1024 * 1024; // shrunk to about 0.5 MB before sending
const MAX_VIDEO_BYTES = 50 * 1024 * 1024;
const MAX_VIDEO_SECONDS = 30;

export const SLIDE_ACCEPT = [...IMAGE_TYPES, ...VIDEO_TYPES].join(",");
export const SLIDE_HINT = "Photos (JPG, PNG, WebP) up to 10 MB. Videos (MP4, WebM) up to 50 MB and 30 seconds.";

// Add this to a services select to get each service's slides with it.
export const SLIDES_SELECT = "slides:media_slides(id, position, media_type, file_path)";

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

// Adds one file to the end of a service's slideshow and returns the saved
// slide. Photos are shrunk first. Videos are too big to send to the AI
// service directly, so they go to the private "slide-uploads" bucket first
// and the AI service takes them from there.
export async function uploadSlide(serviceId, file, userId) {
  if (!isVideoFile(file)) {
    return addSlide({ serviceId, image: await shrinkImage(file) });
  }

  // Named by time + a random part only, so odd characters in the file name can't break it.
  const extension = file.type === "video/webm" ? "webm" : "mp4";
  const videoPath = `${userId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${extension}`;
  const { error } = await supabase.storage.from("slide-uploads").upload(videoPath, file);
  if (error) throw new Error("Couldn't upload that video. Please try again.");

  try {
    return await addSlide({ serviceId, videoPath });
  } catch (err) {
    // The AI service deletes the temporary copy itself; this covers the case
    // where it couldn't be reached at all.
    await supabase.storage.from("slide-uploads").remove([videoPath]);
    throw err;
  }
}

// The public link of a saved slide.
export function slideUrl(filePath) {
  return supabase.storage.from("slide-media").getPublicUrl(filePath).data.publicUrl;
}

// A service's slides in slideshow order, as [{ id, mediaType, url }]. Services
// posted before slideshows existed have one photo or video (image_url), shown
// as a one-slide slideshow.
export function serviceSlides(service) {
  if (service.slides?.length) {
    return [...service.slides]
      .sort((a, b) => a.position - b.position)
      .map((slide) => ({ id: slide.id, mediaType: slide.media_type, url: slideUrl(slide.file_path) }));
  }
  if (service.image_url) return [{ id: "original", mediaType: service.media_type, url: service.image_url }];
  return [];
}

// After a service is deleted, deletes its files too: its slides, or the one
// photo/video of an older service. A failure only leaves unused files behind.
export async function removeServiceFiles(service) {
  const slidePaths = (service.slides || []).map((slide) => slide.file_path);
  if (slidePaths.length) await supabase.storage.from("slide-media").remove(slidePaths);

  const oldPath = storagePathFromUrl(service.image_url);
  if (oldPath) await supabase.storage.from("marketplace-images").remove([oldPath]);
}
