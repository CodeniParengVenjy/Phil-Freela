import { supabase } from "./supabaseClient";

// Address of the Python AI service (the ai-service folder). By default it's
// this website's own /ai address, which the dev server forwards to the
// service (see vite.config.js), so it works the same on the laptop and on a
// phone. VITE_AI_SERVICE_URL points somewhere else instead: on the live site
// it's the laptop's ngrok link (see start-ai.bat).
export const AI_SERVICE_URL = import.meta.env.VITE_AI_SERVICE_URL || "/ai";

const OFFLINE = "The verification service is offline right now. Please try again later.";

// Free ngrok links show browsers a "you are about to visit" page first, which
// would block the AI service's replies. This header skips that page; anywhere
// else it's simply ignored.
const SKIP_NGROK_WARNING = { "ngrok-skip-browser-warning": "true" };

// Calls the AI service and turns its error replies ({ detail: "..." }) into
// normal errors with a message that can be shown to the user.
async function request(path, options) {
  let response;
  try {
    response = await fetch(`${AI_SERVICE_URL}${path}`, {
      ...options,
      headers: { ...SKIP_NGROK_WARNING, ...options?.headers }
    });
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

// All photos: the ID (front, and back unless it's a passport) and the three
// face scan frames (looking straight, then turned each way).
function photoForm({ idType, idPhoto, idBack, selfie, selfieLeft, selfieRight }) {
  const form = new FormData();
  form.append("id_type", idType);
  form.append("id_photo", idPhoto, "id-front.jpg");
  if (idBack) form.append("id_back", idBack, "id-back.jpg");
  form.append("selfie", selfie, "scan-straight.jpg");
  form.append("selfie_left", selfieLeft, "scan-left.jpg");
  form.append("selfie_right", selfieRight, "scan-right.jpg");
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
