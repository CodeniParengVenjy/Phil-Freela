import { supabase } from "./supabaseClient";

// Address of the Python AI service (the ai-service folder): always this
// website's own /ai address, which forwards to the service. On the laptop the
// dev server does the forwarding (see vite.config.js); on the live site a
// Cloudflare function does (see functions/ai). The browser only ever talks to
// this one site, so the AI service's own address never gets in the way.
export const AI_SERVICE_URL = "/ai";

const OFFLINE = "The AI service is offline right now. Please try again later.";

// Calls the AI service and turns its error replies ({ detail: "..." }) into
// normal errors with a message that can be shown to the user.
async function request(path, options) {
  let response;
  try {
    response = await fetch(`${AI_SERVICE_URL}${path}`, options);
  } catch {
    throw new Error(OFFLINE);
  }

  // The AI service always answers in JSON. Anything else means it wasn't
  // reached: e.g. a host without the /ai forwarding answers with the website's
  // own page, which must never be mistaken for "photo passed".
  if (!response.headers.get("content-type")?.includes("application/json")) {
    throw new Error(OFFLINE);
  }

  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    // A missing AI service shows up as 502/504 through the /ai forwarding.
    if (response.status === 502 || response.status === 504) throw new Error(OFFLINE);
    throw new Error(typeof body.detail === "string" ? body.detail : "Something went wrong. Please try again.");
  }
  return body;
}

// The logged-in user's token, which the AI service double-checks with
// Supabase, so nobody can act in someone else's name.
async function authHeader() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error("Your login has expired. Please log in again.");
  return { Authorization: `Bearer ${session.access_token}` };
}

// Who is calling: the phone page sends its QR token, everyone else their login.
async function callerOptions(form, token) {
  if (token) {
    form.append("token", token);
    return {};
  }
  return await authHeader();
}

// All photos: the ID (front, and back unless it's a passport) and the face
// scan frames (looking straight, then turned fully each way). The two
// "halfway" frames, taken during each turn, are only used by the AI to check
// it's the same person throughout; they aren't saved.
function photoForm({ idType, idPhoto, idBack, selfie, selfieLeft, selfieRight, selfieLeftHalf, selfieRightHalf }) {
  const form = new FormData();
  form.append("id_type", idType);
  form.append("id_photo", idPhoto, "id-front.jpg");
  if (idBack) form.append("id_back", idBack, "id-back.jpg");
  form.append("selfie", selfie, "scan-straight.jpg");
  form.append("selfie_left", selfieLeft, "scan-left.jpg");
  form.append("selfie_right", selfieRight, "scan-right.jpg");
  if (selfieLeftHalf && selfieRightHalf) {
    form.append("selfie_left_half", selfieLeftHalf, "scan-left-half.jpg");
    form.append("selfie_right_half", selfieRightHalf, "scan-right-half.jpg");
  }
  return form;
}

// Instant check of the front of the ID (face found, big enough, sharp).
// Resolves when it's fine; throws with a "retake" message when it isn't.
export async function checkIdFront(photo, token) {
  const form = new FormData();
  form.append("photo", photo, "id-front.jpg");
  const headers = await callerOptions(form, token);
  return request("/checks/id-front", { method: "POST", headers, body: form });
}

// Instant check of the back of the ID (sharp, and not the front photo again).
export async function checkIdBack(front, back, token) {
  const form = new FormData();
  form.append("front", front, "id-front.jpg");
  form.append("back", back, "id-back.jpg");
  const headers = await callerOptions(form, token);
  return request("/checks/id-back", { method: "POST", headers, body: form });
}

// Sends everything as the logged-in user (computer, or the Verify Identity
// page opened on a phone). The AI service re-runs every check.
export async function submitVerification(photos) {
  return request("/verifications", {
    method: "POST",
    headers: await authHeader(),
    body: photoForm(photos)
  });
}

// Makes a one-time QR link (valid 10 minutes) for verifying with a phone.
// Returns { token, expires_at }.
export async function createPhoneLink() {
  return request("/phone-links", { method: "POST", headers: await authHeader() });
}

// Asks whether a QR link still works. Returns { valid: true/false }.
export function checkPhoneLink(token) {
  return request(`/phone-links/${encodeURIComponent(token)}`);
}

// Sends everything from the phone. The QR token takes the place of a login.
export function submitFromPhone(token, photos) {
  return request(`/phone-links/${encodeURIComponent(token)}/submit`, {
    method: "POST",
    body: photoForm(photos)
  });
}

// Check Ownership (the Extraction API): sends a picture someone found, and the
// AI service reads the invisible code hidden in it. Returns { found: false },
// or { found: true, bits_matched, is_you, owner: { id, full_name, username,
// verified }, source: { kind: "service" | "project", title, file_path } (null
// if that post was deleted), uploaded_at }.
export async function checkOwnership(picture) {
  const form = new FormData();
  form.append("image", picture, picture.name);
  return request("/watermarks/extract", { method: "POST", headers: await authHeader(), body: form });
}

// Check Ownership for a video (watermarking step 7). The video must already
// be in the "slide-uploads" bucket (see stageVideo in lib/slides.js); pass its
// path. Returns the same answer as checkOwnership.
export async function checkVideoOwnership(videoPath) {
  const form = new FormData();
  form.append("video_path", videoPath);
  return request("/watermarks/extract-video", { method: "POST", headers: await authHeader(), body: form });
}

// Adds writing to the caller's portfolio (watermarking step 6): pasted text,
// or a TXT, DOCX or PDF file. The AI service hides the invisible code in it,
// adds the footer, and runs the copy check. Returns the saved document:
// { id, kind: "document", title, description, body, status, created_at }.
export async function addDocument({ title, description, text, file }) {
  const form = new FormData();
  form.append("title", title);
  if (description) form.append("description", description);
  if (text) form.append("text", text);
  if (file) form.append("document", file, file.name);
  return request("/portfolio/documents", { method: "POST", headers: await authHeader(), body: form });
}

// Check Ownership for writing: pasted text or a TXT, DOCX or PDF file.
// Returns { found: false }, or { found: true, how: "code" | "similarity",
// similarity, is_you, owner: { id, full_name, username, verified },
// document: { id, title, created_at } (null if deleted), uploaded_at }.
export async function checkTextOwnership({ text, file }) {
  const form = new FormData();
  if (text) form.append("text", text);
  if (file) form.append("document", file, file.name);
  return request("/watermarks/extract-text", { method: "POST", headers: await authHeader(), body: form });
}

// Adds one photo (a File), one video (its path in the "slide-uploads" bucket)
// or one document (a PDF, DOCX or TXT File) to the end of a service's or
// portfolio project's slideshow (pass serviceId or portfolioItemId). promo:
// it's an ad, so no visible watermark. Returns the saved slide: { id,
// position, media_type, file_path, watermarked, promo, status }. See lib/slides.js.
export async function addSlide({ serviceId, portfolioItemId, image, videoPath, document, promo = false }) {
  const form = new FormData();
  if (serviceId) form.append("service_id", serviceId);
  if (portfolioItemId) form.append("portfolio_item_id", portfolioItemId);
  form.append("promo", promo ? "true" : "false");
  if (image) form.append("image", image, image.name);
  if (videoPath) form.append("video_path", videoPath);
  if (document) form.append("document", document, document.name);
  return request("/slides", { method: "POST", headers: await authHeader(), body: form });
}

// The AI search box (Hybrid recommendation system, content-based filtering):
// services and job posts closest in meaning to the typed words, best first.
// Returns [{ type: "service" | "job", id, score, strong }]; the page loads the
// posts itself. See ai-service/listing_search.py.
export async function searchListings(query) {
  const body = await request("/search", {
    method: "POST",
    headers: { ...(await authHeader()), "Content-Type": "application/json" },
    body: JSON.stringify({ query })
  });
  return body.results || [];
}

// "Recommended for you" (Hybrid recommendation system: content-based +
// collaborative filtering + ranking): job posts for freelancers, services for
// clients, best first. Returns { personalized, results: [{ type, id, score,
// reasons }] }; the panel loads the posts itself. See
// ai-service/recommendations.py.
export async function getRecommendations() {
  return request("/recommendations", { headers: await authHeader() });
}
