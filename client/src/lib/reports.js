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
//   target: { type: "user" | "service" | "job_post" | "portfolio_item", id, callId? }
//           or { type: "profile_picture" | "cover_photo", id: the owner's user id,
//           reportedPath: the picture's file, as it is now on their profile }.
//           The report keeps the file, so a later change of picture can't make
//           an admin remove the wrong one (database/supabase_cover_photo_schema.sql).
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
    reported_path: target.reportedPath || null,
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
  // Someone else's work posted as their own (PLAN-stolen-work.md). This is
  // how work taken from outside PhilFreela gets caught: the copy check only
  // knows what was posted here. needsDetails: the reporter must say where the
  // original is. notFor: a job post has no work in it.
  { value: "stolen_work", label: "Stolen work / plagiarism", needsDetails: true, notFor: ["job_post"] },
  { value: "other", label: "Other" }
];

// The reasons offered for one kind of target ("user", "service", ...).
export function reasonsFor(targetType) {
  return reportReasons.filter((r) => !r.notFor?.includes(targetType));
}

export function reportReasonLabel(value) {
  return reportReasons.find((r) => r.value === value)?.label || value;
}

// What was reported, in words (used on the admin Reports page).
export const reportTargetLabels = {
  user: "User",
  service: "Service",
  job_post: "Job Post",
  portfolio_item: "Portfolio Project",
  profile_picture: "Profile Picture",
  cover_photo: "Cover Photo"
};

// A reported profile picture or cover photo: the column on the owner's profile
// that holds it, and the storage bucket its file is in. An admin can remove the
// picture (the person goes back to the first-letter circle or the plain
// banner); they can also suspend or ban the owner, like for a reported user.
export const reportPictureKinds = {
  profile_picture: { column: "avatar_path", bucket: "avatars", label: "profile picture" },
  cover_photo: { column: "cover_path", bucket: "covers", label: "cover photo" }
};

// A super admin removes a reported picture. The database clears it from the
// person's profile, but only if it is still the file that was reported (and
// only for a super admin), then its file is deleted. Returns { removed: true },
// { removed: false } when the person had already changed or removed it, or
// { error }. report: a row of the reports table (target_type, target_id, reported_path).
export async function removeReportedPicture(report) {
  const kind = reportPictureKinds[report.target_type];
  const { data: clearedPath, error } = await supabase.rpc("admin_remove_picture", {
    p_user: report.target_id,
    p_kind: report.target_type,
    p_path: report.reported_path
  });
  if (error) return { error };
  // If deleting the file fails it only leaves an unused file behind, so it isn't an error.
  if (clearedPath) await supabase.storage.from(kind.bucket).remove([clearedPath]);
  return { removed: Boolean(clearedPath) };
}

// The database table behind each kind of reported listing (an admin can
// remove these; a reported user is suspended or banned instead).
export const reportListingTables = {
  service: "services",
  job_post: "job_posts",
  portfolio_item: "portfolio_items"
};
