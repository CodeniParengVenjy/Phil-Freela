import { supabase } from "./supabaseClient";
import { shrinkImage } from "./shrinkImage";

// Screenshots sent with a report (database/supabase_reports_schema.sql). They
// go into a private bucket: only the sender and admins can open them.
const EVIDENCE_BUCKET = "report-evidence";
export const MAX_SCREENSHOTS = 3;
const SCREENSHOT_TYPES = ["image/jpeg", "image/png", "image/webp"];
// Before shrinking; after it they're small JPEGs (the bucket allows 5 MB).
const MAX_SCREENSHOT_MB = 15;

// Checks a picked screenshot. Returns what's wrong, or "" when it's fine.
export function checkScreenshot(file) {
  if (!SCREENSHOT_TYPES.includes(file.type)) return "Screenshots must be JPG, PNG or WebP images.";
  if (file.size > MAX_SCREENSHOT_MB * 1024 * 1024) return `Each screenshot must be under ${MAX_SCREENSHOT_MB} MB.`;
  return "";
}

// Sends a report. The screenshots are uploaded first, as
// <user id>/<report id>/1.jpg, 2.jpg...; then the report row lists them. If
// the report can't be saved, the screenshots are deleted again so no unused
// file is left behind. The database checks the rest (you report as yourself,
// can't report yourself, and a call report must be about the other person
// in that call). Returns { error } like Supabase does.
//   target: { type: "user" | "service" | "job_post", id, callId? }
export async function sendReport({ target, reason, details, screenshots = [] }) {
  const { data: { session } } = await supabase.auth.getSession();
  const userId = session?.user?.id;
  if (!userId) return { error: { message: "Please log in again." } };

  const reportId = crypto.randomUUID();
  const paths = [];
  const removeUploaded = () => (paths.length ? supabase.storage.from(EVIDENCE_BUCKET).remove(paths) : null);

  for (const [index, file] of screenshots.entries()) {
    let jpeg;
    try {
      jpeg = await shrinkImage(file); // also makes sure it really is a picture
    } catch (error) {
      await removeUploaded();
      return { error: { message: error.message } };
    }
    const path = `${userId}/${reportId}/${index + 1}.jpg`;
    const { error } = await supabase.storage.from(EVIDENCE_BUCKET).upload(path, jpeg, { contentType: "image/jpeg" });
    if (error) {
      await removeUploaded();
      return { error: { message: "Couldn't upload the screenshots. Please try again." } };
    }
    paths.push(path);
  }

  const { error } = await supabase.from("reports").insert({
    id: reportId,
    reporter_id: userId,
    target_type: target.type,
    target_id: target.id,
    reason,
    details: details || null,
    call_id: target.callId || null,
    evidence_paths: paths
  });
  if (error) await removeUploaded();
  return { error };
}

// Links that open a report's screenshots, for the admin Reports page. The
// bucket is private, so each link only works for an hour.
export async function getScreenshotLinks(paths) {
  if (!paths.length) return {};
  const { data } = await supabase.storage.from(EVIDENCE_BUCKET).createSignedUrls(paths, 60 * 60);
  return Object.fromEntries((data || []).filter((item) => item.signedUrl).map((item) => [item.path, item.signedUrl]));
}

// The reasons a user can pick when reporting something. The values match the
// check on the reports table (database), so do not rename them.
export const reportReasons = [
  { value: "spam", label: "Spam" },
  { value: "scam", label: "Scam / Fraud" },
  { value: "inappropriate", label: "Inappropriate content" },
  { value: "harassment", label: "Harassment" },
  { value: "fake_profile", label: "Fake profile" },
  { value: "other", label: "Other" }
];

export function reportReasonLabel(value) {
  return reportReasons.find((r) => r.value === value)?.label || value;
}

// What was reported, in words (used on the admin Reports page).
export const reportTargetLabels = {
  user: "User",
  service: "Service",
  job_post: "Job Post"
};
