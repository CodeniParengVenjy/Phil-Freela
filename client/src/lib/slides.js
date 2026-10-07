import { supabase } from "./supabaseClient";
import { addSlide } from "./aiService";
import { shrinkImage } from "./shrinkImage";
import { storagePathFromUrl } from "./storage";

// Slideshows for services and portfolio projects (watermarking system, steps
// 1-2). Every photo, video and (in services, step 8) document goes through the
// AI service, which checks it (and, from step 3, watermarks it) before saving
// it in the "slide-media" bucket. The AI service checks all of these rules
// again; the browser checks first only to answer faster.
//
// "target" says what the slides are for: { serviceId } or { portfolioItemId }.

export const MAX_SLIDES = 10;
const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];
// MOV = iPhone videos (step 7: every video is saved as a watermarked MP4).
export const VIDEO_TYPES = ["video/mp4", "video/webm", "video/quicktime"];
const MAX_IMAGE_BYTES = 10 * 1024 * 1024; // shrunk to about 0.5 MB before sending
export const MAX_VIDEO_BYTES = 50 * 1024 * 1024;
const MAX_VIDEO_SECONDS = 30;
// Documents (step 8): the text is kept, like portfolio writing, and a PDF's
// first pages are also kept as watermarked pictures (step 11). 4 MB fits in
// one request to the AI service.
const DOCUMENT_EXTENSIONS = /\.(pdf|docx|txt)$/i;
const MAX_DOCUMENT_BYTES = 4 * 1024 * 1024;

export const SLIDE_ACCEPT = [...IMAGE_TYPES, ...VIDEO_TYPES, ".mov"].join(",");
export const SLIDE_HINT = "Photos (JPG, PNG, WebP) up to 10 MB. Videos (MP4, MOV, WebM) up to 50 MB and 30 seconds; each video takes up to 2 minutes to watermark.";
// Services (step 8) and portfolio projects (step 10) also take documents.
export const SLIDE_ACCEPT_WITH_DOCUMENTS = `${SLIDE_ACCEPT},.pdf,.docx,.txt`;
export const SLIDE_HINT_WITH_DOCUMENTS = `${SLIDE_HINT} Documents (PDF, DOCX, TXT) up to 4 MB: the text is kept, with your invisible code and footer. A PDF also shows its first 5 pages as pictures with your name across them (about a minute to watermark).`;

// Add this to a services select to get each service's slides with it.
// watermarked: the file carries the watermark itself (photos from step 3 on).
// promo: the freelancer marked it as a promo/ad, so it has no visible watermark.
// status: "flagged" = nearly the same as another freelancer's photo, so only
// its uploader and the admins see it until an admin reviews it (step 5).
// page_count: how many page pictures a document has (a PDF, step 11).
export const SLIDES_SELECT = "slides:media_slides(id, position, media_type, file_path, page_count, watermarked, promo, status)";

// (Some browsers give .mov files no type at all, so the name counts too.)
export const isVideoFile = (file) => VIDEO_TYPES.includes(file.type) || /\.mov$/i.test(file.name);
const isMovFile = (file) => file.type === "video/quicktime" || /\.mov$/i.test(file.name);
export const isDocumentFile = (file) => DOCUMENT_EXTENSIONS.test(file.name);

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
// allowDocuments: PDF, DOCX and TXT are allowed too (services).
export async function checkSlideFile(file, allowDocuments = false) {
  if (allowDocuments && isDocumentFile(file)) {
    return file.size > MAX_DOCUMENT_BYTES ? "Documents must be 4 MB or smaller." : "";
  }
  if (IMAGE_TYPES.includes(file.type)) {
    return file.size > MAX_IMAGE_BYTES ? "Photos must be 10 MB or smaller." : "";
  }
  if (isVideoFile(file)) {
    if (file.size > MAX_VIDEO_BYTES) return "Videos must be 50 MB or smaller.";
    const seconds = await videoSeconds(file);
    // Some browsers can't open iPhone (MOV) videos themselves; the AI service
    // checks those, since it converts them anyway.
    if (seconds === null && !isMovFile(file)) return "This video can't be played. Please use an MP4, MOV or WebM video.";
    // Some recorded videos don't store their length (Infinity); the AI service measures those.
    if (Number.isFinite(seconds) && seconds > MAX_VIDEO_SECONDS + 0.5) return `Videos can be at most ${MAX_VIDEO_SECONDS} seconds long.`;
    return "";
  }
  return allowDocuments
    ? "Only JPG, PNG or WebP photos, MP4, MOV or WebM videos, or PDF, DOCX or TXT documents are allowed."
    : "Only JPG, PNG or WebP photos, or MP4, MOV or WebM videos, are allowed.";
}

// Puts a video in the private "slide-uploads" bucket (in the user's own
// folder), where the AI service takes it from: videos are too big to send to
// it directly. Returns the path. Also used by Check Ownership for videos.
export async function stageVideo(file, userId) {
  // Named by time + a random part only, so odd characters in the file name can't break it.
  const extension = isMovFile(file) ? "mov" : file.type === "video/webm" ? "webm" : "mp4";
  const contentType = isMovFile(file) ? "video/quicktime" : file.type || "video/mp4";
  const videoPath = `${userId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${extension}`;
  const { error } = await supabase.storage.from("slide-uploads").upload(videoPath, file, { contentType });
  if (error) throw new Error("Couldn't upload that video. Please try again.");
  return videoPath;
}

// Removes a staged video (the AI service normally does this itself; this
// covers the case where it couldn't be reached at all).
export async function unstageVideo(videoPath) {
  await supabase.storage.from("slide-uploads").remove([videoPath]);
}

// Gives each picked file its own key, so the picker can tell them apart.
let nextSlideKey = 0;

// Checks newly picked files and adds the good ones after the files already
// picked ([{ key, file }], at most 10). Returns { items, error }: the new
// list, and a message about any file that was left out ("" if none were).
// allowDocuments: see checkSlideFile.
export async function addPickedFiles(items, files, allowDocuments = false) {
  const problems = [];
  const accepted = [];
  for (const file of files) {
    const problem = await checkSlideFile(file, allowDocuments);
    if (problem) problems.push(`${file.name}: ${problem}`);
    else accepted.push({ key: nextSlideKey++, file, promo: false });
  }

  const room = MAX_SLIDES - items.length;
  if (accepted.length > room) {
    problems.push(`Only ${MAX_SLIDES} files fit, so ${accepted.length - room} were left out.`);
  }
  return { items: [...items, ...accepted].slice(0, MAX_SLIDES), error: problems.join(" ") };
}

// Adds one file to the end of a service's or project's slideshow and returns
// the saved slide. promo: it's an ad, so no visible watermark. Photos are
// shrunk first. Documents go as they are (the AI service keeps their text).
// Videos are too big to send to the AI service directly, so they go to the
// private "slide-uploads" bucket first and the AI service takes them from there.
export async function uploadSlide(target, file, userId, promo = false) {
  if (isDocumentFile(file)) {
    return addSlide({ ...target, document: file });
  }
  if (!isVideoFile(file)) {
    return addSlide({ ...target, image: await shrinkImage(file), promo });
  }

  const videoPath = await stageVideo(file, userId);
  try {
    return await addSlide({ ...target, videoPath, promo });
  } catch (err) {
    await unstageVideo(videoPath);
    throw err;
  }
}

// The message to show after uploading when some files were held back for an
// admin ("" when none were). held_because (in the AI service's reply, step
// 10): "watermark" = the file carries another freelancer's hidden watermark
// (step 9); otherwise the copy check found it very similar (steps 5-6).
export function underReviewMessage(slides) {
  const flagged = slides.filter((slide) => slide.status === "flagged");
  const byWatermark = flagged.filter((slide) => slide.held_because === "watermark").length;
  const bySimilarity = flagged.length - byWatermark;
  const messages = [];
  if (byWatermark) {
    messages.push(`${byWatermark === 1 ? "1 file carries" : `${byWatermark} files carry`} another freelancer's hidden watermark, so an admin will review ${byWatermark === 1 ? "it before it's" : "them before they're"} shown.`);
  }
  if (bySimilarity) {
    messages.push(`${bySimilarity === 1 ? "1 file is" : `${bySimilarity} files are`} waiting for an admin to review, because ${bySimilarity === 1 ? "it looks" : "they look"} very similar to another freelancer's work. Until then only you can see ${bySimilarity === 1 ? "it" : "them"}.`);
  }
  return messages.join(" ");
}

// The good news to show after uploading: how many files passed the ownership
// check ("" when none did). The AI service runs that check on every file as
// it is uploaded (POST /slides): it reads any hidden code the file already
// carries, then compares it with other freelancers' work. A file that passes
// both is saved as "active"; one that doesn't is "flagged" (see above).
export function ownershipPassedMessage(slides) {
  const passed = slides.filter((slide) => slide.status === "active").length;
  if (!passed) return "";
  if (passed < slides.length) return `Ownership check passed on ${passed} of ${slides.length} files.`;
  if (passed === 1) return "Ownership check passed.";
  return `Ownership check passed on ${passed === 2 ? "both" : `all ${passed}`} files.`;
}

// Whether a service or portfolio project gets the "Original" badge (step 10,
// see components/OriginalBadge.jsx): it has files, none is waiting for an
// admin, and every one carries PhilFreela's hidden watermark, so it passed
// the copy check and can be traced back to its owner. Writing added before
// step 10 always has the code.
export function isOriginalWork(item) {
  if (item.kind === "document") return item.status === "active";
  const slides = item.slides || [];
  return slides.length > 0 && slides.every((slide) => slide.status === "active" && slide.watermarked);
}

// Uploads the picked files ([{ key, file, promo }]) one at a time: each
// request to the AI service must stay small, and it lets the page show
// progress through onProgress("Checking ownership: 2 of 5..."). The words
// say "checking" because the request that uploads a file also runs the
// ownership check on it (see ownershipPassedMessage). If one fails the rest
// still go. Returns { slides, failed }: the saved slides, and a message per
// failed file.
export async function uploadSlides(target, items, userId, onProgress) {
  const slides = [];
  const failed = [];
  for (const [index, { file, promo }] of items.entries()) {
    onProgress(isVideoFile(file)
      ? `Watermarking and checking video ${index + 1} of ${items.length} (up to 2 minutes)...`
      : isDocumentFile(file)
        ? `Watermarking and checking document ${index + 1} of ${items.length} (a PDF takes about a minute)...`
        : `Checking ownership: ${index + 1} of ${items.length}...`);
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

// Where a document slide's page pictures are (step 11): next to its text
// file, "<user id>/<slide id>.txt" -> "<user id>/<slide id>-p1.jpg",
// "-p2.jpg" and so on. The AI service saves them under these names
// (page_path in ai-service/main.py). [] for a slide without page pictures.
export function slidePagePaths(slide) {
  const stem = slide.file_path.replace(/\.[^./]+$/, "");
  return Array.from({ length: slide.page_count || 0 }, (_, i) => `${stem}-p${i + 1}.jpg`);
}

// The text of a document slide (step 8), fetched once per page load.
const documentTexts = new Map();
export function fetchSlideText(url) {
  if (!documentTexts.has(url)) {
    const request = fetch(url).then((response) => {
      if (!response.ok) throw new Error("Couldn't load this document.");
      return response.text();
    });
    // A failed load isn't kept, so it's tried again next time.
    request.catch(() => documentTexts.delete(url));
    documentTexts.set(url, request);
  }
  return documentTexts.get(url);
}

// A service's or project's slides in slideshow order, as
// [{ id, mediaType, url, pages, showOwnerName, underReview }]. mediaType:
// "image", "video" or "document" (a .txt file, step 8). pages: the links of a
// document's page pictures (a PDF, step 11; [] otherwise). showOwnerName: the
// page draws the uploader's name faintly over it, because the file itself has
// no watermark (older photos, videos until step 7) and it isn't a promo.
// underReview: flagged by the copy check, waiting for an admin.
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
        pages: slidePagePaths(slide).map(slideUrl),
        // (Photos from step 3 and videos from step 7 on carry their own watermark.)
        showOwnerName: !slide.watermarked && !slide.promo,
        underReview: slide.status === "flagged"
      }));
  }
  if (item.image_url) return [{ id: "original", mediaType: item.media_type, url: item.image_url, showOwnerName: true }];
  return [];
}

// After a service or project is deleted, deletes its files too: its slides
// (with a document's page pictures), or the one photo/video of an older
// service. A failure only leaves unused files behind.
export async function removeItemFiles(item) {
  const slidePaths = (item.slides || []).flatMap((slide) => [slide.file_path, ...slidePagePaths(slide)]);
  if (slidePaths.length) await supabase.storage.from("slide-media").remove(slidePaths);

  const oldPath = storagePathFromUrl(item.image_url);
  if (oldPath) await supabase.storage.from("marketplace-images").remove([oldPath]);
}
