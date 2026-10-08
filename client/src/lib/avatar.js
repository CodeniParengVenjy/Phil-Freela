import { supabase } from "./supabaseClient";
import { shrinkImage } from "./shrinkImage";

// Profile pictures and cover photos live in two public buckets, one folder per
// user (database/supabase_avatar_schema.sql and supabase_cover_photo_schema.sql).
// profiles.avatar_path / profiles.cover_path say which file. `side` is the
// longest side they are shrunk to: pictures are shown at most 120 px wide, so
// 512 px is plenty (about 50 KB); a cover is a wide banner, so 1600 px.
const PICTURE = { bucket: "avatars", column: "avatar_path", side: 512, label: "picture" };
const COVER = { bucket: "covers", column: "cover_path", side: 1600, label: "cover photo" };
const PICKABLE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];
const MAX_PICK_BYTES = 5 * 1024 * 1024;

// The link a page can show, or null when the user has no picture.
export function avatarUrl(path) {
  return path ? supabase.storage.from(PICTURE.bucket).getPublicUrl(path).data.publicUrl : null;
}

// Same for a cover photo.
export function coverUrl(path) {
  return path ? supabase.storage.from(COVER.bucket).getPublicUrl(path).data.publicUrl : null;
}

// Checks a picked file before it's previewed (for a picture or a cover).
// Returns "" when it's fine, or a message to show the user.
export function checkAvatarFile(file) {
  if (!PICKABLE_TYPES.includes(file.type)) return "Please pick a JPG, PNG, WebP or GIF picture.";
  if (file.size > MAX_PICK_BYTES) return "Pictures must be 5 MB or smaller.";
  return "";
}

// A user's cover photo path ("" when they have none, null when it couldn't be
// loaded). Any signed-in user can read it, like the description.
export async function fetchCoverPath(userId) {
  const { data, error } = await supabase.from("profiles").select("cover_path").eq("id", userId).maybeSingle();
  if (error) return null;
  return data?.cover_path ?? "";
}

// Shrinks and uploads a new picture, saves it on the profile, then deletes
// the old one. Returns { path } when saved, or { error } with a message.
async function uploadPicture(kind, userId, file, oldPath) {
  // Redrawing the picture as a small JPEG also strips anything hidden inside
  // the original file, so only a clean image is stored.
  let picture;
  try {
    picture = await shrinkImage(file, kind.side);
  } catch (error) {
    return { error: error.message };
  }

  // A new file name every time, so browsers don't keep showing the old picture.
  const path = `${userId}/${Date.now()}.jpg`;
  const { error: uploadError } = await supabase.storage.from(kind.bucket).upload(path, picture, { contentType: "image/jpeg" });
  if (uploadError) {
    // The exact reason (e.g. a missing storage rule) shows in the browser console (F12).
    console.error(`Uploading the ${kind.label} failed:`, uploadError);
    return { error: `Couldn't upload your ${kind.label}. Please try again.` };
  }

  // .select("id") returns the updated row, so an empty result means nothing was saved.
  const { data, error } = await supabase.from("profiles").update({ [kind.column]: path }).eq("id", userId).select("id");
  if (error || !data?.length) {
    console.error(`Saving the ${kind.label} failed:`, error || "no profile row was updated");
    await supabase.storage.from(kind.bucket).remove([path]); // don't leave an unused file behind
    return { error: `Couldn't save your ${kind.label}. Please try again.` };
  }

  // If this fails it only leaves an unused file behind, so it isn't an error.
  if (oldPath) await supabase.storage.from(kind.bucket).remove([oldPath]);
  return { path };
}

export const uploadAvatar = (userId, file, oldPath) => uploadPicture(PICTURE, userId, file, oldPath);
export const uploadCover = (userId, file, oldPath) => uploadPicture(COVER, userId, file, oldPath);

// Takes the cover photo off the profile and deletes its file. Returns "" when
// done, or a message to show the user.
export async function removeCover(userId, oldPath) {
  const { data, error } = await supabase.from("profiles").update({ cover_path: null }).eq("id", userId).select("id");
  if (error || !data?.length) {
    console.error("Removing the cover photo failed:", error || "no profile row was updated");
    return "Couldn't remove your cover photo. Please try again.";
  }
  if (oldPath) await supabase.storage.from(COVER.bucket).remove([oldPath]);
  return "";
}
